import type { MeshNetwork } from "../mesh/network.js";
import { Message, MessageType, encodeMessage } from "../protocol/message.js";
import { split, combine } from "../crypto/shamir.js";
import {
  signMessage,
  generateEphemeralKeyPair,
  performKeyExchange,
  encryptMessage,
  decryptMessage,
  generateNonce,
  convertEd25519PublicKeyToX25519,
  convertEd25519PrivateKeyToX25519,
  secureWipe,
} from "../crypto/primitives.js";
import { sha256 as sha256Hash } from "@noble/hashes/sha2.js";

// Type definitions for share payload
interface SharePayload {
  shareId: number; // x value in shamir
  shareData: string; // base64 encoded encrypted y value
  threshold: number;
  fingerprint?: string; // Optional: fingerprint of the key being recovered (e.g. hash of public key)
  ephemeralPublicKey: string; // base64 encoded ephemeral public key for ECIES decryption
  nonce: string; // base64 encoded nonce for encryption
}

interface RequestSharePayload {
  newPublicKey: string; // The user's new identity public key where share should be sent (base64 encoded Ed25519 public key)
  fingerprint: string; // Fingerprint of the OLD key to identify which share to retrieve
}

interface ResponseSharePayload {
  shareId: number;
  shareData: string; // base64 encoded encrypted y value
  fingerprint: string;
  ephemeralPublicKey: string; // base64 encoded ephemeral public key for ECIES decryption
  nonce: string; // base64 encoded nonce for encryption
}

export class SocialRecoveryManager {
  private network: MeshNetwork;
  // Store for shares held for OTHERS. Key: fingerprint, Value: SharePayload
  // In a real app, this should be PERSISTED securely. For now, in-memory.
  private heldShares: Map<string, SharePayload> = new Map();

  private pendingRecoveryResolvers: Map<
    string,
    (share: { x: number; y: Uint8Array }) => void
  > = new Map();
  private collectedShares: Map<string, Array<{ x: number; y: Uint8Array }>> =
    new Map();

  constructor(network: MeshNetwork) {
    this.network = network;
  }

  /**
   * Encrypt data using ECIES (Elliptic Curve Integrated Encryption Scheme)
   * Uses X25519 key exchange + HKDF + XChaCha20-Poly1305 AEAD
   * @param data Data to encrypt
   * @param recipientPublicKey Recipient's Ed25519 public key (will be converted to X25519)
   * @returns Object with encrypted data, ephemeral public key, and nonce
   */
  private async encryptECIES(
    data: Uint8Array,
    recipientPublicKey: Uint8Array,
  ): Promise<{ encrypted: Uint8Array; ephemeralPublicKey: Uint8Array; nonce: Uint8Array }> {
    // Generate ephemeral X25519 keypair
    const ephemeralKeyPair = generateEphemeralKeyPair();

    // Convert recipient's Ed25519 public key to X25519
    const recipientX25519PublicKey = convertEd25519PublicKeyToX25519(recipientPublicKey);

    // Perform ECDH to derive shared secret (already includes HKDF in performKeyExchange)
    const encryptionKey = performKeyExchange(
      ephemeralKeyPair.privateKey,
      recipientX25519PublicKey,
    );

    // Generate nonce for encryption
    const nonce = generateNonce();

    // Encrypt using XChaCha20-Poly1305
    const encrypted = encryptMessage(data, encryptionKey, nonce);

    // Securely wipe sensitive material from memory
    secureWipe(ephemeralKeyPair.privateKey);
    secureWipe(encryptionKey);

    return {
      encrypted,
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
      nonce,
    };
  }

  /**
   * Decrypt data using ECIES
   * @param encrypted Encrypted data
   * @param ephemeralPublicKey Ephemeral public key from encryption
   * @param nonce Nonce from encryption
   * @param recipientPrivateKey Recipient's Ed25519 private key (will be converted to X25519)
   * @returns Decrypted data
   */
  private async decryptECIES(
    encrypted: Uint8Array,
    ephemeralPublicKey: Uint8Array,
    nonce: Uint8Array,
    recipientPrivateKey: Uint8Array,
  ): Promise<Uint8Array> {
    // Convert recipient's Ed25519 private key to X25519
    const recipientX25519PrivateKey = convertEd25519PrivateKeyToX25519(recipientPrivateKey);

    // Perform ECDH to derive the same shared secret (already includes HKDF in performKeyExchange)
    const encryptionKey = performKeyExchange(
      recipientX25519PrivateKey,
      ephemeralPublicKey,
    );

    // Decrypt using XChaCha20-Poly1305
    const decrypted = decryptMessage(encrypted, encryptionKey, nonce);

    // Securely wipe sensitive material from memory
    secureWipe(recipientX25519PrivateKey);
    secureWipe(encryptionKey);

    return decrypted;
  }

  /**
   * Split a secret and distribute shares to trusted peers.
   * @param secret The secret key to backup (Uint8Array)
   * @param peers Array of objects with peer ID and public key
   * @param threshold Minimum number of peers required to recover
   * @param fingerprint Optional fingerprint to identify this backup (defaults to hash of secret)
   */
  async distributeShares(
    secret: Uint8Array,
    peers: Array<{ id: string; publicKey: Uint8Array }>,
    threshold: number,
    fingerprint?: string,
  ): Promise<void> {
    if (peers.length < threshold) {
      throw new Error(
        `Not enough peers (${peers.length}) for threshold ${threshold}`,
      );
    }

    const shares = split(secret, peers.length, threshold);

    // Generate fingerprint if not provided (using hash of secret)
    const actualFingerprint = fingerprint || Buffer.from(sha256Hash(secret)).toString("hex").slice(0, 16);

    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i];
      const share = shares[i];

      // Validate peer public key
      if (!peer.publicKey || peer.publicKey.length !== 32) {
        throw new Error(`Invalid public key for peer ${peer.id}: must be exactly 32 bytes (Ed25519 public key)`);
      }

      // Encrypt share using ECIES with peer's public key
      const encryptionResult = await this.encryptECIES(share.y, peer.publicKey);

      const payloadData: SharePayload = {
        shareId: share.x,
        shareData: Buffer.from(encryptionResult.encrypted).toString("base64"),
        threshold,
        fingerprint: actualFingerprint,
        ephemeralPublicKey: Buffer.from(encryptionResult.ephemeralPublicKey).toString("base64"),
        nonce: Buffer.from(encryptionResult.nonce).toString("base64"),
      };

      const payload = new TextEncoder().encode(JSON.stringify(payloadData));

      await this.sendMessage(peer.id, MessageType.STORE_SHARE, payload);
    }
  }

  /**
   * Request shares from friends to recover a secret.
   * @param peers List of friends to contact
   * @param fingerprint The ID of the secret to recover
   * @param newPublicKey My new public key (to receive encrypted shares)
   */
  async initiateRecovery(
    peers: string[],
    fingerprint: string,
    newPublicKey: string,
  ): Promise<Uint8Array> {
    this.collectedShares.set(fingerprint, []);

    // Send requests
    const reqData: RequestSharePayload = {
      newPublicKey,
      fingerprint,
    };
    const payload = new TextEncoder().encode(JSON.stringify(reqData));

    for (const peerId of peers) {
      await this.sendMessage(peerId, MessageType.REQUEST_SHARE, payload);
    }

    // Return a promise that resolves when we have enough shares
    // This is tricky because we don't know the threshold yet (it's in the shares!).
    // We need to wait for checks.

    return new Promise((resolve, reject) => {
      // Timeout 30s
      const timeout = setTimeout(() => {
        const collected = this.collectedShares.get(fingerprint) || [];
        if (collected.length > 0) {
          // Try to combine whatever we have?
          try {
            const secret = combine(collected);
            resolve(secret);
          } catch (e) {
            reject(new Error("Timeout and failed to combine shares"));
          }
        } else {
          reject(new Error("Timeout: No shares received"));
        }
      }, 30000);

      // Register resolver
      // We'll check in handleMessage
      // For now, store resolve/reject in a map?
      // Simplification: We just poll or event based.
      // Let's hack: attach to 'this'
      (this as any)._recoveryPromise = {
        resolve,
        reject,
        fingerprint,
        timeout,
      };
    });
  }

  /**
   * Handle incoming Social Recovery messages
   */
  async handleMessage(message: Message): Promise<void> {
    const type = message.header.type;
    const senderId = Buffer.from(message.header.senderId).toString("hex");

    if (type === MessageType.STORE_SHARE) {
      const data: SharePayload = JSON.parse(
        new TextDecoder().decode(message.payload),
      );
      console.log(`Received share from ${senderId} for ${data.fingerprint}`);
      // Store it
      // In real app, prompt user "Do you accept backup for User X?"
      this.heldShares.set(data.fingerprint || "unknown", data);
    } else if (type === MessageType.REQUEST_SHARE) {
      const data: RequestSharePayload = JSON.parse(
        new TextDecoder().decode(message.payload),
      );
      console.log(
        `Received recovery request for ${data.fingerprint} from ${senderId}`,
      );

      const share = this.heldShares.get(data.fingerprint);
      if (share) {
        // Verify sender identity through message signature (already verified by network layer)
        // In production, implement additional social verification (e.g., user confirmation dialog)

        // Decrypt the stored share first (it was encrypted with our public key)
        const identity = this.network.getIdentity();

        const storedShareData = Buffer.from(share.shareData, "base64");
        const storedEphemeralPubKey = Buffer.from(share.ephemeralPublicKey, "base64");
        const storedNonce = Buffer.from(share.nonce, "base64");

        const decryptedShareData = await this.decryptECIES(
          storedShareData,
          storedEphemeralPubKey,
          storedNonce,
          identity.privateKey,
        );

        // Re-encrypt the share with the requester's new public key
        const requesterNewPublicKey = Buffer.from(data.newPublicKey, "base64");
        const encryptionResult = await this.encryptECIES(decryptedShareData, requesterNewPublicKey);

        const respData: ResponseSharePayload = {
          shareId: share.shareId,
          shareData: Buffer.from(encryptionResult.encrypted).toString("base64"),
          fingerprint: data.fingerprint,
          ephemeralPublicKey: Buffer.from(encryptionResult.ephemeralPublicKey).toString("base64"),
          nonce: Buffer.from(encryptionResult.nonce).toString("base64"),
        };

        const payload = new TextEncoder().encode(JSON.stringify(respData));
        await this.sendMessage(senderId, MessageType.RESPONSE_SHARE, payload);
      }
    } else if (type === MessageType.RESPONSE_SHARE) {
      const data: ResponseSharePayload = JSON.parse(
        new TextDecoder().decode(message.payload),
      );
      console.log(`Received recovery share part for ${data.fingerprint}`);

      // Decrypt the received share using our private key
      const promise = (this as any)._recoveryPromise;
      if (promise && promise.fingerprint === data.fingerprint) {
        try {
          const identity = this.network.getIdentity();

          const encryptedShareData = Buffer.from(data.shareData, "base64");
          const ephemeralPubKey = Buffer.from(data.ephemeralPublicKey, "base64");
          const nonce = Buffer.from(data.nonce, "base64");

          // Decrypt share with our private key
          const decryptedShareData = await this.decryptECIES(
            encryptedShareData,
            ephemeralPubKey,
            nonce,
            identity.privateKey,
          );

          const sharePart = {
            x: data.shareId,
            y: decryptedShareData,
          };

          const current = this.collectedShares.get(data.fingerprint) || [];
          // Avoid duplicates
          if (!current.find((s) => s.x === sharePart.x)) {
            current.push(sharePart);
            this.collectedShares.set(data.fingerprint, current);
          }

          // Try to combine shares if we have enough
          // Shamir's Secret Sharing will fail gracefully if we don't have enough shares
          if (current.length >= 2) {
            // Try with minimum 2 shares, will throw if threshold not met
            try {
              const secret = combine(current);
              // If successful, resolve the recovery promise
              clearTimeout(promise.timeout);
              promise.resolve(secret);
              (this as any)._recoveryPromise = undefined;
            } catch (e) {
              // Not enough shares yet, or invalid combination
              console.log(`Cannot combine yet: ${e}`);
            }
          }
        } catch (e) {
          console.error(`Failed to decrypt share: ${e}`);
        }
      }
    }
  }

  // Helper to send message (this duplicates Peer logic, usually MeshNetwork exposes `sendMessage`)
  // But MeshNetwork `send` takes raw bytes.
  // We need to construct Message, Sign, etc.
  // MeshNetwork should probably expose a `createAndSendMessage` or I access its identity.
  // I'll assume I can access `this.network.identity`
  private async sendMessage(
    to: string,
    type: MessageType,
    payload: Uint8Array,
  ) {
    // This requires accessing private keys etc from network.
    // Ideally MeshNetwork provides a high-level send method.
    // I will use `this.network.transportManager.send` but I need to construct the message.
    // WAIT, `SocialRecoveryManager` shouldn't do low-level signing.
    // I should add `sendAppMessage` to MeshNetwork?
    // Or duplicate the logic for now (mocking identity access if private).
    // MeshNetwork has `identity`.

    // I'll rely on the caller/network integration for now, or just use `this.network` if accessible.
    // Since `identity` is private in MeshNetwork, I might have trouble.
    // Assume I can get it or MeshNetwork exposes a helper.
    // For this prototype, I'll access it via `(this.network as any).identity`.

    const identity = this.network.getIdentity();

    const header = {
      version: 1,
      type,
      ttl: 64,
      timestamp: Date.now(),
      senderId: identity.publicKey,
      signature: new Uint8Array(64) as unknown as Uint8Array,
    };

    // Construct partial message to sign
    const msg: Message = { header: header as any, payload };
    // Sign
    const bytes = encodeMessage(msg);
    header.signature = signMessage(bytes, identity.privateKey);
    // Re-encode with signature
    const finalBytes = encodeMessage({ header: header as any, payload });

    const transport = (this.network as any).transportManager;
    if (transport && typeof transport.send === "function") {
      await transport.send(to, finalBytes);
    } else {
      // Fallback or error
      console.error("TransportManager not accessible on network instance");
    }
  }
}
