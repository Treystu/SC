import { MeshNetwork } from "@sc/core";
import { WebPersistenceAdapter } from "../utils/WebPersistenceAdapter";
import { getDatabase } from "../storage/database";

let meshNetworkInstance: MeshNetwork | null = null;

export const getMeshNetwork = async (): Promise<MeshNetwork> => {
    if (meshNetworkInstance) {
        return meshNetworkInstance;
    }

    // Initialize database
    const db = getDatabase();
    await db.init();

    // Load persisted identity (if exists) or generate new one
    let identityKeyPair: any;
    try {
        const storedIdentity = await db.getPrimaryIdentity();
        const displayName = localStorage.getItem("sc-display-name");

        if (storedIdentity) {
            console.log(
                "Loaded persisted identity:",
                storedIdentity.fingerprint,
            );

            // Update display name if missing/different in DB but present in localStorage
            if (displayName && storedIdentity.displayName !== displayName) {
                await db.saveIdentity({
                    ...storedIdentity,
                    displayName: displayName,
                });
                storedIdentity.displayName = displayName;
            }

            identityKeyPair = {
                publicKey: storedIdentity.publicKey,
                privateKey: storedIdentity.privateKey,
                displayName: storedIdentity.displayName,
            };
        } else {
            console.log("No persisted identity found, generating new one...");
            const { generateIdentity, generateFingerprint } =
                await import("@sc/core");
            const newIdentity = generateIdentity();
            const fingerprint = await generateFingerprint(
                newIdentity.publicKey,
            );

            // Save to database
            await db.saveIdentity({
                id: fingerprint.substring(0, 16), // Use first 16 chars of fingerprint as ID
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
            console.log("Generated and saved new identity:", fingerprint);
        }
    } catch (error) {
        console.error("Failed to load/generate identity:", error);
        // Fallback to temporary identity if DB fails
        const { generateIdentity } = await import("@sc/core");
        identityKeyPair = generateIdentity();
    }

    const network = new MeshNetwork({
        defaultTTL: 10,
        maxPeers: 50,
        persistence: new WebPersistenceAdapter(),
        identity: identityKeyPair,
    });

    meshNetworkInstance = network;
    return network;
};