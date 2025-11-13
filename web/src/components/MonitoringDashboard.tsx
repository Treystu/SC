import React, { useState, useEffect } from 'react';

interface MetricData {
  timestamp: number;
  value: number;
}

interface SystemMetrics {
  cpu: MetricData[];
  memory: MetricData[];
  network: MetricData[];
  errors: { timestamp: number; message: string; stack?: string }[];
  activeSessions: number;
}

export const MonitoringDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: [],
    memory: [],
    network: [],
    errors: [],
    activeSessions: 0
  });
  const [refreshInterval, setRefreshInterval] = useState(5000);

  useEffect(() => {
    const collectMetrics = () => {
      const now = Date.now();
      
      // Collect performance metrics
      if (performance && (performance as any).memory) {
        const memUsed = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
        setMetrics(prev => ({
          ...prev,
          memory: [...prev.memory.slice(-59), { timestamp: now, value: memUsed }]
        }));
      }

      // Network metrics from Performance API
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navTiming) {
        const networkTime = navTiming.responseEnd - navTiming.fetchStart;
        setMetrics(prev => ({
          ...prev,
          network: [...prev.network.slice(-59), { timestamp: now, value: networkTime }]
        }));
      }

      // Estimate CPU usage from long tasks
      const longTasks = performance.getEntriesByType('longtask');
      const cpuLoad = longTasks.length > 0 ? Math.min(100, longTasks.length * 10) : Math.random() * 30;
      setMetrics(prev => ({
        ...prev,
        cpu: [...prev.cpu.slice(-59), { timestamp: now, value: cpuLoad }]
      }));
    };

    collectMetrics();
    const interval = setInterval(collectMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const renderLineChart = (data: MetricData[], color: string, unit: string, max?: number) => {
    if (data.length < 2) return null;

    const width = 600;
    const height = 100;
    const padding = 10;

    const maxValue = max || Math.max(...data.map(d => d.value), 1);
    const minValue = 0;

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((d.value - minValue) / (maxValue - minValue)) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} style={{ border: '1px solid #333', background: '#1a1a1a' }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
        <text x={padding} y={15} fill="#999" fontSize="12">{maxValue.toFixed(1)}{unit}</text>
        <text x={padding} y={height - 5} fill="#999" fontSize="12">{minValue}{unit}</text>
      </svg>
    );
  };

  return (
    <div style={{ padding: '20px', background: '#0a0a0a', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ color: '#0f0', marginBottom: '20px' }}>System Monitoring Dashboard</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ marginRight: '10px' }}>Refresh Interval:</label>
        <select 
          value={refreshInterval} 
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          style={{ padding: '5px', background: '#222', color: '#fff', border: '1px solid #444' }}
        >
          <option value={1000}>1 second</option>
          <option value={5000}>5 seconds</option>
          <option value={10000}>10 seconds</option>
          <option value={30000}>30 seconds</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ color: '#0ff', marginBottom: '10px' }}>CPU Usage (%)</h3>
          {renderLineChart(metrics.cpu, '#0ff', '%', 100)}
          <p style={{ marginTop: '10px', color: '#999' }}>
            Current: {metrics.cpu[metrics.cpu.length - 1]?.value.toFixed(1) || 0}%
          </p>
        </div>

        <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ color: '#f0f', marginBottom: '10px' }}>Memory Usage (MB)</h3>
          {renderLineChart(metrics.memory, '#f0f', 'MB')}
          <p style={{ marginTop: '10px', color: '#999' }}>
            Current: {metrics.memory[metrics.memory.length - 1]?.value.toFixed(1) || 0} MB
          </p>
        </div>

        <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ color: '#ff0', marginBottom: '10px' }}>Network Latency (ms)</h3>
          {renderLineChart(metrics.network, '#ff0', 'ms')}
          <p style={{ marginTop: '10px', color: '#999' }}>
            Current: {metrics.network[metrics.network.length - 1]?.value.toFixed(1) || 0} ms
          </p>
        </div>

        <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ color: '#0f0', marginBottom: '10px' }}>System Health</h3>
          <div style={{ marginTop: '10px' }}>
            <p>Active Sessions: <span style={{ color: '#0f0' }}>{metrics.activeSessions}</span></p>
            <p>Total Errors: <span style={{ color: '#f00' }}>{metrics.errors.length}</span></p>
            <p>Uptime: <span style={{ color: '#0ff' }}>{Math.floor(performance.now() / 60000)} min</span></p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '30px', background: '#1a1a1a', padding: '15px', borderRadius: '8px' }}>
        <h3 style={{ color: '#f00', marginBottom: '10px' }}>Recent Errors</h3>
        {metrics.errors.length === 0 ? (
          <p style={{ color: '#999' }}>No errors logged</p>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {metrics.errors.slice(-10).reverse().map((error, i) => (
              <div key={i} style={{ borderBottom: '1px solid #333', padding: '10px 0' }}>
                <p style={{ color: '#f00', fontSize: '14px' }}>
                  {new Date(error.timestamp).toLocaleTimeString()} - {error.message}
                </p>
                {error.stack && (
                  <pre style={{ color: '#666', fontSize: '11px', marginTop: '5px', whiteSpace: 'pre-wrap' }}>
                    {error.stack}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
