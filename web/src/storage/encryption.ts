/**
 * IndexedDB Encryption Layer
 * Implements transparent encryption for all sensitive data stored in IndexedDB
 * Addresses Critical Gap #2 from V1.0 audit
 */

import { encryptData, decryptData, deriveKey } from "../utils/backupCrypto";

export interface EncryptionConfig {
  enabled: boolean;
  passphrase?: string;
}

/**
 * Encryption manager for IndexedDB storage
 */
class EncryptionManager {
  private static instance: EncryptionManager;
  private enabled: boolean = false;
  private key: CryptoKey | null = null;
  private passphrase: string | null = null;

  private constructor() {}

  static getInstance(): EncryptionManager {
    if (!EncryptionManager.instance) {
      EncryptionManager.instance = new EncryptionManager();
    }
    return EncryptionManager.instance;
  }

  /**
   * Initialize encryption with a passphrase
   * Passphrase should be derived from user password or hardware-backed key
   */
  async initialize(passphrase: string): Promise<void> {
    this.passphrase = passphrase;
    this.key = await deriveKey(passphrase);
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
    if (value && typeof value === "string") {
      encrypted[field] = (await encryptionManager.encrypt(value)) as T[keyof T];
    } else if (value && typeof value === "object") {
      encrypted[field] = (await encryptionManager.encryptObject(
        value,
      )) as T[keyof T];
    }
  }
  return encrypted;
}

/**
 * Helper to decrypt sensitive fields in a stored object
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
      decrypted[field] = (await encryptionManager.decrypt(value)) as T[keyof T];
    }
  }
  return decrypted;
}
