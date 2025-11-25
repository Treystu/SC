import { generateInviteLink, parseInviteLink } from './util.js';
import { PendingInvite } from './types.js';

describe('Sharing Utilities', () => {
  const invite: PendingInvite = {
    code: 'testcode',
    inviterPeerId: 'testinviter',
    inviterPublicKey: new Uint8Array(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
    signature: new Uint8Array(),
    bootstrapPeers: [],
  };

  it('should generate a valid invite link', () => {
    const link = generateInviteLink(invite);
    expect(link).toContain('https://sc.app/join');
    expect(link).toContain('code=testcode');
    expect(link).toContain('inviter=testinviter');
  });

  it('should parse a valid invite link', () => {
    const link = 'https://sc.app/join?code=testcode&inviter=testinviter';
    const parsed = parseInviteLink(link);
    expect(parsed).toEqual({ code: 'testcode', inviterPeerId: 'testinviter' });
  });

  it('should return null for an invalid invite link', () => {
    const link = 'https://invalid.app/join';
    const parsed = parseInviteLink(link);
    expect(parsed).toBeNull();
  });
});