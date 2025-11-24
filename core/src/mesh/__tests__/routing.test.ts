import { RoutingTable } from '../routing';
import { Peer, TransportType } from '../../types';
import { generateIdentity } from '../../crypto';

describe('RoutingTable', () => {
  let routingTable: RoutingTable;

  beforeEach(() => {
    routingTable = new RoutingTable();
  });

  describe('Peer management', () => {
    it('should add and retrieve a peer', () => {
      const identity = generateIdentity();
      const peer: Peer = {
        id: identity.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      };

      routingTable.addPeer(peer);
      const retrieved = routingTable.getPeer(identity.publicKey);

      expect(retrieved).toEqual(peer);
    });

    it('should remove a peer', () => {
      const identity = generateIdentity();
      const peer: Peer = {
        id: identity.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      };

      routingTable.addPeer(peer);
      routingTable.removePeer(identity.publicKey);
      const retrieved = routingTable.getPeer(identity.publicKey);

      expect(retrieved).toBeUndefined();
    });

    it('should get all peers', () => {
      const id1 = generateIdentity();
      const id2 = generateIdentity();
      const peer1: Peer = {
        id: id1.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      };
      const peer2: Peer = {
        id: id2.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.BLE,
        reliability: 0.8,
      };

      routingTable.addPeer(peer1);
      routingTable.addPeer(peer2);
      const peers = routingTable.getAllPeers();

      expect(peers).toHaveLength(2);
    });

    it('should check for direct connection', () => {
      const identity = generateIdentity();
      const peer: Peer = {
        id: identity.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      };

      expect(routingTable.hasDirectConnection(identity.publicKey)).toBe(false);
      routingTable.addPeer(peer);
      expect(routingTable.hasDirectConnection(identity.publicKey)).toBe(true);
    });

    it('should update peer last seen', () => {
      const identity = generateIdentity();
      const peer: Peer = {
        id: identity.publicKey,
        lastSeen: 1000,
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      };

      routingTable.addPeer(peer);
      const before = routingTable.getPeer(identity.publicKey)!.lastSeen;

      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        routingTable.updatePeerLastSeen(identity.publicKey);
        const after = routingTable.getPeer(identity.publicKey)!.lastSeen;
        expect(after).toBeGreaterThan(before);
      }, 10);
    });
  });

  describe('Route management', () => {
    it('should add and retrieve a route', () => {
      const dest = generateIdentity().publicKey;
      const nextHop = generateIdentity().publicKey;
      
      routingTable.addRoute({
        destinationId: dest,
        nextHopId: nextHop,
        hopCount: 2,
        lastUpdated: Date.now(),
      });

      const retrieved = routingTable.getNextHop(dest);
      expect(retrieved).toEqual(nextHop);
    });

    it('should prefer routes with fewer hops', () => {
      const dest = generateIdentity().publicKey;
      const hop1 = generateIdentity().publicKey;
      const hop2 = generateIdentity().publicKey;

      routingTable.addRoute({
        destinationId: dest,
        nextHopId: hop1,
        hopCount: 3,
        lastUpdated: Date.now(),
      });

      routingTable.addRoute({
        destinationId: dest,
        nextHopId: hop2,
        hopCount: 2,
        lastUpdated: Date.now(),
      });

      const retrieved = routingTable.getNextHop(dest);
      expect(retrieved).toEqual(hop2);
    });
  });
});
