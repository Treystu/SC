/**
 * Basic tests for IndexedDB persistence
 * Task 1.2.13: Add tests for persistence
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager, getDatabase } from './database';

describe('DatabaseManager - V1 Persistence', () => {
  let db: DatabaseManager;

  beforeEach(async () => {
    db = getDatabase();
    await db.init();
  });

  afterEach(async () => {
    await db.clearAll();
    db.close();
  });

  describe('Identity Operations', () => {
    it('should save and retrieve an identity', async () => {
      const identity = {
        id: 'test-identity-1',
        publicKey: new Uint8Array([1, 2, 3]),
        privateKey: new Uint8Array([4, 5, 6]),
        fingerprint: 'abc123',
        createdAt: Date.now(),
        isPrimary: true,
        label: 'Test Identity'
      };

      await db.saveIdentity(identity);
      const retrieved = await db.getIdentity(identity.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(identity.id);
      expect(retrieved?.fingerprint).toBe(identity.fingerprint);
      expect(retrieved?.isPrimary).toBe(true);
    });

    it('should retrieve primary identity', async () => {
      const identity1 = {
        id: 'id1',
        publicKey: new Uint8Array([1]),
        privateKey: new Uint8Array([2]),
        fingerprint: 'fp1',
        createdAt: Date.now(),
        isPrimary: false
      };

      const identity2 = {
        id: 'id2',
        publicKey: new Uint8Array([3]),
        privateKey: new Uint8Array([4]),
        fingerprint: 'fp2',
        createdAt: Date.now(),
        isPrimary: true
      };

      await db.saveIdentity(identity1);
      await db.saveIdentity(identity2);

      const primary = await db.getPrimaryIdentity();
      expect(primary?.id).toBe('id2');
    });

    it('should delete an identity', async () => {
      const identity = {
        id: 'to-delete',
        publicKey: new Uint8Array([1]),
        privateKey: new Uint8Array([2]),
        fingerprint: 'fp',
        createdAt: Date.now(),
        isPrimary: false
      };

      await db.saveIdentity(identity);
      await db.deleteIdentity(identity.id);

      const retrieved = await db.getIdentity(identity.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Peer Persistence', () => {
    it('should save and retrieve a peer', async () => {
      const peer = {
        id: 'peer-1',
        publicKey: 'pubkey123',
        transportType: 'webrtc' as const,
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        connectionQuality: 85,
        bytesSent: 1000,
        bytesReceived: 2000,
        reputation: 75,
        isBlacklisted: false
      };

      await db.savePeer(peer);
      const retrieved = await db.getPeer(peer.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(peer.id);
      expect(retrieved?.reputation).toBe(75);
    });

    it('should update peer reputation', async () => {
      const peer = {
        id: 'peer-rep',
        publicKey: 'pk',
        transportType: 'webrtc' as const,
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
        reputation: 50,
        isBlacklisted: false
      };

      await db.savePeer(peer);
      await db.updatePeerReputation(peer.id, 90);

      const updated = await db.getPeer(peer.id);
      expect(updated?.reputation).toBe(90);
    });

    it('should blacklist a peer', async () => {
      const peer = {
        id: 'bad-peer',
        publicKey: 'pk',
        transportType: 'webrtc' as const,
        lastSeen: Date.now(),
        connectedAt: Date.now(),
        connectionQuality: 50,
        bytesSent: 0,
        bytesReceived: 0,
        reputation: 10,
        isBlacklisted: false
      };

      await db.savePeer(peer);
      await db.blacklistPeer(peer.id, 3600000); // 1 hour

      const blacklisted = await db.getPeer(peer.id);
      expect(blacklisted?.isBlacklisted).toBe(true);
      expect(blacklisted?.blacklistedUntil).toBeDefined();
    });

    it('should get only active peers', async () => {
      const now = Date.now();
      const oldPeer = {
        id: 'old-peer',
        publicKey: 'pk1',
        transportType: 'webrtc' as const,
        lastSeen: now - 10 * 60 * 1000, // 10 minutes ago
        connectedAt: now - 20 * 60 * 1000,
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
        reputation: 50,
        isBlacklisted: false
      };

      const activePeer = {
        id: 'active-peer',
        publicKey: 'pk2',
        transportType: 'webrtc' as const,
        lastSeen: now - 2 * 60 * 1000, // 2 minutes ago
        connectedAt: now - 5 * 60 * 1000,
        connectionQuality: 100,
        bytesSent: 0,
        bytesReceived: 0,
        reputation: 50,
        isBlacklisted: false
      };

      await db.savePeer(oldPeer);
      await db.savePeer(activePeer);

      const active = await db.getActivePeers();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('active-peer');
    });
  });

  describe('Data Export/Import', () => {
    it('should export all data', async () => {
      // Add some test data
      await db.saveIdentity({
        id: 'id1',
        publicKey: new Uint8Array([1]),
        privateKey: new Uint8Array([2]),
        fingerprint: 'fp1',
        createdAt: Date.now(),
        isPrimary: true
      });

      await db.saveContact({
        id: 'contact1',
        publicKey: 'pk1',
        displayName: 'Test Contact',
        lastSeen: Date.now(),
        createdAt: Date.now(),
        fingerprint: 'fp-contact',
        verified: true,
        blocked: false,
        endpoints: []
      });

      const exported = await db.exportAllData();

      expect(exported.version).toBe('1.0');
      expect(exported.exportedAt).toBeDefined();
      expect(exported.identities.length).toBe(1);
      expect(exported.contacts.length).toBe(1);
    });

    it('should import data with merge strategy', async () => {
      const exportData = {
        version: '1.0',
        exportedAt: Date.now(),
        identities: [{
          id: 'imported-id',
          publicKey: new Uint8Array([1]),
          privateKey: new Uint8Array([2]),
          fingerprint: 'imported-fp',
          createdAt: Date.now(),
          isPrimary: true
        }],
        contacts: [],
        conversations: [],
        messages: [],
        peers: [],
        routes: [],
        sessionKeys: []
      };

      const result = await db.importData(exportData, { mergeStrategy: 'merge' });

      expect(result.imported).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      const identity = await db.getIdentity('imported-id');
      expect(identity).toBeDefined();
    });
  });

  describe('Secure Deletion', () => {
    it('should require correct confirmation token', async () => {
      await expect(
        db.deleteAllData('wrong token')
      ).rejects.toThrow('Invalid confirmation token');
    });

    it('should delete all data with correct token', async () => {
      // Add some data
      await db.saveIdentity({
        id: 'id1',
        publicKey: new Uint8Array([1]),
        privateKey: new Uint8Array([2]),
        fingerprint: 'fp1',
        createdAt: Date.now(),
        isPrimary: true
      });

      await db.deleteAllData('DELETE ALL MY DATA');

      const identities = await db.getAllIdentities();
      expect(identities.length).toBe(0);
    });
  });
});
