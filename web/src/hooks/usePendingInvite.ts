/**
 * Hook for handling pending invites from the join.html landing page
 * Checks localStorage and URL hash for invite codes
 */

import { useEffect, useState } from "react";

interface PendingInviteInfo {
  code: string | null;
  inviterName: string | null;
}

// Constants for invite URL parsing
const INVITE_HASH_PREFIX = "join=";
const INVITE_HASH_PREFIX_LENGTH = INVITE_HASH_PREFIX.length;
const PENDING_INVITE_STORAGE_KEY = "pendingInvite";
const INVITER_NAME_STORAGE_KEY = "inviterName";

export function usePendingInvite(): PendingInviteInfo {
  const [inviteInfo, setInviteInfo] = useState<PendingInviteInfo>({
    code: null,
    inviterName: null,
  });

  useEffect(() => {
    // Check URL query parameters first (new format for deep linking)
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get("code");
    const inviterParam = urlParams.get("inviter");

    if (codeParam) {
      setInviteInfo({
        code: codeParam,
        inviterName:
          inviterParam || sessionStorage.getItem(INVITER_NAME_STORAGE_KEY),
      });
      // Clear query params after reading
      if (window.history?.replaceState) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.hash,
        );
      }
      return;
    }

    // Check URL hash for invite code (legacy format: #join=INVITE_CODE)
    const hash = window.location.hash.slice(1);
    if (hash.startsWith(INVITE_HASH_PREFIX)) {
      const code = hash.substring(INVITE_HASH_PREFIX_LENGTH);
      if (code) {
        setInviteInfo({
          code,
          inviterName: sessionStorage.getItem(INVITER_NAME_STORAGE_KEY),
        });
        // Clear hash after reading using replaceState to avoid browser history issues
        if (window.history?.replaceState) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        } else {
          // Fallback for older browsers
          window.location.hash = "";
        }
        return;
      }
    }

    // Check localStorage for pending invite (set by join.html)
    const pendingInvite = localStorage.getItem(PENDING_INVITE_STORAGE_KEY);
    const pendingInviterName = localStorage.getItem("pendingInviterName");
    if (pendingInvite) {
      setInviteInfo({
        code: pendingInvite,
        inviterName:
          pendingInviterName ||
          sessionStorage.getItem(INVITER_NAME_STORAGE_KEY),
      });
      // Clear from localStorage after reading
      localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
      localStorage.removeItem("pendingInviterName");
    }
  }, []);

  return inviteInfo;
}
