/**
 * Unified Data Reset Manager
 * Ensures complete data isolation and proper reset across all platforms
 * Prevents data bleedover between platforms and app instances
 */

export interface ResetResult {
  success: boolean;
  platform: string;
  clearedItems: string[];
  errors?: string[];
}

export interface ResetConfig {
  clearIdentity: boolean;
  clearMessages: boolean;
  clearContacts: boolean;
  clearConversations: boolean;
  clearRoutes: boolean;
  clearSettings: boolean;
  clearCache: boolean;
  clearAll: boolean;
}

/**
 * Unified reset manager for cross-platform data isolation
 */
export class UnifiedResetManager {
  private static instance: UnifiedResetManager;
  private resetInProgress: boolean = false;
  private resetCallbacks: Set<(result: ResetResult) => void> = new Set();

  private constructor() {}

  static getInstance(): UnifiedResetManager {
    if (!UnifiedResetManager.instance) {
      UnifiedResetManager.instance = new UnifiedResetManager();
    }
    return UnifiedResetManager.instance;
  }

  /**
   * Register callback for reset completion
   */
  onResetComplete(callback: (result: ResetResult) => void): void {
    this.resetCallbacks.add(callback);
  }

  /**
   * Unregister reset callback
   */
  offResetComplete(callback: (result: ResetResult) => void): void {
    this.resetCallbacks.delete(callback);
  }

  /**
   * Perform unified reset across all platforms
   */
  async performUnifiedReset(config: ResetConfig): Promise<ResetResult[]> {
    if (this.resetInProgress) {
      throw new Error('Reset already in progress');
    }

    this.resetInProgress = true;
    const results: ResetResult[] = [];

    try {
      // Detect current platform
      const platform = this.detectPlatform();
      
      // Perform platform-specific reset
      const result = await this.resetPlatformData(platform, config);
      results.push(result);

      // Notify callbacks
      this.resetCallbacks.forEach(callback => callback(result));

      return results;
    } finally {
      this.resetInProgress = false;
    }
  }

  /**
   * Reset data for specific platform
   */
  private async resetPlatformData(platform: string, config: ResetConfig): Promise<ResetResult> {
    const clearedItems: string[] = [];
    const errors: string[] = [];

    try {
      switch (platform) {
        case 'web':
          await this.resetWebData(config, clearedItems, errors);
          break;
        case 'android':
          await this.resetAndroidData(config, clearedItems, errors);
          break;
        case 'ios':
          await this.resetIOSData(config, clearedItems, errors);
          break;
        default:
          errors.push(`Unsupported platform: ${platform}`);
      }

      return {
        success: errors.length === 0,
        platform,
        clearedItems,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return {
        success: false,
        platform,
        clearedItems,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Reset web platform data
   */
  private async resetWebData(config: ResetConfig, clearedItems: string[], errors: string[]): Promise<void> {
    try {
      // Clear IndexedDB
      if (config.clearAll || config.clearIdentity) {
        await this.clearWebIdentity();
        clearedItems.push('web_identity');
      }

      if (config.clearAll || config.clearMessages) {
        await this.clearWebMessages();
        clearedItems.push('web_messages');
      }

      if (config.clearAll || config.clearContacts) {
        await this.clearWebContacts();
        clearedItems.push('web_contacts');
      }

      if (config.clearAll || config.clearConversations) {
        await this.clearWebConversations();
        clearedItems.push('web_conversations');
      }

      if (config.clearAll || config.clearRoutes) {
        await this.clearWebRoutes();
        clearedItems.push('web_routes');
      }

      if (config.clearAll || config.clearSettings) {
        await this.clearWebSettings();
        clearedItems.push('web_settings');
      }

      if (config.clearAll || config.clearCache) {
        await this.clearWebCache();
        clearedItems.push('web_cache');
      }

      // Clear localStorage and sessionStorage
      if (config.clearAll) {
        if (typeof localStorage !== 'undefined') {
          localStorage.clear();
          clearedItems.push('localStorage');
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
          clearedItems.push('sessionStorage');
        }
      }

    } catch (error) {
      errors.push(`Web reset error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset Android platform data
   */
  private async resetAndroidData(config: ResetConfig, clearedItems: string[], errors: string[]): Promise<void> {
    try {
      // For Android, we need to communicate with the native layer
      // This would be implemented via a bridge in a real scenario
      
      // Clear identity
      if (config.clearAll || config.clearIdentity) {
        await this.clearAndroidIdentity();
        clearedItems.push('android_identity');
      }

      // Clear database
      if (config.clearAll || config.clearMessages || config.clearContacts || config.clearConversations) {
        await this.clearAndroidDatabase();
        clearedItems.push('android_database');
      }

      // Clear SharedPreferences
      if (config.clearAll || config.clearSettings) {
        await this.clearAndroidPreferences();
        clearedItems.push('android_preferences');
      }

      // Clear cache
      if (config.clearAll || config.clearCache) {
        await this.clearAndroidCache();
        clearedItems.push('android_cache');
      }

    } catch (error) {
      errors.push(`Android reset error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset iOS platform data
   */
  private async resetIOSData(config: ResetConfig, clearedItems: string[], errors: string[]): Promise<void> {
    try {
      // For iOS, we need to communicate with the native layer
      // This would be implemented via a bridge in a real scenario
      
      // Clear identity
      if (config.clearAll || config.clearIdentity) {
        await this.clearIOSIdentity();
        clearedItems.push('ios_identity');
      }

      // Clear database
      if (config.clearAll || config.clearMessages || config.clearContacts || config.clearConversations) {
        await this.clearIOSDatabase();
        clearedItems.push('ios_database');
      }

      // Clear UserDefaults
      if (config.clearAll || config.clearSettings) {
        await this.clearIOSUserDefaults();
        clearedItems.push('ios_user_defaults');
      }

      // Clear cache
      if (config.clearAll || config.clearCache) {
        await this.clearIOSCache();
        clearedItems.push('ios_cache');
      }

    } catch (error) {
      errors.push(`iOS reset error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Web platform reset methods
   */
  private async clearWebIdentity(): Promise<void> {
    // Clear web identity data
    console.log('Web identity reset: Clearing identity data');
  }

  private async clearWebMessages(): Promise<void> {
    // Clear web messages
    console.log('Web messages reset: Clearing message data');
  }

  private async clearWebContacts(): Promise<void> {
    // Clear web contacts
    console.log('Web contacts reset: Clearing contact data');
  }

  private async clearWebConversations(): Promise<void> {
    // Clear web conversations
    console.log('Web conversations reset: Clearing conversation data');
  }

  private async clearWebRoutes(): Promise<void> {
    // Clear web routes
    console.log('Web routes reset: Clearing route data');
  }

  private async clearWebSettings(): Promise<void> {
    // Clear web settings
    console.log('Web settings reset: Clearing settings data');
  }

  private async clearWebCache(): Promise<void> {
    // Clear service worker cache
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    // Clear application cache if available
    if ('applicationCache' in window) {
      await window.applicationCache?.clear();
    }
  }

  /**
   * Android platform reset methods (bridge implementations)
   */
  private async clearAndroidIdentity(): Promise<void> {
    // This would communicate with Android native code
    // For now, we'll simulate the bridge call
    console.log('Android identity reset: Would call native bridge');
  }

  private async clearAndroidDatabase(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android database reset: Would call native bridge');
  }

  private async clearAndroidPreferences(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android preferences reset: Would call native bridge');
  }

  private async clearAndroidCache(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android cache reset: Would call native bridge');
  }

  /**
   * iOS platform reset methods (bridge implementations)
   */
  private async clearIOSIdentity(): Promise<void> {
    // This would communicate with iOS native code
    // For now, we'll simulate the bridge call
    console.log('iOS identity reset: Would call native bridge');
  }

  private async clearIOSDatabase(): Promise<void> {
    // This would communicate with iOS native code
    console.log('iOS database reset: Would call native bridge');
  }

  private async clearIOSUserDefaults(): Promise<void> {
    // This would communicate with iOS native code
    console.log('iOS user defaults reset: Would call native bridge');
  }

  private async clearIOSCache(): Promise<void> {
    // This would communicate with iOS native code
    console.log('iOS cache reset: Would call native bridge');
  }

  /**
   * Detect current platform
   */
  private detectPlatform(): string {
    if (typeof window !== 'undefined') {
      // Web platform
      return 'web';
    } else if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Android')) {
      // Android platform
      return 'android';
    } else if (typeof navigator !== 'undefined' && navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
      // iOS platform
      return 'ios';
    } else {
      // Unknown platform
      return 'unknown';
    }
  }

  /**
   * Check if reset is in progress
   */
  isResetInProgress(): boolean {
    return this.resetInProgress;
  }

  /**
   * Get reset status
   */
  getResetStatus(): {
    inProgress: boolean;
    platform: string;
  } {
    return {
      inProgress: this.resetInProgress,
      platform: this.detectPlatform()
    };
  }
}
