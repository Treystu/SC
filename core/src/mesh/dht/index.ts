/**
 * DHT Module Exports
 * 
 * Kademlia-based Distributed Hash Table implementation
 * for peer discovery and decentralized routing.
 */

// Types
export * from './types.js';

// Node ID utilities
export {
  generateNodeId,
  nodeIdFromPublicKey,
  generateDHTKey,
  xorDistance,
  compareDistance,
  isCloser,
  bucketIndexFromDistance,
  getBucketIndex,
  nodeIdToHex,
  hexToNodeId,
  nodeIdsEqual,
  isValidNodeId,
  copyNodeId,
  sortByDistance,
  getClosestContacts,
  generateIdInBucket,
  NODE_ID_BYTES,
  NODE_ID_BITS,
} from './node-id.js';

// K-Bucket implementation
export { KBucket, KBucketManager } from './bucket.js';

// Kademlia routing table
export { KademliaRoutingTable } from './kademlia.js';

// Bootstrap
export {
  DHTBootstrap,
  createBootstrapNodesFromPeers,
  bootstrapFromPeer,
  type BootstrapResult,
  type BootstrapProgressCallback,
} from './bootstrap.js';

// Network state awareness
export {
  NetworkStateManager,
  createNetworkStateManager,
  DEFAULT_HEALTH_THRESHOLDS,
  type HealthThresholds,
  type NetworkEventType,
  type NetworkEvent,
  type NetworkEventListener,
} from './network-state.js';
