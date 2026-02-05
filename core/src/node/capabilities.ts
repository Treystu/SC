/**
 * Node Capabilities Detection System
 *
 * Auto-detects node capabilities to determine what services
 * a node can provide to the network. Every node runs identical code,
 * but capabilities determine what roles are enabled.
 *
 * "Core" nodes are simply peers with better hardware, uptime, or connectivity.
 * The network self-organizes around capable nodes.
 */

import { NATDetector, NATType, type NATProfile } from "../nat/NATDetector.js";

/**
 * Bandwidth classification for nodes
 */
export type BandwidthClass = "low" | "medium" | "high";

/**
 * Node capability profile
 */
export interface NodeCapabilities {
  /** Can accept incoming connections directly */
  hasPublicIP: boolean;

  /** Uptime > 95% over 7 days (tracked locally) */
  isAlwaysOn: boolean;

  /** Bandwidth classification */
  bandwidth: BandwidthClass;

  /** Available storage in MB for store-forward */
  storage: number;

  /** Is this a battery-powered device? */
  batteryPowered: boolean;

  /** NAT type detected */
  natType: NATType;

  /** Public IP address if available */
  publicIP?: string;

  /** Derived: Can act as signaling relay */
  canSignal: boolean;

  /** Derived: Can relay data between peers */
  canRelay: boolean;

  /** Derived: Can store messages for offline peers */
  canStore: boolean;

  /** Derived: Should participate in DHT as a full node */
  canDHT: boolean;

  /** Last capability check timestamp */
  lastChecked: number;

  /** Estimated connection quality (0-100) */
  connectionQuality: number;

  /** Maximum concurrent connections this node can handle */
  maxConnections: number;
}

/**
 * Uptime tracking for isAlwaysOn calculation
 */
export interface UptimeRecord {
  /** Timestamp when node started */
  startTime: number;

  /** Array of uptime sessions in the last 7 days */
  sessions: Array<{
    start: number;
    end: number;
  }>;

  /** Total uptime in milliseconds over last 7 days */
  totalUptime: number;

  /** Uptime percentage (0-100) */
  uptimePercentage: number;
}

/**
 * Configuration for capability detection
 */
export interface CapabilityConfig {
  /** Minimum storage (MB) to enable store-forward */
  minStorageForStore: number;

  /** Minimum bandwidth for relay */
  minBandwidthForRelay: BandwidthClass;

  /** Minimum uptime percentage for "always on" */
  minUptimePercentage: number;

  /** Storage check interval in ms */
  checkInterval: number;

  /** Enable aggressive capability detection */
  aggressiveDetection: boolean;
}

/**
 * Default capability configuration
 */
export const DEFAULT_CAPABILITY_CONFIG: CapabilityConfig = {
  minStorageForStore: 100, // 100 MB minimum
  minBandwidthForRelay: "medium",
  minUptimePercentage: 95,
  checkInterval: 300000, // 5 minutes
  aggressiveDetection: false,
};

/**
 * Bandwidth thresholds in kbps
 */
const BANDWIDTH_THRESHOLDS = {
  low: 0, // < 1 Mbps
  medium: 1000, // 1-10 Mbps
  high: 10000, // > 10 Mbps
};

/**
 * Node Capabilities Detector
 *
 * Runs on startup and periodically to detect what services
 * this node can provide to the network.
 */
export class NodeCapabilitiesDetector {
  private config: CapabilityConfig;
  private natDetector: NATDetector;
  private uptimeRecord: UptimeRecord;
  private capabilities: NodeCapabilities | null = null;
  private checkIntervalHandle?: ReturnType<typeof setInterval>;

  constructor(config: Partial<CapabilityConfig> = {}) {
    this.config = { ...DEFAULT_CAPABILITY_CONFIG, ...config };
    this.natDetector = new NATDetector();
    this.uptimeRecord = {
      startTime: Date.now(),
      sessions: [],
      totalUptime: 0,
      uptimePercentage: 0,
    };

    // Start a new session
    this.startSession();
  }

  /**
   * Start tracking a new uptime session
   */
  private startSession(): void {
    const now = Date.now();
    this.uptimeRecord.sessions.push({
      start: now,
      end: now, // Will be updated periodically
    });
  }

  /**
   * Update the current session's end time
   */
  private updateCurrentSession(): void {
    const sessions = this.uptimeRecord.sessions;
    if (sessions.length > 0) {
      sessions[sessions.length - 1].end = Date.now();
    }
    this.calculateUptimePercentage();
  }

  /**
   * Calculate uptime percentage over the last 7 days
   */
  private calculateUptimePercentage(): void {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Filter sessions to last 7 days and calculate total uptime
    let totalUptime = 0;
    for (const session of this.uptimeRecord.sessions) {
      const start = Math.max(session.start, sevenDaysAgo);
      const end = Math.min(session.end, now);
      if (end > start) {
        totalUptime += end - start;
      }
    }

    this.uptimeRecord.totalUptime = totalUptime;

    // Calculate percentage of 7 days
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const timeSinceTracking = Math.min(now - this.uptimeRecord.startTime, sevenDaysMs);

    if (timeSinceTracking > 0) {
      this.uptimeRecord.uptimePercentage = (totalUptime / timeSinceTracking) * 100;
    } else {
      this.uptimeRecord.uptimePercentage = 100; // Just started
    }

    // Prune old sessions
    this.uptimeRecord.sessions = this.uptimeRecord.sessions.filter(
      (s) => s.end > sevenDaysAgo
    );
  }

  /**
   * Detect node capabilities
   */
  async detectCapabilities(): Promise<NodeCapabilities> {
    this.updateCurrentSession();

    // Detect NAT profile
    const natProfile = await this.detectNAT();

    // Detect bandwidth
    const bandwidth = await this.detectBandwidth();

    // Detect storage
    const storage = await this.detectStorage();

    // Detect battery status
    const batteryPowered = await this.detectBattery();

    // Determine derived capabilities
    const hasPublicIP =
      natProfile.type === NATType.OPEN && !!natProfile.publicIP;

    const isAlwaysOn =
      this.uptimeRecord.uptimePercentage >= this.config.minUptimePercentage &&
      !batteryPowered;

    const canSignal = hasPublicIP && isAlwaysOn;

    const canRelay =
      hasPublicIP &&
      this.bandwidthMeetsThreshold(bandwidth, this.config.minBandwidthForRelay);

    const canStore =
      storage >= this.config.minStorageForStore && isAlwaysOn;

    const canDHT = true; // All nodes participate in DHT

    // Calculate connection quality
    const connectionQuality = this.calculateConnectionQuality(
      natProfile,
      bandwidth,
      isAlwaysOn
    );

    // Calculate max connections based on capabilities
    const maxConnections = this.calculateMaxConnections(bandwidth, storage);

    this.capabilities = {
      hasPublicIP,
      isAlwaysOn,
      bandwidth,
      storage,
      batteryPowered,
      natType: natProfile.type,
      publicIP: natProfile.publicIP,
      canSignal,
      canRelay,
      canStore,
      canDHT,
      lastChecked: Date.now(),
      connectionQuality,
      maxConnections,
    };

    return this.capabilities;
  }

  /**
   * Get current capabilities (cached)
   */
  getCapabilities(): NodeCapabilities | null {
    return this.capabilities;
  }

  /**
   * Check if capabilities need refresh
   */
  needsRefresh(): boolean {
    if (!this.capabilities) return true;
    return Date.now() - this.capabilities.lastChecked > this.config.checkInterval;
  }

  /**
   * Start periodic capability detection
   */
  start(): void {
    // Initial detection
    this.detectCapabilities();

    // Periodic refresh
    this.checkIntervalHandle = setInterval(
      () => this.detectCapabilities(),
      this.config.checkInterval
    );

    // Unref if possible (Node.js)
    try {
      if (this.checkIntervalHandle && typeof (this.checkIntervalHandle as any).unref === 'function') {
        (this.checkIntervalHandle as any).unref();
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Stop periodic capability detection
   */
  stop(): void {
    if (this.checkIntervalHandle) {
      clearInterval(this.checkIntervalHandle);
      this.checkIntervalHandle = undefined;
    }
  }

  /**
   * Detect NAT type
   */
  private async detectNAT(): Promise<NATProfile> {
    try {
      return await this.natDetector.detect();
    } catch {
      return {
        type: NATType.UNKNOWN,
        isWAN: false,
        detectedAt: Date.now(),
      };
    }
  }

  /**
   * Detect bandwidth class
   * Uses a simple heuristic based on network type and RTT measurements
   */
  private async detectBandwidth(): Promise<BandwidthClass> {
    try {
      // Check navigator.connection if available (Web/Chrome)
      if (typeof navigator !== "undefined" && "connection" in navigator) {
        const conn = (navigator as any).connection;
        if (conn) {
          const effectiveType = conn.effectiveType;
          const downlink = conn.downlink; // Mbps

          // Use downlink if available
          if (typeof downlink === "number") {
            if (downlink >= 10) return "high";
            if (downlink >= 1) return "medium";
            return "low";
          }

          // Fall back to effectiveType
          switch (effectiveType) {
            case "4g":
              return "high";
            case "3g":
              return "medium";
            case "2g":
            case "slow-2g":
              return "low";
          }
        }
      }

      // Default to medium for unknown
      return "medium";
    } catch {
      return "medium";
    }
  }

  /**
   * Detect available storage in MB
   */
  private async detectStorage(): Promise<number> {
    try {
      // Check StorageManager if available (Web)
      if (
        typeof navigator !== "undefined" &&
        "storage" in navigator &&
        "estimate" in (navigator as any).storage
      ) {
        const estimate = await (navigator as any).storage.estimate();
        const availableMB = (estimate.quota - estimate.usage) / (1024 * 1024);
        return Math.floor(availableMB);
      }

      // Default to 500MB for Node.js environments
      return 500;
    } catch {
      return 100; // Conservative default
    }
  }

  /**
   * Detect if device is battery powered
   */
  private async detectBattery(): Promise<boolean> {
    try {
      // Check Battery API if available (Web)
      if (typeof navigator !== "undefined" && "getBattery" in navigator) {
        const battery = await (navigator as any).getBattery();
        return !battery.charging && battery.level < 1;
      }

      // Check platform indicators
      if (typeof navigator !== "undefined") {
        const ua = navigator.userAgent?.toLowerCase() || "";
        // Mobile devices are typically battery powered
        if (
          ua.includes("android") ||
          ua.includes("iphone") ||
          ua.includes("ipad")
        ) {
          return true;
        }
      }

      // Default to not battery powered (server/desktop)
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if bandwidth meets threshold
   */
  private bandwidthMeetsThreshold(
    actual: BandwidthClass,
    required: BandwidthClass
  ): boolean {
    const levels: BandwidthClass[] = ["low", "medium", "high"];
    return levels.indexOf(actual) >= levels.indexOf(required);
  }

  /**
   * Calculate connection quality score (0-100)
   */
  private calculateConnectionQuality(
    natProfile: NATProfile,
    bandwidth: BandwidthClass,
    isAlwaysOn: boolean
  ): number {
    let score = 50; // Base score

    // NAT type contribution (0-30)
    switch (natProfile.type) {
      case NATType.OPEN:
        score += 30;
        break;
      case NATType.MODERATE:
        score += 20;
        break;
      case NATType.STRICT:
        score += 10;
        break;
      case NATType.SYMMETRIC:
        score += 5;
        break;
    }

    // Bandwidth contribution (0-30)
    switch (bandwidth) {
      case "high":
        score += 30;
        break;
      case "medium":
        score += 20;
        break;
      case "low":
        score += 10;
        break;
    }

    // Uptime contribution (0-20)
    if (isAlwaysOn) {
      score += 20;
    } else {
      score += Math.floor(this.uptimeRecord.uptimePercentage / 5);
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate maximum connections based on capabilities
   */
  private calculateMaxConnections(
    bandwidth: BandwidthClass,
    storage: number
  ): number {
    let maxConnections = 10; // Base

    // Bandwidth multiplier
    switch (bandwidth) {
      case "high":
        maxConnections *= 5;
        break;
      case "medium":
        maxConnections *= 2;
        break;
    }

    // Storage multiplier (more storage = can handle more peers)
    if (storage >= 1000) {
      maxConnections *= 2;
    } else if (storage >= 500) {
      maxConnections *= 1.5;
    }

    return Math.floor(maxConnections);
  }

  /**
   * Export uptime record for persistence
   */
  exportUptimeRecord(): UptimeRecord {
    this.updateCurrentSession();
    return { ...this.uptimeRecord };
  }

  /**
   * Import uptime record from persistence
   */
  importUptimeRecord(record: UptimeRecord): void {
    this.uptimeRecord = {
      ...record,
      sessions: [...record.sessions],
    };
    // Start new session
    this.startSession();
    this.calculateUptimePercentage();
  }

  /**
   * Get a serializable summary of capabilities
   */
  getCapabilitySummary(): Record<string, unknown> {
    const caps = this.capabilities;
    if (!caps) return { detected: false };

    return {
      detected: true,
      hasPublicIP: caps.hasPublicIP,
      natType: caps.natType,
      bandwidth: caps.bandwidth,
      storage: caps.storage,
      batteryPowered: caps.batteryPowered,
      canSignal: caps.canSignal,
      canRelay: caps.canRelay,
      canStore: caps.canStore,
      connectionQuality: caps.connectionQuality,
      maxConnections: caps.maxConnections,
      uptimePercentage: Math.round(this.uptimeRecord.uptimePercentage),
    };
  }
}

/**
 * Singleton instance for convenience
 */
let defaultDetector: NodeCapabilitiesDetector | null = null;

/**
 * Get or create the default capabilities detector
 */
export function getCapabilitiesDetector(
  config?: Partial<CapabilityConfig>
): NodeCapabilitiesDetector {
  if (!defaultDetector) {
    defaultDetector = new NodeCapabilitiesDetector(config);
  }
  return defaultDetector;
}

/**
 * Quick capability check without starting periodic detection
 */
export async function detectCapabilities(
  config?: Partial<CapabilityConfig>
): Promise<NodeCapabilities> {
  const detector = new NodeCapabilitiesDetector(config);
  return detector.detectCapabilities();
}
