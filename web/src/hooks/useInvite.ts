/**
 * Hook for managing invite codes and sharing
 */

import { useState, useCallback, useEffect } from "react";
import { InviteManager } from "@sc/core";
import type { PendingInvite } from "@sc/core";

interface UseInviteResult {
  invite: PendingInvite | null;
  isLoading: boolean;
  error: string | null;
  createInvite: () => Promise<void>;
  clearInvite: () => void;
}

export function useInvite(
  peerId: string,
  publicKey: Uint8Array | null,
  privateKey: Uint8Array | null,
  displayName?: string,
  bootstrapPeers?: string[],
): UseInviteResult {
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteManager, setInviteManager] = useState<InviteManager | null>(
    null,
  );

  // Initialize InviteManager when keys are available
  useEffect(() => {
    if (peerId && publicKey && privateKey) {
      const manager = new InviteManager(
        peerId,
        publicKey,
        privateKey,
        displayName,
        bootstrapPeers,
      );
      setInviteManager(manager);
    }
  }, [peerId, publicKey, privateKey, displayName, bootstrapPeers]);

  const createInvite = useCallback(async () => {
    if (!inviteManager) {
      setError("Invite manager not initialized");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newInvite = await inviteManager.createInvite();
      setInvite(newInvite);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create invite";
      setError(errorMessage);
      console.error("Failed to create invite:", err);
    } finally {
      setIsLoading(false);
    }
  }, [inviteManager]);

  const clearInvite = useCallback(() => {
    setInvite(null);
    setError(null);
  }, []);

  return {
    invite,
    isLoading,
    error,
    createInvite,
    clearInvite,
  };
}
