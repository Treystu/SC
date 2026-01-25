import { NATDetector, NATType } from "../nat/NATDetector.js";

export interface NodeProfile {
  nodeId: string;
  natType: NATType;
  publicIP?: string;
  ipStability: number; // Ms since IP last changed
  isWAN: boolean;
  resources: {
    memory?: number; // Total RAM in GB
    storage?: number; // Available storage in GB
    cores?: number; // CPU cores
    load: number; // 0-1 current usage estimate
  };
  latency: Record<string, number>; // PeerId -> latency ms
  lastUpdate: number;
}

export class NodeProfiler {
  private detector = new NATDetector();
  private lastIP?: string;
  private ipChangeTimestamp = Date.now();
  private latencyMap: Record<string, number> = {};

  async profile(nodeId: string): Promise<NodeProfile> {
    const nat = await this.detector.detect();

    // Track IP stability
    if (nat.publicIP !== this.lastIP) {
      this.lastIP = nat.publicIP;
      this.ipChangeTimestamp = Date.now();
    }

    const resources = await this.getSystemResources();

    return {
      nodeId,
      natType: nat.type,
      publicIP: nat.publicIP,
      ipStability: Date.now() - this.ipChangeTimestamp,
      isWAN: nat.isWAN,
      resources,
      latency: this.latencyMap,
      lastUpdate: Date.now(),
    };
  }

  updateLatency(peerId: string, ms: number) {
    this.latencyMap[peerId] = ms;
  }

  private async getSystemResources() {
    // Attempt to use StorageManager API if available
    let storage = 0;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.storage &&
        navigator.storage.estimate
      ) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) {
          storage = Math.round(estimate.quota / (1024 * 1024 * 1024)); // GB
        }
      }
    } catch (e) {
      // Ignore
    }

    return {
      memory: (navigator as any).deviceMemory || undefined,
      cores: navigator.hardwareConcurrency || undefined,
      storage: storage > 0 ? storage : undefined,
      load: this.estimateLoad(),
    };
  }

  private estimateLoad(): number {
    // Very rough estimate for web
    // Could use performance.now() jitter but for now keep it simple
    return 0.1;
  }
}
