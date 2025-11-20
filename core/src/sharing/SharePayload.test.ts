/**
 * Tests for SharePayloadGenerator
 */

import { SharePayloadGenerator } from './SharePayload';
import { InviteManager } from './InviteManager';
import { generateIdentity } from '../crypto/primitives';

describe('SharePayloadGenerator', () => {
  let generator: SharePayloadGenerator;
  let inviteManager: InviteManager;
  let identity: ReturnType<typeof generateIdentity>;

  beforeEach(() => {
    generator = new SharePayloadGenerator();
    identity = generateIdentity();
    inviteManager = new InviteManager(
      'test-peer-id',
      identity.publicKey,
      identity.privateKey,
      'Test User'
    );
  });

  describe('Payload Creation', () => {
    it('should create a valid payload from an invite', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);

      expect(payload.version).toBe('0.1.0');
      expect(payload.inviteCode).toBe(invite.code);
      expect(payload.inviterPeerId).toBe(invite.inviterPeerId);
      expect(payload.signature).toEqual(invite.signature);
      expect(payload.bootstrapPeers).toEqual(invite.bootstrapPeers);
      expect(payload.timestamp).toBeDefined();
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it('should include current timestamp', async () => {
      const invite = await inviteManager.createInvite();
      const beforeTime = Date.now();
      const payload = await generator.createPayload(invite);
      const afterTime = Date.now();

      expect(payload.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(payload.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Payload Verification', () => {
    it('should verify a valid payload', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject incompatible version', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      payload.version = '99.0.0'; // Future incompatible version

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Incompatible version');
    });

    it('should accept compatible versions with same major', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      payload.version = '0.2.5'; // Same major version

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(true);
    });

    it('should reject old timestamps', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      payload.timestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Payload timestamp too old or from future');
    });

    it('should reject future timestamps', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      payload.timestamp = Date.now() + (10 * 60 * 1000); // 10 minutes in future

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Payload timestamp too old or from future');
    });

    it('should accept recent timestamps', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      payload.timestamp = Date.now() - (2 * 60 * 1000); // 2 minutes ago

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid signature format', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      payload.signature = new Uint8Array(32); // Wrong size

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature format');
    });

    it('should reject invalid bootstrap peers format', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      (payload as any).bootstrapPeers = 'not-an-array';

      const result = await generator.verifyPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid bootstrap peers format');
    });
  });

  describe('Payload Serialization', () => {
    it('should serialize and deserialize payload correctly', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      
      const serialized = generator.serializePayload(payload);
      const deserialized = generator.deserializePayload(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized?.version).toBe(payload.version);
      expect(deserialized?.inviteCode).toBe(payload.inviteCode);
      expect(deserialized?.inviterPeerId).toBe(payload.inviterPeerId);
      expect(deserialized?.signature).toEqual(payload.signature);
      expect(deserialized?.bootstrapPeers).toEqual(payload.bootstrapPeers);
      expect(deserialized?.timestamp).toBe(payload.timestamp);
    });

    it('should handle serialization with bootstrap peers', async () => {
      const invite = await inviteManager.createInvite();
      // Manually add bootstrap peers for testing
      invite.bootstrapPeers = ['peer1', 'peer2', 'peer3'];
      
      const payload = await generator.createPayload(invite);
      const serialized = generator.serializePayload(payload);
      const deserialized = generator.deserializePayload(serialized);

      expect(deserialized?.bootstrapPeers).toEqual(['peer1', 'peer2', 'peer3']);
    });

    it('should return null for invalid JSON', () => {
      const result = generator.deserializePayload('invalid json{');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = generator.deserializePayload('');
      expect(result).toBeNull();
    });

    it('should handle complex metadata in serialization', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      
      const serialized = generator.serializePayload(payload);
      expect(serialized).toBeTruthy();
      expect(typeof serialized).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle payload with empty bootstrap peers', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      
      const result = await generator.verifyPayload(payload);
      expect(result.valid).toBe(true);
    });

    it('should serialize compact format', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      
      const serialized = generator.serializePayload(payload);
      const parsed = JSON.parse(serialized);

      // Check compact keys are used
      expect(parsed.v).toBeDefined();
      expect(parsed.c).toBeDefined();
      expect(parsed.p).toBeDefined();
      expect(parsed.s).toBeDefined();
      expect(parsed.b).toBeDefined();
      expect(parsed.t).toBeDefined();
    });

    it('should preserve signature bytes through serialization', async () => {
      const invite = await inviteManager.createInvite();
      const payload = await generator.createPayload(invite);
      
      const serialized = generator.serializePayload(payload);
      const deserialized = generator.deserializePayload(serialized);

      expect(deserialized?.signature).toEqual(payload.signature);
      expect(Array.from(deserialized!.signature)).toEqual(Array.from(payload.signature));
    });
  });
});
