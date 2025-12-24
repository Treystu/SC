import { getDatabase } from "./storage/database";

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
    const db = getDatabase();
    const passphrase = await generateBrowserFingerprint();
    await db.initializeEncryption(passphrase);
    console.log("✅ Encryption initialized (bootstrap)");
  } catch (error) {
    console.error("Failed to initialize encryption during bootstrap:", error);
  }
};
