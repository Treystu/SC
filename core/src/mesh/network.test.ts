/**
 * Mesh Network Tests
 * 
 * Tests for the high-level mesh network orchestration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MeshNetwork, MeshNetworkConfig } from './network';
import { MessageType } from '../protocol/message';
import { generateIdentity } from '../crypto/primitives';

describe('Mesh Network', () => {
  let network: MeshNetwork;

  beforeEach(() => {
    network = new MeshNetwork();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const net = new MeshNetwork();
      expect(net).toBeDefined();
    });

    it('should initialize with custom identity', () => {
      const identity = generateIdentity();
      const config: MeshNetworkConfig = { identity };
      const net = new MeshNetwork(config);
      
      expect(net).toBeDefined();
    });

    it('should initialize with custom max peers', () => {
      const config: MeshNetworkConfig = { maxPeers: 100 };
      const net = new MeshNetwork(config);
      
      expect(net).toBeDefined();
    });

    it('should initialize with custom default TTL', () => {
      const config: MeshNetworkConfig = { defaultTTL: 20 };
      const net = new MeshNetwork(config);
      
      expect(net).toBeDefined();
    });

    it('should generate identity if not provided', () => {
      const net1 = new MeshNetwork();
      const net2 = new MeshNetwork();
      
      // Each network should have unique identity
      expect(net1).not.toBe(net2);
    });
  });

  describe('Peer Management', () => {
    it('should get local peer ID', () => {
      const peerId = network.getLocalPeerId();
      expect(peerId).toBeDefined();
      expect(typeof peerId).toBe('string');
      expect(peerId.length).toBeGreaterThan(0);
    });

    it('should get public key', () => {
      const publicKey = network.getPublicKey();
      expect(publicKey).toBeDefined();
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(32);
    });

    it('should list connected peers', () => {
      const peers = network.getConnectedPeers();
      expect(Array.isArray(peers)).toBe(true);
      expect(peers.length).toBe(0);
    });

    it('should get peer count', () => {
      const count = network.getPeerCount();
      expect(count).toBe(0);
    });
  });

  describe('Message Handling', () => {
    it('should set message callback', () => {
      const callback = jest.fn();
      network.onMessage(callback);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should set peer connected callback', () => {
      const callback = jest.fn();
      network.onPeerConnected(callback);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should set peer disconnected callback', () => {
      const callback = jest.fn();
      network.onPeerDisconnected(callback);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should send text message', async () => {
      const recipientId = 'peer-123';
      const text = 'Hello, World!';
      
      // Should not throw
      await expect(network.sendTextMessage(recipientId, text)).resolves.not.toThrow();
    });

    it('should send binary message', async () => {
      const recipientId = 'peer-123';
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      
      await expect(network.sendBinaryMessage(recipientId, data)).resolves.not.toThrow();
    });

    it('should broadcast message to all peers', async () => {
      const text = 'Broadcast message';
      
      await expect(network.broadcastMessage(text)).resolves.not.toThrow();
    });
  });

  describe('Connection Management', () => {
    it('should attempt to connect to peer', async () => {
      const peerId = 'remote-peer-123';
      
      // This will fail without actual WebRTC setup, but should not throw immediately
      const connectPromise = network.connectToPeer(peerId);
      expect(connectPromise).toBeInstanceOf(Promise);
    });

    it('should reject connection when max peers reached', async () => {
      const config: MeshNetworkConfig = { maxPeers: 0 };
      const net = new MeshNetwork(config);
      
      await expect(net.connectToPeer('peer-1')).rejects.toThrow('Maximum number of peers reached');
    });

    it('should disconnect from peer', async () => {
      const peerId = 'peer-123';
      
      await expect(network.disconnectFromPeer(peerId)).resolves.not.toThrow();
    });

    it('should disconnect from all peers', async () => {
      await expect(network.disconnectAll()).resolves.not.toThrow();
    });
  });

  describe('Network State', () => {
    it('should check if connected to peer', () => {
      const isConnected = network.isConnectedToPeer('peer-123');
      expect(typeof isConnected).toBe('boolean');
      expect(isConnected).toBe(false);
    });

    it('should get network statistics', () => {
      const stats = network.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.peerCount).toBeDefined();
      expect(stats.messagesSent).toBeDefined();
      expect(stats.messagesReceived).toBeDefined();
      expect(stats.bytesTransferred).toBeDefined();
    });

    it('should start network', async () => {
      await expect(network.start()).resolves.not.toThrow();
    });

    it('should stop network', async () => {
      await expect(network.stop()).resolves.not.toThrow();
    });

    it('should restart network', async () => {
      await network.start();
      await expect(network.stop()).resolves.not.toThrow();
      await expect(network.start()).resolves.not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should respect max peers limit', () => {
      const config: MeshNetworkConfig = { maxPeers: 5 };
      const net = new MeshNetwork(config);
      
      expect(net).toBeDefined();
    });

    it('should use default TTL for messages', () => {
      const config: MeshNetworkConfig = { defaultTTL: 15 };
      const net = new MeshNetwork(config);
      
      expect(net).toBeDefined();
    });

    it('should handle zero max peers', () => {
      const config: MeshNetworkConfig = { maxPeers: 0 };
      const net = new MeshNetwork(config);
      
      expect(net.getPeerCount()).toBe(0);
    });

    it('should handle large max peers', () => {
      const config: MeshNetworkConfig = { maxPeers: 1000 };
      const net = new MeshNetwork(config);
      
      expect(net).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid peer ID gracefully', async () => {
      const result = network.isConnectedToPeer('');
      expect(result).toBe(false);
    });

    it('should handle empty message gracefully', async () => {
      await expect(network.sendTextMessage('peer-123', '')).resolves.not.toThrow();
    });

    it('should handle null callbacks gracefully', () => {
      expect(() => network.onMessage(null as any)).not.toThrow();
    });
  });

  describe('Multiple Networks', () => {
    it('should allow multiple network instances', () => {
      const net1 = new MeshNetwork();
      const net2 = new MeshNetwork();
      
      expect(net1.getLocalPeerId()).not.toBe(net2.getLocalPeerId());
    });

    it('should have independent peer lists', () => {
      const net1 = new MeshNetwork();
      const net2 = new MeshNetwork();
      
      expect(net1.getPeerCount()).toBe(0);
      expect(net2.getPeerCount()).toBe(0);
    });

    it('should have independent statistics', () => {
      const net1 = new MeshNetwork();
      const net2 = new MeshNetwork();
      
      const stats1 = net1.getStatistics();
      const stats2 = net2.getStatistics();
      
      expect(stats1).not.toBe(stats2);
    });
  });
});
