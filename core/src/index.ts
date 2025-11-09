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

// Discovery
export * from './discovery/peer';

// Version
export const VERSION = '0.1.0';
