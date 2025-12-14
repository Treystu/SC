/**
 * Encoding utilities for Base64 and Hex conversion.
 * Compatible with Browser, Node.js (recent), and Mobile JS Runtimes (JSC/V8).
 */

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    const binary = Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join("");
    return btoa(binary);
  } else if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  } else {
    throw new Error("Environment does not support Base64 encoding");
  }
}

export function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    throw new Error("Environment does not support Base64 decoding");
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
