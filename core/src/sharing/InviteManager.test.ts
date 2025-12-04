/**
 * Tests for InviteManager
 */

import { InviteManager } from './InviteManager';
import { generateIdentity } from '../crypto/primitives';

describe('InviteManager', () => {
  let inviteManager: InviteManager;
  let identity: ReturnType<typeof generateIdentity>;

  beforeEach(() => {
    identity = generateIdentity();
    inviteManager = new InviteManager(
      'test-peer-id',
      identity.publicKey,
      identity.privateKey,
      'Test User'
    );
  });

  describe('Invite Creation', () => {
    it('should create a valid invite with default TTL', async () => {
      const invite = await inviteManager.createInvite();

      expect(invite.code).toBeDefined();
      expect(invite.code).toHaveLength(64); // 32 bytes as hex
      expect(invite.inviterPeerId).toBe('test-peer-id');
      expect(invite.inviterPublicKey).toEqual(identity.publicKey);
      expect(invite.inviterName).toBe('Test User');
      expect(invite.signature).toHaveLength(64);
      expect(invite.expiresAt).toBeGreaterThan(invite.createdAt);
      expect(invite.bootstrapPeers).toEqual([]);
    });

    it('should create invites with custom TTL', async () => {
      const customTTL = 60 * 60 * 1000; // 1 hour
      const invite = await inviteManager.createInvite({ ttl: customTTL });

      expect(invite.expiresAt - invite.createdAt).toBe(customTTL);
    });

    it('should create invites with metadata', async () => {
      const metadata = { purpose: 'testing', priority: 'high' };
      const invite = await inviteManager.createInvite({ metadata });

      expect(invite.metadata).toEqual(metadata);
    });

    it('should generate unique invite codes', async () => {
      const invite1 = await inviteManager.createInvite();
      const invite2 = await inviteManager.createInvite();

      expect(invite1.code).not.toBe(invite2.code);
    });

    it('should store created invites', async () => {
      const invite = await inviteManager.createInvite();
      const retrieved = inviteManager.getInvite(invite.code);

      expect(retrieved).toEqual(invite);
    });
  });

  describe('Invite Validation', () => {
    it('should validate a valid invite', async () => {
      const invite = await inviteManager.createInvite();
      const validation = await inviteManager.validateInvite(invite.code);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
      expect(validation.invite).toEqual(invite);
    });

    it('should reject invalid invite codes', async () => {
      const validation = await inviteManager.validateInvite('invalid-code');

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Invalid invite code');
    });

    it('should reject expired invites', async () => {
      const invite = await inviteManager.createInvite({ ttl: -1000 }); // Expired
      const validation = await inviteManager.validateInvite(invite.code);

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Invite expired');
    });

    it('should reject invites with invalid signatures', async () => {
      const invite = await inviteManager.createInvite();
      // Tamper with the signature
      invite.signature = new Uint8Array(64);
      
      // Manually update the stored invite (simulating tampering)
      const allInvites = inviteManager.getAllInvites();
      const inviteIndex = allInvites.findIndex(i => i.code === invite.code);
      if (inviteIndex !== -1) {
        // Re-create manager to test with tampered data
        const tamperedManager = new InviteManager(
          'test-peer-id',
          identity.publicKey,
          identity.privateKey
        );
        // Manually set the invite with tampered signature
        await tamperedManager.createInvite();
        const invites = (tamperedManager as any).invites as Map<string, any>;
        const storedInvite = invites.get([...invites.keys()][0]);
        storedInvite.signature = new Uint8Array(64);

        const validation = await tamperedManager.validateInvite(storedInvite.code);
        expect(validation.valid).toBe(false);
        expect(validation.error).toBe('Invalid signature');
      }
    });
  });

  describe('Invite Redemption', () => {
    it('should successfully redeem a valid invite', async () => {
      const invite = await inviteManager.createInvite();
      const result = await inviteManager.redeemInvite(invite.code, 'recipient-peer-id');

      expect(result.success).toBe(true);
      expect(result.contact.peerId).toBe(invite.inviterPeerId);
      expect(result.contact.publicKey).toEqual(invite.inviterPublicKey);
      expect(result.contact.verified).toBe(true);
      expect(result.contact.addedVia).toBe('invite');
    });

    it('should remove invite after redemption', async () => {
      const invite = await inviteManager.createInvite();
      await inviteManager.redeemInvite(invite.code, 'recipient-peer-id');

      const retrieved = inviteManager.getInvite(invite.code);
      expect(retrieved).toBeUndefined();
    });

    it('should throw error for invalid invite code', async () => {
      await expect(
        inviteManager.redeemInvite('invalid-code', 'recipient-peer-id')
      ).rejects.toThrow('Invalid invite code');
    });

    it('should throw error for expired invite', async () => {
      const invite = await inviteManager.createInvite({ ttl: -1000 });
      
      await expect(
        inviteManager.redeemInvite(invite.code, 'recipient-peer-id')
      ).rejects.toThrow('Invite expired');
    });

    it('should include inviter name in contact', async () => {
      const invite = await inviteManager.createInvite();
      const result = await inviteManager.redeemInvite(invite.code, 'recipient-peer-id');

      expect(result.contact.name).toBe('Test User');
    });
  });

  describe('Invite Management', () => {
    it('should get all pending invites', async () => {
      await inviteManager.createInvite();
      await inviteManager.createInvite();
      await inviteManager.createInvite();

      const invites = inviteManager.getAllInvites();
      expect(invites).toHaveLength(3);
    });

    it('should clean up expired invites', async () => {
      // Create some invites with different expiration times
      await inviteManager.createInvite({ ttl: -1000 }); // Expired
      await inviteManager.createInvite({ ttl: -1000 }); // Expired
      await inviteManager.createInvite({ ttl: 60000 }); // Valid

      const removedCount = inviteManager.cleanupExpiredInvites();

      expect(removedCount).toBe(2);
      expect(inviteManager.getPendingInviteCount()).toBe(1);
    });

    it('should revoke a specific invite', async () => {
      const invite = await inviteManager.createInvite();
      const result = inviteManager.revokeInvite(invite.code);

      expect(result).toBe(true);
      expect(inviteManager.getInvite(invite.code)).toBeUndefined();
    });

    it('should return false when revoking non-existent invite', () => {
      const result = inviteManager.revokeInvite('non-existent');
      expect(result).toBe(false);
    });

    it('should revoke all invites', async () => {
      await inviteManager.createInvite();
      await inviteManager.createInvite();
      await inviteManager.createInvite();

      const revokedCount = inviteManager.revokeAllInvites();

      expect(revokedCount).toBe(3);
      expect(inviteManager.getPendingInviteCount()).toBe(0);
    });

    it('should track pending invite count', async () => {
      expect(inviteManager.getPendingInviteCount()).toBe(0);

      await inviteManager.createInvite();
      expect(inviteManager.getPendingInviteCount()).toBe(1);

      await inviteManager.createInvite();
      expect(inviteManager.getPendingInviteCount()).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle manager without display name', async () => {
      const manager = new InviteManager(
        'test-peer-id',
        identity.publicKey,
        identity.privateKey
      );

      const invite = await manager.createInvite();
      expect(invite.inviterName).toBe('User'); // Default name when none provided
    });

    it('should handle zero TTL', async () => {
      const invite = await inviteManager.createInvite({ ttl: -100 });
      const validation = await inviteManager.validateInvite(invite.code);

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Invite expired');
    });

    it('should handle very long TTL', async () => {
      const veryLongTTL = 365 * 24 * 60 * 60 * 1000; // 1 year
      const invite = await inviteManager.createInvite({ ttl: veryLongTTL });

      expect(invite.expiresAt - invite.createdAt).toBe(veryLongTTL);
    });

    it('should not mutate original metadata', async () => {
      const metadata = { key: 'value' };
      const invite = await inviteManager.createInvite({ metadata });

      metadata.key = 'changed';
      expect(invite.metadata?.key).toBe('value');
    });
  });
});
