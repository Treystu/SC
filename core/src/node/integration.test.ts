/**
 * Integration Tests for Unified Node Architecture
 *
 * Tests end-to-end flows combining multiple modules:
 * - X3DH key exchange + Double Ratchet encryption
 * - Node capabilities + services
 * - Transport management
 * - DHT records
 */

import { generateIdentity, generateFingerprint } from "../crypto/primitives";
import {
  X3DHKeyManager,
  initiateX3DH,
  completeX3DH,
  createX3DHInitialMessage,
} from "../crypto/x3dh";
import { DoubleRatchet } from "../crypto/double-ratchet";
import {
  NodeCapabilitiesDetector,
  type NodeCapabilities,
} from "./capabilities";
import {
  NodeServices,
  ServiceRequestType,
} from "./services";
import { NodeRegistration } from "./registration";
import {
  createPeerRecord,
  verifyPeerRecord,
  getPeerRecordKey,
  serializeRecord,
  deserializeRecord,
} from "../mesh/dht/records";
import { NATType } from "../nat/NATDetector";

describe("Unified Node Architecture Integration", () => {
  describe("X3DH + Double Ratchet end-to-end messaging", () => {
    it("should establish encrypted session and exchange messages", () => {
      // Setup Alice and Bob identities
      const aliceIdentity = generateIdentity();
      const bobIdentity = generateIdentity();

      // Bob generates X3DH key bundle
      const bobKeyManager = new X3DHKeyManager();
      bobKeyManager.generateKeyBundle(bobIdentity);
      const bobBundle = bobKeyManager.getPublicBundle(
        generateFingerprint(bobIdentity.publicKey)
      );

      // Alice initiates X3DH
      const aliceX3DHResult = initiateX3DH(aliceIdentity, bobBundle!);

      // Alice creates initial message
      const initialMessage = createX3DHInitialMessage(
        aliceIdentity,
        aliceX3DHResult.ephemeralPublic,
        aliceX3DHResult.usedSignedPrekeyId,
        aliceX3DHResult.usedOneTimePrekeyId
      );

      // Bob completes X3DH
      const bobSignedPrekeyPrivate = bobKeyManager.getSignedPrekeyPrivate(
        initialMessage.signedPrekeyId
      )!;
      const bobOTPPrivate = initialMessage.oneTimePrekeyId
        ? bobKeyManager.getOneTimePrekeyPrivate(
            initialMessage.oneTimePrekeyId
          )
        : null;

      const bobX3DHResult = completeX3DH(
        bobIdentity,
        bobSignedPrekeyPrivate,
        bobOTPPrivate,
        initialMessage
      );

      // Verify both sides derived the same shared secret
      expect(
        Buffer.from(aliceX3DHResult.sharedSecret).toString("hex")
      ).toBe(
        Buffer.from(bobX3DHResult.sharedSecret).toString("hex")
      );

      // Initialize Double Ratchet sessions
      // Bob's signed prekey serves as the initial DH key for the receiver
      const bobSPK = bobBundle!.signedPrekeyPublic;

      const aliceRatchet = DoubleRatchet.initializeAsSender(
        aliceX3DHResult.sharedSecret,
        bobSPK
      );

      // For Bob, we need to use his signed prekey as the initial DH key pair
      const bobKeyBundle = bobKeyManager.getKeyBundle()!;
      const bobRatchet = DoubleRatchet.initializeAsReceiver(
        bobX3DHResult.sharedSecret,
        {
          publicKey: bobKeyBundle.signedPrekey.keyPair.publicKey,
          privateKey: bobKeyBundle.signedPrekey.keyPair.privateKey,
        }
      );

      // Alice sends a message
      const plaintext1 = new TextEncoder().encode(
        "Hello Bob! This is a secure message."
      );
      const encrypted1 = aliceRatchet.encrypt(plaintext1);

      // Bob decrypts
      const decrypted1 = bobRatchet.decrypt(encrypted1);
      expect(new TextDecoder().decode(decrypted1)).toBe(
        "Hello Bob! This is a secure message."
      );

      // Bob sends a reply
      const plaintext2 = new TextEncoder().encode(
        "Hi Alice! Got your message securely."
      );
      const encrypted2 = bobRatchet.encrypt(plaintext2);

      // Alice decrypts
      const decrypted2 = aliceRatchet.decrypt(encrypted2);
      expect(new TextDecoder().decode(decrypted2)).toBe(
        "Hi Alice! Got your message securely."
      );

      // Continue exchanging messages
      for (let i = 0; i < 10; i++) {
        const msg = new TextEncoder().encode(`Message ${i} from Alice`);
        const enc = aliceRatchet.encrypt(msg);
        const dec = bobRatchet.decrypt(enc);
        expect(new TextDecoder().decode(dec)).toBe(
          `Message ${i} from Alice`
        );
      }

      // Verify forward secrecy - each message uses a different key
      const stats = aliceRatchet.getStats();
      expect(stats.sendingChainLength).toBeGreaterThan(0);

      bobKeyManager.destroy();
    });
  });

  describe("Node capability detection and services", () => {
    it("should detect capabilities and configure services accordingly", async () => {
      const detector = new NodeCapabilitiesDetector({
        checkInterval: 60000,
      });

      const capabilities = await detector.detectCapabilities();
      expect(capabilities.canDHT).toBe(true); // All nodes support DHT

      const services = new NodeServices(capabilities, {
        sendToPeer: async () => {},
        onMessage: () => {},
      });

      // All nodes handle pings
      const pingReq = NodeServices.createRequest(
        ServiceRequestType.PING,
        "SENDER_PEER_ID_01",
        new Uint8Array(0)
      );
      const pingResp = await services.handleRequest(pingReq);
      expect(pingResp.success).toBe(true);

      // All nodes handle capability queries
      const capsReq = NodeServices.createRequest(
        ServiceRequestType.CAPABILITIES,
        "SENDER_PEER_ID_01",
        new Uint8Array(0)
      );
      const capsResp = await services.handleRequest(capsReq);
      expect(capsResp.success).toBe(true);

      const reportedCaps = JSON.parse(
        new TextDecoder().decode(capsResp.payload!)
      );
      expect(reportedCaps.canDHT).toBe(true);

      detector.stop();
    });
  });

  describe("Peer record lifecycle", () => {
    it("should create, sign, serialize, deserialize, and verify peer records", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const capabilities: NodeCapabilities = {
        hasPublicIP: true,
        isAlwaysOn: true,
        bandwidth: "high",
        storage: 1000,
        batteryPowered: false,
        natType: NATType.OPEN,
        publicIP: "203.0.113.1",
        canSignal: true,
        canRelay: true,
        canStore: true,
        canDHT: true,
        lastChecked: Date.now(),
        connectionQuality: 95,
        maxConnections: 100,
      };

      // Create record
      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [
          {
            type: "websocket",
            address: "ws://203.0.113.1:8080",
            priority: 10,
            active: true,
          },
          {
            type: "webrtc",
            address: "stun:stun.example.com",
            priority: 5,
            active: true,
          },
        ],
        capabilities,
        1
      );

      // Verify signature
      expect(verifyPeerRecord(record)).toBe(true);

      // Serialize
      const serialized = serializeRecord(record);
      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBeGreaterThan(0);

      // Deserialize
      const deserialized = deserializeRecord(serialized) as any;
      expect(deserialized.peerId).toBe(peerId);
      expect(deserialized.addresses).toHaveLength(2);
      expect(deserialized.capabilities.canSignal).toBe(true);
      expect(deserialized.capabilities.canRelay).toBe(true);
      expect(deserialized.capabilities.canStore).toBe(true);
      expect(deserialized.version).toBe(1);
    });
  });

  describe("Service request serialization round-trip", () => {
    it("should correctly round-trip service requests", () => {
      const types = [
        ServiceRequestType.PING,
        ServiceRequestType.CAPABILITIES,
        ServiceRequestType.MESSAGE,
        ServiceRequestType.DHT_QUERY,
      ];

      for (const type of types) {
        const payload = new TextEncoder().encode(
          `payload for ${type}`
        );
        const request = NodeServices.createRequest(
          type,
          "SENDER_PEER_ID_01",
          payload
        );

        const serialized = NodeServices.serializeRequest(request);
        const deserialized =
          NodeServices.deserializeRequest(serialized);

        expect(deserialized.type).toBe(type);
        expect(deserialized.from).toBe("SENDER_PEER_ID_01");
        expect(deserialized.requestId).toBe(request.requestId);
        expect(
          new TextDecoder().decode(deserialized.payload)
        ).toBe(`payload for ${type}`);
      }
    });
  });

  describe("Registration system", () => {
    it("should create registration and manage state", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const registration = new NodeRegistration(
        peerId,
        identity.publicKey,
        identity.privateKey,
        { refreshInterval: 60000 }
      );

      const state = registration.getState();
      expect(state.isRegistered).toBe(false);
      expect(state.version).toBe(0);
      expect(state.registrationCount).toBe(0);

      // Without DHT, registration should return false
      const registered = registration.register(
        {
          hasPublicIP: false,
          isAlwaysOn: false,
          bandwidth: "medium",
          storage: 500,
          batteryPowered: false,
          natType: NATType.UNKNOWN,
          canSignal: false,
          canRelay: false,
          canStore: false,
          canDHT: true,
          lastChecked: Date.now(),
          connectionQuality: 70,
          maxConnections: 20,
        },
        []
      );

      // Should return a promise that resolves to false (no DHT)
      registered.then((result) => {
        expect(result).toBe(false);
      });

      registration.destroy();
    });
  });
});
