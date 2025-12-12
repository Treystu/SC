/**
 * DHT Routing Integration Tests
 * 
 * Tests the integration of Kademlia DHT with the mesh routing layer,
 * including bootstrap from discovery mechanisms.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  RoutingTable,
  RoutingMode,
  createPeer,
  type Peer,
} from '../../core/src/mesh/routing.js';
import {
  KademliaRoutingTable,
  generateNodeId,
  nodeIdFromPublicKey,
  bootstrapFromQRCode,
  bootstrapFromManualEntry,
  peerToDHTContact,
  isValidDHTPeer,
} from '../../core/src/mesh/dht/index.js';
import type { PeerInfo } from '../../core/src/discovery/peer.js';

// Helper to generate a mock public key for testing
// Note: Uses crypto.getRandomValues when available (browser/Node 15+)
// Falls back to deterministic pattern for environments without crypto API
function generateMockPublicKey(): Uint8Array {
  const key = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(key);
  } else if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer) {
    // Node.js fallback with crypto
    const nodeCrypto = require('crypto');
    return new Uint8Array(nodeCrypto.randomBytes(32));
  } else {
    // Final fallback: deterministic pattern for testing
    // This is acceptable for unit tests where we don't need cryptographic security
    for (let i = 0; i < 32; i++) {
      key[i] = (i * 7 + Date.now()) % 256;
    }
  }
  return key;
}

// Helper to create a mock peer
function createMockPeer(id?: string, publicKey?: Uint8Array): Peer {
  const pk = publicKey || generateMockPublicKey();
  const peerId = id || Buffer.from(pk).toString('hex');
  return createPeer(peerId, pk, 'webrtc');
}

describe('DHT Routing Integration', () => {
  describe('RoutingTable DHT Mode', () => {
    it('should create routing table in FLOOD mode by default', () => {
      const routingTable = new RoutingTable();
      expect(routingTable.getRoutingMode()).toBe(RoutingMode.FLOOD);
    });

    it('should create routing table in DHT mode', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.DHT,
        dhtRoutingTable,
      });

      expect(routingTable.getRoutingMode()).toBe(RoutingMode.DHT);
      expect(routingTable.getDHTRoutingTable()).toBe(dhtRoutingTable);
    });

    it('should create routing table in HYBRID mode', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.HYBRID,
        dhtRoutingTable,
      });

      expect(routingTable.getRoutingMode()).toBe(RoutingMode.HYBRID);
      expect(routingTable.isDHTEnabled()).toBe(true);
    });

    it('should throw error if DHT mode without DHT routing table', () => {
      expect(() => {
        new RoutingTable({ mode: RoutingMode.DHT });
      }).toThrow('DHT routing table required');
    });

    it('should add peers to DHT when in DHT mode', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.DHT,
        dhtRoutingTable,
      });

      const peer = createMockPeer();
      routingTable.addPeer(peer);

      // Check peer is in regular routing table
      expect(routingTable.getPeer(peer.id)).toBeDefined();

      // Check peer is also in DHT routing table
      const dhtContacts = dhtRoutingTable.getAllContacts();
      expect(dhtContacts.length).toBeGreaterThan(0);
    });

    it('should not add peers to DHT when in FLOOD mode', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.FLOOD,
        dhtRoutingTable, // DHT table provided but not used
      });

      const peer = createMockPeer();
      routingTable.addPeer(peer);

      // Peer should be in routing table
      expect(routingTable.getPeer(peer.id)).toBeDefined();

      // DHT should remain empty
      const dhtContacts = dhtRoutingTable.getAllContacts();
      expect(dhtContacts.length).toBe(0);
    });
  });

  describe('Peer to DHT Contact Conversion', () => {
    it('should convert peer to DHT contact', () => {
      const publicKey = generateMockPublicKey();
      const peer = createMockPeer(undefined, publicKey);
      
      const dhtContact = peerToDHTContact(peer);
      
      expect(dhtContact.peerId).toBe(peer.id);
      expect(dhtContact.lastSeen).toBe(peer.lastSeen);
      expect(dhtContact.failureCount).toBe(0);
      expect(dhtContact.endpoints).toHaveLength(1);
      expect(dhtContact.endpoints[0].type).toBe('webrtc');
    });

    it('should validate DHT peer correctly', () => {
      const validPeer = createMockPeer();
      expect(isValidDHTPeer(validPeer)).toBe(true);

      const invalidPeer = {
        ...createMockPeer(),
        publicKey: new Uint8Array(16), // Wrong size
      } as Peer;
      expect(isValidDHTPeer(invalidPeer)).toBe(false);
    });
  });

  describe('DHT Peer Lookup', () => {
    it('should find peers via DHT', async () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.DHT,
        dhtRoutingTable,
      });

      // Add some peers
      const peers: Peer[] = [];
      for (let i = 0; i < 5; i++) {
        const peer = createMockPeer();
        peers.push(peer);
        routingTable.addPeer(peer);
      }

      // Try to find a peer
      const targetPeerId = peers[2].id;
      const closestNodes = await routingTable.findPeerViaDHT(targetPeerId);
      
      expect(Array.isArray(closestNodes)).toBe(true);
      // In a small network, we should find the added peers
      expect(closestNodes.length).toBeGreaterThan(0);
    }, 10000);

    it('should throw error when finding peer without DHT', async () => {
      const routingTable = new RoutingTable({ mode: RoutingMode.FLOOD });
      
      await expect(
        routingTable.findPeerViaDHT('some-peer-id')
      ).rejects.toThrow('DHT routing table not configured');
    });
  });

  describe('Bootstrap Integration', () => {
    it('should bootstrap from QR code peer', async () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);

      const publicKey = generateMockPublicKey();
      const peerInfo: PeerInfo = {
        publicKey,
        peerId: Buffer.from(publicKey).toString('hex').slice(0, 40),
        displayName: 'QR Test Peer',
        endpoints: [
          { type: 'webrtc', signaling: 'relay-1' },
        ],
        timestamp: Date.now(),
      };

      // Mock RPC sender (bootstrap will try to ping)
      dhtRoutingTable.setRpcSender(async () => {
        // Mock successful ping
      });

      const result = await bootstrapFromQRCode(dhtRoutingTable, peerInfo);
      
      // Bootstrap might fail without real network, but should not throw
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.duration).toBe('number');
    }, 10000);

    it('should bootstrap from manual entry', async () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);

      const publicKey = generateMockPublicKey();
      const peerId = Buffer.from(publicKey).toString('hex').slice(0, 40);
      const address = '192.168.1.100:8080';

      // Mock RPC sender
      dhtRoutingTable.setRpcSender(async () => {});

      const result = await bootstrapFromManualEntry(
        dhtRoutingTable,
        peerId,
        publicKey,
        address,
        'manual'
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }, 10000);
  });

  describe('Multi-peer DHT Network', () => {
    it('should build DHT network with multiple peers', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.DHT,
        dhtRoutingTable,
      });

      // Add 20 peers
      const peers: Peer[] = [];
      for (let i = 0; i < 20; i++) {
        const peer = createMockPeer();
        peers.push(peer);
        routingTable.addPeer(peer);
      }

      // Check statistics
      const stats = routingTable.getStats();
      expect(stats.peerCount).toBe(20);

      const dhtStats = dhtRoutingTable.getStats();
      expect(dhtStats.nodeCount).toBe(20);
      expect(dhtStats.activeBuckets).toBeGreaterThan(0);
    });

    it('should distribute peers across buckets', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.DHT,
        dhtRoutingTable,
      });

      // Add many peers to see distribution
      for (let i = 0; i < 50; i++) {
        const peer = createMockPeer();
        routingTable.addPeer(peer);
      }

      const dhtStats = dhtRoutingTable.getStats();
      // getBucketDistribution() is the correct API method
      const distribution = dhtRoutingTable.getBucketDistribution();
      
      // Should have peers in multiple buckets
      const nonEmptyBuckets = distribution.filter((count: number) => count > 0);
      expect(nonEmptyBuckets.length).toBeGreaterThan(1);
    });
  });

  describe('Hybrid Mode', () => {
    it('should support both flood and DHT routing in hybrid mode', () => {
      const localNodeId = generateNodeId();
      const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
      
      const routingTable = new RoutingTable({
        mode: RoutingMode.HYBRID,
        dhtRoutingTable,
      });

      const peer = createMockPeer();
      routingTable.addPeer(peer);

      // Peer should be in both systems
      expect(routingTable.getPeer(peer.id)).toBeDefined();
      expect(dhtRoutingTable.getAllContacts().length).toBeGreaterThan(0);
      
      // Should have DHT capabilities
      expect(routingTable.isDHTEnabled()).toBe(true);
      expect(routingTable.getDHTRoutingTable()).toBe(dhtRoutingTable);
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with existing code that does not specify mode', () => {
      const routingTable = new RoutingTable();
      
      const peer = createMockPeer();
      routingTable.addPeer(peer);
      
      expect(routingTable.getPeer(peer.id)).toBeDefined();
      expect(routingTable.getRoutingMode()).toBe(RoutingMode.FLOOD);
    });

    it('should work with existing configuration objects', () => {
      const routingTable = new RoutingTable({
        maxCacheSize: 5000,
        cacheTTL: 30000,
      });
      
      expect(routingTable.getRoutingMode()).toBe(RoutingMode.FLOOD);
    });
  });
});
