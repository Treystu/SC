/**
 * Tests for AutoLink
 */

import { AutoLink, ContactStore, MessageSender, AutoLinkMessage } from './AutoLink';
import { InviteManager } from './InviteManager';
import { Contact, PendingInvite } from './types';
import { generateIdentity } from '../crypto/primitives';

// Mock ContactStore implementation
class MockContactStore implements ContactStore {
  private contacts: Map<string, Contact> = new Map();

  async add(contact: Contact): Promise<void> {
    this.contacts.set(contact.peerId, contact);
  }

  async get(peerId: string): Promise<Contact | null> {
    return this.contacts.get(peerId) || null;
  }

  async has(peerId: string): Promise<boolean> {
    return this.contacts.has(peerId);
  }

  getAll(): Contact[] {
    return Array.from(this.contacts.values());
  }

  clear(): void {
    this.contacts.clear();
  }
}

// Mock MessageSender implementation
class MockMessageSender implements MessageSender {
  public sentMessages: Array<{ peerId: string; message: AutoLinkMessage }> = [];
  public shouldFail: boolean = false;

  async sendToPeer(peerId: string, message: AutoLinkMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Failed to send message');
    }
    this.sentMessages.push({ peerId, message });
  }

  clear(): void {
    this.sentMessages = [];
  }
}

describe('AutoLink', () => {
  let autoLink: AutoLink;
  let contactStore: MockContactStore;
  let messageSender: MockMessageSender;
  let inviteManager: InviteManager;
  let identity: ReturnType<typeof generateIdentity>;

  beforeEach(() => {
    contactStore = new MockContactStore();
    messageSender = new MockMessageSender();
    autoLink = new AutoLink(contactStore, messageSender);
    
    identity = generateIdentity();
    inviteManager = new InviteManager(
      'inviter-peer-id',
      identity.publicKey,
      identity.privateKey,
      'Inviter User'
    );
  });

  describe('Auto Connection Creation', () => {
    it('should add inviter to contacts', async () => {
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      await autoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey,
        'Recipient User'
      );

      const contact = await contactStore.get('inviter-peer-id');
      expect(contact).not.toBeNull();
      expect(contact!.peerId).toBe('inviter-peer-id');
      expect(contact!.publicKey).toEqual(identity.publicKey);
      expect(contact!.name).toBe('Inviter User');
      expect(contact!.addedVia).toBe('invite');
      expect(contact!.verified).toBe(true);
    });

    it('should send acceptance notification to inviter', async () => {
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      await autoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey,
        'Recipient User'
      );

      expect(messageSender.sentMessages).toHaveLength(1);
      expect(messageSender.sentMessages[0].peerId).toBe('inviter-peer-id');
      expect(messageSender.sentMessages[0].message.type).toBe('INVITE_ACCEPTED');
      expect(messageSender.sentMessages[0].message.recipientPeerId).toBe('recipient-peer-id');
      expect(messageSender.sentMessages[0].message.recipientPublicKey).toEqual(recipientIdentity.publicKey);
      expect(messageSender.sentMessages[0].message.recipientName).toBe('Recipient User');
      expect(messageSender.sentMessages[0].message.inviteCode).toBe(invite.code);
    });

    it('should work without message sender', async () => {
      const autoLinkWithoutSender = new AutoLink(contactStore);
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      await autoLinkWithoutSender.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey,
        'Recipient User'
      );

      const contact = await contactStore.get('inviter-peer-id');
      expect(contact).not.toBeNull();
    });

    it('should handle message sending failures gracefully', async () => {
      messageSender.shouldFail = true;
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      // Should not throw
      await expect(
        autoLink.createAutoConnection(
          invite,
          'recipient-peer-id',
          recipientIdentity.publicKey,
          'Recipient User'
        )
      ).resolves.not.toThrow();

      // Contact should still be added
      const contact = await contactStore.get('inviter-peer-id');
      expect(contact).not.toBeNull();
    });

    it('should handle recipient without name', async () => {
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      await autoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey
      );

      const message = messageSender.sentMessages[0]?.message;
      expect(message?.recipientName).toBeUndefined();
    });

    it('should set correct contact metadata', async () => {
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      await autoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey,
        'Recipient User'
      );

      const contact = await contactStore.get('inviter-peer-id');
      expect(contact!.addedAt).toBeGreaterThan(0);
      expect(contact!.addedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Invite Acceptance Handling', () => {
    it('should add recipient to contacts when handling acceptance', async () => {
      const recipientIdentity = generateIdentity();
      const message: AutoLinkMessage = {
        type: 'INVITE_ACCEPTED',
        recipientPeerId: 'recipient-peer-id',
        recipientPublicKey: recipientIdentity.publicKey,
        recipientName: 'Recipient User',
        inviteCode: 'test-invite-code',
        timestamp: Date.now(),
      };

      await autoLink.handleInviteAcceptance(message);

      const contact = await contactStore.get('recipient-peer-id');
      expect(contact).not.toBeNull();
      expect(contact!.peerId).toBe('recipient-peer-id');
      expect(contact!.publicKey).toEqual(recipientIdentity.publicKey);
      expect(contact!.name).toBe('Recipient User');
      expect(contact!.addedVia).toBe('invite');
      expect(contact!.verified).toBe(true);
    });

    it('should not duplicate existing contacts', async () => {
      const recipientIdentity = generateIdentity();
      const existingContact: Contact = {
        peerId: 'recipient-peer-id',
        publicKey: recipientIdentity.publicKey,
        name: 'Old Name',
        addedVia: 'manual',
        addedAt: Date.now() - 1000,
        verified: false,
      };

      await contactStore.add(existingContact);

      const message: AutoLinkMessage = {
        type: 'INVITE_ACCEPTED',
        recipientPeerId: 'recipient-peer-id',
        recipientPublicKey: recipientIdentity.publicKey,
        recipientName: 'New Name',
        inviteCode: 'test-invite-code',
        timestamp: Date.now(),
      };

      await autoLink.handleInviteAcceptance(message);

      const contact = await contactStore.get('recipient-peer-id');
      expect(contact!.name).toBe('Old Name'); // Should not change
    });

    it('should handle acceptance without recipient name', async () => {
      const recipientIdentity = generateIdentity();
      const message: AutoLinkMessage = {
        type: 'INVITE_ACCEPTED',
        recipientPeerId: 'recipient-peer-id',
        recipientPublicKey: recipientIdentity.publicKey,
        inviteCode: 'test-invite-code',
        timestamp: Date.now(),
      };

      await autoLink.handleInviteAcceptance(message);

      const contact = await contactStore.get('recipient-peer-id');
      expect(contact).not.toBeNull();
      expect(contact!.name).toBeUndefined();
    });
  });

  describe('Bidirectional Connection', () => {
    it('should create bidirectional link when both sides process', async () => {
      // Create two AutoLink instances for inviter and recipient
      const inviterContacts = new MockContactStore();
      const recipientContacts = new MockContactStore();
      const recipientSender = new MockMessageSender();
      
      const inviterAutoLink = new AutoLink(inviterContacts);
      const recipientAutoLink = new AutoLink(recipientContacts, recipientSender);

      // Create invite
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();

      // Recipient redeems invite
      await recipientAutoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey,
        'Recipient User'
      );

      // Inviter processes acceptance
      const acceptanceMessage = recipientSender.sentMessages[0].message;
      await inviterAutoLink.handleInviteAcceptance(acceptanceMessage);

      // Both should have each other as contacts
      const inviterContact = await recipientContacts.get('inviter-peer-id');
      const recipientContact = await inviterContacts.get('recipient-peer-id');

      expect(inviterContact).not.toBeNull();
      expect(recipientContact).not.toBeNull();
      expect(inviterContact!.peerId).toBe('inviter-peer-id');
      expect(recipientContact!.peerId).toBe('recipient-peer-id');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invite without inviter name', async () => {
      const anonymousManager = new InviteManager(
        'inviter-peer-id',
        identity.publicKey,
        identity.privateKey
      );
      const invite = await anonymousManager.createInvite();
      const recipientIdentity = generateIdentity();

      await autoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey
      );

      const contact = await contactStore.get('inviter-peer-id');
      expect(contact!.name).toBe('User'); // Default name when none provided
    });

    it('should include timestamp in acceptance message', async () => {
      const invite = await inviteManager.createInvite();
      const recipientIdentity = generateIdentity();
      const beforeTime = Date.now();

      await autoLink.createAutoConnection(
        invite,
        'recipient-peer-id',
        recipientIdentity.publicKey
      );

      const afterTime = Date.now();
      const message = messageSender.sentMessages[0]?.message;
      
      expect(message?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(message?.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });
});
