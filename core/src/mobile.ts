/**
 * Mobile-safe exports for core library
 *
 * This module exports only the essential cryptography, protocol, and mesh
 * functionality that can run in embedded JavaScript engines (JavaScriptCore,
 * QuickJS, etc.) without browser-specific or Node.js-specific dependencies.
 */

// Core cryptographic primitives (uses @noble/* libraries which are platform-agnostic)
export {
  generateIdentity,
  signMessage,
  verifySignature,
  deriveSharedSecret,
  generateSessionKey,
  encryptMessage,
  decryptMessage,
  generateNonce,
  generateFingerprint,
  type IdentityKeyPair,
} from "./crypto/primitives.js";

// Protocol
export {
  encodeMessage,
  decodeMessage,
  MessageType,
  type Message,
  type MessageHeader,
} from "./protocol/message.js";

// Mesh routing (platform-agnostic)
export {
  RoutingTable,
  createPeer,
  PeerState,
  type Peer,
  type RoutingConfig,
  type PeerCapabilities,
  type PeerMetadata,
} from "./mesh/routing.js";

// Mesh Network Manager (The Brain)
export { MeshNetwork, type MeshNetworkConfig } from "./mesh/network.js";

// DHT (Distributed Hash Table)
export { DHT, type DHTConfig, type NodeLookupResult } from "./mesh/dht.js";

// Envelope encryption
export {
  encryptEnvelope,
  decryptEnvelope,
  signEnvelope,
  verifyEnvelope,
  serializeEncryptedEnvelope,
  deserializeEncryptedEnvelope,
  serializeSignedEnvelope,
  deserializeSignedEnvelope,
  type EncryptedEnvelope,
  type SignedEnvelope,
} from "./crypto/envelope.js";

// Transport abstraction
export {
  type Transport,
  type TransportPeerId,
  type TransportMessage,
  type TransportEvents,
  type TransportConfig,
  type TransportPeerInfo,
  type TransportConnectionState,
  type SignalingData,
  DefaultTransportRegistry,
} from "./transport/Transport.js";

// Fingerprint utilities
export {
  generateFullFingerprint,
  formatFingerprint,
  isValidPublicKey,
  publicKeyToBase64,
  base64ToPublicKey,
  compareFingerprints,
} from "./utils/fingerprint.js";

// Relay (deduplication, message forwarding)
export {
  MessageRelay,
  type PersistenceAdapter,
  type RelayConfig,
  type RelayStats,
} from "./mesh/relay.js";

// Performance Monitoring
export {
  PerformanceMonitor,
  performanceMonitor,
  type PerformanceMetric,
} from "./performance-monitor.js";
export {
  MetricsCollector,
  type PerformanceMetrics,
} from "./performance-optimizations.js";

// File Transfer
export {
  chunkFile,
  splitFile,
  FileReassembler,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  type FileChunkPayload,
  type FileChunkMetadata,
  type ReassemblyState,
} from "./transfer/file-chunker.js";

// Audio & Proximity Pairing
export {
  AudioTonePairing,
  pairViaDTMF,
  type AudioPairingOptions,
} from "./discovery/audio-pairing.js";
export {
  ProximityPairing,
  type ProximityDevice,
  type ProximityPairingOptions,
} from "./discovery/proximity.js";
export { generateQRDataURL, type QRPairingData } from "./pairing/qr-utils.js";

// Identity & Invites
export { IdentityManager } from "./identity-manager.js";
export { InviteManager } from "./sharing/InviteManager.js";
export { parseConnectionOffer } from "./sharing/util.js";

// Version
export const VERSION = "0.1.0";
export const MOBILE_BUNDLE = true;
