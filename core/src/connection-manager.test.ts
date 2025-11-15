import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ConnectionManager, type PeerConnection } from './connection-manager';

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager({
      maxPeers: 10,
      reconnectInterval: 1000,
      connectionTimeout: 5000,
      keepAliveInterval: 2000
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    manager.destroy();
    jest.useRealTimers();
  });

  describe('Connection Management', () => {
    it('should add new connection', () => {
      manager.addConnection('peer1', 'webrtc');
      const connection = manager.getConnection('peer1');

      expect(connection).toBeDefined();
      expect(connection?.id).toBe('peer1');
      expect(connection?.type).toBe('webrtc');
      expect(connection?.status).toBe('connecting');
    });

    it('should remove connection', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.removeConnection('peer1');

      const connection = manager.getConnection('peer1');
      expect(connection).toBeUndefined();
    });

    it('should list all connections', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      manager.addConnection('peer3', 'local');

      const connections = manager.getAllConnections();
      expect(connections.length).toBe(3);
    });

    it('should enforce max peers limit', () => {
      for (let i = 0; i < 15; i++) {
        manager.addConnection(`peer${i}`, 'webrtc');
      }

      const connections = manager.getAllConnections();
      expect(connections.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Connection Status', () => {
    it('should update connection status', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateStatus('peer1', 'connected');

      const connection = manager.getConnection('peer1');
      expect(connection?.status).toBe('connected');
    });

    it('should track connection quality', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateQuality('peer1', 0.85);

      const connection = manager.getConnection('peer1');
      expect(connection?.quality).toBe(0.85);
    });

    it('should track latency', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateLatency('peer1', 50);

      const connection = manager.getConnection('peer1');
      expect(connection?.latency).toBe(50);
    });

    it('should update last seen timestamp', () => {
      manager.addConnection('peer1', 'webrtc');
      const initialTime = Date.now();
      
      jest.advanceTimersByTime(5000);
      manager.updateLastSeen('peer1');

      const connection = manager.getConnection('peer1');
      expect(connection?.lastSeen).toBeGreaterThan(initialTime);
    });

    it('should track bandwidth', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateBandwidth('peer1', { upload: 1000, download: 2000 });

      const connection = manager.getConnection('peer1');
      expect(connection?.bandwidth.upload).toBe(1000);
      expect(connection?.bandwidth.download).toBe(2000);
    });
  });

  describe('Keep-Alive', () => {
    it('should start keep-alive for new connection', () => {
      manager.addConnection('peer1', 'webrtc');
      
      // Verify timer was started
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('should send keep-alive messages', () => {
      const onKeepAlive = jest.fn();
      manager.on('keepalive', onKeepAlive);
      
      manager.addConnection('peer1', 'webrtc');
      
      jest.advanceTimersByTime(2000);
      
      expect(onKeepAlive).toHaveBeenCalled();
    });

    it('should stop keep-alive when connection removed', () => {
      manager.addConnection('peer1', 'webrtc');
      const timerCount = jest.getTimerCount();
      
      manager.removeConnection('peer1');
      
      expect(jest.getTimerCount()).toBeLessThan(timerCount);
    });
  });

  describe('Reconnection', () => {
    it('should attempt reconnection on failure', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateStatus('peer1', 'failed');

      jest.advanceTimersByTime(1000);
      
      const connection = manager.getConnection('peer1');
      expect(connection?.status).toBe('connecting');
    });

    it('should respect reconnect interval', () => {
      const onReconnect = jest.fn();
      manager.on('reconnect', onReconnect);
      
      manager.addConnection('peer1', 'webrtc');
      manager.updateStatus('peer1', 'failed');

      jest.advanceTimersByTime(500);
      expect(onReconnect).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(500);
      expect(onReconnect).toHaveBeenCalled();
    });

    it('should limit reconnection attempts', () => {
      manager.addConnection('peer1', 'webrtc');
      
      // Fail and reconnect multiple times
      for (let i = 0; i < 10; i++) {
        manager.updateStatus('peer1', 'failed');
        jest.advanceTimersByTime(1000);
      }

      // After max attempts, should give up
      const connection = manager.getConnection('peer1');
      expect(connection).toBeDefined();
    });
  });

  describe('Connection Timeout', () => {
    it('should timeout if not connected', () => {
      manager.addConnection('peer1', 'webrtc');
      
      jest.advanceTimersByTime(5000);
      
      const connection = manager.getConnection('peer1');
      expect(connection?.status).not.toBe('connecting');
    });

    it('should not timeout connected connections', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateStatus('peer1', 'connected');
      
      jest.advanceTimersByTime(10000);
      
      const connection = manager.getConnection('peer1');
      expect(connection?.status).toBe('connected');
    });
  });

  describe('Connection Types', () => {
    it('should support WebRTC connections', () => {
      manager.addConnection('peer1', 'webrtc');
      const connection = manager.getConnection('peer1');
      
      expect(connection?.type).toBe('webrtc');
    });

    it('should support BLE connections', () => {
      manager.addConnection('peer2', 'ble');
      const connection = manager.getConnection('peer2');
      
      expect(connection?.type).toBe('ble');
    });

    it('should support local connections', () => {
      manager.addConnection('peer3', 'local');
      const connection = manager.getConnection('peer3');
      
      expect(connection?.type).toBe('local');
    });
  });

  describe('Statistics', () => {
    it('should count total connections', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      
      const stats = manager.getStatistics();
      expect(stats.totalConnections).toBe(2);
    });

    it('should count connected peers', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'webrtc');
      manager.updateStatus('peer1', 'connected');
      
      const stats = manager.getStatistics();
      expect(stats.connectedPeers).toBe(1);
    });

    it('should calculate average latency', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'webrtc');
      manager.updateLatency('peer1', 50);
      manager.updateLatency('peer2', 100);
      
      const stats = manager.getStatistics();
      expect(stats.averageLatency).toBe(75);
    });

    it('should calculate average quality', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'webrtc');
      manager.updateQuality('peer1', 0.8);
      manager.updateQuality('peer2', 0.6);
      
      const stats = manager.getStatistics();
      expect(stats.averageQuality).toBe(0.7);
    });
  });

  describe('Cleanup', () => {
    it('should clean up stale connections', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.updateStatus('peer1', 'connected');
      
      // Simulate stale connection (no updates for long time)
      jest.advanceTimersByTime(60000);
      manager.cleanupStaleConnections();
      
      const connection = manager.getConnection('peer1');
      expect(connection?.status).not.toBe('connected');
    });

    it('should destroy all connections on cleanup', () => {
      manager.addConnection('peer1', 'webrtc');
      manager.addConnection('peer2', 'ble');
      
      manager.destroy();
      
      const connections = manager.getAllConnections();
      expect(connections.length).toBe(0);
    });
  });
});
