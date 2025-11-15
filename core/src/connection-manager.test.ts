import { ConnectionManager } from './connection-manager';

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('Basic Connection Management', () => {
    it('should add a connection', () => {
      manager.addConnection('peer1', 'webrtc');
      
      const connection = manager.getConnection('peer1');
      expect(connection).toBeDefined();
      expect(connection?.type).toBe('webrtc');
      expect(connection?.status).toBe('connecting');
    });

    it('should get all connections', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      
      const connections = manager.getAllConnections();
      expect(connections.length).toBe(2);
    });

    it('should remove a connection', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.removeConnection('peer1');
      
      const connection = manager.getConnection('peer1');
      expect(connection).toBeUndefined();
    });
  });

  describe('Connection Status', () => {
    it('should update connection status', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateConnectionStatus('peer1', 'connected');
      
      const connection = manager.getConnection('peer1');
      expect(connection?.status).toBe('connected');
    });

    it('should get connected peers', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      manager.updateConnectionStatus('peer1', 'connected');
      
      const connected = manager.getConnectedPeers();
      expect(connected.length).toBe(1);
      expect(connected[0].id).toBe('peer1');
    });
  });

  describe('Connection Metrics', () => {
    it('should update connection metrics', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateConnectionMetrics('peer1', {
        quality: 0.9,
        latency: 50,
        bandwidth: { upload: 1000, download: 2000 }
      });
      
      const connection = manager.getConnection('peer1');
      expect(connection?.quality).toBe(0.9);
      expect(connection?.latency).toBe(50);
      expect(connection?.bandwidth).toEqual({ upload: 1000, download: 2000 });
    });

    it('should partially update metrics', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateConnectionMetrics('peer1', { quality: 0.8 });
      
      const connection = manager.getConnection('peer1');
      expect(connection?.quality).toBe(0.8);
    });
  });

  describe('Best Connection Selection', () => {
    it('should return null when no connections are available', () => {
      const best = manager.getBestConnection();
      expect(best).toBeNull();
    });

    it('should return null when no connections are connected', () => {
      manager.addConnection('peer1', 'webrtc');
      const best = manager.getBestConnection();
      expect(best).toBeNull();
    });

    it('should return the best connected peer', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      
      manager.updateConnectionStatus('peer1', 'connected');
      manager.updateConnectionStatus('peer2', 'connected');
      
      manager.updateConnectionMetrics('peer1', { quality: 0.7 });
      manager.updateConnectionMetrics('peer2', { quality: 0.9 });
      
      const best = manager.getBestConnection();
      expect(best?.id).toBe('peer2');
    });
  });

  describe('Statistics', () => {
    it('should return statistics with no connections', () => {
      const stats = manager.getStatistics();
      
      expect(stats.total).toBe(0);
      expect(stats.connected).toBe(0);
    });

    it('should return accurate connection statistics', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      manager.updateConnectionStatus('peer1', 'connected');
      
      const stats = manager.getStatistics();
      expect(stats.total).toBe(2);
      expect(stats.connected).toBe(1);
      expect(stats.connecting).toBe(1);
    });

    it('should calculate average quality and latency', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      
      manager.updateConnectionStatus('peer1', 'connected');
      manager.updateConnectionStatus('peer2', 'connected');
      
      manager.updateConnectionMetrics('peer1', { quality: 0.8, latency: 50 });
      manager.updateConnectionMetrics('peer2', { quality: 1.0, latency: 30 });
      
      const stats = manager.getStatistics();
      expect(stats.avgQuality).toBe(0.9);
      expect(stats.avgLatency).toBe(40);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultManager = new ConnectionManager();
      expect(defaultManager).toBeDefined();
      defaultManager.cleanup();
    });

    it('should use custom configuration', () => {
      const customManager = new ConnectionManager({
        maxPeers: 100,
        reconnectInterval: 10000,
        connectionTimeout: 60000,
        keepAliveInterval: 20000
      });
      expect(customManager).toBeDefined();
      customManager.cleanup();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all connections', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      
      manager.cleanup();
      
      const connections = manager.getAllConnections();
      expect(connections.length).toBe(0);
    });

    it('should be safe to call cleanup multiple times', () => {
      manager.addConnection('peer1', 'webrtc');
      
      expect(() => {
        manager.cleanup();
        manager.cleanup();
      }).not.toThrow();
    });
  });
});
