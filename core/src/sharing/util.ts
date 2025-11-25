/**
 * Sharing and Invite Utilities
 */

import { PendingInvite } from './types.js';

const BASE_INVITE_URL = 'https://sc.app/join';

/**
 * Generate a user-friendly invite link from a pending invite
 */
export function generateInviteLink(invite: PendingInvite): string {
  const url = new URL(BASE_INVITE_URL);
  url.searchParams.set('code', invite.code);
  url.searchParams.set('inviter', invite.inviterPeerId);
  
  if (invite.inviterName) {
    url.searchParams.set('name', invite.inviterName);
  }
  
  return url.toString();
}

/**
 * Parse an invite link and extract the invite code and other details
 */
export function parseInviteLink(link: string): { code: string; inviterPeerId: string; inviterName?: string } | null {
  try {
    const url = new URL(link);
    const code = url.searchParams.get('code');
    const inviterPeerId = url.searchParams.get('inviter');
    
    if (!code || !inviterPeerId) {
      return null;
    }
    
    const inviterName = url.searchParams.get('name') || undefined;
    
    return { code, inviterPeerId, inviterName };
  } catch (error) {
    return null; // Invalid URL
  }
}