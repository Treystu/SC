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

// File transfer
export * from './transfer/file';

// Version
export const VERSION = '0.1.0';
