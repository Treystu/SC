/**
 * IndexedDB Encryption Layer
 * Implements transparent encryption for all sensitive data stored in IndexedDB
 * Addresses Critical Gap #2 from V1.0 audit
 * 
 * CRITICAL FIX: Properly handles salt persistence to avoid data loss
 */

import { encryptData, decryptData, deriveKey } from "../utils/backupCrypto";

export interface EncryptionConfig {
  enabled: boolean;
  passphrase?: string;
}

const ENCRYPTION_SALT_KEY = "sc_encryption_salt";

/**
 * Encryption manager for IndexedDB storage
 */
class EncryptionManager {
  private static instance: EncryptionManager;
  private enabled: boolean = false;
  private key: CryptoKey | null = null;
  private passphrase: string | null = null;
  private salt: Uint8Array | null = null;

  private constructor() {}

  static getInstance(): EncryptionManager {
    if (!EncryptionManager.instance) {
      EncryptionManager.instance = new EncryptionManager();
    }
    return EncryptionManager.instance;
  }

  /**
   * Initialize encryption with a passphrase
   * CRITICAL FIX: Persists salt to localStorage to ensure consistent key derivation
   * Previously, salt was regenerated on each init, making old data unreadable
   */
  async initialize(passphrase: string): Promise<void> {
    this.passphrase = passphrase;
    
    // Try to retrieve existing salt from localStorage
    const storedSalt = localStorage.getItem(ENCRYPTION_SALT_KEY);
    
    if (storedSalt) {
      // Use existing salt to maintain compatibility with previously encrypted data
      this.salt = new Uint8Array(
        atob(storedSalt).split("").map((c) => c.charCodeAt(0))
      );
    } else {
      // Generate new salt only if none exists
      this.salt = window.crypto.getRandomValues(new Uint8Array(16));
      // Persist salt to localStorage
      const saltBase64 = btoa(String.fromCharCode(...this.salt));
      localStorage.setItem(ENCRYPTION_SALT_KEY, saltBase64);
    }
    
    this.key = await deriveKey(passphrase, this.salt);
    this.enabled = true;
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.key !== null;
  }

  /**
   * Encrypt sensitive data before storing in IndexedDB
   */
  async encrypt(data: string): Promise<string> {
    if (!this.isEnabled() || !this.key || !this.passphrase) {
      // If encryption not enabled, return data as-is
      // This allows gradual migration
      return data;
    }

    try {
      const encrypted = await encryptData(data, this.passphrase);
      return JSON.stringify(encrypted);
    } catch (error) {
      console.error("Encryption failed:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  /**
   * Decrypt data retrieved from IndexedDB
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.isEnabled() || !this.key || !this.passphrase) {
      // If encryption not enabled, return data as-is
      return encryptedData;
    }

    try {
      // Check if data is actually encrypted (JSON format)
      if (!encryptedData.startsWith("{")) {
        // Not encrypted, return as-is (backwards compatibility)
        return encryptedData;
      }

      const parsed = JSON.parse(encryptedData);
      // Verify it has encryption structure
      if (!parsed.ciphertext || !parsed.salt || !parsed.iv) {
        // Not encrypted format, return as-is
        return encryptedData;
      }

      return await decryptData(parsed, this.passphrase);
    } catch (error) {
      console.error("Decryption failed:", error);
      // Return original data if decryption fails (backwards compatibility)
      return encryptedData;
    }
  }

  /**
   * Encrypt object data (for metadata, etc.)
   */
  async encryptObject<T>(obj: T): Promise<string> {
    const jsonStr = JSON.stringify(obj);
    return await this.encrypt(jsonStr);
  }

  /**
   * Decrypt object data
   */
  async decryptObject<T>(encryptedData: string): Promise<T> {
    const decrypted = await this.decrypt(encryptedData);
    return JSON.parse(decrypted);
  }

  /**
   * Encrypt Uint8Array data (for private keys)
   * CRITICAL: Encrypts binary data like Ed25519 private keys
   */
  async encryptBytes(data: Uint8Array): Promise<string> {
    // Convert Uint8Array to base64 string, then encrypt
    const base64 = btoa(String.fromCharCode(...data));
    return await this.encrypt(base64);
  }

  /**
   * Decrypt to Uint8Array (for private keys)
   * CRITICAL: Decrypts binary data like Ed25519 private keys
   */
  async decryptBytes(encryptedData: string): Promise<Uint8Array> {
    const base64 = await this.decrypt(encryptedData);
    // Convert base64 back to Uint8Array
    return new Uint8Array(
      atob(base64).split("").map((c) => c.charCodeAt(0))
    );
  }

  /**
   * Disable encryption (for testing or if user opts out)
   */
  disable(): void {
    this.enabled = false;
    this.key = null;
    this.passphrase = null;
  }
}

export const encryptionManager = EncryptionManager.getInstance();

/**
 * Helper to encrypt sensitive fields in a stored object
 * CRITICAL FIX: Now handles Uint8Array for private keys
 */
export async function encryptSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: Array<keyof T>,
): Promise<T> {
  if (!encryptionManager.isEnabled()) {
    return obj;
  }

  const encrypted = { ...obj };
  for (const field of sensitiveFields) {
    const value = obj[field];
    if (value instanceof Uint8Array) {
      // CRITICAL: Encrypt Uint8Array (private keys)
      encrypted[field] = (await encryptionManager.encryptBytes(value)) as unknown as T[keyof T];
    } else if (value && typeof value === "string") {
      // Encrypt strings
      encrypted[field] = (await encryptionManager.encrypt(value)) as unknown as T[keyof T];
    } else if (value && typeof value === "object") {
      // Encrypt objects
      encrypted[field] = (await encryptionManager.encryptObject(
        value,
      )) as unknown as T[keyof T];
    }
  }
  return encrypted;
}

/**
 * Helper to decrypt sensitive fields in a stored object
 * CRITICAL FIX: Now handles Uint8Array for private keys and objects
 */
export async function decryptSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: Array<keyof T>,
): Promise<T> {
  if (!encryptionManager.isEnabled()) {
    return obj;
  }

  const decrypted = { ...obj };
  for (const field of sensitiveFields) {
    const value = obj[field];
    if (value && typeof value === "string") {
      try {
        // Try to decrypt - check if it looks like encrypted data
        if (value.startsWith("{")) {
          const parsed = JSON.parse(value);
          if (parsed.ciphertext && parsed.salt && parsed.iv) {
            // This is encrypted data
            // If the field name suggests binary data, decrypt as bytes
            if (field === "privateKey" || field === "publicKey") {
              decrypted[field] = (await encryptionManager.decryptBytes(value)) as unknown as T[keyof T];
            } else {
              // Try to decrypt as object first, fall back to string
              try {
                decrypted[field] = (await encryptionManager.decryptObject(value)) as unknown as T[keyof T];
              } catch {
                // If object parsing fails, treat as plain string
                decrypted[field] = (await encryptionManager.decrypt(value)) as unknown as T[keyof T];
              }
            }
          } else {
            // Not encrypted, leave as-is
            decrypted[field] = value as unknown as T[keyof T];
          }
        } else {
          // Not encrypted, leave as-is
          decrypted[field] = value as unknown as T[keyof T];
        }
      } catch (error) {
        // If decryption fails, leave as-is
        console.warn(`Failed to decrypt field ${String(field)}:`, error);
        decrypted[field] = value as unknown as T[keyof T];
      }
    } else if (value instanceof Uint8Array) {
      // Already Uint8Array (unencrypted), leave as-is
      decrypted[field] = value as unknown as T[keyof T];
    }
  }
  return decrypted;
}
