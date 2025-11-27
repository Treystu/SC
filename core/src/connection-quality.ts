export interface ConnectionMetrics {
  latency: number; // ms
  packetLoss: number; // percentage
  bandwidth: number; // bytes/sec
  jitter: number; // ms
}

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

export function calculateConnectionQuality(metrics: ConnectionMetrics): ConnectionQuality {
  if (metrics.latency === Infinity) {
    return 'offline';
  }
  
  // Excellent: <50ms latency, <1% packet loss
  if (metrics.latency < 50 && metrics.packetLoss < 1) {
    return 'excellent';
  }
  
  // Good: <100ms latency, <5% packet loss
  if (metrics.latency < 100 && metrics.packetLoss < 5) {
    return 'good';
  }
  
  // Fair: <200ms latency, <10% packet loss
  if (metrics.latency < 200 && metrics.packetLoss < 10) {
    return 'fair';
  }
  
  // Poor: everything else
  return 'poor';
}

export class ConnectionMonitor {
  private metrics: ConnectionMetrics = {
    latency: Infinity,
    packetLoss: 0,
    bandwidth: 0,
    jitter: 0
  };
  
  private latencyHistory: number[] = [];
  private readonly HISTORY_SIZE = 10;
  
  updateLatency(latency: number) {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.HISTORY_SIZE) {
      this.latencyHistory.shift();
    }
    
    // Calculate average latency
    this.metrics.latency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    
    // Calculate jitter (variance in latency)
    if (this.latencyHistory.length > 1) {
      const diffs = [];
      for (let i = 1; i < this.latencyHistory.length; i++) {
        diffs.push(Math.abs(this.latencyHistory[i] - this.latencyHistory[i - 1]));
      }
      this.metrics.jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
  }
  
  updatePacketLoss(sent: number, received: number) {
    this.metrics.packetLoss = ((sent - received) / sent) * 100;
  }
  
  updateBandwidth(bytes: number, durationMs: number) {
    this.metrics.bandwidth = (bytes / durationMs) * 1000; // bytes per second
  }
  
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }
  
  getQuality(): ConnectionQuality {
    return calculateConnectionQuality(this.metrics);
  }
}