/**
 * Main exports for the core library
 */

// Protocol
export * from "./protocol/message.js";

// Crypto
export * from "./crypto/primitives.js";
export * from "./crypto/storage.js";
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
export { CryptoManager, KeyManager } from "./crypto/index.js";
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
export * from "./mesh/gossip.js";
export {
  IndexedDbSeenAdapter,
  MemorySeenAdapter,
  createSeenAdapter,
  type MeshSeenAdapter,
} from "./mesh/seen-adapter.js";

// Transport Abstraction Layer
export {
  type Transport,
  type TransportPeerId,
  type TransportMessage,
  type TransportEvents,
  type TransportConfig,
  type TransportPeerInfo,
  type TransportConnectionState,
  type SignalingData,
  type TransportFactory,
  type TransportRegistry,
  DefaultTransportRegistry,
  transportRegistry,
} from "./transport/Transport.js";

// WebRTC Transport (new abstraction)
export {
  WebRTCTransport,
  type WebRTCTransportConfig,
} from "./transport/WebRTCTransport.js";

// Legacy Transport (for backwards compatibility)
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
export {
  WebSocketSessionEnhanced,
  WebSocketSessionState,
  type WebSocketSessionConfig,
} from "./transport/websocket-session.js";
export {
  RTCSessionManager,
  type RTCOutboxMessage,
  type RTCSessionConfig,
  type RTCSessionStats,
  type MessagePriority,
} from "./transport/rtc-session-manager.js";

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

// Pairing utilities
export {
  encodePairingData,
  decodePairingData,
  renderQR,
  generateQRDataURL,
  scanQRFromVideo,
  scanQRFromImage,
  startCameraStream,
  isCameraAvailable,
  setJsQR,
  isJsQRAvailable,
  type QRPairingData,
} from "./pairing/qr-utils.js";
export {
  AudioCalibration,
  playAudioData,
  calibrateBitDuration,
  type AudioCalibrationResult,
  type AudioPairingConfig,
} from "./pairing/audio-calibration.js";

// File transfer
export * from "./transfer/file.js";
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
