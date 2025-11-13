import { describe, it, expect, beforeEach } from 'vitest';
import { PeerRegistry } from '../core/src/peer-registry';
import { RoutingTable } from '../core/src/routing-table';
import { MessageDeduplication } from '../core/src/message-deduplication';
import { MessageFragmenter } from '../core/src/message-fragmentation';

describe('PeerRegistry', () => {
  let registry: PeerRegistry;

  beforeEach(() => {
    registry = new PeerRegistry();
  });

  it('should add peer successfully', () => {
    const peerId = 'peer1';
    registry.addPeer(peerId, { connection: 'webrtc' });
    
    expect(registry.hasPeer(peerId)).toBe(true);
    expect(registry.getPeerCount()).toBe(1);
  });

  it('should remove peer successfully', () => {
    const peerId = 'peer1';
    registry.addPeer(peerId, { connection: 'webrtc' });
    registry.removePeer(peerId);
    
    expect(registry.hasPeer(peerId)).toBe(false);
    expect(registry.getPeerCount()).toBe(0);
  });

  it('should update peer last seen timestamp', () => {
    const peerId = 'peer1';
    registry.addPeer(peerId, { connection: 'webrtc' });
    
    const initialTime = registry.getPeer(peerId)?.lastSeen;
    
    // Wait a bit and update
    setTimeout(() => {
      registry.updatePeerLastSeen(peerId);
      const updatedTime = registry.getPeer(peerId)?.lastSeen;
      
      expect(updatedTime).toBeGreaterThan(initialTime!);
    }, 10);
  });

  it('should remove stale peers', () => {
    registry.addPeer('peer1', { connection: 'webrtc' });
    registry.addPeer('peer2', { connection: 'ble' });
    
    // Manually set old timestamp for peer1
    const peer1 = registry.getPeer('peer1');
    if (peer1) {
      peer1.lastSeen = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    }
    
    registry.removeStale Peers(5 * 60 * 1000); // 5 minute timeout
    
    expect(registry.hasPeer('peer1')).toBe(false);
    expect(registry.hasPeer('peer2')).toBe(true);
  });

  it('should get all connected peers', () => {
    registry.addPeer('peer1', { connection: 'webrtc' });
    registry.addPeer('peer2', { connection: 'ble' });
    registry.addPeer('peer3', { connection: 'webrtc' });
    
    const peers = registry.getAllPeers();
    expect(peers.length).toBe(3);
  });
});

describe('RoutingTable', () => {
  let routingTable: RoutingTable;

  beforeEach(() => {
    routingTable = new RoutingTable();
  });

  it('should add route successfully', () => {
    routingTable.addRoute('destPeer', 'nextHop', 2);
    
    const route = routingTable.getRoute('destPeer');
    expect(route?.nextHop).toBe('nextHop');
    expect(route?.hops).toBe(2);
  });

  it('should update route with better hop count', () => {
    routingTable.addRoute('destPeer', 'nextHop1', 3);
    routingTable.addRoute('destPeer', 'nextHop2', 2);
    
    const route = routingTable.getRoute('destPeer');
    expect(route?.nextHop).toBe('nextHop2');
    expect(route?.hops).toBe(2);
  });

  it('should not update route with worse hop count', () => {
    routingTable.addRoute('destPeer', 'nextHop1', 2);
    routingTable.addRoute('destPeer', 'nextHop2', 3);
    
    const route = routingTable.getRoute('destPeer');
    expect(route?.nextHop).toBe('nextHop1');
    expect(route?.hops).toBe(2);
  });

  it('should remove route', () => {
    routingTable.addRoute('destPeer', 'nextHop', 2);
    routingTable.removeRoute('destPeer');
    
    expect(routingTable.getRoute('destPeer')).toBeUndefined();
  });

  it('should get all routes', () => {
    routingTable.addRoute('dest1', 'hop1', 1);
    routingTable.addRoute('dest2', 'hop2', 2);
    routingTable.addRoute('dest3', 'hop3', 3);
    
    const routes = routingTable.getAllRoutes();
    expect(routes.size).toBe(3);
  });
});

describe('MessageDeduplication', () => {
  let dedup: MessageDeduplication;

  beforeEach(() => {
    dedup = new MessageDeduplication();
  });

  it('should detect duplicate message', () => {
    const messageHash = 'hash123';
    
    expect(dedup.isDuplicate(messageHash)).toBe(false);
    dedup.addMessage(messageHash);
    expect(dedup.isDuplicate(messageHash)).toBe(true);
  });

  it('should expire old messages from cache', async () => {
    const messageHash = 'hash123';
    dedup.addMessage(messageHash);
    
    // Wait for expiration (assuming 1 second TTL for testing)
    await new Promise(resolve => setTimeout(resolve, 1100));
    dedup.cleanExpired(1000); // 1 second TTL
    
    expect(dedup.isDuplicate(messageHash)).toBe(false);
  });

  it('should handle multiple messages', () => {
    dedup.addMessage('hash1');
    dedup.addMessage('hash2');
    dedup.addMessage('hash3');
    
    expect(dedup.isDuplicate('hash1')).toBe(true);
    expect(dedup.isDuplicate('hash2')).toBe(true);
    expect(dedup.isDuplicate('hash3')).toBe(true);
    expect(dedup.isDuplicate('hash4')).toBe(false);
  });
});

describe('MessageFragmenter', () => {
  let fragmenter: MessageFragmenter;

  beforeEach(() => {
    fragmenter = new MessageFragmenter();
  });

  it('should fragment large message', () => {
    const largeMessage = new Uint8Array(5000).fill(65); // 5000 bytes of 'A'
    const fragments = fragmenter.fragment(largeMessage, 1000); // 1KB chunks
    
    expect(fragments.length).toBe(5);
    expect(fragments[0].length).toBe(1000);
    expect(fragments[4].length).toBe(1000);
  });

  it('should reassemble fragmented message', () => {
    const originalMessage = new Uint8Array(5000).fill(65);
    const fragments = fragmenter.fragment(originalMessage, 1000);
    
    const reassembled = fragmenter.reassemble(fragments);
    
    expect(reassembled).toEqual(originalMessage);
  });

  it('should handle message that fits in single fragment', () => {
    const smallMessage = new Uint8Array(500).fill(65);
    const fragments = fragmenter.fragment(smallMessage, 1000);
    
    expect(fragments.length).toBe(1);
    expect(fragments[0]).toEqual(smallMessage);
  });

  it('should fail reassembly with missing fragments', () => {
    const originalMessage = new Uint8Array(5000).fill(65);
    const fragments = fragmenter.fragment(originalMessage, 1000);
    
    // Remove one fragment
    fragments.splice(2, 1);
    
    expect(() => fragmenter.reassemble(fragments)).toThrow();
  });
});
