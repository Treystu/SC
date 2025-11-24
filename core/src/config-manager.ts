/**
 * Centralized configuration management system
 * Supports environment-specific configs, feature flags, and hot reload
 */

export type Environment = 'development' | 'staging' | 'production';

export interface AppConfig {
  environment: Environment;
  features: FeatureFlags;
  network: NetworkConfig;
  security: SecurityConfig;
  ui: UIConfig;
}

export interface FeatureFlags {
  enableBLE: boolean;
  enableWebRTC: boolean;
  enableVoiceMessages: boolean;
  enableVideoCall: boolean;
  enableScreenShare: boolean;
  enableFileTransfer: boolean;
  enableGroupChat: boolean;
  enableAnalytics: boolean;
  enableDebugMode: boolean;
}

export interface NetworkConfig {
  maxPeers: number;
  connectionTimeout: number;
  heartbeatInterval: number;
  messageRetryAttempts: number;
  messageRetryDelay: number;
  maxMessageSize: number;
}

export interface SecurityConfig {
  sessionKeyRotationInterval: number;
  messageEncryption: boolean;
  requireSignatures: boolean;
  allowUntrustedPeers: boolean;
}

export interface UIConfig {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: boolean;
  sounds: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

const DEFAULT_CONFIG: AppConfig = {
  environment: 'development',
  features: {
    enableBLE: true,
    enableWebRTC: true,
    enableVoiceMessages: true,
    enableVideoCall: true,
    enableScreenShare: true,
    enableFileTransfer: true,
    enableGroupChat: true,
    enableAnalytics: false,
    enableDebugMode: true,
  },
  network: {
    maxPeers: 50,
    connectionTimeout: 30000,
    heartbeatInterval: 10000,
    messageRetryAttempts: 3,
    messageRetryDelay: 1000,
    maxMessageSize: 10 * 1024 * 1024, // 10MB
  },
  security: {
    sessionKeyRotationInterval: 3600000, // 1 hour
    messageEncryption: true,
    requireSignatures: true,
    allowUntrustedPeers: false,
  },
  ui: {
    theme: 'auto',
    language: 'en',
    notifications: true,
    sounds: true,
    fontSize: 'medium',
  },
};

const PRODUCTION_OVERRIDES: Partial<AppConfig> = {
  environment: 'production',
  features: {
    enableBLE: true,
    enableWebRTC: true,
    enableVoiceMessages: true,
    enableVideoCall: true,
    enableScreenShare: true,
    enableFileTransfer: true,
    enableGroupChat: true,
    enableAnalytics: true,
    enableDebugMode: false,
  },
  security: {
    sessionKeyRotationInterval: 1800000, // 30 minutes
    messageEncryption: true,
    requireSignatures: true,
    allowUntrustedPeers: false,
  },
};

export class ConfigManager {
  private config: AppConfig;
  private observers: ((config: AppConfig) => void)[] = [];

  constructor(environment?: Environment) {
    this.config = this.loadConfig(environment);
  }

  /**
   * Load configuration based on environment
   */
  private loadConfig(environment?: Environment): AppConfig {
    const env = environment || this.detectEnvironment();
    const baseConfig = { ...DEFAULT_CONFIG, environment: env };

    // Apply environment-specific overrides
    if (env === 'production') {
      return this.mergeConfig(baseConfig, PRODUCTION_OVERRIDES);
    }

    // Load from localStorage if available
    const stored = this.loadFromStorage();
    if (stored) {
      return this.mergeConfig(baseConfig, stored);
    }

    return baseConfig;
  }

  /**
   * Detect environment from hostname or NODE_ENV
   */
  private detectEnvironment(): Environment {
    if (typeof process !== 'undefined' && process.env.NODE_ENV) {
      return process.env.NODE_ENV as Environment;
    }

    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
      }
      if (hostname.includes('staging')) {
        return 'staging';
      }
    }

    return 'production';
  }

  /**
   * Deep merge two config objects
   */
  private mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
    return {
      ...base,
      ...override,
      features: { ...base.features, ...override.features },
      network: { ...base.network, ...override.network },
      security: { ...base.security, ...override.security },
      ui: { ...base.ui, ...override.ui },
    };
  }

  /**
   * Get configuration value
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Get entire configuration
   */
  getAll(): AppConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value;
    this.saveToStorage();
    this.notifyObservers();
  }

  /**
   * Update partial configuration
   */
  update(updates: Partial<AppConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    this.saveToStorage();
    this.notifyObservers();
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.config.features[feature];
  }

  /**
   * Enable/disable a feature
   */
  setFeature(feature: keyof FeatureFlags, enabled: boolean): void {
    this.config.features[feature] = enabled;
    this.saveToStorage();
    this.notifyObservers();
  }

  /**
   * Save configuration to localStorage
   */
  private saveToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('app-config', JSON.stringify(this.config));
      } catch (error) {
        console.error('Failed to save config:', error);
      }
    }
  }

  /**
   * Load configuration from localStorage
   */
  private loadFromStorage(): Partial<AppConfig> | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem('app-config');
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        console.error('Failed to load config:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(callback: (config: AppConfig) => void): () => void {
    this.observers.push(callback);
    
    return () => {
      const index = this.observers.indexOf(callback);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  /**
   * Notify observers of configuration changes
   */
  private notifyObservers(): void {
    const config = this.getAll();
    this.observers.forEach(callback => callback(config));
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = this.loadConfig();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('app-config');
    }
    this.notifyObservers();
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.network.maxPeers < 1) {
      errors.push('maxPeers must be at least 1');
    }

    if (this.config.network.connectionTimeout < 1000) {
      errors.push('connectionTimeout must be at least 1000ms');
    }

    if (this.config.network.messageRetryAttempts < 0) {
      errors.push('messageRetryAttempts cannot be negative');
    }

    if (this.config.security.sessionKeyRotationInterval < 60000) {
      errors.push('sessionKeyRotationInterval must be at least 60000ms (1 minute)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
export const configManager = new ConfigManager();
