import { MeshNetwork, IndexedDBStorage } from "@sc/core";
import { WebPersistenceAdapter } from "../utils/WebPersistenceAdapter";
import { getDatabase } from "../storage/database";

let meshNetworkInstance: MeshNetwork | null = null;

let initializationPromise: Promise<MeshNetwork> | null = null;

// Timeout for initialization (15 seconds)
const INITIALIZATION_TIMEOUT_MS = 15000;

export const getMeshNetwork = async (): Promise<MeshNetwork> => {

  if (meshNetworkInstance) {
    console.log('[MeshNetworkService] Returning existing meshNetworkInstance');
    return meshNetworkInstance;
  }

  if (initializationPromise) {
    console.log('[MeshNetworkService] Initialization already in progress');
    return initializationPromise;
  }

  console.log('[MeshNetworkService] Starting mesh network initialization');
  initializationPromise = (async () => {
    // Create a timeout promise that rejects after 15 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Mesh network initialization timed out after ${INITIALIZATION_TIMEOUT_MS}ms`));
      }, INITIALIZATION_TIMEOUT_MS);
    });

    try {
      const db = getDatabase();
      console.log('[MeshNetworkService] Initializing database...');
      
      // Race between database init and timeout
      const initPromise = (async () => {
        await db.init();
        console.log('[MeshNetworkService] Database initialized successfully');
      })();

      // Wait for either successful init or timeout
      await Promise.race([initPromise, timeoutPromise]);

      let identityKeyPair: any;
      let peerId: string | undefined;

      try {
        console.log('[MeshNetworkService] Loading primary identity from DB...');
        const storedIdentity = await db.getPrimaryIdentity();
        const displayName = localStorage.getItem("sc-display-name");

        if (storedIdentity) {
          console.log('[MeshNetworkService] Loaded persisted identity:', storedIdentity.fingerprint, storedIdentity.id);

          if (displayName && storedIdentity.displayName !== displayName) {
            console.log('[MeshNetworkService] Updating displayName in DB:', displayName);
            await db.saveIdentity({
              ...storedIdentity,
              displayName: displayName,
            });
            storedIdentity.displayName = displayName;
          }

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
          console.log('[MeshNetworkService] Identity ready:', { peerId, fingerprint: storedIdentity.fingerprint });
        } else {
          console.log('[MeshNetworkService] No persisted identity found, generating new one...');
          try {
            await db.clearAllData();
            console.log('[MeshNetworkService] Cleared old data before identity generation');
          } catch (e) {
            console.warn('[MeshNetworkService] Failed to clear old data during identity generation:', e);
          }

          const { generateIdentity, generateFingerprint } = await import("@sc/core");
          const newIdentity = generateIdentity();
          const fingerprint = await generateFingerprint(newIdentity.publicKey);
          const newId = fingerprint.substring(0, 16);

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
          console.log('[MeshNetworkService] Generated and saved new identity:', { peerId, fingerprint });
        }
      } catch (error) {
        console.error('[MeshNetworkService] Failed to load identity (corruption/decryption error). Resetting DB...', error);
        try {
          await db.clearAllData();
          console.log('[MeshNetworkService] Cleared corrupted data');
          const { generateIdentity, generateFingerprint } = await import("@sc/core");
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
          console.log('[MeshNetworkService] Identity reset and saved:', { peerId, fingerprint });
        } catch (resetError) {
          console.error('[MeshNetworkService] Failed to reset identity:', resetError);
          const { generateIdentity } = await import("@sc/core");
          identityKeyPair = generateIdentity();
          console.log('[MeshNetworkService] Using temporary identity');
        }
      }

      console.log('[MeshNetworkService] Creating MeshNetwork instance...');
      let dhtStorage: any = undefined;
      try {
        // Some test environments/mocks may not provide a real IndexedDBStorage constructor
        // Guard against that and fall back to undefined (in-memory) storage when unavailable.
        if (typeof IndexedDBStorage === "function") {
          dhtStorage = new (IndexedDBStorage as any)();
        }
      } catch (e) {
        console.warn('[MeshNetworkService] IndexedDBStorage unavailable, falling back to in-memory DHT:', e);
        dhtStorage = undefined;
      }

      const network = new MeshNetwork({
        defaultTTL: 10,
        maxPeers: 50,
        persistence: new WebPersistenceAdapter(),
        identity: identityKeyPair,
        peerId: peerId,
        dhtStorage: dhtStorage,
      });

      meshNetworkInstance = network;
      console.log('[MeshNetworkService] MeshNetwork instance created and ready');
      return network;
    } catch (error) {
      // On timeout or error, clear the promise so we can retry
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
};
