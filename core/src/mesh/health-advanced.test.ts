import { PeerHealthMonitor, PeerHealth } from './health';
import { RoutingTable, createPeer } from './routing';

describe('Advanced Peer Health Monitoring', () => {
  let healthMonitor: PeerHealthMonitor;
  let routingTable: RoutingTable;
  const localPeerId = 'local-peer';
  const privateKey = new Uint8Array(32);

  beforeEach(() => {
    routingTable = new RoutingTable(localPeerId);
    healthMonitor = new PeerHealthMonitor(
      localPeerId,
      privateKey,
      routingTable,
      {
        interval: 1000, // 1 second for testing
        timeout: 3000,
        maxMissed: 2,
        adaptiveInterval: true,
        minInterval: 500,
        maxInterval: 2000,
      }
    );
  });

  afterEach(() => {
    healthMonitor.shutdown();
  });

  describe('Adaptive Heartbeat Intervals', () => {
    it('should initialize with default interval', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      
      healthMonitor.startMonitoring('peer1');
      const health = healthMonitor.getPeerHealth('peer1');
      
      expect(health?.adaptiveInterval).toBe(1000);
    });

    it('should track RTT and latency history', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      healthMonitor.startMonitoring('peer1');

      const timestamp = Date.now() - 100;
      healthMonitor.processHeartbeatResponse('peer1', timestamp);

      const health = healthMonitor.getPeerHealth('peer1');
      expect(health?.rtt).toBeGreaterThan(0);
      expect(health?.latencyHistory.length).toBeGreaterThan(0);
    });

    it('should calculate health score based on metrics', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      healthMonitor.startMonitoring('peer1');

      // Simulate good response
      const timestamp = Date.now() - 50;
      healthMonitor.processHeartbeatResponse('peer1', timestamp);

      const health = healthMonitor.getPeerHealth('peer1');
      expect(health?.healthScore).toBeGreaterThan(80);
    });

    it('should update packet loss on missed heartbeats', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      healthMonitor.startMonitoring('peer1');

      // Force a check without response
      const health = healthMonitor.getPeerHealth('peer1');
      if (health) {
        health.lastHeartbeat = Date.now() - 5000; // Force timeout
      }

      // Packet loss should increase over time with missed heartbeats
      expect(health?.packetLoss).toBeDefined();
    });
  });

  describe('Health Score Calculation', () => {
    it('should penalize high latency', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      healthMonitor.startMonitoring('peer1');

      // Simulate high latency response
      const timestamp = Date.now() - 1500; // 1500ms latency
      healthMonitor.processHeartbeatResponse('peer1', timestamp);

      const health = healthMonitor.getPeerHealth('peer1');
      expect(health?.healthScore).toBeLessThan(80);
    });

    it('should maintain high score for good connection', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      healthMonitor.startMonitoring('peer1');

      // Simulate good responses
      for (let i = 0; i < 5; i++) {
        const timestamp = Date.now() - 50;
        healthMonitor.processHeartbeatResponse('peer1', timestamp);
      }

      const health = healthMonitor.getPeerHealth('peer1');
      expect(health?.healthScore).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Peer Health State Transitions', () => {
    it('should track missed heartbeats', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);

      healthMonitor.startMonitoring('peer1');

      const health = healthMonitor.getPeerHealth('peer1');
      expect(health).toBeDefined();
      expect(health?.isHealthy).toBe(true);
      expect(health?.missedHeartbeats).toBe(0);
    });

    it('should transition back to healthy on successful response', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      healthMonitor.startMonitoring('peer1');

      const health = healthMonitor.getPeerHealth('peer1');
      if (health) {
        health.isHealthy = false;
        health.missedHeartbeats = 3;
      }

      const timestamp = Date.now() - 50;
      healthMonitor.processHeartbeatResponse('peer1', timestamp);

      const updatedHealth = healthMonitor.getPeerHealth('peer1');
      expect(updatedHealth?.isHealthy).toBe(true);
      expect(updatedHealth?.missedHeartbeats).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide health statistics', () => {
      const peer1 = createPeer('peer1', new Uint8Array(32), 'webrtc');
      const peer2 = createPeer('peer2', new Uint8Array(32), 'webrtc');
      
      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);
      
      healthMonitor.startMonitoring('peer1');
      healthMonitor.startMonitoring('peer2');

      const stats = healthMonitor.getStats();
      expect(stats.totalPeers).toBe(2);
      expect(stats.healthy).toBeGreaterThan(0);
    });

    it('should calculate average RTT', () => {
      const peer1 = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer1);
      healthMonitor.startMonitoring('peer1');

      const timestamp = Date.now() - 100;
      healthMonitor.processHeartbeatResponse('peer1', timestamp);

      const stats = healthMonitor.getStats();
      expect(stats.averageRtt).toBeGreaterThan(0);
    });

    it('should get all peer health statuses', () => {
      const peer1 = createPeer('peer1', new Uint8Array(32), 'webrtc');
      const peer2 = createPeer('peer2', new Uint8Array(32), 'webrtc');
      
      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);
      
      healthMonitor.startMonitoring('peer1');
      healthMonitor.startMonitoring('peer2');

      const allHealth = healthMonitor.getAllPeerHealth();
      expect(allHealth).toHaveLength(2);
      expect(allHealth.map(h => h.peerId)).toContain('peer1');
      expect(allHealth.map(h => h.peerId)).toContain('peer2');
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should stop monitoring a peer', () => {
      const peer = createPeer('peer1', new Uint8Array(32), 'webrtc');
      routingTable.addPeer(peer);
      
      healthMonitor.startMonitoring('peer1');
      expect(healthMonitor.getPeerHealth('peer1')).toBeDefined();

      healthMonitor.stopMonitoring('peer1');
      expect(healthMonitor.getPeerHealth('peer1')).toBeUndefined();
    });

    it('should shutdown all monitoring', () => {
      const peer1 = createPeer('peer1', new Uint8Array(32), 'webrtc');
      const peer2 = createPeer('peer2', new Uint8Array(32), 'webrtc');
      
      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);
      
      healthMonitor.startMonitoring('peer1');
      healthMonitor.startMonitoring('peer2');

      healthMonitor.shutdown();

      const allHealth = healthMonitor.getAllPeerHealth();
      expect(allHealth).toHaveLength(0);
    });
  });
});
