/**
 * Unified Configuration Manager
 * Consolidates all configuration functionality into single source of truth
 */

import type { AppConfig, Environment, ConfigUpdateOptions, ConfigValidationResult } from '../types/config';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AppConfig = {
  environment: 'development',
  features: {
    enableBLE: true,
    enableWebRTC: true,
    enableVoiceMessages: true,
    enableFileTransfer: true,
    enableGroupChat: true,
    enableEndToEndEncryption: true,
    enableMessagePersistence: true,
    enablePeerDiscovery: true,
    enableProximityDiscovery: true,
    enableAdaptiveQuality: true,
    enableDebugMode: false,
    enableTelemetry: false,
    enableCrashReporting: true,
    enableAnalytics: false,
  },
  network: {
    maxPeers: 50,
    connectionTimeout: 10000,
    heartbeatInterval: 30000,
    reconnectInterval: 5000,
    maxMessageSize: 1024 * 1024, // 1MB
    maxRetries: 3,
    enableCompression: true,
    enableEncryption: true,
    preferredTransport: 'auto',
    fallbackTransports: ['websocket', 'webrtc', 'ble'],
  },
  security: {
    sessionKeyRotationInterval: 3600000, // 1 hour
    messageEncryption: true,
    requireSignatures: true,
    allowUntrustedPeers: false,
    certificatePinning: true,
    secureStorage: true,
    keyDerivationIterations: 100000,
    encryptionAlgorithm: 'AES-256-GCM',
    signatureAlgorithm: 'Ed25519',
  },
  ui: {
    theme: 'auto',
    language: 'en',
    notifications: true,
    soundEffects: true,
    vibration: true,
    autoScroll: true,
    showTimestamps: true,
    showReadReceipts: true,
    compactMode: false,
    fontSize: 'medium',
    messagePreview: true,
  },
  performance: {
    enableCaching: true,
    cacheSize: 100 * 1024 * 1024, // 100MB
    enableBatching: true,
    batchSize: 10,
    enableLazyLoading: true,
    enableCompression: true,
    compressionLevel: 6,
    enableWebWorkers: true,
    maxWebWorkers: 4,
    enableOptimizations: true,
    enableProfiling: false,
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: false,
    enableRemote: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    format: 'text',
    includeStackTrace: true,
    includeTimestamp: true,
    includeModule: true,
  },
};

/**
 * Unified configuration manager
 */
export class ConfigManager {
  private config: AppConfig;
  private observers: ((config: AppConfig) => void)[] = [];
  private static instance: ConfigManager;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * Get specific configuration section
   */
  getSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    return { ...this.config[section] };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AppConfig>, options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    const newConfig = { ...this.config, ...updates };

    // Validate configuration
    if (options.validate) {
      const validation = this.validateConfig(newConfig);
      if (!validation.valid) {
        return validation;
      }
    }

    // Update configuration
    this.config = newConfig;

    // Persist to storage
    if (options.persist) {
      this.saveConfig();
    }

    // Notify observers
    if (options.notify) {
      this.notifyObservers();
    }

    return { valid: true, errors: [], warnings: [] };
  }

  /**
   * Update specific configuration section
   */
  updateSection<K extends keyof AppConfig>(section: K, updates: Partial<AppConfig[K]>, options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    return this.updateConfig({ [section]: { ...this.config[section], ...updates } } as Partial<AppConfig>, options);
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    return this.updateConfig(DEFAULT_CONFIG, options);
  }

  /**
   * Set environment
   */
  setEnvironment(environment: Environment, options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    return this.updateSection('environment', environment, options);
  }

  /**
   * Update feature flags
   */
  updateFeatures(features: Partial<AppConfig['features']>, options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    return this.updateSection('features', features, options);
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled<K extends keyof AppConfig['features']>(feature: K): boolean {
    return this.config.features[feature];
  }

  /**
   * Toggle a feature
   */
  toggleFeature<K extends keyof AppConfig['features']>(feature: K, options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    return this.updateFeatures({ [feature]: !this.config.features[feature] } as Partial<AppConfig['features']>, options);
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(observer: (config: AppConfig) => void): () => void {
    this.observers.push(observer);
    
    // Return unsubscribe function
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: AppConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate network configuration
    if (config.network.maxPeers <= 0) {
      errors.push('maxPeers must be greater than 0');
    }
    if (config.network.connectionTimeout <= 0) {
      errors.push('connectionTimeout must be greater than 0');
    }
    if (config.network.maxMessageSize <= 0) {
      errors.push('maxMessageSize must be greater than 0');
    }

    // Validate security configuration
    if (config.security.sessionKeyRotationInterval <= 0) {
      errors.push('sessionKeyRotationInterval must be greater than 0');
    }
    if (config.security.keyDerivationIterations < 10000) {
      warnings.push('keyDerivationIterations should be at least 10000 for security');
    }

    // Validate performance configuration
    if (config.performance.cacheSize <= 0) {
      errors.push('cacheSize must be greater than 0');
    }
    if (config.performance.batchSize <= 0) {
      errors.push('batchSize must be greater than 0');
    }
    if (config.performance.maxWebWorkers <= 0) {
      errors.push('maxWebWorkers must be greater than 0');
    }

    // Validate logging configuration
    if (config.logging.maxFileSize <= 0) {
      errors.push('maxFileSize must be greater than 0');
    }
    if (config.logging.maxFiles <= 0) {
      errors.push('maxFiles must be greater than 0');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Load configuration from storage
   */
  private loadConfig(): AppConfig {
    try {
      // Try to load from localStorage (web) or appropriate storage for platform
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('sc_config');
        if (stored) {
          const parsed = JSON.parse(stored);
          return { ...DEFAULT_CONFIG, ...parsed };
        }
      }
    } catch (error) {
      console.warn('Failed to load configuration from storage:', error);
    }

    return DEFAULT_CONFIG;
  }

  /**
   * Save configuration to storage
   */
  private saveConfig(): void {
    try {
      // Save to localStorage (web) or appropriate storage for platform
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('sc_config', JSON.stringify(this.config));
      }
    } catch (error) {
      console.warn('Failed to save configuration to storage:', error);
    }
  }

  /**
   * Notify all observers of configuration changes
   */
  private notifyObservers(): void {
    this.observers.forEach(observer => {
      try {
        observer(this.getConfig());
      } catch (error) {
        console.warn('Configuration observer error:', error);
      }
    });
  }

  /**
   * Export configuration
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration
   */
  importConfig(configJson: string, options: ConfigUpdateOptions = { persist: true, validate: true, notify: true }): ConfigValidationResult {
    try {
      const imported = JSON.parse(configJson);
      return this.updateConfig(imported, options);
    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid JSON format'],
        warnings: [],
      };
    }
  }

  /**
   * Get environment-specific overrides
   */
  getEnvironmentOverrides(): Partial<AppConfig> {
    switch (this.config.environment) {
      case 'development':
        return {
          features: {
            ...this.config.features,
            enableDebugMode: true,
            enableTelemetry: true,
            enableAnalytics: true,
          },
          logging: {
            ...this.config.logging,
            level: 'debug',
            enableConsole: true,
          },
        };
      case 'staging':
        return {
          features: {
            ...this.config.features,
            enableDebugMode: false,
            enableTelemetry: true,
            enableAnalytics: true,
          },
          logging: {
            ...this.config.logging,
            level: 'info',
            enableRemote: true,
          },
        };
      case 'production':
        return {
          features: {
            ...this.config.features,
            enableDebugMode: false,
            enableTelemetry: false,
            enableAnalytics: false,
          },
          logging: {
            ...this.config.logging,
            level: 'warn',
            enableConsole: false,
            enableRemote: true,
          },
        };
      default:
        return {};
    }
  }

  /**
   * Get effective configuration (with environment overrides)
   */
  getEffectiveConfig(): AppConfig {
    const overrides = this.getEnvironmentOverrides();
    return {
      ...this.config,
      ...overrides,
      features: { ...this.config.features, ...overrides.features },
      network: { ...this.config.network, ...overrides.network },
      security: { ...this.config.security, ...overrides.security },
      ui: { ...this.config.ui, ...overrides.ui },
      performance: { ...this.config.performance, ...overrides.performance },
      logging: { ...this.config.logging, ...overrides.logging },
    };
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
