/**
 * Tests for DeepLinkHandler
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  DeepLinkManager,
  DeepLinkStorage,
  ParsedDeepLink,
} from './DeepLinkHandler.js';

// Mock storage implementation
class MockStorage implements DeepLinkStorage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe('DeepLinkManager', () => {
  let manager: DeepLinkManager;
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
    manager = new DeepLinkManager(storage);
  });

  describe('parseURL', () => {
    it('should parse custom scheme join URL', () => {
      const result = manager.parseURL('sc://join/ABC123');
      expect(result).toEqual({
        action: 'join',
        params: { code: 'ABC123' },
      });
    });

    it('should parse custom scheme connect URL', () => {
      const result = manager.parseURL('sc://connect/peer123');
      expect(result).toEqual({
        action: 'connect',
        params: { peer: 'peer123' },
      });
    });

    it('should parse HTTPS URL with hash', () => {
      const result = manager.parseURL('https://sc.app/join#ABC123');
      expect(result).toEqual({
        action: 'join',
        params: { code: 'ABC123' },
      });
    });

    it('should parse HTTPS URL with query params', () => {
      const result = manager.parseURL(
        'https://sc.app/join?code=ABC123&inviterName=Alice'
      );
      expect(result).toEqual({
        action: 'join',
        params: { code: 'ABC123', inviterName: 'Alice' },
      });
    });

    it('should parse hash-only format', () => {
      const result = manager.parseURL('#join=ABC123');
      expect(result).toEqual({
        action: 'join',
        params: { code: 'ABC123' },
      });
    });

    it('should parse path with hash', () => {
      const result = manager.parseURL('/join#ABC123');
      expect(result).toEqual({
        action: 'join',
        params: { code: 'ABC123' },
      });
    });

    it('should return empty result for invalid URL', () => {
      const result = manager.parseURL('invalid');
      expect(result).toEqual({
        action: '',
        params: {},
      });
    });
  });

  describe('handleURL', () => {
    it('should handle join URL and store invite code', async () => {
      // First set onboarding as complete
      await storage.set('onboarding_complete', 'true');

      const handled = await manager.handleURL('sc://join/ABC123');

      expect(handled).toBe(true);
      expect(await storage.get('pendingInvite')).toBe('ABC123');
    });

    it('should return false for unhandled action', async () => {
      const handled = await manager.handleURL('sc://unknown/value');
      expect(handled).toBe(false);
    });

    it('should return false for empty action', async () => {
      const handled = await manager.handleURL('invalid-url');
      expect(handled).toBe(false);
    });
  });

  describe('registerHandler', () => {
    it('should allow registering custom handlers', async () => {
      let handledParams: Record<string, string | undefined> | null = null;

      manager.registerHandler('custom', async (params) => {
        handledParams = params;
      });

      await manager.handleURL('sc://custom/test');

      expect(handledParams).toEqual({ value: 'test' });
    });
  });

  describe('pending invite management', () => {
    it('should get and clear pending invite', async () => {
      await storage.set('pendingInvite', 'ABC123');
      await storage.set('pendingInviterName', 'Alice');

      const invite = await manager.getPendingInvite();
      expect(invite).toEqual({ code: 'ABC123', inviterName: 'Alice' });

      await manager.clearPendingInvite();
      const clearedInvite = await manager.getPendingInvite();
      expect(clearedInvite).toBeNull();
    });

    it('should return null when no pending invite', async () => {
      const invite = await manager.getPendingInvite();
      expect(invite).toBeNull();
    });
  });

  describe('pending peer connection management', () => {
    it('should get and clear pending peer connection', async () => {
      await storage.set('pendingPeerConnection', 'peer123');

      const peerId = await manager.getPendingPeerConnection();
      expect(peerId).toBe('peer123');

      await manager.clearPendingPeerConnection();
      const clearedPeerId = await manager.getPendingPeerConnection();
      expect(clearedPeerId).toBeNull();
    });
  });

  describe('static URL generators', () => {
    it('should generate invite URL', () => {
      const url = DeepLinkManager.generateInviteURL(
        'https://sc.app',
        'ABC123',
        'Alice'
      );
      expect(url).toBe('https://sc.app/join?code=ABC123&inviterName=Alice');
    });

    it('should generate invite URL without inviter name', () => {
      const url = DeepLinkManager.generateInviteURL('https://sc.app', 'ABC123');
      expect(url).toBe('https://sc.app/join?code=ABC123');
    });

    it('should generate custom scheme URL', () => {
      const url = DeepLinkManager.generateCustomSchemeURL('ABC123');
      expect(url).toBe('sc://join/ABC123');
    });
  });
});
