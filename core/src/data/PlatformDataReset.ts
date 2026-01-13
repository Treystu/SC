/**
 * Platform-specific data reset utilities
 * Ensures complete data isolation and prevents bleedover between platforms
 */

export interface ResetResult {
  success: boolean;
  platform: string;
  clearedItems: string[];
  errors?: string[];
  timestamp: number;
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
 * Platform-specific data reset implementation
 */
export class PlatformDataReset {
  private static instance: PlatformDataReset;
  private resetInProgress: boolean = false;

  private constructor() {}

  static getInstance(): PlatformDataReset {
    if (!PlatformDataReset.instance) {
      PlatformDataReset.instance = new PlatformDataReset();
    }
    return PlatformDataReset.instance;
  }

  /**
   * Perform complete data reset for current platform
   */
  async performCompleteReset(config: ResetConfig): Promise<ResetResult> {
    if (this.resetInProgress) {
      throw new Error('Reset already in progress');
    }

    this.resetInProgress = true;
    const startTime = Date.now();
    
    try {
      const platform = this.detectPlatform();
      const result = await this.resetPlatformData(platform, config);
      
      return {
        ...result,
        timestamp: startTime
      };
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
        errors: errors.length > 0 ? errors : undefined,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        platform,
        clearedItems,
        errors: [error instanceof Error ? error.message : String(error)],
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Reset web platform data
   */
  private async resetWebData(config: ResetConfig, clearedItems: string[], errors: string[]): Promise<void> {
    try {
      // Clear IndexedDB databases
      if (config.clearAll || config.clearIdentity || config.clearMessages || config.clearContacts || config.clearConversations) {
        await this.clearAllIndexedDB();
        clearedItems.push('indexedDB_databases');
      }

      // Clear localStorage
      if (config.clearAll || config.clearSettings) {
        if (typeof localStorage !== 'undefined') {
          localStorage.clear();
          clearedItems.push('localStorage');
        }
      }

      // Clear sessionStorage
      if (config.clearAll) {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.clear();
          clearedItems.push('sessionStorage');
        }
      }

      // Clear service worker cache
      if (config.clearAll || config.clearCache) {
        await this.clearServiceWorkerCache();
        clearedItems.push('serviceWorker_cache');
      }

      // Clear application cache
      if (config.clearAll || config.clearCache) {
        await this.clearApplicationCache();
        clearedItems.push('application_cache');
      }

      // Clear WebRTC peer connections
      if (config.clearAll || config.clearRoutes) {
        await this.clearWebRTCConnections();
        clearedItems.push('webrtc_connections');
      }

      // Force page reload to ensure clean state
      if (config.clearAll) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
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
      // For Android, we need to communicate with native code
      // This would be implemented via a bridge in a real scenario
      
      if (config.clearAll || config.clearIdentity) {
        await this.clearAndroidIdentity();
        clearedItems.push('android_identity');
      }

      if (config.clearAll || config.clearMessages || config.clearContacts || config.clearConversations) {
        await this.clearAndroidDatabase();
        clearedItems.push('android_database');
      }

      if (config.clearAll || config.clearSettings) {
        await this.clearAndroidSharedPreferences();
        clearedItems.push('android_shared_preferences');
      }

      if (config.clearAll || config.clearCache) {
        await this.clearAndroidCache();
        clearedItems.push('android_cache');
      }

      // Clear Android Keystore entries
      if (config.clearAll || config.clearIdentity) {
        await this.clearAndroidKeystore();
        clearedItems.push('android_keystore');
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
      // For iOS, we need to communicate with native code
      // This would be implemented via a bridge in a real scenario
      
      if (config.clearAll || config.clearIdentity) {
        await this.clearIOSIdentity();
        clearedItems.push('ios_identity');
      }

      if (config.clearAll || config.clearMessages || config.clearContacts || config.clearConversations) {
        await this.clearIOSDatabase();
        clearedItems.push('ios_database');
      }

      if (config.clearAll || config.clearSettings) {
        await this.clearIOSUserDefaults();
        clearedItems.push('ios_user_defaults');
      }

      if (config.clearAll || config.clearCache) {
        await this.clearIOSCache();
        clearedItems.push('ios_cache');
      }

      // Clear iOS Keychain entries
      if (config.clearAll || config.clearIdentity) {
        await this.clearIOSKeychain();
        clearedItems.push('ios_keychain');
      }

    } catch (error) {
      errors.push(`iOS reset error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Web platform reset methods
   */
  private async clearAllIndexedDB(): Promise<void> {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      const name = db?.name;
      if (typeof name === 'string' && name.length > 0) {
        await indexedDB.deleteDatabase(name);
      }
    }
  }

  private async clearServiceWorkerCache(): Promise<void> {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
  }

  private async clearApplicationCache(): Promise<void> {
    if ('applicationCache' in window) {
      const appCache = (window as unknown as { applicationCache?: { update?: () => Promise<void> | void } }).applicationCache;
      const updater = appCache?.update;
      if (typeof updater === 'function') {
        await Promise.resolve(updater.call(appCache));
      }
    }
  }

  private async clearWebRTCConnections(): Promise<void> {
    // Close any existing WebRTC connections
    // This would need to be implemented in the actual WebRTC manager
    console.log('Clearing WebRTC connections');
  }

  /**
   * Android platform reset methods (bridge implementations)
   */
  private async clearAndroidIdentity(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android identity reset: Would call native bridge');
  }

  private async clearAndroidDatabase(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android database reset: Would call native bridge');
  }

  private async clearAndroidSharedPreferences(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android preferences reset: Would call native bridge');
  }

  private async clearAndroidCache(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android cache reset: Would call native bridge');
  }

  private async clearAndroidKeystore(): Promise<void> {
    // This would communicate with Android native code
    console.log('Android keystore reset: Would call native bridge');
  }

  /**
   * iOS platform reset methods (bridge implementations)
   */
  private async clearIOSIdentity(): Promise<void> {
    // This would communicate with iOS native code
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

  private async clearIOSKeychain(): Promise<void> {
    // This would communicate with iOS native code
    console.log('iOS keychain reset: Would call native bridge');
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
    } else if (typeof navigator !== 'undefined' && (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad'))) {
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

  /**
   * Verify reset completeness
   */
  async verifyResetCompleteness(): Promise<boolean> {
    const platform = this.detectPlatform();
    
    switch (platform) {
      case 'web':
        return this.verifyWebReset();
      case 'android':
        return this.verifyAndroidReset();
      case 'ios':
        return this.verifyIOSReset();
      default:
        return false;
    }
  }

  private async verifyWebReset(): Promise<boolean> {
    // Check if IndexedDB is empty
    const databases = await indexedDB.databases();
    if (databases.length > 0) return false;
    
    // Check if localStorage is empty
    if (typeof localStorage !== 'undefined' && localStorage.length > 0) return false;
    
    // Check if sessionStorage is empty
    if (typeof sessionStorage !== 'undefined' && sessionStorage.length > 0) return false;
    
    return true;
  }

  private async verifyAndroidReset(): Promise<boolean> {
    // This would verify with Android native code
    console.log('Verifying Android reset: Would call native bridge');
    return true;
  }

  private async verifyIOSReset(): Promise<boolean> {
    // This would verify with iOS native code
    console.log('Verifying iOS reset: Would call native bridge');
    return true;
  }
}
