/**
 * Tests for Node Capabilities Detection System
 */

import {
  NodeCapabilitiesDetector,
  detectCapabilities,
  getCapabilitiesDetector,
  type NodeCapabilities,
  DEFAULT_CAPABILITY_CONFIG,
} from "./capabilities";
import { NATType } from "../nat/NATDetector";

describe("NodeCapabilitiesDetector", () => {
  let detector: NodeCapabilitiesDetector;

  beforeEach(() => {
    detector = new NodeCapabilitiesDetector({
      checkInterval: 1000, // Short for tests
    });
  });

  afterEach(() => {
    detector.stop();
  });

  describe("detectCapabilities", () => {
    it("should detect capabilities and return a valid result", async () => {
      const caps = await detector.detectCapabilities();

      expect(caps).toBeDefined();
      expect(typeof caps.hasPublicIP).toBe("boolean");
      expect(typeof caps.isAlwaysOn).toBe("boolean");
      expect(["low", "medium", "high"]).toContain(caps.bandwidth);
      expect(typeof caps.storage).toBe("number");
      expect(caps.storage).toBeGreaterThanOrEqual(0);
      expect(typeof caps.batteryPowered).toBe("boolean");
      expect(typeof caps.canSignal).toBe("boolean");
      expect(typeof caps.canRelay).toBe("boolean");
      expect(typeof caps.canStore).toBe("boolean");
      expect(caps.canDHT).toBe(true); // All nodes participate in DHT
      expect(typeof caps.lastChecked).toBe("number");
      expect(caps.lastChecked).toBeGreaterThan(0);
      expect(typeof caps.connectionQuality).toBe("number");
      expect(caps.connectionQuality).toBeGreaterThanOrEqual(0);
      expect(caps.connectionQuality).toBeLessThanOrEqual(100);
      expect(typeof caps.maxConnections).toBe("number");
      expect(caps.maxConnections).toBeGreaterThan(0);
    });

    it("should cache capabilities after detection", async () => {
      expect(detector.getCapabilities()).toBeNull();
      await detector.detectCapabilities();
      expect(detector.getCapabilities()).not.toBeNull();
    });

    it("should report needs refresh when no capabilities detected", () => {
      expect(detector.needsRefresh()).toBe(true);
    });

    it("should not need refresh immediately after detection", async () => {
      await detector.detectCapabilities();
      expect(detector.needsRefresh()).toBe(false);
    });
  });

  describe("Uptime tracking", () => {
    it("should track uptime sessions", async () => {
      const record = detector.exportUptimeRecord();
      expect(record.sessions.length).toBeGreaterThanOrEqual(1);
      expect(record.startTime).toBeGreaterThan(0);
    });

    it("should calculate uptime percentage", async () => {
      await detector.detectCapabilities();
      const record = detector.exportUptimeRecord();
      // Just started, so should be 100%
      expect(record.uptimePercentage).toBe(100);
    });

    it("should import uptime records", () => {
      const mockRecord = {
        startTime: Date.now() - 86400000, // 1 day ago
        sessions: [
          {
            start: Date.now() - 86400000,
            end: Date.now(),
          },
        ],
        totalUptime: 86400000,
        uptimePercentage: 100,
      };

      detector.importUptimeRecord(mockRecord);
      const exported = detector.exportUptimeRecord();
      expect(exported.sessions.length).toBeGreaterThanOrEqual(2); // Original + new
    });
  });

  describe("Capability summary", () => {
    it("should return not detected before first check", () => {
      const summary = detector.getCapabilitySummary();
      expect(summary.detected).toBe(false);
    });

    it("should return full summary after detection", async () => {
      await detector.detectCapabilities();
      const summary = detector.getCapabilitySummary();

      expect(summary.detected).toBe(true);
      expect(summary).toHaveProperty("hasPublicIP");
      expect(summary).toHaveProperty("natType");
      expect(summary).toHaveProperty("bandwidth");
      expect(summary).toHaveProperty("storage");
      expect(summary).toHaveProperty("canSignal");
      expect(summary).toHaveProperty("canRelay");
      expect(summary).toHaveProperty("canStore");
      expect(summary).toHaveProperty("connectionQuality");
      expect(summary).toHaveProperty("maxConnections");
      expect(summary).toHaveProperty("uptimePercentage");
    });
  });

  describe("Derived capabilities", () => {
    it("should set canDHT to true for all nodes", async () => {
      const caps = await detector.detectCapabilities();
      expect(caps.canDHT).toBe(true);
    });

    it("should set canSignal only with public IP and always-on", async () => {
      const caps = await detector.detectCapabilities();
      if (caps.canSignal) {
        expect(caps.hasPublicIP).toBe(true);
        expect(caps.isAlwaysOn).toBe(true);
      }
    });

    it("should set canRelay only with public IP and sufficient bandwidth", async () => {
      const caps = await detector.detectCapabilities();
      if (caps.canRelay) {
        expect(caps.hasPublicIP).toBe(true);
        expect(["medium", "high"]).toContain(caps.bandwidth);
      }
    });

    it("should set canStore only with sufficient storage and always-on", async () => {
      const caps = await detector.detectCapabilities();
      if (caps.canStore) {
        expect(caps.storage).toBeGreaterThanOrEqual(
          DEFAULT_CAPABILITY_CONFIG.minStorageForStore
        );
        expect(caps.isAlwaysOn).toBe(true);
      }
    });
  });

  describe("Default configuration", () => {
    it("should have valid defaults", () => {
      expect(DEFAULT_CAPABILITY_CONFIG.minStorageForStore).toBe(100);
      expect(DEFAULT_CAPABILITY_CONFIG.minBandwidthForRelay).toBe("medium");
      expect(DEFAULT_CAPABILITY_CONFIG.minUptimePercentage).toBe(95);
      expect(DEFAULT_CAPABILITY_CONFIG.checkInterval).toBe(300000);
    });
  });

  describe("Convenience functions", () => {
    it("detectCapabilities should return capabilities", async () => {
      const caps = await detectCapabilities();
      expect(caps).toBeDefined();
      expect(caps.canDHT).toBe(true);
    });
  });
});
