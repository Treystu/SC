/**
 * Main exports for the core library
 */

// Protocol
export * from './protocol/message';

// Crypto
export * from './crypto/primitives';
export * from './crypto/storage';

// Mesh networking
export * from './mesh/routing';
export * from './mesh/relay';
export * from './mesh/network';
export * from './mesh/health';

// Transport
export * from './transport/webrtc';
export { 
  WebRTCPeerEnhanced, 
  WebRTCConnectionPool,
  WebRTCConfig,
  DataChannelType,
  ConnectionMetrics,
  NATType,
  ICEServerConfig,
  SignalingMessage,
  SignalingMessageType,
} from './transport/webrtc-enhanced';

// Discovery
export * from './discovery/peer';
export { 
  MDNSBroadcaster, 
  MDNSDiscoverer, 
  createServiceType, 
  validateServiceName, 
  formatServiceInstanceName,
  type MDNSServiceInfo,
  type MDNSCapabilities,
  type MDNSBroadcasterOptions,
  type MDNSDiscoveryOptions,
} from './discovery/mdns';
export { 
  QRCodeDiscoveryV2, 
  QR_FORMAT_VERSION,
  type QRPeerInfo,
  type QRDataV2,
  type QRValidationResult,
} from './discovery/qr-enhanced';
export { 
  ReachabilityVerifier, 
  testPeerReachability,
  type PingMessage,
  type PongMessage,
  type ReachabilityResult,
  type ReachabilityMethod,
  type ReachabilityOptions,
} from './discovery/reachability';
export { AudioTonePairing, pairViaDTMF, type AudioPairingOptions } from './discovery/audio-pairing';
export { ProximityPairing, type ProximityDevice, type ProximityPairingOptions } from './discovery/proximity';
export { PeerAnnouncementManager, type PeerCapabilities as AnnouncementCapabilities } from './discovery/announcement';

// File transfer
export * from './transfer/file';

// Version
export const VERSION = '0.1.0';
