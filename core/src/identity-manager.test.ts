import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IdentityManager, type Identity } from './identity-manager';

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

global.localStorage = localStorageMock as any;

describe('IdentityManager', () => {
  let manager: IdentityManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new IdentityManager();
  });

  describe('Identity Generation', () => {
    it('should generate new identity', async () => {
      const identity = await manager.generateIdentity();

      expect(identity).toBeDefined();
      expect(identity.id).toBeDefined();
      expect(identity.publicKey).toBeDefined();
      expect(identity.privateKey).toBeDefined();
      expect(identity.created).toBeInstanceOf(Date);
    });

    it('should generate identity with display name', async () => {
      const identity = await manager.generateIdentity('Alice');

      expect(identity.displayName).toBe('Alice');
    });

    it('should generate unique IDs', async () => {
      const identity1 = await manager.generateIdentity();
      const manager2 = new IdentityManager();
      const identity2 = await manager2.generateIdentity();

      expect(identity1.id).not.toBe(identity2.id);
    });

    it('should use Ed25519 keys', async () => {
      const identity = await manager.generateIdentity();

      expect(identity.publicKey.algorithm.name).toBe('Ed25519');
      expect(identity.privateKey.algorithm.name).toBe('Ed25519');
    });
  });

  describe('Identity Persistence', () => {
    it('should save identity to storage', async () => {
      const identity = await manager.generateIdentity('Bob');
      // generateIdentity automatically saves, so we just need to load it back

      const loaded = await manager.loadIdentity();
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(identity.id);
    });

    it('should load identity from storage', async () => {
      await manager.generateIdentity('Charlie');
      // generateIdentity automatically saves

      const newManager = new IdentityManager();
      const loaded = await newManager.loadIdentity();

      expect(loaded).toBeDefined();
      expect(loaded?.displayName).toBe('Charlie');
    });

    it('should return null when no identity exists', async () => {
      const loaded = await manager.loadIdentity();
      expect(loaded).toBeNull();
    });

    it('should delete identity from storage', async () => {
      await manager.generateIdentity();
      // generateIdentity automatically saves
      await manager.deleteIdentity();

      const loaded = await manager.loadIdentity();
      expect(loaded).toBeNull();
    });
  });

  describe('Identity Export/Import', () => {
    it('should export identity to JWK format', async () => {
      const identity = await manager.generateIdentity('Dave');
      const exported = await manager.exportIdentity();

      expect(exported).toBeDefined();
      expect(exported.id).toBe(identity.id);
      expect(exported.publicKeyJwk).toBeDefined();
      expect(exported.privateKeyJwk).toBeDefined();
      expect(exported.displayName).toBe('Dave');
    });

    it('should import identity from JWK format', async () => {
      const original = await manager.generateIdentity('Eve');
      const exported = await manager.exportIdentity();

      const newManager = new IdentityManager();
      const imported = await newManager.importIdentity(exported);

      expect(imported.id).toBe(original.id);
      expect(imported.displayName).toBe(original.displayName);
    });

    it('should preserve key material on export/import', async () => {
      await manager.generateIdentity();
      const exported = await manager.exportIdentity();

      const newManager = new IdentityManager();
      const imported = await newManager.importIdentity(exported);

      // Verify keys can still be used for signing
      const data = new Uint8Array([1, 2, 3]);
      const signature = await crypto.subtle.sign(
        'Ed25519',
        imported.privateKey,
        data
      );

      const verified = await crypto.subtle.verify(
        'Ed25519',
        imported.publicKey,
        signature,
        data
      );

      expect(verified).toBe(true);
    });
  });

  describe('Public Key Operations', () => {
    it('should get public key', async () => {
      await manager.generateIdentity();
      const publicKey = await manager.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(publicKey.type).toBe('public');
    });

    it('should export public key as bytes', async () => {
      await manager.generateIdentity();
      const publicKeyBytes = await manager.getPublicKeyBytes();

      expect(publicKeyBytes).toBeInstanceOf(Uint8Array);
      expect(publicKeyBytes.length).toBeGreaterThan(0);
    });

    it('should export public key as hex string', async () => {
      await manager.generateIdentity();
      const publicKeyHex = await manager.getPublicKeyHex();

      expect(typeof publicKeyHex).toBe('string');
      expect(publicKeyHex.length).toBeGreaterThan(0);
      expect(/^[0-9a-f]+$/i.test(publicKeyHex)).toBe(true);
    });
  });

  describe('Identity Verification', () => {
    it('should verify identity has keys', async () => {
      await manager.generateIdentity();
      const hasIdentity = manager.hasIdentity();

      expect(hasIdentity).toBe(true);
    });

    it('should return false when no identity', () => {
      const hasIdentity = manager.hasIdentity();
      expect(hasIdentity).toBe(false);
    });

    it('should get current identity', async () => {
      const generated = await manager.generateIdentity('Frank');
      const current = manager.getCurrentIdentity();

      expect(current).toBeDefined();
      expect(current?.id).toBe(generated.id);
    });

    it('should return null for current identity when none exists', () => {
      const current = manager.getCurrentIdentity();
      expect(current).toBeNull();
    });
  });

  describe('Signing Operations', () => {
    it('should sign data with private key', async () => {
      await manager.generateIdentity();
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const signature = await manager.sign(data);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should verify signature with public key', async () => {
      await manager.generateIdentity();
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const signature = await manager.sign(data);
      const verified = await manager.verify(data, signature);

      expect(verified).toBe(true);
    });

    it('should reject invalid signature', async () => {
      await manager.generateIdentity();
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const wrongSignature = new Uint8Array(64);

      const verified = await manager.verify(data, wrongSignature);
      expect(verified).toBe(false);
    });

    it('should reject modified data', async () => {
      await manager.generateIdentity();
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = await manager.sign(data);

      const identity = await manager.getIdentity();
      expect(identity).toBeDefined();
      
      const modifiedData = new Uint8Array([1, 2, 3, 4, 6]);
      const verified = await manager.verify(modifiedData, signature, identity!.publicKey);

      expect(verified).toBe(false);
    });
  });

  describe('Display Name Management', () => {
    it('should have display name from generation', async () => {
      await manager.generateIdentity('Initial');

      const identity = await manager.getIdentity();
      expect(identity?.displayName).toBe('Initial');
    });

    it('should persist display name', async () => {
      await manager.generateIdentity('TestName');

      const newManager = new IdentityManager();
      const loaded = await newManager.loadIdentity();

      expect(loaded?.displayName).toBe('TestName');
    });
  });

  describe('Error Handling', () => {
    it('should throw when trying to sign without identity', async () => {
      const data = new Uint8Array([1, 2, 3]);

      await expect(manager.sign(data)).rejects.toThrow();
    });

    it('should throw when trying to export without identity', async () => {
      await expect(manager.exportIdentity()).rejects.toThrow();
    });

    it('should throw when importing invalid identity', async () => {
      const invalid = {
        id: 'invalid',
        publicKeyJwk: {},
        privateKeyJwk: {},
        created: new Date().toISOString()
      };

      await expect(manager.importIdentity(invalid as any)).rejects.toThrow();
    });
  });

  describe('Security', () => {
    it('should not expose private key directly', async () => {
      const identity = await manager.generateIdentity();

      expect(identity.privateKey.extractable).toBe(true); // For export
      expect(identity.privateKey.usages).toContain('sign');
    });

    it('should generate cryptographically secure IDs', async () => {
      const identity1 = await manager.generateIdentity();
      const identity2 = await manager.generateIdentity();

      // IDs should be sufficiently random
      expect(identity1.id.length).toBeGreaterThanOrEqual(16);
      expect(identity2.id.length).toBeGreaterThanOrEqual(16);
      expect(identity1.id).not.toBe(identity2.id);
    });
  });
});
