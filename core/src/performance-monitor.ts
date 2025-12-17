export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 1000;

  startMeasure(name: string): (metadata?: Record<string, any>) => void {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    return (metadata?: Record<string, any>) => {
      const current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const duration = current - now;
      this.recordMetric({
        name,
        duration,
        timestamp: Date.now(),
        metadata,
      });
    };
  }

  recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 1000) {
      console.warn(
        `[Performance] Slow operation: ${metric.name} took ${metric.duration}ms`,
      );
    }
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.filter((m) => m.name === name);
    }
    return [...this.metrics];
  }

  getAverageDuration(name: string): number {
    const filtered = this.getMetrics(name);
    if (filtered.length === 0) return 0;

    const total = filtered.reduce((sum, m) => sum + m.duration, 0);
    return total / filtered.length;
  }

  clearMetrics() {
    this.metrics = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();
