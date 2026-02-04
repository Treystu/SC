/**
 * Tests for X3DH Key Exchange Protocol
 */

import {
  X3DHKeyManager,
  initiateX3DH,
  completeX3DH,
  verifyPrekeyBundle,
  createX3DHInitialMessage,
  serializePrekeyBundle,
  deserializePrekeyBundle,
  serializeX3DHInitialMessage,
  deserializeX3DHInitialMessage,
  DEFAULT_X3DH_CONFIG,
} from "./x3dh";
import {
  generateIdentity,
  secureWipe,
} from "./primitives";

describe("X3DH Key Exchange Protocol", () => {
  describe("X3DHKeyManager", () => {
    let manager: X3DHKeyManager;
    let identity: ReturnType<typeof generateIdentity>;

    beforeEach(() => {
      manager = new X3DHKeyManager();
      identity = generateIdentity();
    });

    afterEach(() => {
      manager.destroy();
    });

    it("should generate a key bundle", () => {
      const bundle = manager.generateKeyBundle(identity);

      expect(bundle).toBeDefined();
      expect(bundle.identityKey.publicKey).toEqual(identity.publicKey);
      expect(bundle.identityKey.privateKey).toEqual(identity.privateKey);
      expect(bundle.signedPrekey).toBeDefined();
      expect(bundle.signedPrekey.keyPair.publicKey).toHaveLength(32);
      expect(bundle.signedPrekey.keyPair.privateKey).toHaveLength(32);
      expect(bundle.signedPrekey.signature).toBeDefined();
      expect(bundle.signedPrekey.id).toBe(1);
      expect(bundle.oneTimePrekeys.length).toBe(
        DEFAULT_X3DH_CONFIG.initialOneTimePrekeys
      );
    });

    it("should generate unique one-time prekeys", () => {
      const bundle = manager.generateKeyBundle(identity);
      const publicKeys = bundle.oneTimePrekeys.map((otp) =>
        Buffer.from(otp.keyPair.publicKey).toString("hex")
      );
      const uniqueKeys = new Set(publicKeys);
      expect(uniqueKeys.size).toBe(publicKeys.length);
    });

    it("should create a public prekey bundle", () => {
      manager.generateKeyBundle(identity);
      const publicBundle = manager.getPublicBundle("ABCDEF1234567890");

      expect(publicBundle).not.toBeNull();
      expect(publicBundle!.peerId).toBe("ABCDEF1234567890");
      expect(publicBundle!.identityKey).toHaveLength(32);
      expect(publicBundle!.signedPrekeyPublic).toHaveLength(32);
      expect(publicBundle!.signedPrekeySignature).toBeDefined();
      expect(publicBundle!.oneTimePrekeyPublics.length).toBeGreaterThan(0);
      expect(publicBundle!.oneTimePrekeyPublics.length).toBeLessThanOrEqual(20);
    });

    it("should return null public bundle before generation", () => {
      expect(manager.getPublicBundle("ABCDEF1234567890")).toBeNull();
    });

    it("should replenish one-time prekeys", () => {
      const bundle = manager.generateKeyBundle(identity);

      // Mark all but a few as used
      const toMark = bundle.oneTimePrekeys.length - 5;
      for (let i = 0; i < toMark; i++) {
        manager.markOneTimePrekeyUsed(bundle.oneTimePrekeys[i].id);
      }

      const replenished = manager.replenishOneTimePrekeys();
      expect(replenished).toBeGreaterThan(0);
    });

    it("should not replenish if enough prekeys remain", () => {
      manager.generateKeyBundle(identity);
      const replenished = manager.replenishOneTimePrekeys();
      expect(replenished).toBe(0);
    });

    it("should detect signed prekey rotation need", () => {
      manager.generateKeyBundle(identity);
      expect(manager.needsSignedPrekeyRotation()).toBe(false);
    });

    it("should rotate signed prekey", () => {
      const bundle = manager.generateKeyBundle(identity);
      const oldId = bundle.signedPrekey.id;

      const newPrekey = manager.rotateSignedPrekey();
      expect(newPrekey).not.toBeNull();
      expect(newPrekey!.id).not.toBe(oldId);
      expect(newPrekey!.keyPair.publicKey).toHaveLength(32);
    });

    it("should mark one-time prekey as used", () => {
      const bundle = manager.generateKeyBundle(identity);
      const otpId = bundle.oneTimePrekeys[0].id;

      expect(manager.markOneTimePrekeyUsed(otpId)).toBe(true);
      // Can't use again
      expect(manager.getOneTimePrekeyPrivate(otpId)).toBeNull();
    });

    it("should export and import key bundle", () => {
      manager.generateKeyBundle(identity);
      const exported = manager.exportKeyBundle();
      expect(exported).not.toBeNull();

      const manager2 = new X3DHKeyManager();
      manager2.importKeyBundle(exported!);
      const bundle2 = manager2.getPublicBundle("test");
      expect(bundle2).not.toBeNull();

      manager2.destroy();
    });
  });

  describe("X3DH Key Exchange", () => {
    let aliceIdentity: ReturnType<typeof generateIdentity>;
    let bobIdentity: ReturnType<typeof generateIdentity>;
    let aliceManager: X3DHKeyManager;
    let bobManager: X3DHKeyManager;

    beforeEach(() => {
      aliceIdentity = generateIdentity();
      bobIdentity = generateIdentity();
      aliceManager = new X3DHKeyManager();
      bobManager = new X3DHKeyManager();
    });

    afterEach(() => {
      aliceManager.destroy();
      bobManager.destroy();
    });

    it("should complete X3DH exchange with one-time prekey", () => {
      // Bob generates key bundle
      bobManager.generateKeyBundle(bobIdentity);
      const bobBundle = bobManager.getPublicBundle("BOB_PEER_ID_123456");

      // Alice initiates
      const aliceResult = initiateX3DH(aliceIdentity, bobBundle!);

      expect(aliceResult.sharedSecret).toHaveLength(32);
      expect(aliceResult.ephemeralPublic).toHaveLength(32);
      expect(aliceResult.usedSignedPrekeyId).toBe(1);
      expect(aliceResult.usedOneTimePrekeyId).toBeDefined();
      expect(aliceResult.associatedData).toHaveLength(64); // IKa || IKb

      // Bob completes
      const bobSignedPrekeyPrivate = bobManager.getSignedPrekeyPrivate(
        aliceResult.usedSignedPrekeyId
      )!;
      const bobOTPPrivate = aliceResult.usedOneTimePrekeyId
        ? bobManager.getOneTimePrekeyPrivate(aliceResult.usedOneTimePrekeyId)
        : null;

      const initialMessage = createX3DHInitialMessage(
        aliceIdentity,
        aliceResult.ephemeralPublic,
        aliceResult.usedSignedPrekeyId,
        aliceResult.usedOneTimePrekeyId
      );

      const bobResult = completeX3DH(
        bobIdentity,
        bobSignedPrekeyPrivate,
        bobOTPPrivate,
        initialMessage
      );

      expect(bobResult.sharedSecret).toHaveLength(32);
      expect(bobResult.associatedData).toHaveLength(64);

      // Both should derive the same shared secret
      expect(Buffer.from(aliceResult.sharedSecret).toString("hex")).toBe(
        Buffer.from(bobResult.sharedSecret).toString("hex")
      );
    });

    it("should complete X3DH exchange without one-time prekey", () => {
      // Bob generates key bundle with no OTPs in the public bundle
      bobManager.generateKeyBundle(bobIdentity);
      const bobBundle = bobManager.getPublicBundle("BOB_PEER_ID_123456");
      // Remove OTPs to simulate exhaustion
      bobBundle!.oneTimePrekeyPublics = [];

      // Alice initiates
      const aliceResult = initiateX3DH(aliceIdentity, bobBundle!);
      expect(aliceResult.usedOneTimePrekeyId).toBeUndefined();

      // Bob completes
      const bobSignedPrekeyPrivate = bobManager.getSignedPrekeyPrivate(
        aliceResult.usedSignedPrekeyId
      )!;

      const initialMessage = createX3DHInitialMessage(
        aliceIdentity,
        aliceResult.ephemeralPublic,
        aliceResult.usedSignedPrekeyId
      );

      const bobResult = completeX3DH(
        bobIdentity,
        bobSignedPrekeyPrivate,
        null,
        initialMessage
      );

      // Both should derive the same shared secret
      expect(Buffer.from(aliceResult.sharedSecret).toString("hex")).toBe(
        Buffer.from(bobResult.sharedSecret).toString("hex")
      );
    });

    it("should fail with invalid prekey bundle signature", () => {
      bobManager.generateKeyBundle(bobIdentity);
      const bobBundle = bobManager.getPublicBundle("BOB_PEER_ID_123456");

      // Tamper with signature
      bobBundle!.signedPrekeySignature[0] ^= 0xff;

      expect(() => initiateX3DH(aliceIdentity, bobBundle!)).toThrow(
        "Invalid prekey bundle signature"
      );
    });

    it("should generate different shared secrets for different exchanges", () => {
      bobManager.generateKeyBundle(bobIdentity);
      const bobBundle1 = bobManager.getPublicBundle("BOB_PEER_ID_123456");
      const bobBundle2 = bobManager.getPublicBundle("BOB_PEER_ID_123456");

      const result1 = initiateX3DH(aliceIdentity, bobBundle1!);
      const result2 = initiateX3DH(aliceIdentity, bobBundle2!);

      // Different ephemeral keys should produce different secrets
      expect(Buffer.from(result1.ephemeralPublic).toString("hex")).not.toBe(
        Buffer.from(result2.ephemeralPublic).toString("hex")
      );
    });
  });

  describe("Prekey bundle verification", () => {
    it("should verify valid bundle", () => {
      const identity = generateIdentity();
      const manager = new X3DHKeyManager();
      manager.generateKeyBundle(identity);
      const bundle = manager.getPublicBundle("TEST_PEER_ID_0001");

      expect(verifyPrekeyBundle(bundle!)).toBe(true);
      manager.destroy();
    });

    it("should reject tampered bundle", () => {
      const identity = generateIdentity();
      const manager = new X3DHKeyManager();
      manager.generateKeyBundle(identity);
      const bundle = manager.getPublicBundle("TEST_PEER_ID_0001");

      // Tamper with signed prekey public
      bundle!.signedPrekeyPublic[0] ^= 0xff;
      expect(verifyPrekeyBundle(bundle!)).toBe(false);
      manager.destroy();
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize prekey bundle", () => {
      const identity = generateIdentity();
      const manager = new X3DHKeyManager();
      manager.generateKeyBundle(identity);
      const bundle = manager.getPublicBundle("TEST_PEER_ID_0001")!;

      const serialized = serializePrekeyBundle(bundle);
      const deserialized = deserializePrekeyBundle(serialized);

      expect(deserialized.peerId).toBe(bundle.peerId);
      expect(Buffer.from(deserialized.identityKey).toString("hex")).toBe(
        Buffer.from(bundle.identityKey).toString("hex")
      );
      expect(deserialized.signedPrekeyId).toBe(bundle.signedPrekeyId);
      expect(deserialized.oneTimePrekeyPublics.length).toBe(
        bundle.oneTimePrekeyPublics.length
      );

      manager.destroy();
    });

    it("should serialize and deserialize X3DH initial message", () => {
      const identity = generateIdentity();
      const ephemeralPublic = new Uint8Array(32);
      ephemeralPublic.fill(42);

      const msg = createX3DHInitialMessage(identity, ephemeralPublic, 1, 5);
      const serialized = serializeX3DHInitialMessage(msg);
      const deserialized = deserializeX3DHInitialMessage(serialized);

      expect(Buffer.from(deserialized.identityKey).toString("hex")).toBe(
        Buffer.from(identity.publicKey).toString("hex")
      );
      expect(Buffer.from(deserialized.ephemeralKey).toString("hex")).toBe(
        Buffer.from(ephemeralPublic).toString("hex")
      );
      expect(deserialized.signedPrekeyId).toBe(1);
      expect(deserialized.oneTimePrekeyId).toBe(5);
    });
  });
});
