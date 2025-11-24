/**
 * Real-time network diagnostics panel
 */
import { useState, useEffect } from 'react';

interface NetworkStats {
  connectedPeers: number;
  messagesSent: number;
  messagesReceived: number;
  bandwidth: {
    upload: number;
    download: number;
  };
  latency: {
    average: number;
    min: number;
    max: number;
  };
  packetLoss: number;
  uptime: number;
  bleConnections: number;
  webrtcConnections: number;
}

export const NetworkDiagnostics: React.FC = () => {
  const [stats, setStats] = useState<NetworkStats>({
    connectedPeers: 0,
    messagesSent: 0,
    messagesReceived: 0,
    bandwidth: { upload: 0, download: 0 },
    latency: { average: 0, min: 0, max: 0 },
    packetLoss: 0,
    uptime: 0,
    bleConnections: 0,
    webrtcConnections: 0
  });

  const [refreshInterval, setRefreshInterval] = useState(1000);

  useEffect(() => {
    const interval = setInterval(() => {
      // Mock data - replace with actual network stats
      setStats({
        connectedPeers: Math.floor(Math.random() * 10),
        messagesSent: Math.floor(Math.random() * 1000),
        messagesReceived: Math.floor(Math.random() * 1000),
        bandwidth: {
          upload: Math.random() * 1024 * 1024,
          download: Math.random() * 1024 * 1024
        },
        latency: {
          average: Math.random() * 100,
          min: Math.random() * 50,
          max: Math.random() * 200
        },
        packetLoss: Math.random() * 5,
        uptime: Date.now(),
        bleConnections: Math.floor(Math.random() * 5),
        webrtcConnections: Math.floor(Math.random() * 5)
      });
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getHealthColor = (value: number, thresholds: { good: number; warn: number }): string => {
    if (value <= thresholds.good) return '#4CAF50';
    if (value <= thresholds.warn) return '#FF9800';
    return '#f44336';
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#1a1a1a', color: '#fff', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Network Diagnostics</h1>
        <div>
          <label style={{ marginRight: '10px' }}>Refresh:</label>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            style={{ padding: '5px', backgroundColor: '#333', color: '#fff', border: 'none' }}
          >
            <option value={500}>0.5s</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
        </div>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Connected Peers</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.connectedPeers}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            BLE: {stats.bleConnections} | WebRTC: {stats.webrtcConnections}
          </div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Messages</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            ↑ {stats.messagesSent} / ↓ {stats.messagesReceived}
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            Total: {stats.messagesSent + stats.messagesReceived}
          </div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Latency</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: getHealthColor(stats.latency.average, { good: 50, warn: 100 }) }}>
            {stats.latency.average.toFixed(0)}ms
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            Min: {stats.latency.min.toFixed(0)}ms | Max: {stats.latency.max.toFixed(0)}ms
          </div>
        </div>

        <div style={{ backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Packet Loss</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: getHealthColor(stats.packetLoss, { good: 1, warn: 3 }) }}>
            {stats.packetLoss.toFixed(2)}%
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
            Uptime: {formatUptime(stats.uptime)}
          </div>
        </div>
      </div>

      {/* Bandwidth */}
      <div style={{ backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Bandwidth</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Upload</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
              {formatBytes(stats.bandwidth.upload)}/s
            </div>
            <div style={{ marginTop: '10px', height: '10px', backgroundColor: '#333', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((stats.bandwidth.upload / (1024 * 1024)) * 100, 100)}%`, height: '100%', backgroundColor: '#4CAF50' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '14px', color: '#888', marginBottom: '5px' }}>Download</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
              {formatBytes(stats.bandwidth.download)}/s
            </div>
            <div style={{ marginTop: '10px', height: '10px', backgroundColor: '#333', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min((stats.bandwidth.download / (1024 * 1024)) * 100, 100)}%`, height: '100%', backgroundColor: '#2196F3' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Connection Types */}
      <div style={{ backgroundColor: '#2a2a2a', padding: '20px', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Connection Distribution</h2>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <div style={{ flex: stats.bleConnections, backgroundColor: '#9C27B0', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
            BLE: {stats.bleConnections}
          </div>
          <div style={{ flex: stats.webrtcConnections, backgroundColor: '#FF5722', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
            WebRTC: {stats.webrtcConnections}
          </div>
        </div>
      </div>
    </div>
  );
};
