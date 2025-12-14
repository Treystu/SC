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

export * as utils from "./utils/encoding.js"; // For Native Bridge compatibility

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

// DHT (Kademlia)
export * from "./mesh/dht/index.js";

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

// BLE Transport (platform-agnostic interface)
export {
  MockBleTransport,
  BleAdvertisingMode,
  BleScanMode,
  BLE_MESH_SERVICE_UUID,
  BLE_TX_CHARACTERISTIC_UUID,
  BLE_RX_CHARACTERISTIC_UUID,
  BLE_VERSION_CHARACTERISTIC_UUID,
  BLE_METADATA_CHARACTERISTIC_UUID,
  DEFAULT_BLE_CONFIG,
  type BleTransport,
  type BleTransportConfig,
  type BleTransportEvents,
  type BleDeviceInfo,
  type BlePeerInfo,
  type BleTransportFactory,
} from "./transport/BleTransport.js";

// Wi-Fi Direct Transport (platform-agnostic interface)
export {
  MockWifiDirectTransport,
  WifiDirectRole,
  WifiDirectDeviceStatus,
  DEFAULT_WIFI_DIRECT_CONFIG,
  type WifiDirectTransport,
  type WifiDirectTransportConfig,
  type WifiDirectTransportEvents,
  type WifiDirectDeviceInfo,
  type WifiDirectGroupInfo,
  type WifiDirectPeerInfo,
  type WifiDirectServiceRecord,
  type WifiDirectTransportFactory,
} from "./transport/WifiDirectTransport.js";

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
  MDNSBroadcaster,
  MDNSDiscoverer,
  MDNSManager,
  MDNS_SERVICE_TYPE,
  MDNS_DEFAULT_PORT,
  TXT_RECORD_KEYS,
  parseCapabilities,
  serializeCapabilities,
  parseTxtRecord,
  buildTxtRecord,
  filterService,
  type MDNSServiceInfo,
  type MDNSCapabilities,
  type MDNSBroadcasterConfig,
  type MDNSDiscovererConfig,
  type MDNSEventType,
  type MDNSEventCallback,
} from "./discovery/mdns.js";

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

// Performance Optimizations
export {
  LRUCache,
  BufferPool,
  bufferPool,
  MessageBatcher,
  BloomFilter,
  ConnectionPool,
  MetricsCollector,
  type BatchConfig,
  type BatchItem,
  type ConnectionPoolConfig,
  type PooledConnection,
  type PerformanceMetrics,
} from "./performance-optimizations.js";

// Cache Manager
export {
  CacheManager,
  MediaCache,
  type CacheEntry,
  type CacheStats,
} from "./cache-manager.js";

// Storage
export {
  MemoryStorageAdapter,
  TypedMemoryStorage,
  type StorageAdapter,
} from "./storage/memory.js";

// Backup & Restore
export {
  BackupManager,
  BackupScheduler,
  RestoreManager,
  BackupMigrator,
  type BackupData,
  type BackupMetadata,
  type BackupOptions,
  type RestoreOptions,
  type RestoreResult,
  type ConflictResolution,
} from "./backup/index.js";

// Version
export const VERSION = "0.1.0";
