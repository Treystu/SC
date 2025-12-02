// Utility functions for public key fingerprints and validation

/**
 * Generate a human-readable fingerprint from a public key
 * Uses SHA-256 hash and formats as hex string
 */
export async function generateFingerprint(
  publicKey: Uint8Array | string,
): Promise<string> {
  let keyBytes: Uint8Array;

  if (typeof publicKey === "string") {
    // Convert hex string or base64 to Uint8Array
    if (publicKey.match(/^[0-9a-fA-F]+$/)) {
      // Hex string
      keyBytes = hexToBytes(publicKey);
    } else {
      // Base64 string
      keyBytes = base64ToBytes(publicKey);
    }
  } else {
    keyBytes = publicKey;
  }

  // Hash the public key
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes as any);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Convert to hex and take first 16 characters for display
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.substring(0, 16).toUpperCase();
}

/**
 * Generate a full fingerprint (64 characters) for verification
 */
export async function generateFullFingerprint(
  publicKey: Uint8Array | string,
): Promise<string> {
  let keyBytes: Uint8Array;

  if (typeof publicKey === "string") {
    if (publicKey.match(/^[0-9a-fA-F]+$/)) {
      keyBytes = hexToBytes(publicKey);
    } else {
      keyBytes = base64ToBytes(publicKey);
    }
  } else {
    keyBytes = publicKey;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes as any);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Format fingerprint for display (groups of 4 characters)
 * Example: "A1B2 C3D4 E5F6 G7H8"
 */
export function formatFingerprint(fingerprint: string): string {
  return fingerprint.match(/.{1,4}/g)?.join(" ") || fingerprint;
}

/**
 * Validate public key format
 */
export function isValidPublicKey(publicKey: string | Uint8Array): boolean {
  if (typeof publicKey === "string") {
    // Check if it's a valid hex string (64 characters for Ed25519)
    if (publicKey.match(/^[0-9a-fA-F]{64}$/)) {
      return true;
    }
    // Check if it's a valid base64 string
    try {
      const decoded = atob(publicKey);
      return decoded.length === 32; // Ed25519 public key is 32 bytes
    } catch {
      return false;
    }
  } else {
    // Uint8Array should be 32 bytes for Ed25519
    return publicKey.length === 32;
  }
}

/**
 * Convert public key to base64 for storage
 */
export function publicKeyToBase64(publicKey: Uint8Array): string {
  return btoa(String.fromCharCode(...publicKey));
}

/**
 * Convert base64 to public key bytes
 */
export function base64ToPublicKey(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compare two fingerprints for equality
 */
export function compareFingerprints(fp1: string, fp2: string): boolean {
  return (
    fp1.toUpperCase().replace(/\s/g, "") ===
    fp2.toUpperCase().replace(/\s/g, "")
  );
}
