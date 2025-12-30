/**
 * Crypto utilities wrapper for common cryptographic operations
 * Standardized across the repository to use @sc/core/crypto/primitives
 */
import { randomBytes, sha256 as nobleSha256 } from "./crypto/primitives.js";

export class CryptoUtils {
  /**
   * Generate a random key of specified length
   */
  static async generateRandomKey(length: number = 32): Promise<Uint8Array> {
    return randomBytes(length);
  }

  /**
   * Hash data using SHA-256
   */
  static async sha256(data: Uint8Array): Promise<Uint8Array> {
    // For consistency, we use the noble implementation which is synchronous but fast
    return nobleSha256(data);
  }

  /**
   * Derive a key using PBKDF2
   * Uses Web Crypto API for standard compliance
   */
  static async deriveKey(
    password: string,
    salt: Uint8Array,
    iterations: number = 100000,
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"],
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer as ArrayBuffer,
        iterations,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * Encrypt data using AES-GCM
   */
  static async encrypt(
    key: CryptoKey,
    data: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
    const iv = await this.generateRandomKey(12);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      data.buffer as ArrayBuffer,
    );

    return {
      ciphertext: new Uint8Array(ciphertext),
      iv,
    };
  }

  /**
   * Decrypt data using AES-GCM
   */
  static async decrypt(
    key: CryptoKey,
    ciphertext: Uint8Array,
    iv: Uint8Array,
  ): Promise<Uint8Array> {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer,
    );

    return new Uint8Array(plaintext);
  }

  /**
   * Convert Uint8Array to hex string
   */
  static toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Convert hex string to Uint8Array
   */
  static fromHex(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }
}
