/**
 * PowerManager - Adaptive power management for survival mode
 *
 * Power profiles:
 * - FULL: Always on, full scanning, relay everything
 * - BALANCED: 50% duty cycle, moderate scanning
 * - SURVIVAL: 10% duty cycle, critical only
 * - DEAD_PHONE: One-shot sync, then shutdown
 *
 * Target: 72+ hours battery life in SURVIVAL mode
 */

/**
 * Power profiles
 */
export enum PowerProfile {
  FULL = 'full',           // Always on, full functionality
  BALANCED = 'balanced',   // 50% duty cycle
  SURVIVAL = 'survival',   // 10% duty cycle, critical only
  DEAD_PHONE = 'dead_phone', // One-shot sync then shutdown
}

/**
 * Configuration for each power profile
 */
export interface PowerProfileConfig {
  profile: PowerProfile;

  /** Interval between wake periods (ms, 0 = always on) */
  wakeInterval: number;

  /** Duration of each wake period (ms) */
  wakeDuration: number;

  /** Duration of BLE scanning per wake (ms) */
  scanDuration: number;

  /** Whether to participate in relay */
  relayEnabled: boolean;

  /** Whether to sync with discovered peers */
  syncOnConnect: boolean;

  /** Minimum priority to relay */
  minRelayPriority: number; // 0=LOW, 1=NORMAL, 2=HIGH, 3=EMERGENCY

  /** Maximum messages to relay per wake */
  maxRelayPerWake: number;
}

/**
 * Predefined power profiles
 */
export const POWER_PROFILES: Record<PowerProfile, PowerProfileConfig> = {
  [PowerProfile.FULL]: {
    profile: PowerProfile.FULL,
    wakeInterval: 0,           // Always on
    wakeDuration: Infinity,
    scanDuration: 30_000,      // 30s scans
    relayEnabled: true,
    syncOnConnect: true,
    minRelayPriority: 0,       // Relay all
    maxRelayPerWake: Infinity,
  },

  [PowerProfile.BALANCED]: {
    profile: PowerProfile.BALANCED,
    wakeInterval: 60_000,      // Wake every minute
    wakeDuration: 30_000,      // 30s active
    scanDuration: 10_000,      // 10s scans
    relayEnabled: true,
    syncOnConnect: true,
    minRelayPriority: 0,       // Relay all
    maxRelayPerWake: 100,
  },

  [PowerProfile.SURVIVAL]: {
    profile: PowerProfile.SURVIVAL,
    wakeInterval: 300_000,     // Wake every 5 minutes
    wakeDuration: 15_000,      // 15s active
    scanDuration: 5_000,       // 5s scans
    relayEnabled: false,       // Don't relay others' messages
    syncOnConnect: true,
    minRelayPriority: 2,       // Only HIGH and EMERGENCY
    maxRelayPerWake: 10,
  },

  [PowerProfile.DEAD_PHONE]: {
    profile: PowerProfile.DEAD_PHONE,
    wakeInterval: 0,           // One-shot
    wakeDuration: 600_000,     // 10 minutes max
    scanDuration: 30_000,      // Full scan
    relayEnabled: true,        // Maximize sync opportunity
    syncOnConnect: true,
    minRelayPriority: 0,       // Sync everything possible
    maxRelayPerWake: Infinity,
  },
};

/**
 * Battery thresholds for auto-profile selection
 */
export interface BatteryThresholds {
  /** Below this %, enter BALANCED (default: 50%) */
  balanced: number;

  /** Below this %, enter SURVIVAL (default: 20%) */
  survival: number;

  /** Below this %, enter DEAD_PHONE (default: 5%) */
  deadPhone: number;
}

/**
 * Default battery thresholds
 */
export const DEFAULT_BATTERY_THRESHOLDS: BatteryThresholds = {
  balanced: 50,
  survival: 20,
  deadPhone: 5,
};

/**
 * Battery status
 */
export interface BatteryStatus {
  /** Battery level 0-100 */
  level: number;

  /** Whether device is charging */
  charging: boolean;

  /** Estimated time remaining (ms), -1 if unknown */
  timeRemaining: number;

  /** Timestamp of last update */
  timestamp: number;
}

/**
 * Power state change event
 */
export interface PowerStateChange {
  previousProfile: PowerProfile;
  newProfile: PowerProfile;
  reason: 'manual' | 'auto' | 'battery' | 'emergency';
  timestamp: number;
}

/**
 * PowerManager controls duty cycling and power optimization
 */
export class PowerManager {
  private currentProfile: PowerProfile = PowerProfile.FULL;
  private config: PowerProfileConfig = POWER_PROFILES[PowerProfile.FULL];
  private batteryThresholds: BatteryThresholds = DEFAULT_BATTERY_THRESHOLDS;
  private autoProfileEnabled = false;

  private wakeTimer?: ReturnType<typeof setTimeout>;
  private sleepTimer?: ReturnType<typeof setTimeout>;
  private isAwake = true;

  private onWakeCallbacks: (() => void)[] = [];
  private onSleepCallbacks: (() => void)[] = [];
  private onStateChangeCallbacks: ((change: PowerStateChange) => void)[] = [];

  private lastBattery: BatteryStatus = {
    level: 100,
    charging: false,
    timeRemaining: -1,
    timestamp: Date.now(),
  };

  constructor(initialProfile: PowerProfile = PowerProfile.FULL) {
    this.setProfile(initialProfile, 'manual');
  }

  /**
   * Get current power profile
   */
  getProfile(): PowerProfile {
    return this.currentProfile;
  }

  /**
   * Get current profile configuration
   */
  getConfig(): PowerProfileConfig {
    return { ...this.config };
  }

  /**
   * Set power profile
   */
  setProfile(profile: PowerProfile, reason: 'manual' | 'auto' | 'battery' | 'emergency' = 'manual'): void {
    if (profile === this.currentProfile) return;

    const previousProfile = this.currentProfile;
    this.currentProfile = profile;
    this.config = POWER_PROFILES[profile];

    console.log(`[PowerManager] Profile changed: ${previousProfile} -> ${profile} (${reason})`);

    // Notify listeners
    const change: PowerStateChange = {
      previousProfile,
      newProfile: profile,
      reason,
      timestamp: Date.now(),
    };

    for (const callback of this.onStateChangeCallbacks) {
      try {
        callback(change);
      } catch (err) {
        console.error('[PowerManager] State change callback error:', err);
      }
    }

    // Restart duty cycle with new config
    this.restartDutyCycle();
  }

  /**
   * Enable auto profile selection based on battery level
   */
  enableAutoProfile(thresholds: BatteryThresholds = DEFAULT_BATTERY_THRESHOLDS): void {
    this.batteryThresholds = thresholds;
    this.autoProfileEnabled = true;
    console.log('[PowerManager] Auto profile enabled');
  }

  /**
   * Disable auto profile selection
   */
  disableAutoProfile(): void {
    this.autoProfileEnabled = false;
    console.log('[PowerManager] Auto profile disabled');
  }

  /**
   * Update battery status (call from platform-specific battery API)
   */
  updateBattery(status: BatteryStatus): void {
    this.lastBattery = status;

    if (this.autoProfileEnabled && !status.charging) {
      // Auto-select profile based on battery
      let newProfile = PowerProfile.FULL;

      if (status.level <= this.batteryThresholds.deadPhone) {
        newProfile = PowerProfile.DEAD_PHONE;
      } else if (status.level <= this.batteryThresholds.survival) {
        newProfile = PowerProfile.SURVIVAL;
      } else if (status.level <= this.batteryThresholds.balanced) {
        newProfile = PowerProfile.BALANCED;
      }

      if (newProfile !== this.currentProfile) {
        this.setProfile(newProfile, 'battery');
      }
    }
  }

  /**
   * Get last known battery status
   */
  getBatteryStatus(): BatteryStatus {
    return { ...this.lastBattery };
  }

  /**
   * Force wake (for immediate action)
   */
  forceWake(reason: string = 'manual'): void {
    console.log(`[PowerManager] Force wake: ${reason}`);

    if (!this.isAwake) {
      this.wake();
    }
  }

  /**
   * Check if currently awake
   */
  isCurrentlyAwake(): boolean {
    return this.isAwake;
  }

  /**
   * Register wake callback
   */
  onWake(callback: () => void): void {
    this.onWakeCallbacks.push(callback);
  }

  /**
   * Register sleep callback
   */
  onSleep(callback: () => void): void {
    this.onSleepCallbacks.push(callback);
  }

  /**
   * Register state change callback
   */
  onStateChange(callback: (change: PowerStateChange) => void): void {
    this.onStateChangeCallbacks.push(callback);
  }

  /**
   * Start the power management duty cycle
   */
  start(): void {
    console.log(`[PowerManager] Starting with profile ${this.currentProfile}`);
    this.restartDutyCycle();
  }

  /**
   * Stop power management
   */
  stop(): void {
    console.log('[PowerManager] Stopping');

    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }

    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = undefined;
    }
  }

  /**
   * Prepare for imminent power loss (dead phone mode)
   */
  async prepareForShutdown(): Promise<void> {
    console.log('[PowerManager] Preparing for shutdown');

    // Notify sleep callbacks to persist state
    for (const callback of this.onSleepCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('[PowerManager] Shutdown callback error:', err);
      }
    }
  }

  /**
   * Estimate time remaining at current power profile
   * Based on typical smartphone usage
   */
  estimateTimeRemaining(): number {
    const battery = this.lastBattery;
    if (battery.charging) return Infinity;

    // Rough estimates (mA draw)
    const powerDraw: Record<PowerProfile, number> = {
      [PowerProfile.FULL]: 250,     // ~4 hours on 1000mAh
      [PowerProfile.BALANCED]: 150, // ~7 hours
      [PowerProfile.SURVIVAL]: 50,  // ~20 hours
      [PowerProfile.DEAD_PHONE]: 300, // ~3 hours (full sync mode)
    };

    // Assume average 3000mAh battery
    const batteryCapacity = 3000;
    const currentMah = (battery.level / 100) * batteryCapacity;
    const hoursRemaining = currentMah / powerDraw[this.currentProfile];

    return hoursRemaining * 60 * 60 * 1000; // Convert to ms
  }

  // ============== Private Methods ==============

  private restartDutyCycle(): void {
    // Clear existing timers
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);

    // DEAD_PHONE mode = one-shot immediate wake (check before wakeInterval === 0)
    if (this.currentProfile === PowerProfile.DEAD_PHONE) {
      this.isAwake = false; // Start sleeping to trigger wake callbacks
      this.wake(); // Immediate wake
      this.sleepTimer = setTimeout(() => {
        this.sleep();
        // Don't schedule next wake - we're done
      }, this.config.wakeDuration);
      return;
    }

    // FULL mode = always awake (wakeInterval === 0)
    if (this.config.wakeInterval === 0) {
      this.isAwake = true;
      return;
    }

    // Normal duty cycle - start sleeping, then wake after interval
    this.isAwake = false;
    this.scheduleNextWake();
  }

  private scheduleNextWake(): void {
    if (this.config.wakeInterval === 0) return;

    this.wakeTimer = setTimeout(() => {
      this.wake();

      // Schedule sleep after wake duration
      this.sleepTimer = setTimeout(() => {
        this.sleep();
      }, this.config.wakeDuration);

      // Schedule next wake based on wake-to-wake interval
      // (wakeInterval is measured from this wake to the next wake)
      this.scheduleNextWake();

    }, this.config.wakeInterval);
  }

  private wake(): void {
    if (this.isAwake) return;

    this.isAwake = true;
    console.log('[PowerManager] Wake');

    for (const callback of this.onWakeCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('[PowerManager] Wake callback error:', err);
      }
    }
  }

  private sleep(): void {
    if (!this.isAwake) return;

    this.isAwake = false;
    console.log('[PowerManager] Sleep');

    for (const callback of this.onSleepCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('[PowerManager] Sleep callback error:', err);
      }
    }
  }
}

/**
 * Create a power manager instance
 */
export function createPowerManager(initialProfile: PowerProfile = PowerProfile.FULL): PowerManager {
  return new PowerManager(initialProfile);
}
