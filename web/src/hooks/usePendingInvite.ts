/**
 * Hook for handling pending invites from the join.html landing page
 * Checks localStorage and URL hash for invite codes
 */

import { useEffect, useState } from 'react';

interface PendingInviteInfo {
  code: string | null;
  inviterName: string | null;
}

export function usePendingInvite(): PendingInviteInfo {
  const [inviteInfo, setInviteInfo] = useState<PendingInviteInfo>({
    code: null,
    inviterName: null,
  });

  useEffect(() => {
    // Check URL hash for invite code (e.g., #join=INVITE_CODE)
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('join=')) {
      const code = hash.substring(5);
      if (code) {
        setInviteInfo({
          code,
          inviterName: sessionStorage.getItem('inviterName'),
        });
        // Clear hash after reading
        window.location.hash = '';
        return;
      }
    }

    // Check localStorage for pending invite (set by join.html)
    const pendingInvite = localStorage.getItem('pendingInvite');
    if (pendingInvite) {
      setInviteInfo({
        code: pendingInvite,
        inviterName: sessionStorage.getItem('inviterName'),
      });
      // Clear from localStorage after reading
      localStorage.removeItem('pendingInvite');
    }
  }, []);

  return inviteInfo;
}
