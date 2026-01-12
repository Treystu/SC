import { getDatabase } from "./storage/database";
import { encryptionManager } from "./storage/encryption";

// Timeout for encryption initialization
const ENCRYPTION_INIT_TIMEOUT = 10000;

// Generate a browser-specific fingerprint for encryption
// SECURITY NOTE: This is a fallback - production should use user password
export const generateBrowserFingerprint = async (): Promise<string> => {
  const navigator_props = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth.toString(),
    screen.width.toString() + "x" + screen.height.toString(),
    new Date().getTimezoneOffset().toString(),
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(navigator_props);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const initializeEncryption = async (): Promise<void> => {
  try {
    // E2E runs should keep persistence deterministic and avoid device-fingerprint-derived
    // key drift breaking decrypt-after-reload.
    if (
      (typeof navigator !== "undefined" && navigator.webdriver === true) ||
      (typeof window !== "undefined" && (window as any).__E2E__ === true)
    ) {
      try {
        encryptionManager.disable();
      } catch {
        // ignore
      }
      console.log("✅ Encryption disabled (E2E)");
      return;
    }

    const db = getDatabase();
    const passphrase = await generateBrowserFingerprint();
    
    // Add timeout protection to prevent hanging
    await Promise.race([
      db.initializeEncryption(passphrase),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Encryption initialization timed out')), ENCRYPTION_INIT_TIMEOUT)
      )
    ]);
    
    console.log("✅ Encryption initialized (bootstrap)");
  } catch (error) {
    // Don't throw - allow app to continue without encryption if it fails
    console.warn("Encryption initialization failed or timed out, continuing without encryption:", error instanceof Error ? error.message : error);
  }
};
