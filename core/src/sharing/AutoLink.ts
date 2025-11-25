/**
 * AutoLink - Automatically establishes bidirectional connections between peers
 * 
 * When an invite is redeemed, this system:
 * 1. Adds the inviter to the recipient's contacts
 * 2. Notifies the inviter that their invite was accepted
 * 3. Establishes a trusted connection between both parties
 */

import { PendingInvite, Contact } from './types.js';

export interface AutoLinkMessage {
  type: 'INVITE_ACCEPTED';
  recipientPeerId: string;
  recipientPublicKey: Uint8Array;
  recipientName?: string;
  inviteCode: string;
  timestamp: number;
}

export interface ContactStore {
  add(contact: Contact): Promise<void>;
  get(peerId: string): Promise<Contact | null>;
  has(peerId: string): Promise<boolean>;
}

export interface MessageSender {
  sendToPeer(peerId: string, message: AutoLinkMessage): Promise<void>;
}

export class AutoLink {
  private contacts: ContactStore;
  private messageSender?: MessageSender;

  constructor(contacts: ContactStore, messageSender?: MessageSender) {
    this.contacts = contacts;
    this.messageSender = messageSender;
  }

  /**
   * Create an automatic connection when an invite is redeemed
   */
  async createAutoConnection(
    invite: PendingInvite,
    recipientPeerId: string,
    recipientPublicKey: Uint8Array,
    recipientName?: string
  ): Promise<void> {
    // Add the inviter to the recipient's contacts
    const contact: Contact = {
      peerId: invite.inviterPeerId,
      publicKey: invite.inviterPublicKey,
      name: invite.inviterName,
      addedVia: 'invite',
      addedAt: Date.now(),
      verified: true, // Auto-verified through invite signature
    };

    await this.contacts.add(contact);

    // Send acceptance notification to the inviter (if message sender is available)
    if (this.messageSender) {
      const message: AutoLinkMessage = {
        type: 'INVITE_ACCEPTED',
        recipientPeerId,
        recipientPublicKey,
        recipientName,
        inviteCode: invite.code,
        timestamp: Date.now(),
      };

      try {
        await this.messageSender.sendToPeer(invite.inviterPeerId, message);
      } catch (error) {
        // Log but don't fail - the inviter will discover the connection through other means
        console.warn('Failed to send invite acceptance notification:', error);
      }
    }
  }

  /**
   * Handle an invite acceptance message
   * This is called on the inviter's side when someone redeems their invite
   */
  async handleInviteAcceptance(message: AutoLinkMessage): Promise<void> {
    // Check if this contact already exists
    const existingContact = await this.contacts.get(message.recipientPeerId);
    
    if (existingContact) {
      // Contact already exists, no need to add again
      return;
    }

    // Add the recipient to the inviter's contacts
    const contact: Contact = {
      peerId: message.recipientPeerId,
      publicKey: message.recipientPublicKey,
      name: message.recipientName,
      addedVia: 'invite',
      addedAt: Date.now(),
      verified: true,
    };

    await this.contacts.add(contact);
  }
}
