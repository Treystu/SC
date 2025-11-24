/**
 * Peer information for mesh networking (Task 12)
 */
export interface Peer {
  id: Uint8Array;           // 32 bytes - Ed25519 public key
  lastSeen: number;         // Timestamp of last communication
  connectionType: TransportType;
  address?: string;         // IP:port or BLE address
  latency?: number;         // Round-trip time in ms
  reliability: number;      // 0-1 score based on message delivery
}

/**
 * Transport types for multi-transport support
 */
export enum TransportType {
  WEBRTC = 'webrtc',
  BLE = 'ble',
  MDNS = 'mdns',
  MANUAL = 'manual',
}

/**
 * Routing table entry (Task 11)
 */
export interface RouteEntry {
  destinationId: Uint8Array;
  nextHopId: Uint8Array;
  hopCount: number;
  lastUpdated: number;
}

/**
 * Message fragment for large message handling (Task 19)
 */
export interface MessageFragment {
  messageId: Uint8Array;    // 32 bytes - Unique message identifier
  fragmentIndex: number;    // Current fragment number
  totalFragments: number;   // Total number of fragments
  data: Uint8Array;         // Fragment data
}

/**
 * Peer health status (Task 17)
 */
export interface PeerHealth {
  peerId: Uint8Array;
  lastHeartbeat: number;
  missedHeartbeats: number;
  isHealthy: boolean;
}

/**
 * Identity keypair (Task 5)
 */
export interface Identity {
  publicKey: Uint8Array;    // 32 bytes - Ed25519 public key
  privateKey: Uint8Array;   // 32 bytes - Ed25519 private key
  createdAt: number;
  displayName?: string;
  avatar?: Uint8Array;
}

/**
 * Shared secret from ECDH (Task 2)
 */
export interface SharedSecret {
  peerId: Uint8Array;
  secret: Uint8Array;       // 32 bytes - Shared secret
  createdAt: number;
  lastUsed: number;
}
