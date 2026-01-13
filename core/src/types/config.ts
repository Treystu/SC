/**
 * Unified configuration system types
 * Single source of truth for all configuration-related interfaces
 */

export type Environment = 'development' | 'staging' | 'production';

export interface AppConfig {
  environment: Environment;
  features: FeatureFlags;
  network: NetworkConfig;
  security: SecurityConfig;
  ui: UIConfig;
  performance: PerformanceConfig;
  logging: LoggingConfig;
}

export interface FeatureFlags {
  enableBLE: boolean;
  enableWebRTC: boolean;
  enableVoiceMessages: boolean;
  enableFileTransfer: boolean;
  enableGroupChat: boolean;
  enableEndToEndEncryption: boolean;
  enableMessagePersistence: boolean;
  enablePeerDiscovery: boolean;
  enableProximityDiscovery: boolean;
  enableAdaptiveQuality: boolean;
  enableDebugMode: boolean;
  enableTelemetry: boolean;
  enableCrashReporting: boolean;
  enableAnalytics: boolean;
}

export interface NetworkConfig {
  maxPeers: number;
  connectionTimeout: number;
  heartbeatInterval: number;
  reconnectInterval: number;
  maxMessageSize: number;
  maxRetries: number;
  enableCompression: boolean;
  enableEncryption: boolean;
  preferredTransport: 'webrtc' | 'websocket' | 'ble' | 'auto';
  fallbackTransports: string[];
}

export interface SecurityConfig {
  sessionKeyRotationInterval: number;
  messageEncryption: boolean;
  requireSignatures: boolean;
  allowUntrustedPeers: boolean;
  certificatePinning: boolean;
  secureStorage: boolean;
  keyDerivationIterations: number;
  encryptionAlgorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  signatureAlgorithm: 'Ed25519' | 'ECDSA';
}

export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: boolean;
  soundEffects: boolean;
  vibration: boolean;
  autoScroll: boolean;
  showTimestamps: boolean;
  showReadReceipts: boolean;
  compactMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
  messagePreview: boolean;
}

export interface PerformanceConfig {
  enableCaching: boolean;
  cacheSize: number;
  enableBatching: boolean;
  batchSize: number;
  enableLazyLoading: boolean;
  enableCompression: boolean;
  compressionLevel: number;
  enableWebWorkers: boolean;
  maxWebWorkers: number;
  enableOptimizations: boolean;
  enableProfiling: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  maxFileSize: number;
  maxFiles: number;
  format: 'json' | 'text';
  includeStackTrace: boolean;
  includeTimestamp: boolean;
  includeModule: boolean;
}

export interface ConfigUpdateOptions {
  persist: boolean;
  validate: boolean;
  notify: boolean;
  restartRequired?: boolean;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
