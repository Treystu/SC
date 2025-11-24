// Privacy-preserving analytics for mesh network monitoring

export interface NetworkMetrics {
  totalMessages: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageLatency: number;
  activePeers: number;
  totalPeers: number;
  bandwidthUsed: number;
  timestamp: number;
}

export class Analytics {
  private metrics: NetworkMetrics = {
    totalMessages: 0,
    successfulDeliveries: 0,
    failedDeliveries: 0,
    averageLatency: 0,
    activePeers: 0,
    totalPeers: 0,
    bandwidthUsed: 0,
    timestamp: Date.now()
  };
  
  private latencyHistory: number[] = [];
  private readonly maxHistorySize = 100;
  
  recordMessageSent(): void {
    this.metrics.totalMessages++;
    this.metrics.timestamp = Date.now();
  }
  
  recordDeliverySuccess(latency: number): void {
    this.metrics.successfulDeliveries++;
    this.latencyHistory.push(latency);
    
    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift();
    }
    
    this.updateAverageLatency();
  }
  
  recordDeliveryFailure(): void {
    this.metrics.failedDeliveries++;
  }
  
  private updateAverageLatency(): void {
    if (this.latencyHistory.length === 0) return;
    
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    this.metrics.averageLatency = sum / this.latencyHistory.length;
  }
  
  updatePeerCount(active: number, total: number): void {
    this.metrics.activePeers = active;
    this.metrics.totalPeers = total;
  }
  
  recordBandwidthUsage(bytes: number): void {
    this.metrics.bandwidthUsed += bytes;
  }
  
  getMetrics(): NetworkMetrics {
    return { ...this.metrics };
  }
  
  getSuccessRate(): number {
    const total = this.metrics.successfulDeliveries + this.metrics.failedDeliveries;
    if (total === 0) return 0;
    return (this.metrics.successfulDeliveries / total) * 100;
  }
  
  getNetworkHealth(): 'healthy' | 'degraded' | 'critical' {
    const successRate = this.getSuccessRate();
    const avgLatency = this.metrics.averageLatency;
    
    if (successRate > 90 && avgLatency < 100) return 'healthy';
    if (successRate > 70 && avgLatency < 500) return 'degraded';
    return 'critical';
  }
  
  reset(): void {
    this.metrics = {
      totalMessages: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      averageLatency: 0,
      activePeers: this.metrics.activePeers,
      totalPeers: this.metrics.totalPeers,
      bandwidthUsed: 0,
      timestamp: Date.now()
    };
    this.latencyHistory = [];
  }
  
  exportMetrics(): string {
    return JSON.stringify({
      ...this.metrics,
      successRate: this.getSuccessRate(),
      networkHealth: this.getNetworkHealth()
    }, null, 2);
  }
}
