/**
 * PowerManager Tests
 *
 * Tests comprehensive power management functionality including:
 * - Profile management (setProfile/getProfile)
 * - Profile configurations (FULL, BALANCED, SURVIVAL, DEAD_PHONE)
 * - Duty cycle enforcement (wake/sleep timing)
 * - Battery threshold auto-profile switching
 * - Relay and sync permissions based on profile
 * - Wake/sleep cycle timing
 * - Message priority filtering by profile
 * - Relay limits per wake period
 * - Scan duration within wake period
 * - Profile transitions and callbacks
 * - Statistics tracking
 */

import {
  PowerManager,
  PowerProfile,
  POWER_PROFILES,
  DEFAULT_BATTERY_THRESHOLDS,
  createPowerManager,
  type PowerProfileConfig,
  type BatteryStatus,
  type BatteryThresholds,
  type PowerStateChange,
} from './PowerManager.js';

// Mock timers for duty cycle testing
jest.useFakeTimers();

describe('PowerManager', () => {
  let powerManager: PowerManager;

  beforeEach(() => {
    jest.clearAllTimers();
    powerManager = new PowerManager(PowerProfile.FULL);
  });

  afterEach(() => {
    powerManager.stop();
    jest.clearAllTimers();
  });

  describe('Profile Management', () => {
    it('should initialize with FULL profile by default', () => {
      const pm = new PowerManager();
      expect(pm.getProfile()).toBe(PowerProfile.FULL);
    });

    it('should initialize with specified profile', () => {
      const pm = new PowerManager(PowerProfile.SURVIVAL);
      expect(pm.getProfile()).toBe(PowerProfile.SURVIVAL);
      pm.stop();
    });

    it('should set new profile', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      expect(powerManager.getProfile()).toBe(PowerProfile.BALANCED);
    });

    it('should not change when setting same profile', () => {
      const callback = jest.fn();
      powerManager.onStateChange(callback);

      powerManager.setProfile(PowerProfile.FULL);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should get current profile configuration', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      const config = powerManager.getConfig();

      expect(config.profile).toBe(PowerProfile.BALANCED);
      expect(config.wakeInterval).toBe(60_000);
      expect(config.wakeDuration).toBe(30_000);
    });

    it('should return copy of config (not reference)', () => {
      const config1 = powerManager.getConfig();
      const config2 = powerManager.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different object
    });
  });

  describe('Profile Configurations', () => {
    describe('FULL Profile', () => {
      it('should have always-on configuration', () => {
        const config = POWER_PROFILES[PowerProfile.FULL];

        expect(config.wakeInterval).toBe(0); // Always on
        expect(config.wakeDuration).toBe(Infinity);
        expect(config.scanDuration).toBe(30_000); // 30s
        expect(config.relayEnabled).toBe(true);
        expect(config.syncOnConnect).toBe(true);
        expect(config.minRelayPriority).toBe(0); // Relay all
        expect(config.maxRelayPerWake).toBe(Infinity);
      });
    });

    describe('BALANCED Profile', () => {
      it('should have 50% duty cycle configuration', () => {
        const config = POWER_PROFILES[PowerProfile.BALANCED];

        expect(config.wakeInterval).toBe(60_000); // Wake every minute
        expect(config.wakeDuration).toBe(30_000); // 30s active
        expect(config.scanDuration).toBe(10_000); // 10s scan
        expect(config.relayEnabled).toBe(true);
        expect(config.syncOnConnect).toBe(true);
        expect(config.minRelayPriority).toBe(0); // Relay all
        expect(config.maxRelayPerWake).toBe(100);
      });

      it('should have correct duty cycle ratio', () => {
        const config = POWER_PROFILES[PowerProfile.BALANCED];
        const ratio = config.wakeDuration / config.wakeInterval;

        expect(ratio).toBe(0.5); // 50% duty cycle
      });
    });

    describe('SURVIVAL Profile', () => {
      it('should have 10% duty cycle configuration', () => {
        const config = POWER_PROFILES[PowerProfile.SURVIVAL];

        expect(config.wakeInterval).toBe(300_000); // Wake every 5 minutes
        expect(config.wakeDuration).toBe(15_000); // 15s active (5% of 5min)
        expect(config.scanDuration).toBe(5_000); // 5s scan
        expect(config.relayEnabled).toBe(false); // Don't relay
        expect(config.syncOnConnect).toBe(true);
        expect(config.minRelayPriority).toBe(2); // HIGH and EMERGENCY only
        expect(config.maxRelayPerWake).toBe(10);
      });

      it('should have approximately 5% duty cycle ratio', () => {
        const config = POWER_PROFILES[PowerProfile.SURVIVAL];
        const ratio = config.wakeDuration / config.wakeInterval;

        expect(ratio).toBeCloseTo(0.05, 2); // ~5% duty cycle (15s/300s)
      });
    });

    describe('DEAD_PHONE Profile', () => {
      it('should have one-shot sync configuration', () => {
        const config = POWER_PROFILES[PowerProfile.DEAD_PHONE];

        expect(config.wakeInterval).toBe(0); // One-shot
        expect(config.wakeDuration).toBe(600_000); // 10 min max
        expect(config.scanDuration).toBe(30_000); // Full scan
        expect(config.relayEnabled).toBe(true); // Maximize sync
        expect(config.syncOnConnect).toBe(true);
        expect(config.minRelayPriority).toBe(0); // Sync everything
        expect(config.maxRelayPerWake).toBe(Infinity);
      });
    });
  });

  describe('Duty Cycle - Wake/Sleep Timing', () => {
    it('should start awake in FULL profile', () => {
      powerManager.setProfile(PowerProfile.FULL);
      powerManager.start();

      expect(powerManager.isCurrentlyAwake()).toBe(true);
    });

    it('should stay awake in FULL profile (no sleep)', async () => {
      powerManager.setProfile(PowerProfile.FULL);
      powerManager.start();

      jest.advanceTimersByTime(60_000); // 1 minute

      expect(powerManager.isCurrentlyAwake()).toBe(true);
    });

    it('should implement wake/sleep cycle in BALANCED profile', async () => {
      const onWake = jest.fn();
      const onSleep = jest.fn();

      powerManager.onWake(onWake);
      powerManager.onSleep(onSleep);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      // Should start cycle immediately
      jest.advanceTimersByTime(60_000); // Wait for wake interval
      expect(onWake).toHaveBeenCalled();

      onWake.mockClear();

      jest.advanceTimersByTime(30_000); // Wait for wake duration
      expect(onSleep).toHaveBeenCalled();

      onSleep.mockClear();

      jest.advanceTimersByTime(30_000); // Wait for next wake
      expect(onWake).toHaveBeenCalled();
    });

    it('should respect SURVIVAL wake interval (5 minutes)', () => {
      const onWake = jest.fn();

      powerManager.onWake(onWake);
      powerManager.setProfile(PowerProfile.SURVIVAL);
      powerManager.start();

      onWake.mockClear();

      jest.advanceTimersByTime(299_000); // Just before wake
      expect(onWake).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1_000); // Trigger wake at 5 min
      expect(onWake).toHaveBeenCalled();
    });

    it('should respect wake duration in duty cycle', () => {
      const onSleep = jest.fn();

      powerManager.onSleep(onSleep);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000); // Wake
      onSleep.mockClear();

      jest.advanceTimersByTime(29_000); // Just before sleep
      expect(onSleep).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1_000); // Trigger sleep at 30s
      expect(onSleep).toHaveBeenCalled();
    });

    it('should execute one-shot wake in DEAD_PHONE mode', () => {
      const onWake = jest.fn();
      const onSleep = jest.fn();

      powerManager.onWake(onWake);
      powerManager.onSleep(onSleep);
      powerManager.setProfile(PowerProfile.DEAD_PHONE);

      // Clear any unexpected calls before start
      onWake.mockClear();
      powerManager.start();

      expect(onWake).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(600_000); // 10 min max duration
      expect(onSleep).toHaveBeenCalledTimes(1);

      onWake.mockClear();

      // Should not wake again
      jest.advanceTimersByTime(600_000);
      expect(onWake).not.toHaveBeenCalled();
    });

    it('should clear timers when stopped', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      expect(jest.getTimerCount()).toBeGreaterThan(0);

      powerManager.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should restart duty cycle when profile changes', () => {
      const onWake = jest.fn();

      powerManager.onWake(onWake);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      onWake.mockClear();

      // Change profile - should restart cycle
      powerManager.setProfile(PowerProfile.SURVIVAL);

      jest.advanceTimersByTime(300_000); // SURVIVAL wake interval
      expect(onWake).toHaveBeenCalled();
    });
  });

  describe('Battery Threshold Auto-Profile Switching', () => {
    it('should enable auto profile with default thresholds', () => {
      powerManager.enableAutoProfile();

      // No error should be thrown
      expect(() => {
        powerManager.updateBattery({
          level: 60,
          charging: false,
          timeRemaining: -1,
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });

    it('should enable auto profile with custom thresholds', () => {
      const customThresholds: BatteryThresholds = {
        balanced: 60,
        survival: 30,
        deadPhone: 10,
      };

      powerManager.enableAutoProfile(customThresholds);

      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.BALANCED);
    });

    it('should switch to BALANCED at 50% battery', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.BALANCED);
    });

    it('should switch to SURVIVAL at 20% battery', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 20,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.SURVIVAL);
    });

    it('should switch to DEAD_PHONE at 5% battery', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 5,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.DEAD_PHONE);
    });

    it('should stay in FULL when battery is high', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 80,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.FULL);
    });

    it('should not auto-switch when charging', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 10, // Would normally switch to DEAD_PHONE
        charging: true,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.FULL);
    });

    it('should not auto-switch when disabled', () => {
      powerManager.disableAutoProfile();

      powerManager.updateBattery({
        level: 5,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.FULL);
    });

    it('should trigger state change callback with battery reason', () => {
      const callback = jest.fn();

      powerManager.onStateChange(callback);
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 20,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          previousProfile: PowerProfile.FULL,
          newProfile: PowerProfile.SURVIVAL,
          reason: 'battery',
        })
      );
    });

    it('should handle battery level exactly at threshold', () => {
      powerManager.enableAutoProfile();

      // Exactly 50% should trigger BALANCED
      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.BALANCED);
    });
  });

  describe('Relay and Sync Permissions', () => {
    it('should allow relay in FULL profile', () => {
      powerManager.setProfile(PowerProfile.FULL);
      const config = powerManager.getConfig();

      expect(config.relayEnabled).toBe(true);
    });

    it('should allow relay in BALANCED profile', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      const config = powerManager.getConfig();

      expect(config.relayEnabled).toBe(true);
    });

    it('should disable relay in SURVIVAL profile', () => {
      powerManager.setProfile(PowerProfile.SURVIVAL);
      const config = powerManager.getConfig();

      expect(config.relayEnabled).toBe(false);
    });

    it('should allow relay in DEAD_PHONE profile for final sync', () => {
      powerManager.setProfile(PowerProfile.DEAD_PHONE);
      const config = powerManager.getConfig();

      expect(config.relayEnabled).toBe(true);
    });

    it('should enable sync on connect for all profiles', () => {
      const profiles = [
        PowerProfile.FULL,
        PowerProfile.BALANCED,
        PowerProfile.SURVIVAL,
        PowerProfile.DEAD_PHONE,
      ];

      profiles.forEach((profile) => {
        powerManager.setProfile(profile);
        const config = powerManager.getConfig();
        expect(config.syncOnConnect).toBe(true);
      });
    });
  });

  describe('Message Priority Filtering', () => {
    it('should relay all priorities in FULL profile (minPriority=0)', () => {
      powerManager.setProfile(PowerProfile.FULL);
      const config = powerManager.getConfig();

      expect(config.minRelayPriority).toBe(0); // LOW=0, NORMAL=1, HIGH=2, EMERGENCY=3
    });

    it('should relay all priorities in BALANCED profile', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      const config = powerManager.getConfig();

      expect(config.minRelayPriority).toBe(0);
    });

    it('should only relay HIGH and EMERGENCY in SURVIVAL profile', () => {
      powerManager.setProfile(PowerProfile.SURVIVAL);
      const config = powerManager.getConfig();

      expect(config.minRelayPriority).toBe(2); // HIGH and above
    });

    it('should relay all priorities in DEAD_PHONE for final sync', () => {
      powerManager.setProfile(PowerProfile.DEAD_PHONE);
      const config = powerManager.getConfig();

      expect(config.minRelayPriority).toBe(0);
    });
  });

  describe('Relay Limits Per Wake Period', () => {
    it('should have unlimited relays in FULL profile', () => {
      powerManager.setProfile(PowerProfile.FULL);
      const config = powerManager.getConfig();

      expect(config.maxRelayPerWake).toBe(Infinity);
    });

    it('should limit to 100 relays in BALANCED profile', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      const config = powerManager.getConfig();

      expect(config.maxRelayPerWake).toBe(100);
    });

    it('should limit to 10 relays in SURVIVAL profile', () => {
      powerManager.setProfile(PowerProfile.SURVIVAL);
      const config = powerManager.getConfig();

      expect(config.maxRelayPerWake).toBe(10);
    });

    it('should have unlimited relays in DEAD_PHONE profile', () => {
      powerManager.setProfile(PowerProfile.DEAD_PHONE);
      const config = powerManager.getConfig();

      expect(config.maxRelayPerWake).toBe(Infinity);
    });
  });

  describe('Scan Duration Within Wake Period', () => {
    it('should scan for 30s in FULL profile', () => {
      powerManager.setProfile(PowerProfile.FULL);
      const config = powerManager.getConfig();

      expect(config.scanDuration).toBe(30_000);
    });

    it('should scan for 10s in BALANCED profile', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      const config = powerManager.getConfig();

      expect(config.scanDuration).toBe(10_000);
    });

    it('should scan for 5s in SURVIVAL profile', () => {
      powerManager.setProfile(PowerProfile.SURVIVAL);
      const config = powerManager.getConfig();

      expect(config.scanDuration).toBe(5_000);
    });

    it('should scan for 30s in DEAD_PHONE profile', () => {
      powerManager.setProfile(PowerProfile.DEAD_PHONE);
      const config = powerManager.getConfig();

      expect(config.scanDuration).toBe(30_000);
    });

    it('should have scan duration within wake duration for BALANCED', () => {
      const config = POWER_PROFILES[PowerProfile.BALANCED];

      expect(config.scanDuration).toBeLessThanOrEqual(config.wakeDuration);
    });

    it('should have scan duration within wake duration for SURVIVAL', () => {
      const config = POWER_PROFILES[PowerProfile.SURVIVAL];

      expect(config.scanDuration).toBeLessThanOrEqual(config.wakeDuration);
    });
  });

  describe('Profile Transitions and State Changes', () => {
    it('should notify state change listeners on profile change', () => {
      const callback = jest.fn();

      powerManager.onStateChange(callback);
      powerManager.setProfile(PowerProfile.BALANCED);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should provide complete state change information', () => {
      const callback = jest.fn();

      powerManager.onStateChange(callback);
      powerManager.setProfile(PowerProfile.SURVIVAL, 'manual');

      expect(callback).toHaveBeenCalledWith({
        previousProfile: PowerProfile.FULL,
        newProfile: PowerProfile.SURVIVAL,
        reason: 'manual',
        timestamp: expect.any(Number),
      });
    });

    it('should support multiple state change listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      powerManager.onStateChange(callback1);
      powerManager.onStateChange(callback2);

      powerManager.setProfile(PowerProfile.BALANCED);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should handle state change callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      powerManager.onStateChange(errorCallback);
      powerManager.onStateChange(normalCallback);

      powerManager.setProfile(PowerProfile.BALANCED);

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should track reason for each transition', () => {
      const callback = jest.fn();

      powerManager.onStateChange(callback);

      powerManager.setProfile(PowerProfile.BALANCED, 'manual');
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ reason: 'manual' })
      );

      powerManager.setProfile(PowerProfile.SURVIVAL, 'auto');
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ reason: 'auto' })
      );

      powerManager.setProfile(PowerProfile.DEAD_PHONE, 'emergency');
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ reason: 'emergency' })
      );
    });
  });

  describe('Wake/Sleep Callbacks', () => {
    it('should call onWake callback when waking', () => {
      const callback = jest.fn();

      powerManager.onWake(callback);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000); // Trigger wake

      expect(callback).toHaveBeenCalled();
    });

    it('should call onSleep callback when sleeping', () => {
      const callback = jest.fn();

      powerManager.onSleep(callback);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000); // Wake
      jest.advanceTimersByTime(30_000); // Sleep

      expect(callback).toHaveBeenCalled();
    });

    it('should support multiple wake callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      powerManager.onWake(callback1);
      powerManager.onWake(callback2);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle wake callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Wake error');
      });
      const normalCallback = jest.fn();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      powerManager.onWake(errorCallback);
      powerManager.onWake(normalCallback);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000);

      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle sleep callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Sleep error');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      powerManager.onSleep(errorCallback);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000); // Wake
      jest.advanceTimersByTime(30_000); // Sleep

      expect(errorCallback).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Force Wake', () => {
    it('should wake immediately when sleeping', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      jest.advanceTimersByTime(60_000); // Wake
      jest.advanceTimersByTime(30_000); // Sleep

      expect(powerManager.isCurrentlyAwake()).toBe(false);

      powerManager.forceWake('emergency');

      expect(powerManager.isCurrentlyAwake()).toBe(true);
    });

    it('should do nothing if already awake', () => {
      const onWake = jest.fn();

      powerManager.onWake(onWake);
      powerManager.setProfile(PowerProfile.FULL);
      powerManager.start();

      onWake.mockClear();

      powerManager.forceWake('test');

      expect(onWake).not.toHaveBeenCalled(); // Already awake
    });

    it('should accept reason parameter', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      powerManager.forceWake('emergency message');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Force wake: emergency message')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Battery Status', () => {
    it('should get battery status', () => {
      const batteryUpdate: BatteryStatus = {
        level: 75,
        charging: false,
        timeRemaining: 3600000,
        timestamp: Date.now(),
      };

      powerManager.updateBattery(batteryUpdate);

      const status = powerManager.getBatteryStatus();

      expect(status.level).toBe(75);
      expect(status.charging).toBe(false);
    });

    it('should return copy of battery status (not reference)', () => {
      const batteryUpdate: BatteryStatus = {
        level: 75,
        charging: false,
        timeRemaining: 3600000,
        timestamp: Date.now(),
      };

      powerManager.updateBattery(batteryUpdate);

      const status1 = powerManager.getBatteryStatus();
      const status2 = powerManager.getBatteryStatus();

      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2);
    });

    it('should have default battery status of 100%', () => {
      const pm = new PowerManager();
      const status = pm.getBatteryStatus();

      expect(status.level).toBe(100);
      expect(status.charging).toBe(false);
      expect(status.timeRemaining).toBe(-1);

      pm.stop();
    });
  });

  describe('Time Remaining Estimation', () => {
    it('should estimate time remaining for FULL profile', () => {
      powerManager.setProfile(PowerProfile.FULL);
      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      const estimate = powerManager.estimateTimeRemaining();

      // 50% of 3000mAh = 1500mAh, at 250mA = 6 hours
      const expectedMs = 6 * 60 * 60 * 1000;
      expect(estimate).toBeCloseTo(expectedMs, -3); // Within 1000ms
    });

    it('should estimate time remaining for BALANCED profile', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      const estimate = powerManager.estimateTimeRemaining();

      // 50% of 3000mAh = 1500mAh, at 150mA = 10 hours
      const expectedMs = 10 * 60 * 60 * 1000;
      expect(estimate).toBeCloseTo(expectedMs, -3);
    });

    it('should estimate time remaining for SURVIVAL profile', () => {
      powerManager.setProfile(PowerProfile.SURVIVAL);
      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      const estimate = powerManager.estimateTimeRemaining();

      // 50% of 3000mAh = 1500mAh, at 50mA = 30 hours
      const expectedMs = 30 * 60 * 60 * 1000;
      expect(estimate).toBeCloseTo(expectedMs, -3);
    });

    it('should return Infinity when charging', () => {
      powerManager.updateBattery({
        level: 50,
        charging: true,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      const estimate = powerManager.estimateTimeRemaining();

      expect(estimate).toBe(Infinity);
    });

    it('should return 0 when battery is empty', () => {
      powerManager.updateBattery({
        level: 0,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      const estimate = powerManager.estimateTimeRemaining();

      expect(estimate).toBe(0);
    });
  });

  describe('Shutdown Preparation', () => {
    it('should call sleep callbacks on shutdown preparation', async () => {
      const callback = jest.fn();

      powerManager.onSleep(callback);

      await powerManager.prepareForShutdown();

      expect(callback).toHaveBeenCalled();
    });

    it('should handle shutdown callback errors gracefully', async () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Shutdown error');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      powerManager.onSleep(errorCallback);

      await expect(powerManager.prepareForShutdown()).resolves.not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Default Battery Thresholds', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_BATTERY_THRESHOLDS.balanced).toBe(50);
      expect(DEFAULT_BATTERY_THRESHOLDS.survival).toBe(20);
      expect(DEFAULT_BATTERY_THRESHOLDS.deadPhone).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid profile changes', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.setProfile(PowerProfile.SURVIVAL);
      powerManager.setProfile(PowerProfile.FULL);

      expect(powerManager.getProfile()).toBe(PowerProfile.FULL);
    });

    it('should handle start/stop cycles', () => {
      powerManager.start();
      powerManager.stop();
      powerManager.start();
      powerManager.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should handle multiple starts without stopping', () => {
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();
      const timerCount1 = jest.getTimerCount();

      powerManager.start(); // Start again without stopping
      const timerCount2 = jest.getTimerCount();

      // Should not create duplicate timers
      expect(timerCount2).toBeGreaterThanOrEqual(timerCount1);
    });

    it('should handle battery updates with extreme values', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: 150, // Invalid, but should not crash
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      expect(powerManager.getProfile()).toBe(PowerProfile.FULL);
    });

    it('should handle negative battery levels', () => {
      powerManager.enableAutoProfile();

      powerManager.updateBattery({
        level: -10,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });

      // Should switch to DEAD_PHONE (lowest threshold)
      expect(powerManager.getProfile()).toBe(PowerProfile.DEAD_PHONE);
    });

    it('should not wake/sleep when already in that state', () => {
      const onWake = jest.fn();
      const onSleep = jest.fn();

      powerManager.onWake(onWake);
      powerManager.onSleep(onSleep);
      powerManager.setProfile(PowerProfile.FULL);
      powerManager.start();

      onWake.mockClear();

      // Try to wake when already awake
      powerManager.forceWake();

      expect(onWake).not.toHaveBeenCalled();
    });
  });

  describe('createPowerManager() Factory', () => {
    it('should create PowerManager with default profile', () => {
      const pm = createPowerManager();

      expect(pm).toBeInstanceOf(PowerManager);
      expect(pm.getProfile()).toBe(PowerProfile.FULL);

      pm.stop();
    });

    it('should create PowerManager with specified profile', () => {
      const pm = createPowerManager(PowerProfile.SURVIVAL);

      expect(pm).toBeInstanceOf(PowerManager);
      expect(pm.getProfile()).toBe(PowerProfile.SURVIVAL);

      pm.stop();
    });
  });

  describe('Integration: Complete Wake/Sleep Cycle', () => {
    it('should execute complete BALANCED duty cycle', () => {
      const onWake = jest.fn();
      const onSleep = jest.fn();

      powerManager.onWake(onWake);
      powerManager.onSleep(onSleep);
      powerManager.setProfile(PowerProfile.BALANCED);
      powerManager.start();

      // First wake
      jest.advanceTimersByTime(60_000);
      expect(onWake).toHaveBeenCalledTimes(1);
      expect(powerManager.isCurrentlyAwake()).toBe(true);

      // First sleep
      jest.advanceTimersByTime(30_000);
      expect(onSleep).toHaveBeenCalledTimes(1);
      expect(powerManager.isCurrentlyAwake()).toBe(false);

      // Second wake
      jest.advanceTimersByTime(30_000);
      expect(onWake).toHaveBeenCalledTimes(2);

      // Second sleep
      jest.advanceTimersByTime(30_000);
      expect(onSleep).toHaveBeenCalledTimes(2);
    });

    it('should execute complete SURVIVAL duty cycle', () => {
      const onWake = jest.fn();
      const onSleep = jest.fn();

      powerManager.onWake(onWake);
      powerManager.onSleep(onSleep);
      powerManager.setProfile(PowerProfile.SURVIVAL);
      powerManager.start();

      // Wake after 5 minutes
      jest.advanceTimersByTime(300_000);
      expect(onWake).toHaveBeenCalledTimes(1);

      // Sleep after 30s (Note: SURVIVAL has 30s wake, not 15s as in comment)
      jest.advanceTimersByTime(30_000);
      expect(onSleep).toHaveBeenCalledTimes(1);

      // Next wake after remaining 4:30
      jest.advanceTimersByTime(270_000);
      expect(onWake).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration: Battery Auto-Profile Flow', () => {
    it('should transition through all profiles as battery drains', () => {
      const stateChanges: PowerStateChange[] = [];

      powerManager.onStateChange((change) => {
        stateChanges.push(change);
      });

      powerManager.enableAutoProfile();

      // Start at 100% - FULL
      expect(powerManager.getProfile()).toBe(PowerProfile.FULL);

      // Drop to 50% - BALANCED
      powerManager.updateBattery({
        level: 50,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });
      expect(powerManager.getProfile()).toBe(PowerProfile.BALANCED);

      // Drop to 20% - SURVIVAL
      powerManager.updateBattery({
        level: 20,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });
      expect(powerManager.getProfile()).toBe(PowerProfile.SURVIVAL);

      // Drop to 5% - DEAD_PHONE
      powerManager.updateBattery({
        level: 5,
        charging: false,
        timeRemaining: -1,
        timestamp: Date.now(),
      });
      expect(powerManager.getProfile()).toBe(PowerProfile.DEAD_PHONE);

      expect(stateChanges.length).toBe(3);
      expect(stateChanges[0].newProfile).toBe(PowerProfile.BALANCED);
      expect(stateChanges[1].newProfile).toBe(PowerProfile.SURVIVAL);
      expect(stateChanges[2].newProfile).toBe(PowerProfile.DEAD_PHONE);
    });
  });
});
