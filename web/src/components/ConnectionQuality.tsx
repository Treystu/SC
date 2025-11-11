import React, { useEffect, useState } from 'react';

interface ConnectionMetrics {
  latency: number;
  bandwidth: number;
  packetLoss: number;
  jitter: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export const ConnectionQuality: React.FC = () => {
  const [metrics, setMetrics] = useState<ConnectionMetrics>({
    latency: 0,
    bandwidth: 0,
    packetLoss: 0,
    jitter: 0,
    quality: 'excellent'
  });

  useEffect(() => {
    const measureConnection = async () => {
      // Measure latency with ping
      const startTime = performance.now();
      try {
        // Simulate ping to local peer
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        const latency = performance.now() - startTime;

        // Estimate bandwidth (simplified)
        const bandwidth = navigator.connection 
          ? (navigator.connection as any).downlink || 10 
          : 10;

        // Calculate packet loss (simplified simulation)
        const packetLoss = Math.random() * 2;

        // Calculate jitter
        const jitter = Math.random() * 10;

        // Determine quality
        let quality: ConnectionMetrics['quality'] = 'excellent';
        if (latency > 150 || packetLoss > 1 || bandwidth < 2) {
          quality = 'poor';
        } else if (latency > 100 || packetLoss > 0.5 || bandwidth < 5) {
          quality = 'fair';
        } else if (latency > 50 || bandwidth < 10) {
          quality = 'good';
        }

        setMetrics({ latency, bandwidth, packetLoss, jitter, quality });
      } catch (error) {
        console.error('Connection measurement failed:', error);
      }
    };

    measureConnection();
    const interval = setInterval(measureConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const getQualityColor = () => {
    switch (metrics.quality) {
      case 'excellent': return '#22c55e';
      case 'good': return '#84cc16';
      case 'fair': return '#eab308';
      case 'poor': return '#ef4444';
    }
  };

  const getSignalBars = () => {
    switch (metrics.quality) {
      case 'excellent': return 4;
      case 'good': return 3;
      case 'fair': return 2;
      case 'poor': return 1;
    }
  };

  return (
    <div style={{
      padding: '12px',
      backgroundColor: '#1f2937',
      borderRadius: '8px',
      color: '#e5e7eb'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
          {[1, 2, 3, 4].map(bar => (
            <div
              key={bar}
              style={{
                width: '4px',
                height: `${bar * 5}px`,
                backgroundColor: bar <= getSignalBars() ? getQualityColor() : '#4b5563',
                borderRadius: '2px'
              }}
            />
          ))}
        </div>
        <span style={{ 
          fontSize: '14px', 
          fontWeight: 600,
          color: getQualityColor(),
          textTransform: 'capitalize'
        }}>
          {metrics.quality}
        </span>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '8px',
        fontSize: '12px'
      }}>
        <div>
          <span style={{ color: '#9ca3af' }}>Latency:</span>
          <span style={{ marginLeft: '4px', fontWeight: 500 }}>
            {metrics.latency.toFixed(0)}ms
          </span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Bandwidth:</span>
          <span style={{ marginLeft: '4px', fontWeight: 500 }}>
            {metrics.bandwidth.toFixed(1)} Mbps
          </span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Packet Loss:</span>
          <span style={{ marginLeft: '4px', fontWeight: 500 }}>
            {metrics.packetLoss.toFixed(2)}%
          </span>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Jitter:</span>
          <span style={{ marginLeft: '4px', fontWeight: 500 }}>
            {metrics.jitter.toFixed(1)}ms
          </span>
        </div>
      </div>
    </div>
  );
};
