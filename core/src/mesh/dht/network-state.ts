/**
 * Network State Awareness for DHT
 * 
 * Tracks network topology, health, and connectivity state
 * to provide intelligent routing decisions and diagnostics.
 */

import {
  NetworkState,
  type NodeId,
  type DHTContact,
  type NetworkTopology,
  type DHTStats,
} from './types.js';
import { KademliaRoutingTable } from './kademlia.js';

/**
 * Network health thresholds
 */
export interface HealthThresholds {
  /** Minimum nodes for "connected" state */
  minNodesConnected: number;
  /** Minimum nodes for "degraded" state (below this is "disconnected") */
  minNodesDegraded: number;
  /** Maximum acceptable average latency (ms) */
  maxAcceptableLatency: number;
  /** Maximum failure rate before marking node as unhealthy */
  maxFailureRate: number;
  /** Stale contact threshold (ms) */
  staleThreshold: number;
}

/**
 * Default health thresholds
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  minNodesConnected: 10,
  minNodesDegraded: 3,
  maxAcceptableLatency: 1000, // 1 second
  maxFailureRate: 0.3, // 30%
  staleThreshold: 60000, // 1 minute
};

/**
 * Network event types
 */
export type NetworkEventType = 
  | 'stateChange'
  | 'nodeAdded'
  | 'nodeRemoved'
  | 'nodeStale'
  | 'healthWarning'
  | 'topologyChange';

/**
 * Network event
 */
export interface NetworkEvent {
  type: NetworkEventType;
  timestamp: number;
  data: unknown;
}

/**
 * Network event listener
 */
export type NetworkEventListener = (event: NetworkEvent) => void;

/**
 * Network State Manager
 * 
 * Monitors and reports on DHT network state.
 */
export class NetworkStateManager {
  private routingTable: KademliaRoutingTable;
  private thresholds: HealthThresholds;
  private currentState: NetworkState = NetworkState.DISCONNECTED;
  private listeners: Map<NetworkEventType, Set<NetworkEventListener>> = new Map();
  private monitorInterval?: ReturnType<typeof setInterval>;
  private lastTopology?: NetworkTopology;
  private onErrorCallback?: (error: Error, context: string) => void;
  
  /** Event history for debugging */
  private eventHistory: NetworkEvent[] = [];
  private maxEventHistory = 100;

  constructor(
    routingTable: KademliaRoutingTable,
    thresholds?: Partial<HealthThresholds>,
    onError?: (error: Error, context: string) => void
  ) {
    this.routingTable = routingTable;
    this.thresholds = { ...DEFAULT_HEALTH_THRESHOLDS, ...thresholds };
    this.onErrorCallback = onError;
  }

  /**
   * Set error callback
   */
  setOnError(callback: (error: Error, context: string) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Start monitoring network state
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitorInterval) return;
    
    this.monitorInterval = setInterval(() => {
      this.checkNetworkState();
    }, intervalMs);
    try {
      if (this.monitorInterval && typeof (this.monitorInterval as any).unref === 'function') {
        (this.monitorInterval as any).unref();
      }
    } catch (e) {}
    
    // Initial check
    this.checkNetworkState();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  /**
   * Add event listener
   */
  on(eventType: NetworkEventType, listener: NetworkEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: NetworkEventType, listener: NetworkEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /**
   * Emit event
   */
  private emit(event: NetworkEvent): void {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.shift();
    }
    
    // Notify listeners
    this.listeners.get(event.type)?.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        // Report error via callback or silently ignore
        if (this.onErrorCallback) {
          this.onErrorCallback(
            error instanceof Error ? error : new Error(String(error)),
            'network event listener'
          );
        }
      }
    });
  }

  /**
   * Check and update network state
   */
  private checkNetworkState(): void {
    const topology = this.getTopology();
    const newState = this.determineState(topology);
    
    // Check for state change
    if (newState !== this.currentState) {
      const oldState = this.currentState;
      this.currentState = newState;
      this.emit({
        type: 'stateChange',
        timestamp: Date.now(),
        data: { oldState, newState },
      });
    }
    
    // Check for topology changes
    if (this.lastTopology && this.hasTopologyChanged(topology)) {
      this.emit({
        type: 'topologyChange',
        timestamp: Date.now(),
        data: { previous: this.lastTopology, current: topology },
      });
    }
    
    // Check for health warnings
    this.checkHealthWarnings(topology);
    
    this.lastTopology = topology;
  }

  /**
   * Determine network state from topology
   */
  private determineState(topology: NetworkTopology): NetworkState {
    if (topology.totalNodes === 0) {
      return NetworkState.DISCONNECTED;
    }
    
    if (topology.totalNodes < this.thresholds.minNodesDegraded) {
      return NetworkState.DISCONNECTED;
    }
    
    if (topology.totalNodes < this.thresholds.minNodesConnected) {
      return NetworkState.DEGRADED;
    }
    
    if (topology.healthScore < 50) {
      return NetworkState.DEGRADED;
    }
    
    return NetworkState.CONNECTED;
  }

  /**
   * Check if topology has significantly changed
   */
  private hasTopologyChanged(current: NetworkTopology): boolean {
    if (!this.lastTopology) return true;
    
    const nodeCountDiff = Math.abs(current.totalNodes - this.lastTopology.totalNodes);
    const healthDiff = Math.abs(current.healthScore - this.lastTopology.healthScore);
    
    return nodeCountDiff >= 5 || healthDiff >= 10;
  }

  /**
   * Check for health warnings
   */
  private checkHealthWarnings(topology: NetworkTopology): void {
    const warnings: string[] = [];
    
    if (topology.avgLatency > this.thresholds.maxAcceptableLatency) {
      warnings.push(`High average latency: ${topology.avgLatency}ms`);
    }
    
    if (topology.healthScore < 30) {
      warnings.push(`Low health score: ${topology.healthScore}`);
    }
    
    // Check for unbalanced bucket distribution
    const nonEmptyBuckets = topology.bucketDistribution.filter(b => b > 0);
    if (nonEmptyBuckets.length < 5 && topology.totalNodes > 20) {
      warnings.push('Unbalanced bucket distribution');
    }
    
    if (warnings.length > 0) {
      this.emit({
        type: 'healthWarning',
        timestamp: Date.now(),
        data: { warnings },
      });
    }
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return this.currentState;
  }

  /**
   * Get network topology
   */
  getTopology(): NetworkTopology {
    const contacts = this.routingTable.getAllContacts();
    const stats = this.routingTable.getStats();
    const bucketDistribution = this.routingTable.getBucketDistribution();
    
    // Calculate metrics
    const avgLatency = this.calculateAverageLatency(contacts);
    const healthScore = this.calculateHealthScore(contacts, stats);
    const estimatedNetworkSize = this.estimateNetworkSize(bucketDistribution);
    
    return {
      state: this.currentState,
      totalNodes: contacts.length,
      directPeers: contacts.filter(c => c.rtt !== undefined && c.rtt < 100).length,
      estimatedNetworkSize,
      bucketDistribution,
      avgLatency,
      healthScore,
    };
  }

  /**
   * Calculate average latency
   */
  private calculateAverageLatency(contacts: DHTContact[]): number {
    const contactsWithRtt = contacts.filter(c => c.rtt !== undefined);
    if (contactsWithRtt.length === 0) return 0;
    
    const sum = contactsWithRtt.reduce((acc, c) => acc + (c.rtt || 0), 0);
    return sum / contactsWithRtt.length;
  }

  /**
   * Calculate health score (0-100)
   */
  private calculateHealthScore(contacts: DHTContact[], stats: DHTStats): number {
    let score = 100;
    
    // Penalize for low node count
    if (contacts.length < this.thresholds.minNodesConnected) {
      score -= (this.thresholds.minNodesConnected - contacts.length) * 5;
    }
    
    // Penalize for high failure rates
    const avgFailures = contacts.length > 0
      ? contacts.reduce((acc, c) => acc + c.failureCount, 0) / contacts.length
      : 0;
    if (avgFailures > 2) {
      score -= Math.min(30, avgFailures * 5);
    }
    
    // Penalize for stale contacts
    const now = Date.now();
    const staleCount = contacts.filter(
      c => now - c.lastSeen > this.thresholds.staleThreshold
    ).length;
    if (staleCount > 0) {
      score -= Math.min(20, (staleCount / contacts.length) * 20);
    }
    
    // Penalize for low lookup success rate
    if (stats.totalLookups > 10) {
      const successRate = stats.successfulLookups / stats.totalLookups;
      if (successRate < 0.8) {
        score -= (0.8 - successRate) * 50;
      }
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Estimate total network size using bucket coverage.
   * 
   * This uses a heuristic based on bucket coverage patterns in Kademlia networks:
   * - Higher-indexed buckets (closer to local node) have fewer potential nodes
   * - Lower-indexed buckets (further away) have exponentially more potential nodes
   * 
   * The estimation formula uses configurable parameters:
   * - BASE_BUCKET_THRESHOLD: Base multiplier before bucket adjustment (default: 10)
   * - BUCKET_SCALING_DIVISOR: How much each bucket index affects the estimate (default: 16)
   *   Higher values = less aggressive scaling, lower = more aggressive
   * 
   * These parameters are derived from empirical observations in DHT networks
   * where bucket coverage patterns correlate with network size.
   */
  private estimateNetworkSize(bucketDistribution: number[]): number {
    /**
     * Base threshold for bucket-based network size estimation.
     * Lower bucket indices (distant nodes) suggest a larger network since we can
     * "see" further into the ID space. When highestNonEmptyBucket/BUCKET_SCALING_DIVISOR
     * exceeds BASE_BUCKET_THRESHOLD, the coverage factor decreases (smaller estimate).
     */
    const BASE_BUCKET_THRESHOLD = 10;
    
    /**
     * Divisor for bucket index in network size calculation.
     * Controls how aggressively the estimate scales with bucket coverage.
     * A value of 16 means every 16 bucket positions adjusts the exponent by 1.
     */
    const BUCKET_SCALING_DIVISOR = 16;

    // Find the highest non-empty bucket
    let highestNonEmptyBucket = -1;
    for (let i = bucketDistribution.length - 1; i >= 0; i--) {
      if (bucketDistribution[i] > 0) {
        highestNonEmptyBucket = i;
        break;
      }
    }
    
    if (highestNonEmptyBucket < 0) return 0;
    
    const totalContacts = bucketDistribution.reduce((a, b) => a + b, 0);
    
    // Calculate coverage factor based on bucket spread
    // Higher bucket indices indicate closer nodes, suggesting smaller visible network
    const bucketAdjustment = BASE_BUCKET_THRESHOLD - highestNonEmptyBucket / BUCKET_SCALING_DIVISOR;
    const coverageFactor = Math.pow(2, Math.max(0, bucketAdjustment));
    
    return Math.round(totalContacts * coverageFactor);
  }

  /**
   * Get healthy contacts (low failure rate, recently seen)
   */
  getHealthyContacts(): DHTContact[] {
    const now = Date.now();
    return this.routingTable.getAllContacts().filter(contact => {
      const isRecent = now - contact.lastSeen < this.thresholds.staleThreshold;
      const hasLowFailures = contact.failureCount < 3;
      return isRecent && hasLowFailures;
    });
  }

  /**
   * Get unhealthy contacts that may need to be removed
   */
  getUnhealthyContacts(): DHTContact[] {
    const now = Date.now();
    return this.routingTable.getAllContacts().filter(contact => {
      const isStale = now - contact.lastSeen > this.thresholds.staleThreshold * 2;
      const hasHighFailures = contact.failureCount >= 5;
      return isStale || hasHighFailures;
    });
  }

  /**
   * Get event history
   */
  getEventHistory(): NetworkEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Check if we can route to a specific target
   */
  canRouteTo(targetId: NodeId): boolean {
    // We can route if we have at least one contact that might know the target
    const closest = this.routingTable.getClosestContacts(targetId, 1);
    return closest.length > 0;
  }

  /**
   * Get routing quality for a target (0-100)
   */
  getRoutingQuality(targetId: NodeId): number {
    const closest = this.routingTable.getClosestContacts(targetId, 3);
    if (closest.length === 0) return 0;
    
    // Calculate quality based on contact health
    const healthyCount = closest.filter(c => c.failureCount === 0).length;
    const quality = (healthyCount / closest.length) * 100;
    
    return Math.round(quality);
  }

  /**
   * Get diagnostics information
   */
  getDiagnostics(): {
    state: NetworkState;
    topology: NetworkTopology;
    healthyNodes: number;
    unhealthyNodes: number;
    recentEvents: NetworkEvent[];
    recommendations: string[];
  } {
    const topology = this.getTopology();
    const healthyContacts = this.getHealthyContacts();
    const unhealthyContacts = this.getUnhealthyContacts();
    
    const recommendations: string[] = [];
    
    if (topology.totalNodes < this.thresholds.minNodesConnected) {
      recommendations.push('Consider adding more bootstrap nodes');
    }
    
    if (unhealthyContacts.length > topology.totalNodes * 0.3) {
      recommendations.push('Many unhealthy contacts - consider refreshing routing table');
    }
    
    if (topology.avgLatency > this.thresholds.maxAcceptableLatency / 2) {
      recommendations.push('High latency detected - network may be congested');
    }
    
    const nonEmptyBuckets = topology.bucketDistribution.filter(b => b > 0).length;
    if (nonEmptyBuckets < 10 && topology.totalNodes > 20) {
      recommendations.push('Bucket distribution is uneven - perform random lookups');
    }
    
    return {
      state: this.currentState,
      topology,
      healthyNodes: healthyContacts.length,
      unhealthyNodes: unhealthyContacts.length,
      recentEvents: this.eventHistory.slice(-10),
      recommendations,
    };
  }
}

/**
 * Create a network state manager with default configuration
 */
export function createNetworkStateManager(
  routingTable: KademliaRoutingTable,
  options?: {
    thresholds?: Partial<HealthThresholds>;
    monitorInterval?: number;
    autoStart?: boolean;
    onError?: (error: Error, context: string) => void;
  }
): NetworkStateManager {
  const manager = new NetworkStateManager(
    routingTable,
    options?.thresholds,
    options?.onError
  );
  
  if (options?.autoStart !== false) {
    manager.startMonitoring(options?.monitorInterval);
  }
  
  return manager;
}
