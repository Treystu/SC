/**
 * Health Check System
 * Provides comprehensive health monitoring for the application
 */
import { MeshNetwork } from './mesh/network.js';

export interface HealthCheckResult {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'critical';
  checks: {
    crypto: ComponentHealth;
    storage: ComponentHealth;
    network: ComponentHealth;
    performance: ComponentHealth;
  };
  timestamp: number;
  uptime: number;
}

export interface ComponentHealth {
  healthy: boolean;
  status: 'ok' | 'warning' | 'error';
  details: string;
  metrics?: Record<string, number>;
  lastCheck?: number;
}

export class HealthChecker {
  private startTime: number;
  private lastCheckTime: number = 0;
  private checkInterval: number = 30000; // 30 seconds
  private checkResults: Map<string, ComponentHealth> = new Map();
  private meshNetwork?: MeshNetwork;

  constructor(meshNetwork?: MeshNetwork) {
    this.startTime = Date.now();
    this.meshNetwork = meshNetwork;
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const now = Date.now();
    this.lastCheckTime = now;

    const checks = {
      crypto: await this.checkCrypto(),
      storage: await this.checkStorage(),
      network: await this.checkNetwork(),
      performance: await this.checkPerformance(),
    };

    // Cache results
    Object.entries(checks).forEach(([key, value]) => {
      this.checkResults.set(key, value);
    });

    // Determine overall health
    const allHealthy = Object.values(checks).every(c => c.healthy);
    const anyWarning = Object.values(checks).some(c => c.status === 'warning');
    
    let status: 'healthy' | 'degraded' | 'critical';
    if (allHealthy) {
      status = 'healthy';
    } else if (anyWarning) {
      status = 'degraded';
    } else {
      status = 'critical';
    }

    return {
      healthy: allHealthy,
      status,
      checks,
      timestamp: now,
      uptime: now - this.startTime,
    };
  }

  /**
   * Check cryptographic operations
   */
  private async checkCrypto(): Promise<ComponentHealth> {
    try {
      const start = performance.now();
      
      // Test basic crypto operations
      const { generateIdentity, signMessage, verifySignature } = await import('./crypto/primitives.js');
      
      const identity = generateIdentity();
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = signMessage(message, identity.privateKey);
      const isValid = verifySignature(message, signature, identity.publicKey);
      
      const duration = performance.now() - start;

      if (!isValid) {
        return {
          healthy: false,
          status: 'error',
          details: 'Signature verification failed',
          lastCheck: Date.now(),
        };
      }

      // Warning if crypto operations are too slow
      const status = duration > 10 ? 'warning' : 'ok';

      return {
        healthy: true,
        status,
        details: 'Cryptographic operations working',
        metrics: {
          signVerifyTime: Math.round(duration * 100) / 100,
        },
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        details: `Crypto check failed: ${error instanceof Error ? error.message : String(error)}`,
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * Check storage health
   */
  private async checkStorage(): Promise<ComponentHealth> {
    try {
      const start = performance.now();
      
      // Test storage operations
      const testKey = 'health-check-test';
      const testData = { timestamp: Date.now() };
      
      // This will vary based on platform
      // For now, we'll just check if localStorage is available
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(testKey, JSON.stringify(testData));
        const retrieved = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);
        
        if (!retrieved) {
          return {
            healthy: false,
            status: 'error',
            details: 'Storage read/write failed',
            lastCheck: Date.now(),
          };
        }
      }
      
      const duration = performance.now() - start;
      const status = duration > 50 ? 'warning' : 'ok';

      return {
        healthy: true,
        status,
        details: 'Storage operations working',
        metrics: {
          readWriteTime: Math.round(duration * 100) / 100,
        },
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        details: `Storage check failed: ${error instanceof Error ? error.message : String(error)}`,
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * Check network health
   */
  private async checkNetwork(): Promise<ComponentHealth> {
    if (!this.meshNetwork) {
      return {
        healthy: true,
        status: 'ok',
        details: 'Network subsystem not initialized',
        lastCheck: Date.now(),
      };
    }

    try {
      const stats = this.meshNetwork.getStats();
      const peerCount = this.meshNetwork.getPeerCount();
      const isHealthy = peerCount > 0;

      return {
        healthy: isHealthy,
        status: isHealthy ? 'ok' : 'warning',
        details: isHealthy ? `${peerCount} peers connected` : 'No peers connected',
        metrics: {
          activePeers: peerCount,
          totalPeers: stats.routing.peerCount,
        },
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'error',
        details: `Network check failed: ${error instanceof Error ? error.message : String(error)}`,
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * Check performance metrics
   */
  private async checkPerformance(): Promise<ComponentHealth> {
    try {
      const metrics: Record<string, number> = {};
      
      // Memory usage (if available)
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        const memory = (performance as any).memory;
        const usedMB = memory.usedJSHeapSize / (1024 * 1024);
        const limitMB = memory.jsHeapSizeLimit / (1024 * 1024);
        const percentage = (usedMB / limitMB) * 100;
        
        metrics.memoryUsedMB = Math.round(usedMB * 100) / 100;
        metrics.memoryLimitMB = Math.round(limitMB * 100) / 100;
        metrics.memoryPercentage = Math.round(percentage * 100) / 100;
      }
      
      // Determine status based on metrics
      let status: 'ok' | 'warning' | 'error' = 'ok';
      let details = 'Performance within acceptable range';
      
      if (metrics.memoryPercentage > 90) {
        status = 'error';
        details = 'Critical memory usage';
      } else if (metrics.memoryPercentage > 75) {
        status = 'warning';
        details = 'High memory usage';
      }

      return {
        healthy: status !== 'error',
        status,
        details,
        metrics,
        lastCheck: Date.now(),
      };
    } catch (error) {
      return {
        healthy: true,
        status: 'ok',
        details: 'Performance metrics not available',
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * Get cached check results
   */
  getCachedResults(): Map<string, ComponentHealth> {
    return new Map(this.checkResults);
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get formatted uptime string
   */
  getFormattedUptime(): string {
    const uptime = this.getUptime();
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / (1000 * 60)) % 60;
    const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
  }

  /**
   * Start automatic health checking
   */
  startAutoCheck(interval: number = this.checkInterval): () => void {
    const intervalId = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Health check failed:', error);
      });
    }, interval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}

// Singleton instance
let healthCheckerInstance: HealthChecker | null = null;

export function getHealthChecker(): HealthChecker {
  if (!healthCheckerInstance) {
    healthCheckerInstance = new HealthChecker();
  }
  return healthCheckerInstance;
}

/**
 * Quick health check function
 */
export async function quickHealthCheck(): Promise<boolean> {
  const checker = getHealthChecker();
  const result = await checker.performHealthCheck();
  return result.healthy;
}

/**
 * Get health status as HTTP-friendly object
 */
export async function getHealthStatus(): Promise<{
  status: number;
  body: HealthCheckResult;
}> {
  const checker = getHealthChecker();
  const result = await checker.performHealthCheck();
  
  // Map health status to HTTP status codes
  const statusCode = result.status === 'healthy' ? 200 :
                    result.status === 'degraded' ? 503 :
                    500;

  return {
    status: statusCode,
    body: result,
  };
}
