/**
 * Kademlia DHT Type Definitions
 * Core types for the distributed hash table implementation
 */

/**
 * Node ID - 160-bit (20-byte) identifier for DHT nodes
 * Represented as Uint8Array for efficient XOR operations
 */
export type NodeId = Uint8Array;

/**
 * DHT Key - 160-bit key used for lookups
 * Same format as NodeId for consistent XOR distance calculations
 */
export type DHTKey = Uint8Array;

/**
 * DHT Value - arbitrary data stored in the DHT
 */
export interface DHTValue {
  /** Raw data bytes */
  data: Uint8Array;
  /** Timestamp when the value was stored */
  storedAt: number;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Publisher's node ID */
  publisherId: NodeId;
}

/**
 * Contact information for a DHT node
 */
export interface DHTContact {
  /** Node's unique identifier */
  nodeId: NodeId;
  /** Hex-encoded peer ID for mesh network integration */
  peerId: string;
  /** Last time this contact was seen */
  lastSeen: number;
  /** Round-trip time in milliseconds */
  rtt?: number;
  /** Number of failed requests */
  failureCount: number;
  /** Endpoint information */
  endpoints?: DHTEndpoint[];
}

/**
 * Endpoint for DHT communication
 */
export interface DHTEndpoint {
  type: 'webrtc' | 'bluetooth' | 'local' | 'manual';
  address?: string;
}

/**
 * K-Bucket configuration
 * 
 * These parameters control individual bucket behavior. They are inherited
 * by KademliaConfig to ensure consistent behavior across the routing table.
 */
export interface KBucketConfig {
  /** 
   * Maximum number of contacts per bucket (k parameter).
   * Standard Kademlia uses k=20. Higher values increase redundancy but use more memory.
   */
  k: number;
  /** 
   * Ping timeout in milliseconds.
   * How long to wait for a ping response before considering a node unresponsive.
   */
  pingTimeout: number;
  /** 
   * Number of nodes to query in parallel (alpha parameter).
   * Standard Kademlia uses alpha=3. Higher values speed up lookups but increase load.
   */
  alpha: number;
}

/**
 * Kademlia routing table configuration
 * 
 * Extends KBucketConfig to inherit k, alpha, and pingTimeout parameters.
 * These inherited parameters are used consistently across bucket management
 * and routing table operations:
 * - k: Used for both bucket size and number of closest nodes to return
 * - alpha: Used for parallel queries in both findNode and findValue
 * - pingTimeout: Used for RPC timeout in bucket eviction and liveness checks
 */
export interface KademliaConfig extends KBucketConfig {
  /** Local node ID */
  localNodeId: NodeId;
  /** Bucket refresh interval in milliseconds */
  refreshInterval: number;
  /** Value replication factor (typically same as k) */
  replicationFactor: number;
  /** Maximum concurrent lookups to prevent resource exhaustion */
  maxConcurrentLookups: number;
  /** Republish interval in milliseconds for stored values */
  republishInterval: number;
}

/**
 * Default Kademlia configuration values
 */
export const DEFAULT_KADEMLIA_CONFIG: Omit<KademliaConfig, 'localNodeId'> = {
  k: 20, // Number of contacts per bucket
  alpha: 3, // Parallel lookup parameter
  pingTimeout: 5000, // 5 seconds
  refreshInterval: 3600000, // 1 hour
  replicationFactor: 20, // Store at k closest nodes
  maxConcurrentLookups: 10,
  republishInterval: 3600000, // 1 hour
};

/**
 * Result of a node lookup operation
 */
export interface NodeLookupResult {
  /** Closest nodes found */
  closestNodes: DHTContact[];
  /** Number of queries made */
  queriesMade: number;
  /** Time taken in milliseconds */
  duration: number;
  /** Whether the exact node was found */
  found: boolean;
}

/**
 * Result of a value lookup operation
 */
export interface ValueLookupResult {
  /** The found value, or undefined if not found */
  value?: DHTValue;
  /** Nodes queried during lookup */
  queriedNodes: DHTContact[];
  /** Closest nodes that might have the value */
  closestNodes: DHTContact[];
  /** Time taken in milliseconds */
  duration: number;
  /** Whether the value was found */
  found: boolean;
}

/**
 * DHT RPC message types
 */
export enum DHTMessageType {
  /** Request to find a node */
  FIND_NODE = 'FIND_NODE',
  /** Response to FIND_NODE */
  FIND_NODE_RESPONSE = 'FIND_NODE_RESPONSE',
  /** Request to find a value */
  FIND_VALUE = 'FIND_VALUE',
  /** Response to FIND_VALUE with value */
  FIND_VALUE_RESPONSE = 'FIND_VALUE_RESPONSE',
  /** Response to FIND_VALUE with nodes (value not found) */
  FIND_VALUE_NODES = 'FIND_VALUE_NODES',
  /** Request to store a value */
  STORE = 'STORE',
  /** Response to STORE */
  STORE_RESPONSE = 'STORE_RESPONSE',
  /** Ping request */
  PING = 'PING',
  /** Pong response */
  PONG = 'PONG',
}

/**
 * Base DHT message structure
 */
export interface DHTMessage {
  /** Message type */
  type: DHTMessageType;
  /** Sender's node ID */
  senderId: NodeId;
  /** Message ID for request/response correlation */
  messageId: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * FIND_NODE request
 */
export interface FindNodeRequest extends DHTMessage {
  type: DHTMessageType.FIND_NODE;
  /** Target node ID to find */
  targetId: NodeId;
}

/**
 * FIND_NODE response
 */
export interface FindNodeResponse extends DHTMessage {
  type: DHTMessageType.FIND_NODE_RESPONSE;
  /** Closest known nodes to the target */
  nodes: DHTContact[];
}

/**
 * FIND_VALUE request
 */
export interface FindValueRequest extends DHTMessage {
  type: DHTMessageType.FIND_VALUE;
  /** Key to look up */
  key: DHTKey;
}

/**
 * FIND_VALUE response with value
 */
export interface FindValueResponse extends DHTMessage {
  type: DHTMessageType.FIND_VALUE_RESPONSE;
  /** The stored value */
  value: DHTValue;
}

/**
 * FIND_VALUE response with nodes (value not found locally)
 */
export interface FindValueNodesResponse extends DHTMessage {
  type: DHTMessageType.FIND_VALUE_NODES;
  /** Closest known nodes to the key */
  nodes: DHTContact[];
}

/**
 * STORE request
 */
export interface StoreRequest extends DHTMessage {
  type: DHTMessageType.STORE;
  /** Key to store */
  key: DHTKey;
  /** Value to store */
  value: DHTValue;
}

/**
 * STORE response
 */
export interface StoreResponse extends DHTMessage {
  type: DHTMessageType.STORE_RESPONSE;
  /** Whether the store was successful */
  success: boolean;
}

/**
 * PING request
 */
export interface PingRequest extends DHTMessage {
  type: DHTMessageType.PING;
}

/**
 * PONG response
 */
export interface PongResponse extends DHTMessage {
  type: DHTMessageType.PONG;
}

/**
 * Union type for all DHT messages
 */
export type DHTRPCMessage =
  | FindNodeRequest
  | FindNodeResponse
  | FindValueRequest
  | FindValueResponse
  | FindValueNodesResponse
  | StoreRequest
  | StoreResponse
  | PingRequest
  | PongResponse;

/**
 * DHT statistics
 */
export interface DHTStats {
  /** Number of nodes in routing table */
  nodeCount: number;
  /** Number of stored values */
  valueCount: number;
  /** Number of buckets with at least one node */
  activeBuckets: number;
  /** Total lookups performed */
  totalLookups: number;
  /** Successful lookups */
  successfulLookups: number;
  /** Average lookup time in milliseconds */
  avgLookupTime: number;
  /** Memory usage estimate in bytes */
  memoryUsage: number;
}

/**
 * Network state types
 */
export enum NetworkState {
  /** Not connected to any peers */
  DISCONNECTED = 'DISCONNECTED',
  /** Bootstrapping - connecting to initial nodes */
  BOOTSTRAPPING = 'BOOTSTRAPPING',
  /** Partially connected - fewer nodes than desired */
  DEGRADED = 'DEGRADED',
  /** Fully operational */
  CONNECTED = 'CONNECTED',
}

/**
 * Network topology information
 */
export interface NetworkTopology {
  /** Current network state */
  state: NetworkState;
  /** Total number of known nodes */
  totalNodes: number;
  /** Number of directly connected peers */
  directPeers: number;
  /** Estimated network size */
  estimatedNetworkSize: number;
  /** Distribution of nodes across buckets */
  bucketDistribution: number[];
  /** Average node latency */
  avgLatency: number;
  /** Network health score (0-100) */
  healthScore: number;
}

/**
 * Bootstrap node information
 */
export interface BootstrapNode {
  /** Node ID */
  nodeId: NodeId;
  /** Peer ID for mesh integration */
  peerId: string;
  /** Endpoints */
  endpoints: DHTEndpoint[];
  /** Whether this is a trusted bootstrap node */
  trusted: boolean;
}

/**
 * Bootstrap configuration
 */
export interface BootstrapConfig {
  /** List of initial bootstrap nodes */
  bootstrapNodes: BootstrapNode[];
  /** Maximum time to wait for bootstrap in milliseconds */
  bootstrapTimeout: number;
  /** Minimum nodes required for successful bootstrap */
  minBootstrapNodes: number;
  /** Number of parallel bootstrap attempts */
  parallelBootstraps: number;
}

/**
 * Default bootstrap configuration
 */
export const DEFAULT_BOOTSTRAP_CONFIG: Omit<BootstrapConfig, 'bootstrapNodes'> = {
  bootstrapTimeout: 30000, // 30 seconds
  minBootstrapNodes: 1,
  parallelBootstraps: 3,
};
