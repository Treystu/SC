import { jest } from "@jest/globals";
import {
  CryptoManager,
  KeyManager,
  generateKey,
  generateNonce,
  generateEphemeralKeyPair,
  generateIdentity,
} from "./index";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { timingSafeEqual } from "./primitives";

describe("CryptoManager", () => {
  let cryptoManager: CryptoManager;

  beforeEach(() => {
    cryptoManager = new CryptoManager();
  });

  describe("generateKey", () => {
    it("should generate a 32-byte key", () => {
      const key = cryptoManager.generateKey();
      expect(key).toHaveLength(32);
      expect(key).toBeInstanceOf(Uint8Array);
    });

    it("should generate unique keys each time", () => {
      const key1 = cryptoManager.generateKey();
      const key2 = cryptoManager.generateKey();
      expect(timingSafeEqual(key1, key2)).toBe(false);
    });
  });

  describe("encrypt/decrypt", () => {
    it("should encrypt and decrypt a string message", () => {
      const key = cryptoManager.generateKey();
      const message = "Hello, World!";

      const encrypted = cryptoManager.encrypt(message, key);
      const decrypted = cryptoManager.decrypt(encrypted, key);

      expect(decrypted).toBe(message);
    });

    it("should encrypt and decrypt a Uint8Array message", () => {
      const key = cryptoManager.generateKey();
      const message = new TextEncoder().encode("Binary data test");

      const encrypted = cryptoManager.encrypt(message, key);
      const decrypted = cryptoManager.decrypt(encrypted, key);

      expect(decrypted).toBe("Binary data test");
    });

    it("should produce different ciphertext each time (due to random nonce)", () => {
      const key = cryptoManager.generateKey();
      const message = "Same message";

      const encrypted1 = cryptoManager.encrypt(message, key);
      const encrypted2 = cryptoManager.encrypt(message, key);

      // Ciphertexts should be different due to different nonces
      expect(timingSafeEqual(encrypted1, encrypted2)).toBe(false);
    });

    it("should throw error when decrypting data that is too short", () => {
      const key = cryptoManager.generateKey();
      const tooShort = new Uint8Array(20);

      expect(() => cryptoManager.decrypt(tooShort, key)).toThrow(
        "Encrypted data too short",
      );
    });
  });

  describe("decryptBytes", () => {
    it("should decrypt to Uint8Array", () => {
      const key = cryptoManager.generateKey();
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = cryptoManager.encrypt(originalData, key);
      const decrypted = cryptoManager.decryptBytes(encrypted, key);

      expect(decrypted).toEqual(originalData);
      expect(decrypted).toBeInstanceOf(Uint8Array);
    });

    it("should throw error when decrypting data that is too short", () => {
      const key = cryptoManager.generateKey();
      const tooShort = new Uint8Array(20);

      expect(() => cryptoManager.decryptBytes(tooShort, key)).toThrow(
        "Encrypted data too short",
      );
    });
  });

  describe("sign/verify", () => {
    it("should sign and verify a string message", () => {
      const keyManager = new KeyManager();
      keyManager.generateIdentityKeyPair();

      const message = "Message to sign";
      const signature = cryptoManager.sign(message, keyManager.getPrivateKey());
      const isValid = cryptoManager.verify(
        message,
        signature,
        keyManager.getPublicKey(),
      );

      expect(signature).toHaveLength(64);
      expect(isValid).toBe(true);
    });

    it("should sign and verify a Uint8Array message", () => {
      const keyManager = new KeyManager();
      keyManager.generateIdentityKeyPair();

      const message = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = cryptoManager.sign(message, keyManager.getPrivateKey());
      const isValid = cryptoManager.verify(
        message,
        signature,
        keyManager.getPublicKey(),
      );

      expect(isValid).toBe(true);
    });

    it("should reject invalid signature", () => {
      const keyManager = new KeyManager();
      keyManager.generateIdentityKeyPair();

      const message = "Original message";
      const signature = cryptoManager.sign(message, keyManager.getPrivateKey());
      const isValid = cryptoManager.verify(
        "Tampered message",
        signature,
        keyManager.getPublicKey(),
      );

      expect(isValid).toBe(false);
    });
  });

  describe("deriveSecret", () => {
    it("should derive shared secret between two parties", () => {
      // Use identity keys for high-level secret derivation
      const keypair1 = generateIdentity();
      const keypair2 = generateIdentity();

      const secret1 = cryptoManager.deriveSecret(
        keypair1.privateKey,
        keypair2.publicKey,
      );
      const secret2 = cryptoManager.deriveSecret(
        keypair2.privateKey,
        keypair1.publicKey,
      );

      expect(secret1).toHaveLength(32);
      if (!timingSafeEqual(secret1, secret2)) {
        // eslint-disable-next-line no-console
        console.error("[TEST-DEBUG] CryptoManager deriveSecret mismatch:");
        // eslint-disable-next-line no-console
        console.error("secret1=", Buffer.from(secret1).toString("hex"));
        // eslint-disable-next-line no-console
        console.error("secret2=", Buffer.from(secret2).toString("hex"));
      }

      expect(timingSafeEqual(secret1, secret2)).toBe(true);
    });

    it("should maintain key path consistency", () => {
      const priv = ed25519.utils.randomSecretKey();
      const pub = ed25519.getPublicKey(priv);

      const mont = ed25519.utils.toMontgomery(pub);
      const xPriv = ed25519.utils.toMontgomerySecret(priv);
      const xPubFromPriv = x25519.getPublicKey(xPriv);

      if (
        Buffer.from(mont).toString("hex") !==
        Buffer.from(xPubFromPriv).toString("hex")
      ) {
        console.error("[CONSISTENCY-TEST] Mismatch!");
        console.error("mont        :", Buffer.from(mont).toString("hex"));
        console.error(
          "xPubFromPriv:",
          Buffer.from(xPubFromPriv).toString("hex"),
        );
        throw new Error("Key path inconsistency in Jest environment");
      }
    });

    it("should perform correct ECDH", () => {
      const privA = ed25519.utils.randomSecretKey();
      const pubA = ed25519.getPublicKey(privA);
      const privB = ed25519.utils.randomSecretKey();
      const pubB = ed25519.getPublicKey(privB);

      const uA = ed25519.utils.toMontgomery(pubA);
      const uB = ed25519.utils.toMontgomery(pubB);

      const xPrivA = ed25519.utils.toMontgomerySecret(privA);
      const xPrivB = ed25519.utils.toMontgomerySecret(privB);

      const s1 = x25519.getSharedSecret(xPrivA, uB);
      const s2 = x25519.getSharedSecret(xPrivB, uA);

      if (Buffer.from(s1).toString("hex") !== Buffer.from(s2).toString("hex")) {
        console.error("[ECDH-TEST] Mismatch!");
        console.error("s1:", Buffer.from(s1).toString("hex"));
        console.error("s2:", Buffer.from(s2).toString("hex"));
        throw new Error("ECDH mismatch in Jest environment");
      }
    });
  });
});

describe("KeyManager", () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    keyManager = new KeyManager();
  });

  describe("generateIdentityKeyPair", () => {
    it("should generate a keypair", () => {
      expect(keyManager.hasKeypair()).toBe(false);

      keyManager.generateIdentityKeyPair();

      expect(keyManager.hasKeypair()).toBe(true);
    });
  });

  describe("getPublicKey", () => {
    it("should throw if keypair not generated", () => {
      expect(() => keyManager.getPublicKey()).toThrow("Keypair not generated");
    });

    it("should return 32-byte public key", () => {
      keyManager.generateIdentityKeyPair();
      const publicKey = keyManager.getPublicKey();

      expect(publicKey).toHaveLength(32);
      expect(publicKey).toBeInstanceOf(Uint8Array);
    });

    it("should return a copy of the public key", () => {
      keyManager.generateIdentityKeyPair();
      const publicKey1 = keyManager.getPublicKey();
      const publicKey2 = keyManager.getPublicKey();

      // Should be equal in value
      expect(timingSafeEqual(publicKey1, publicKey2)).toBe(true);

      // But should be different objects (copies)
      expect(publicKey1).not.toBe(publicKey2);

      // Modifying one should not affect the other
      publicKey1[0] = publicKey1[0] ^ 0xff;
      expect(timingSafeEqual(publicKey1, publicKey2)).toBe(false);
    });
  });

  describe("getPrivateKey", () => {
    it("should throw if keypair not generated", () => {
      expect(() => keyManager.getPrivateKey()).toThrow("Keypair not generated");
    });

    it("should return 32-byte private key", () => {
      keyManager.generateIdentityKeyPair();
      const privateKey = keyManager.getPrivateKey();

      expect(privateKey).toHaveLength(32);
      expect(privateKey).toBeInstanceOf(Uint8Array);
    });

    it("should return a copy of the private key", () => {
      keyManager.generateIdentityKeyPair();
      const privateKey1 = keyManager.getPrivateKey();
      const privateKey2 = keyManager.getPrivateKey();

      // Should be equal in value
      expect(timingSafeEqual(privateKey1, privateKey2)).toBe(true);

      // But should be different objects (copies)
      expect(privateKey1).not.toBe(privateKey2);

      // Modifying one should not affect the other
      privateKey1[0] = privateKey1[0] ^ 0xff;
      expect(timingSafeEqual(privateKey1, privateKey2)).toBe(false);
    });
  });

  describe("hasKeypair", () => {
    it("should return false before generation", () => {
      expect(keyManager.hasKeypair()).toBe(false);
    });

    it("should return true after generation", () => {
      keyManager.generateIdentityKeyPair();
      expect(keyManager.hasKeypair()).toBe(true);
    });

    it("should return false after clear", () => {
      keyManager.generateIdentityKeyPair();
      keyManager.clear();
      expect(keyManager.hasKeypair()).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear the keypair", () => {
      keyManager.generateIdentityKeyPair();
      expect(keyManager.hasKeypair()).toBe(true);

      keyManager.clear();

      expect(keyManager.hasKeypair()).toBe(false);
      expect(() => keyManager.getPublicKey()).toThrow();
      expect(() => keyManager.getPrivateKey()).toThrow();
    });

    it("should be safe to call multiple times", () => {
      keyManager.generateIdentityKeyPair();
      keyManager.clear();
      keyManager.clear(); // Should not throw

      expect(keyManager.hasKeypair()).toBe(false);
    });

    it("should be safe to call without generating keypair", () => {
      keyManager.clear(); // Should not throw
      expect(keyManager.hasKeypair()).toBe(false);
    });
  });
});
