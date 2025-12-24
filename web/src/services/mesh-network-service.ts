import { MeshNetwork, IndexedDBStorage } from "@sc/core";
import { WebPersistenceAdapter } from "../utils/WebPersistenceAdapter";
import { getDatabase } from "../storage/database";

let meshNetworkInstance: MeshNetwork | null = null;

let initializationPromise: Promise<MeshNetwork> | null = null;

export const getMeshNetwork = async (): Promise<MeshNetwork> => {
  if (meshNetworkInstance) {
    return meshNetworkInstance;
  }

  // If initialization is already in progress, return the existing promise
  if (initializationPromise) {
    return initializationPromise;
  }

  // Initialize new promise
  initializationPromise = (async () => {
    try {
      // Initialize database
      const db = getDatabase();
      await db.init();

      // Load persisted identity (if exists) or generate new one
      let identityKeyPair: any;
      let peerId: string | undefined;

      try {
        const storedIdentity = await db.getPrimaryIdentity();
        const displayName = localStorage.getItem("sc-display-name");

        if (storedIdentity) {
          console.log("Loaded persisted identity:", storedIdentity.fingerprint);

          // Update display name if missing/different in DB but present in localStorage
          if (displayName && storedIdentity.displayName !== displayName) {
            await db.saveIdentity({
              ...storedIdentity,
              displayName: displayName,
            });
            storedIdentity.displayName = displayName;
          }

          // Normalize keys to Uint8Array (some stores may have base64 strings)
          const normalize = (v: any) => {
            if (v instanceof Uint8Array) return v;
            if (typeof v === "string") {
              try {
                return new Uint8Array(
                  atob(v)
                    .split("")
                    .map((c) => c.charCodeAt(0)),
                );
              } catch {
                return undefined;
              }
            }
            return undefined;
          };

          identityKeyPair = {
            publicKey:
              normalize(storedIdentity.publicKey) || (storedIdentity.publicKey as any),
            privateKey:
              normalize(storedIdentity.privateKey) || (storedIdentity.privateKey as any),
            displayName: storedIdentity.displayName,
          };
          peerId = storedIdentity.id.replace(/\s/g, "");
        } else {
          console.log("No persisted identity found, generating new one...");

          // CRITICAL: Ensure we start fresh. Clear any potentially corrupted or old data.
          // This prevents "Old Chats" from showing up if identity was lost/wiped but messages remained.
          try {
            await db.clearAllData();
          } catch (e) {
            console.warn(
              "Failed to clear old data during identity generation:",
              e,
            );
          }

          const { generateIdentity, generateFingerprint } =
            await import("@sc/core");
          const newIdentity = generateIdentity();
          const fingerprint = await generateFingerprint(newIdentity.publicKey);

          const newId = fingerprint.substring(0, 16); // Use first 16 chars of fingerprint as ID

          // Save to database
          await db.saveIdentity({
            id: newId,
            publicKey: newIdentity.publicKey,
            privateKey: newIdentity.privateKey,
            fingerprint: fingerprint,
            createdAt: Date.now(),
            isPrimary: true,
            label: "Primary Identity",
            displayName: displayName || undefined,
          });

          identityKeyPair = {
            ...newIdentity,
            displayName: displayName || undefined,
          };
          peerId = newId;
          console.log("Generated and saved new identity:", fingerprint);
        }
      } catch (error) {
        console.error(
          "Failed to load identity (likely corruption/decryption error). Resetting DB...",
          error,
        );

        try {
          // Clear corrupted data
          await db.clearAllData();

          // Generate and save new identity
          const { generateIdentity, generateFingerprint } =
            await import("@sc/core");
          const newIdentity = generateIdentity();
          const fingerprint = await generateFingerprint(newIdentity.publicKey);
          const newId = fingerprint.substring(0, 16);

          const displayName = localStorage.getItem("sc-display-name");

          await db.saveIdentity({
            id: newId,
            publicKey: newIdentity.publicKey,
            privateKey: newIdentity.privateKey,
            fingerprint: fingerprint,
            createdAt: Date.now(),
            isPrimary: true,
            label: "Primary Identity",
            displayName: displayName || undefined,
          });

          identityKeyPair = {
            ...newIdentity,
            displayName: displayName || undefined,
          };
          peerId = newId;
          console.log("Identity reset and saved:", fingerprint);
        } catch (resetError) {
          console.error("Failed to reset identity:", resetError);
          // Ultimate fallback to temporary identity
          const { generateIdentity } = await import("@sc/core");
          identityKeyPair = generateIdentity();
        }
      }

      const network = new MeshNetwork({
        defaultTTL: 10,
        maxPeers: 50,
        persistence: new WebPersistenceAdapter(),
        identity: identityKeyPair,
        peerId: peerId,
        dhtStorage: new IndexedDBStorage(),
      });

      meshNetworkInstance = network;
      return network;
    } finally {
      // Clear promise reference once done (success or failure)
      // Note: In case of failure, we might want to allow retries, so nulling it is correct.
      // However, if we succeeded, meshNetworkInstance is set, so we won't enter this block again.
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};
