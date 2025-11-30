/**
 * Main exports for the core library
 */

// Protocol
export * from "./protocol/message.js";

// Crypto
export * from "./crypto/primitives.js";
export * from "./crypto/storage.js";
export {
  generateFullFingerprint,
  formatFingerprint,
  isValidPublicKey,
  publicKeyToBase64,
  base64ToPublicKey,
  compareFingerprints,
} from "./utils/fingerprint.js";

// Mesh networking
export * from "./mesh/routing.js";
export * from "./mesh/relay.js";
export * from "./mesh/network.js";
export * from "./mesh/health.js";

// Transport
export * from "./transport/webrtc.js";
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
} from "./transport/webrtc-enhanced.js";

// Discovery
export * from "./discovery/peer.js";

export {
  QRCodeDiscoveryV2,
  QR_FORMAT_VERSION,
  type QRPeerInfo,
  type QRDataV2,
  type QRValidationResult,
} from "./discovery/qr-enhanced.js";
export {
  ReachabilityVerifier,
  testPeerReachability,
  type PingMessage,
  type PongMessage,
  type ReachabilityResult,
  type ReachabilityMethod,
  type ReachabilityOptions,
} from "./discovery/reachability.js";
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

// File transfer
export * from "./transfer/file.js";

// Health check
export {
  HealthChecker,
  getHealthChecker,
  quickHealthCheck,
  getHealthStatus,
  type HealthCheckResult,
  type ComponentHealth,
} from "./health-check.js";

// Validation
export {
  sanitizeHTML,
  sanitizeUserInput,
  validateMessageContent,
} from "./validation.js";

export * from "./file-validation.js";

export {
  ValidationError,
  required,
  validateStringLength,
} from "./validation.js";

// Rate limiting
export {
  TokenBucketRateLimiter,
  SlidingWindowRateLimiter,
  FixedWindowRateLimiter,
  CompositeRateLimiter,
  MessageRateLimiter,
  RateLimiters,
  type RateLimitConfig,
  type RateLimitInfo,
} from "./rate-limiter-enhanced.js";

// Sharing and invites
export * from "./sharing/index.js";
export { InviteManager } from "./sharing/InviteManager.js";
export { parseConnectionOffer, hexToBytes } from "./sharing/util.js";

// Error tracking
export { ErrorTracker, type ErrorContext } from "./error-tracking.js";

// Identity
export { IdentityManager } from "./identity-manager.js";

// Logger
export { logger, LogLevel, type LogEntry } from "./logger.js";

// Database
export { type Database, getDatabase, setMockDatabase } from "./database.js";

// Version
export const VERSION = "0.1.0";
