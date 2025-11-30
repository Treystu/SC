/**
 * Cryptographic utilities for backup encryption/decryption
 * Uses Web Crypto API for secure PBKDF2 key derivation and AES-GCM encryption
 */

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
      iterations: 100000,
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
