import { MeshNetwork, IndexedDBStorage } from "@sc/core";
import { WebPersistenceAdapter } from "../utils/WebPersistenceAdapter";
import { getDatabase } from "../storage/database";
import { config } from "../config";
import { initializeBootstrap } from "./bootstrap-service";

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

        if (storedIdentity) {
          console.log('[MeshNetworkService] Loaded persisted identity:', storedIdentity.fingerprint, storedIdentity.id);

          const normalize = (v: any): Uint8Array | undefined => {
            if (v instanceof Uint8Array) return v;
            
            if (typeof v === "string") {
              try {
                const bytes = new Uint8Array(
                  atob(v)
                    .split("")
                    .map((c) => c.charCodeAt(0)),
                );
                return bytes.length === 32 ? bytes : undefined;
              } catch {
                return undefined;
              }
            }
            
            if (v && typeof v === "object" && !Array.isArray(v)) {
              try {
                const keys = Object.keys(v);
                if (keys.length === 32 && keys.every((k, i) => k === String(i))) {
                  const bytes = new Uint8Array(32);
                  for (let i = 0; i < 32; i++) {
                    bytes[i] = v[i];
                  }
                  return bytes;
                }
              } catch {
                return undefined;
              }
            }
            
            if (Array.isArray(v) && v.length === 32) {
              return new Uint8Array(v);
            }
            
            return undefined;
          };

          const pubKey = normalize(storedIdentity.publicKey) || (storedIdentity.publicKey as any);
          const privKey = normalize(storedIdentity.privateKey) || (storedIdentity.privateKey as any);
          
          // Validate key lengths to prevent crypto errors
          if (!pubKey || pubKey.length !== 32 || !privKey || privKey.length !== 32) {
            console.error('[MeshNetworkService] Invalid stored identity key lengths, regenerating...');
            throw new Error('Invalid key lengths');
          }
          
          identityKeyPair = {
            publicKey: pubKey,
            privateKey: privKey,
            displayName: storedIdentity.displayName,
          };
          // Ensure consistent ID format: no spaces, uppercase
          peerId = storedIdentity.id.replace(/\s/g, "").toUpperCase();
          console.log('[MeshNetworkService] Identity ready:', { peerId, fingerprint: storedIdentity.fingerprint, pubKeyLen: pubKey.length, privKeyLen: privKey.length });
        } else {
          const isE2E =
            (globalThis as any).__E2E__ === true ||
            (typeof navigator !== "undefined" &&
              "webdriver" in navigator &&
              navigator.webdriver === true) ||
            (typeof import.meta !== "undefined" &&
              (import.meta as any).env &&
              (import.meta as any).env.MODE === "test");

          let onboardingComplete = false;
          try {
            const v = await db.getSetting<boolean>("onboarding-complete");
            onboardingComplete = v === true;
          } catch {
            onboardingComplete = false;
          }

          // Some older tests used localStorage instead of IndexedDB for onboarding.
          if (!onboardingComplete) {
            try {
              onboardingComplete =
                typeof localStorage !== "undefined" &&
                (localStorage.getItem("sc-onboarding-complete") === "true" ||
                  localStorage.getItem("onboarding-complete") === "true");
            } catch {
              // ignore
            }
          }

          const hasE2ETestDb = Boolean((globalThis as any).__SC_DB_NAME__);
          const shouldAutoGenerateIdentity =
            onboardingComplete || (isE2E && hasE2ETestDb);

          if (shouldAutoGenerateIdentity) {
            console.log(
              '[MeshNetworkService] No persisted identity found but onboarding is complete; auto-generating identity...',
            );
            const { generateIdentity } = await import("@sc/core");
            const { generateFingerprint } = await import("@sc/core");
            const newIdentity = generateIdentity();
            const fingerprint = await generateFingerprint(newIdentity.publicKey);
            const cleanFingerprint = fingerprint.replace(/\s/g, "").toUpperCase();
            const newId = cleanFingerprint.substring(0, 16);

            await db.saveIdentity({
              id: newId,
              publicKey: newIdentity.publicKey,
              privateKey: newIdentity.privateKey,
              fingerprint: fingerprint,
              createdAt: Date.now(),
              isPrimary: true,
              label: "Primary Identity",
              displayName: "E2E",
            });

            identityKeyPair = {
              publicKey: newIdentity.publicKey,
              privateKey: newIdentity.privateKey,
              displayName: "Anonymous",
            };
            peerId = newId;
            console.log('[MeshNetworkService] Auto-generated identity ready:', { peerId });
          } else {
            console.log('[MeshNetworkService] No persisted identity found. Waiting for onboarding...');
            throw new Error("NO_IDENTITY");
          }
        }
      } catch (error) {
        if ((error as Error).message === "NO_IDENTITY") {
          throw error;
        }
        console.error('[MeshNetworkService] Failed to load identity (corruption/decryption error).', error);
        throw new Error("IDENTITY_CORRUPTED");
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
        bootstrapUrl: config.relayUrl || undefined,
      });

      meshNetworkInstance = network;
      console.log('[MeshNetworkService] MeshNetwork initialized');
      
      // Initialize bootstrap to connect to supernodes
      try {
        console.log('[MeshNetworkService] Initializing bootstrap...');
        await initializeBootstrap(network);
        console.log('[MeshNetworkService] Bootstrap initialized successfully');
      } catch (error) {
        console.warn('[MeshNetworkService] Bootstrap initialization failed (non-critical):', error);
        // Non-critical - network can still function without bootstrap
      }
      
      return network;
    } catch (error) {
      // On timeout or error, clear the promise so we can retry
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
};

export const generateNewIdentity = async (displayName: string) => {
  console.log('[MeshNetworkService] Generating new identity for:', displayName);

  initializationPromise = null;
  if (meshNetworkInstance) {
    try {
      await meshNetworkInstance.stop();
    } catch (e) { console.warn('Error stopping old mesh', e); }
    meshNetworkInstance = null;
  }

  const db = getDatabase();
  await db.init();

  // CRITICAL FIX: Clear ALL storage to prevent stale identity/contact bleeding
  // This ensures a completely fresh start when creating a new identity

  // 1. Clear all IndexedDB data (messages, contacts, conversations, etc.)
  await db.clearAllData();

  // 2. Clear localStorage (removes old sovereign-identity key and any other stale data)
  if (typeof localStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('[MeshNetworkService] Cleared localStorage:', keysToRemove.length, 'keys');
  }

  // 3. Clear sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
    console.log('[MeshNetworkService] Cleared sessionStorage');
  }

  // 4. Clear service worker caches to prevent stale cached data
  if (typeof caches !== 'undefined') {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[MeshNetworkService] Cleared service worker caches:', cacheNames.length);
    } catch (e) {
      console.warn('[MeshNetworkService] Failed to clear caches:', e);
    }
  }

  console.log('[MeshNetworkService] All storage cleared for fresh identity');

  const { generateIdentity } = await import("@sc/core");
  const { generateFingerprint } = await import("@sc/core");
  const newIdentity = generateIdentity();
  const fingerprint = await generateFingerprint(newIdentity.publicKey);
  // Remove spaces and use consistent 16-char uppercase hex ID
  const cleanFingerprint = fingerprint.replace(/\s/g, "").toUpperCase();
  const newId = cleanFingerprint.substring(0, 16);

  await db.saveIdentity({
    id: newId,
    publicKey: newIdentity.publicKey,
    privateKey: newIdentity.privateKey,
    fingerprint: fingerprint,
    createdAt: Date.now(),
    isPrimary: true,
    label: "Primary Identity",
    displayName: displayName,
  });

  await db.setSetting("onboarding-complete", true);

  console.log('[MeshNetworkService] Identity generated. Re-initializing mesh...');
  
  return await getMeshNetwork();
};

