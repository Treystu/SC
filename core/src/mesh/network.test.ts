import { MeshNetwork } from './network';
import { Peer } from '../types';

describe('MeshNetwork', () => {
  let network: MeshNetwork;

  beforeEach(() => {
    network = new MeshNetwork();
  });

  afterEach(() => {
    network.shutdown();
  });

  describe('Peer Management', () => {
    it('should add a peer to the network', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      expect(network.getPeer('peer1')).toEqual(peer);
    });

    it('should remove a peer from the network', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.removePeer('peer1');
      expect(network.getPeer('peer1')).toBeUndefined();
    });

    it('should update peer status', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.updatePeerStatus('peer1', 'disconnected');
      
      const updated = network.getPeer('peer1');
      expect(updated?.state).toBe('disconnected');
    });

    it('should get all peers', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      const peers = network.getAllPeers();
      expect(peers).toHaveLength(2);
      expect(peers).toContainEqual(peer1);
      expect(peers).toContainEqual(peer2);
    });

    it('should handle duplicate peer additions', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.addPeer(peer); // Add again

      const peers = network.getAllPeers();
      expect(peers).toHaveLength(1);
    });

    it('should handle peer disconnections', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.handlePeerDisconnect('peer1');

      const updated = network.getPeer('peer1');
      expect(updated?.state).toBe('disconnected');
    });

    it('should get connected peers only', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'disconnected',
        metadata: {}
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      const connected = network.getConnectedPeers();
      expect(connected).toHaveLength(1);
      expect(connected[0].id).toBe('peer1');
    });
  });

  describe('Message Routing', () => {
    it('should route direct message to peer', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);

      const message = new Uint8Array([1, 2, 3, 4]);
      const result = network.sendMessage('peer1', message);
      
      expect(result).toBe(true);
    });

    it('should broadcast message to all peers', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      const message = new Uint8Array([1, 2, 3, 4]);
      const count = network.broadcast(message);
      
      expect(count).toBe(2);
    });

    it('should handle multi-hop routing', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      // Set up route: local -> peer1 -> peer2
      network.addRoute('peer2', ['peer1', 'peer2']);

      const message = new Uint8Array([1, 2, 3, 4]);
      const result = network.sendMessage('peer2', message);
      
      expect(result).toBe(true);
    });

    it('should optimize routes', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: { latency: 100 }
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'connected',
        metadata: { latency: 50 }
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      network.optimizeRoutes();

      // Expect peer2 to be preferred due to lower latency
      const route = network.getRoute('peer2');
      expect(route).toEqual(['peer2']);
    });

    it('should forward messages to next hop', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer1);

      const message = new Uint8Array([1, 2, 3, 4]);
      const result = network.forwardMessage('peer1', 'peer2', message);
      
      expect(result).toBe(true);
    });

    it('should update routing table', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.updateRoutingTable('peer1', ['peer1']);

      const route = network.getRoute('peer1');
      expect(route).toEqual(['peer1']);
    });

    it('should not route to disconnected peers', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'disconnected',
        metadata: {}
      };

      network.addPeer(peer);

      const message = new Uint8Array([1, 2, 3, 4]);
      const result = network.sendMessage('peer1', message);
      
      expect(result).toBe(false);
    });

    it('should handle broadcast to empty network', () => {
      const message = new Uint8Array([1, 2, 3, 4]);
      const count = network.broadcast(message);
      
      expect(count).toBe(0);
    });
  });

  describe('Network Topology', () => {
    it('should form mesh network', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      const topology = network.getTopology();
      expect(topology.peers).toHaveLength(2);
    });

    it('should integrate with peer discovery', () => {
      const discoveredPeer: Peer = {
        id: 'discovered1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8082',
        state: 'connected',
        metadata: {}
      };

      network.onPeerDiscovered(discoveredPeer);

      const peer = network.getPeer('discovered1');
      expect(peer).toEqual(discoveredPeer);
    });

    it('should establish connections', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connecting',
        metadata: {}
      };

      network.addPeer(peer);
      network.establishConnection('peer1');

      const updated = network.getPeer('peer1');
      expect(updated?.state).toBe('connected');
    });

    it('should expand network with new peers', () => {
      const initialCount = network.getAllPeers().length;

      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);

      expect(network.getAllPeers().length).toBe(initialCount + 1);
    });

    it('should update topology when peers change', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      const topology1 = network.getTopology();

      network.removePeer('peer1');
      const topology2 = network.getTopology();

      expect(topology1.peers.length).toBeGreaterThan(topology2.peers.length);
    });
  });

  describe('Health Monitoring', () => {
    it('should check peer health', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      
      const health = network.checkPeerHealth('peer1');
      expect(health).toBeDefined();
    });

    it('should track connection quality', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.updateConnectionQuality('peer1', 0.9);

      const quality = network.getConnectionQuality('peer1');
      expect(quality).toBe(0.9);
    });

    it('should detect dead peers', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: { lastSeen: Date.now() - 60000 }
      };

      network.addPeer(peer);
      
      const dead = network.getDeadPeers(30000); // 30s timeout
      expect(dead).toContain('peer1');
    });

    it('should update health status', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer);
      network.updateHealthStatus('peer1', 'healthy');

      const health = network.checkPeerHealth('peer1');
      expect(health?.status).toBe('healthy');
    });
  });

  describe('Error Handling', () => {
    it('should handle peer failure recovery', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'failed',
        metadata: {}
      };

      network.addPeer(peer);
      network.recoverPeer('peer1');

      const recovered = network.getPeer('peer1');
      expect(recovered?.state).toBe('connecting');
    });

    it('should handle network partition', () => {
      const peer1: Peer = {
        id: 'peer1',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8080',
        state: 'connected',
        metadata: {}
      };

      const peer2: Peer = {
        id: 'peer2',
        publicKey: new Uint8Array(32),
        endpoint: 'ws://localhost:8081',
        state: 'connected',
        metadata: {}
      };

      network.addPeer(peer1);
      network.addPeer(peer2);

      network.handlePartition(['peer1'], ['peer2']);

      // Should maintain both partitions
      expect(network.getPeer('peer1')).toBeDefined();
      expect(network.getPeer('peer2')).toBeDefined();
    });
  });
});
