/**
 * Performance monitoring utilities
 * Tracks FPS, memory, network latency, and render times
 */

export interface PerformanceMetrics {
  fps: number;
  memory: MemoryMetrics;
  latency: number;
  renderTime: number;
  bundleSize?: number;
}

export interface MemoryMetrics {
  used: number;
  total: number;
  percentage: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fps: 0,
    memory: { used: 0, total: 0, percentage: 0 },
    latency: 0,
    renderTime: 0,
  };

  private frameCount = 0;
  private lastFrameTime = performance.now();
  private fpsInterval: number | null = null;
  private observers: ((metrics: PerformanceMetrics) => void)[] = [];

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start monitoring performance
   */
  startMonitoring(): void {
    // Track FPS
    this.trackFPS();

    // Track memory (if available)
    if ('memory' in performance) {
      setInterval(() => this.trackMemory(), 1000);
    }

    // Track render times using PerformanceObserver
    if ('PerformanceObserver' in window) {
      this.trackRenderTimes();
    }
  }

  /**
   * Track frames per second
   */
  private trackFPS(): void {
    const updateFPS = () => {
      this.frameCount++;
      requestAnimationFrame(updateFPS);
    };

    requestAnimationFrame(updateFPS);

    this.fpsInterval = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - this.lastFrameTime;
      
      this.metrics.fps = Math.round((this.frameCount * 1000) / elapsed);
      
      this.frameCount = 0;
      this.lastFrameTime = now;
      
      this.notifyObservers();
    }, 1000);
  }

  /**
   * Track memory usage (Chrome only)
   */
  private trackMemory(): void {
    const memory = (performance as any).memory;
    if (!memory) return;

    const used = memory.usedJSHeapSize / (1024 * 1024); // MB
    const total = memory.totalJSHeapSize / (1024 * 1024); // MB
    
    this.metrics.memory = {
      used: Math.round(used * 100) / 100,
      total: Math.round(total * 100) / 100,
      percentage: Math.round((used / total) * 100),
    };

    this.notifyObservers();
  }

  /**
   * Track render times using Performance API
   */
  private trackRenderTimes(): void {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      
      for (const entry of entries) {
        if (entry.entryType === 'measure') {
          this.metrics.renderTime = Math.round(entry.duration * 100) / 100;
          this.notifyObservers();
        }
      }
    });

    observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
  }

  /**
   * Measure network latency to a peer
   */
  async measureLatency(peerId: string, sendPing: (id: string) => Promise<void>): Promise<number> {
    const start = performance.now();
    
    try {
      await sendPing(peerId);
      const latency = performance.now() - start;
      
      this.metrics.latency = Math.round(latency * 100) / 100;
      this.notifyObservers();
      
      return latency;
    } catch (error) {
      console.error('Latency measurement failed:', error);
      return -1;
    }
  }

  /**
   * Measure function execution time
   */
  measureExecutionTime<T>(fn: () => T, label: string): T {
    performance.mark(`${label}-start`);
    const result = fn();
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    
    return result;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Subscribe to metrics updates
   */
  subscribe(callback: (metrics: PerformanceMetrics) => void): () => void {
    this.observers.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.observers.indexOf(callback);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  /**
   * Notify all observers of metric changes
   */
  private notifyObservers(): void {
    const metrics = this.getMetrics();
    this.observers.forEach(callback => callback(metrics));
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const { fps, memory, latency, renderTime } = this.metrics;
    
    return `
Performance Report:
------------------
FPS: ${fps}
Memory: ${memory.used.toFixed(2)} MB / ${memory.total.toFixed(2)} MB (${memory.percentage}%)
Latency: ${latency.toFixed(2)} ms
Render Time: ${renderTime.toFixed(2)} ms
    `.trim();
  }

  /**
   * Check if performance is within acceptable ranges
   */
  checkPerformanceBudget(): { passed: boolean; violations: string[] } {
    const violations: string[] = [];

    if (this.metrics.fps < 30) {
      violations.push(`Low FPS: ${this.metrics.fps} (expected ≥30)`);
    }

    if (this.metrics.memory.percentage > 80) {
      violations.push(`High memory usage: ${this.metrics.memory.percentage}% (expected ≤80%)`);
    }

    if (this.metrics.latency > 100) {
      violations.push(`High latency: ${this.metrics.latency}ms (expected ≤100ms)`);
    }

    if (this.metrics.renderTime > 16.67) {
      violations.push(`Slow render: ${this.metrics.renderTime}ms (expected ≤16.67ms for 60fps)`);
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
    this.observers = [];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();
