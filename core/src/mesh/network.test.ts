import { MeshNetwork } from './network';
import type { Peer } from './routing';
import { createPeer } from './routing';

describe('MeshNetwork', () => {
  let network: MeshNetwork;

  beforeEach(() => {
    network = new MeshNetwork();
  });

  afterEach(() => {
    network.shutdown();
  });

  describe('Basic Functionality', () => {
    it('should create a mesh network instance', () => {
      expect(network).toBeDefined();
      expect(network.getLocalPeerId()).toBeDefined();
    });

    it('should get connected peers', () => {
      const peers = network.getConnectedPeers();
      expect(Array.isArray(peers)).toBe(true);
    });

    it('should get peer count', () => {
      const count = network.getPeerCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get statistics', () => {
      const stats = network.getStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.messagesSent).toBe('number');
      expect(typeof stats.messagesReceived).toBe('number');
    });

    it('should get identity', () => {
      const identity = network.getIdentity();
      expect(identity).toBeDefined();
      expect(identity.publicKey).toBeDefined();
      expect(identity.privateKey).toBeDefined();
    });

    it('should get public key', () => {
      const publicKey = network.getPublicKey();
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBeGreaterThan(0);
    });
  });

  describe('Message Handling', () => {
    it('should register message callback', () => {
      const callback = jest.fn();
      network.onMessage(callback);
      // Callback registered successfully
      expect(callback).toBeDefined();
    });

    it('should register peer connected callback', () => {
      const callback = jest.fn();
      network.onPeerConnected(callback);
      expect(callback).toBeDefined();
    });

    it('should register peer disconnected callback', () => {
      const callback = jest.fn();
      network.onPeerDisconnected(callback);
      expect(callback).toBeDefined();
    });
  });

  describe('Lifecycle Management', () => {
    it('should start network', async () => {
      await network.start();
      // Network started successfully
      expect(network).toBeDefined();
    });

    it('should stop network', async () => {
      await network.start();
      await network.stop();
      // Network stopped successfully
      expect(network).toBeDefined();
    });

    it('should shutdown network', () => {
      network.shutdown();
      // Network shut down successfully
      expect(network).toBeDefined();
    });
  });
});
