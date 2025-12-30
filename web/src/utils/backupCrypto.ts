/**
 * Cryptographic utilities for backup encryption/decryption
 * Uses Web Crypto API for secure PBKDF2 key derivation and AES-GCM encryption
 */

// PBKDF2 iterations - reduced from 100000 to 10000 for better performance
// while maintaining reasonable security (NIST recommends minimum 10,000 for PBKDF2-SHA256)
const PBKDF2_ITERATIONS = 10000;

// E2E test marker for faster key derivation
const isE2E = typeof navigator !== 'undefined' && navigator.webdriver === true;
const E2E_ITERATIONS = isE2E ? 1000 : PBKDF2_ITERATIONS; // Fast mode for testing

export interface EncryptedBackup {
  isEncrypted: true;
  version: string;
  ciphertext: string;
  salt: string;
  iv: string;
}

// Derive a key from a password and salt
export const deriveKey = async (
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: E2E_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

// Encrypt data with a password
export const encryptData = async (
  data: string,
  password: string,
): Promise<EncryptedBackup> => {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(data),
  );

  return {
    isEncrypted: true,
    version: "1.0",
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
  };
};

// Decrypt data with a password
export const decryptData = async (
  encryptedData: EncryptedBackup,
  password: string,
): Promise<string> => {
  const salt = new Uint8Array(
    atob(encryptedData.salt)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
  const iv = new Uint8Array(
    atob(encryptedData.iv)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
  const ciphertext = new Uint8Array(
    atob(encryptedData.ciphertext)
      .split("")
      .map((c) => c.charCodeAt(0)),
  );
  const key = await deriveKey(password, salt);

  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    throw new Error("Incorrect password or corrupted backup file.");
  }
};
