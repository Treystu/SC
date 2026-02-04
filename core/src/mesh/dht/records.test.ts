/**
 * Tests for DHT Record Types
 */

import {
  DHTRecordType,
  getPeerRecordKey,
  getPrekeyRecordKey,
  getSignalRecordKey,
  getMessageRecordKey,
  createPeerRecord,
  verifyPeerRecord,
  createSignalRecord,
  createMessageRecord,
  serializeRecord,
  deserializeRecord,
  recordToDHTValue,
  dhtValueToRecord,
  isRecordExpired,
  getRecordType,
} from "./records";
import {
  generateIdentity,
  generateFingerprint,
} from "../../crypto/primitives";
import { NATType } from "../../nat/NATDetector";
import type { NodeCapabilities } from "../../node/capabilities";

function createMockCapabilities(): NodeCapabilities {
  return {
    hasPublicIP: false,
    isAlwaysOn: false,
    bandwidth: "medium" as const,
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
  };
}

describe("DHT Records", () => {
  describe("Key generation", () => {
    it("should generate consistent peer record keys", () => {
      const key1 = getPeerRecordKey("ABCDEF1234567890");
      const key2 = getPeerRecordKey("ABCDEF1234567890");
      expect(Buffer.from(key1).toString("hex")).toBe(
        Buffer.from(key2).toString("hex")
      );
    });

    it("should generate different keys for different peers", () => {
      const key1 = getPeerRecordKey("ABCDEF1234567890");
      const key2 = getPeerRecordKey("1234567890ABCDEF");
      expect(Buffer.from(key1).toString("hex")).not.toBe(
        Buffer.from(key2).toString("hex")
      );
    });

    it("should generate different keys for different record types", () => {
      const peerId = "ABCDEF1234567890";
      const peerKey = getPeerRecordKey(peerId);
      const prekeyKey = getPrekeyRecordKey(peerId);
      const signalKey = getSignalRecordKey(peerId);
      const messageKey = getMessageRecordKey(peerId);

      const keys = [peerKey, prekeyKey, signalKey, messageKey].map((k) =>
        Buffer.from(k).toString("hex")
      );
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(4);
    });
  });

  describe("Peer records", () => {
    it("should create a signed peer record", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [
          {
            type: "webrtc",
            address: "stun:stun.example.com",
            priority: 10,
            active: true,
          },
        ],
        createMockCapabilities()
      );

      expect(record.recordType).toBe(DHTRecordType.PEER);
      expect(record.peerId).toBe(peerId);
      expect(record.publicKey).toEqual(identity.publicKey);
      expect(record.addresses).toHaveLength(1);
      expect(record.signature).toBeDefined();
      expect(record.signature.length).toBe(64); // Ed25519 signature
      expect(record.version).toBe(1);
    });

    it("should verify a valid peer record", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [],
        createMockCapabilities()
      );

      expect(verifyPeerRecord(record)).toBe(true);
    });

    it("should reject a tampered peer record", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [],
        createMockCapabilities()
      );

      // Tamper with timestamp
      record.timestamp += 1;
      expect(verifyPeerRecord(record)).toBe(false);
    });

    it("should reject peer record with wrong peer ID", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [],
        createMockCapabilities()
      );

      // Change peer ID
      record.peerId = "WRONG_PEER_ID_001";
      expect(verifyPeerRecord(record)).toBe(false);
    });
  });

  describe("Signal records", () => {
    it("should create a signal record", () => {
      const identity = generateIdentity();

      const record = createSignalRecord(
        "SENDER_PEER_ID_01",
        "RECEIVER_PEER_0001",
        "offer",
        '{"sdp": "test"}',
        identity.privateKey
      );

      expect(record.recordType).toBe(DHTRecordType.SIGNAL);
      expect(record.from).toBe("SENDER_PEER_ID_01");
      expect(record.to).toBe("RECEIVER_PEER_0001");
      expect(record.type).toBe("offer");
      expect(record.payload).toBe('{"sdp": "test"}');
      expect(record.signature).toBeDefined();
      expect(record.expiresAt).toBeGreaterThan(record.timestamp);
    });
  });

  describe("Message records", () => {
    it("should create a message record", () => {
      const identity = generateIdentity();
      const payload = new Uint8Array([1, 2, 3, 4, 5]);

      const record = createMessageRecord(
        "SENDER_PEER_ID_01",
        "RECEIVER_PEER_0001",
        payload,
        identity.privateKey,
        "high"
      );

      expect(record.recordType).toBe(DHTRecordType.MESSAGE);
      expect(record.senderId).toBe("SENDER_PEER_ID_01");
      expect(record.recipientId).toBe("RECEIVER_PEER_0001");
      expect(record.priority).toBe("high");
      expect(record.encryptedPayload).toEqual(payload);
      expect(record.expiresAt).toBeGreaterThan(record.timestamp);
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize a peer record", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [
          {
            type: "websocket",
            address: "ws://example.com",
            priority: 5,
            active: true,
          },
        ],
        createMockCapabilities()
      );

      const serialized = serializeRecord(record);
      const deserialized = deserializeRecord(serialized);

      expect(deserialized.recordType).toBe(DHTRecordType.PEER);
      expect((deserialized as any).peerId).toBe(peerId);
      expect((deserialized as any).addresses).toHaveLength(1);
    });

    it("should convert records to and from DHT values", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const record = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [],
        createMockCapabilities()
      );

      const nodeId = new Uint8Array(20);
      const dhtValue = recordToDHTValue(record, nodeId, 3600000);

      expect(dhtValue.data).toBeDefined();
      expect(dhtValue.ttl).toBe(3600000);
      expect(dhtValue.publisherId).toEqual(nodeId);

      const recovered = dhtValueToRecord(dhtValue);
      expect(recovered.recordType).toBe(DHTRecordType.PEER);
    });
  });

  describe("Record expiration", () => {
    it("should detect expired records", () => {
      const identity = generateIdentity();

      const record = createSignalRecord(
        "FROM",
        "TO",
        "offer",
        "{}",
        identity.privateKey,
        -1000 // Already expired
      );

      expect(isRecordExpired(record)).toBe(true);
    });

    it("should detect non-expired records", () => {
      const identity = generateIdentity();

      const record = createSignalRecord(
        "FROM",
        "TO",
        "offer",
        "{}",
        identity.privateKey,
        60000 // 1 minute in the future
      );

      expect(isRecordExpired(record)).toBe(false);
    });
  });

  describe("Record type extraction", () => {
    it("should return the correct record type", () => {
      const identity = generateIdentity();
      const peerId = generateFingerprint(identity.publicKey);

      const peerRecord = createPeerRecord(
        peerId,
        identity.publicKey,
        identity.privateKey,
        [],
        createMockCapabilities()
      );

      expect(getRecordType(peerRecord)).toBe(DHTRecordType.PEER);

      const signalRecord = createSignalRecord(
        "FROM",
        "TO",
        "offer",
        "{}",
        identity.privateKey
      );

      expect(getRecordType(signalRecord)).toBe(DHTRecordType.SIGNAL);
    });
  });
});
