/**
 * DHT Record Types for Unified Node Architecture
 *
 * Defines the record types stored in the DHT for:
 * - Peer location and capabilities (PeerRecord)
 * - Prekey bundles for E2E encryption setup (PrekeyRecord)
 * - Signaling messages for WebRTC connection establishment
 */

import { sha256 } from "@noble/hashes/sha2.js";
import {
  signMessage,
  verifySignature,
  generateFingerprint,
} from "../../crypto/primitives.js";
import type { NodeCapabilities } from "../../node/capabilities.js";
import type { PrekeyBundle } from "../../crypto/x3dh.js";
import type { DHTKey, DHTValue, NodeId } from "./types.js";

/**
 * Record types stored in DHT
 */
export enum DHTRecordType {
  /** Peer location and capability record */
  PEER = "peer",
  /** Prekey bundle for E2E encryption */
  PREKEY = "prekey",
  /** WebRTC signaling message */
  SIGNAL = "signal",
  /** Stored message for offline delivery */
  MESSAGE = "message",
}

/**
 * Address types for reaching a peer
 */
export type AddressType = "webrtc" | "websocket" | "ble" | "wifi-direct" | "tcp";

/**
 * Network address for a peer
 */
export interface PeerAddress {
  /** Address type */
  type: AddressType;
  /** Address string (URL, IP:port, etc.) */
  address: string;
  /** Priority (higher = preferred) */
  priority: number;
  /** Whether this address is currently active */
  active: boolean;
}

/**
 * Peer record - stored in DHT for peer discovery
 */
export interface PeerRecord {
  /** Record type identifier */
  recordType: DHTRecordType.PEER;
  /** 16-char hex peer ID (from Ed25519 public key fingerprint) */
  peerId: string;
  /** Ed25519 public key for identity verification */
  publicKey: Uint8Array;
  /** How to reach this peer */
  addresses: PeerAddress[];
  /** Node capabilities */
  capabilities: NodeCapabilities;
  /** Timestamp when record was created */
  timestamp: number;
  /** Record version (for updates) */
  version: number;
  /** Ed25519 signature over the record */
  signature: Uint8Array;
}

/**
 * Prekey record - stored in DHT for E2E session establishment
 */
export interface PrekeyRecord {
  /** Record type identifier */
  recordType: DHTRecordType.PREKEY;
  /** 16-char hex peer ID */
  peerId: string;
  /** Full prekey bundle */
  bundle: PrekeyBundle;
  /** Timestamp when record was created */
  timestamp: number;
  /** Ed25519 signature over the record */
  signature: Uint8Array;
}

/**
 * Signaling message - stored in DHT for WebRTC connection establishment
 */
export interface SignalRecord {
  /** Record type identifier */
  recordType: DHTRecordType.SIGNAL;
  /** Signal message ID */
  id: string;
  /** Sender peer ID */
  from: string;
  /** Recipient peer ID */
  to: string;
  /** Signal type */
  type: "offer" | "answer" | "ice-candidate";
  /** Signal payload (SDP or ICE candidate) */
  payload: string;
  /** Timestamp */
  timestamp: number;
  /** Expiration time */
  expiresAt: number;
  /** Signature from sender */
  signature: Uint8Array;
}

/**
 * Stored message record - for offline message delivery
 */
export interface MessageRecord {
  /** Record type identifier */
  recordType: DHTRecordType.MESSAGE;
  /** Message ID */
  id: string;
  /** Recipient peer ID */
  recipientId: string;
  /** Encrypted payload (E2E encrypted) */
  encryptedPayload: Uint8Array;
  /** Timestamp when stored */
  timestamp: number;
  /** Expiration time */
  expiresAt: number;
  /** Priority for delivery */
  priority: "high" | "normal" | "low";
  /** Sender peer ID */
  senderId: string;
  /** Signature from sender */
  signature: Uint8Array;
}

/**
 * Union type for all DHT records
 */
export type DHTRecord =
  | PeerRecord
  | PrekeyRecord
  | SignalRecord
  | MessageRecord;

/**
 * Generate DHT key for a peer record
 */
export function getPeerRecordKey(peerId: string): DHTKey {
  const data = new TextEncoder().encode(`peer:${peerId}`);
  return sha256(data);
}

/**
 * Generate DHT key for a prekey record
 */
export function getPrekeyRecordKey(peerId: string): DHTKey {
  const data = new TextEncoder().encode(`prekey:${peerId}`);
  return sha256(data);
}

/**
 * Generate DHT key for signaling messages to a peer
 */
export function getSignalRecordKey(toPeerId: string): DHTKey {
  const data = new TextEncoder().encode(`signal:${toPeerId}`);
  return sha256(data);
}

/**
 * Generate DHT key for stored messages to a peer
 */
export function getMessageRecordKey(recipientId: string): DHTKey {
  const data = new TextEncoder().encode(`message:${recipientId}`);
  return sha256(data);
}

/**
 * Create a signed peer record
 */
export function createPeerRecord(
  peerId: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  addresses: PeerAddress[],
  capabilities: NodeCapabilities,
  version: number = 1
): PeerRecord {
  const timestamp = Date.now();

  // Create unsigned record data for signing
  const recordData = {
    recordType: DHTRecordType.PEER,
    peerId,
    publicKey: Array.from(publicKey),
    addresses,
    capabilities,
    timestamp,
    version,
  };

  const dataToSign = new TextEncoder().encode(JSON.stringify(recordData));
  const signature = signMessage(dataToSign, privateKey);

  return {
    recordType: DHTRecordType.PEER,
    peerId,
    publicKey,
    addresses,
    capabilities,
    timestamp,
    version,
    signature,
  };
}

/**
 * Verify a peer record's signature
 */
export function verifyPeerRecord(record: PeerRecord): boolean {
  try {
    // Verify peer ID matches public key
    const expectedPeerId = generateFingerprint(record.publicKey);
    if (record.peerId !== expectedPeerId) {
      return false;
    }

    // Reconstruct the data that was signed
    const recordData = {
      recordType: DHTRecordType.PEER,
      peerId: record.peerId,
      publicKey: Array.from(record.publicKey),
      addresses: record.addresses,
      capabilities: record.capabilities,
      timestamp: record.timestamp,
      version: record.version,
    };

    const dataToVerify = new TextEncoder().encode(JSON.stringify(recordData));
    return verifySignature(dataToVerify, record.signature, record.publicKey);
  } catch {
    return false;
  }
}

/**
 * Create a signed prekey record
 */
export function createPrekeyRecord(
  peerId: string,
  bundle: PrekeyBundle,
  privateKey: Uint8Array
): PrekeyRecord {
  const timestamp = Date.now();

  // Create unsigned record data for signing
  const recordData = {
    recordType: DHTRecordType.PREKEY,
    peerId,
    bundle: {
      peerId: bundle.peerId,
      identityKey: Array.from(bundle.identityKey),
      signedPrekeyPublic: Array.from(bundle.signedPrekeyPublic),
      signedPrekeyId: bundle.signedPrekeyId,
      signedPrekeySignature: Array.from(bundle.signedPrekeySignature),
      oneTimePrekeyPublics: bundle.oneTimePrekeyPublics.map((otp) => ({
        id: otp.id,
        publicKey: Array.from(otp.publicKey),
      })),
      timestamp: bundle.timestamp,
    },
    timestamp,
  };

  const dataToSign = new TextEncoder().encode(JSON.stringify(recordData));
  const signature = signMessage(dataToSign, privateKey);

  return {
    recordType: DHTRecordType.PREKEY,
    peerId,
    bundle,
    timestamp,
    signature,
  };
}

/**
 * Verify a prekey record's signature
 */
export function verifyPrekeyRecord(record: PrekeyRecord): boolean {
  try {
    // The signature should be from the identity key in the bundle
    const recordData = {
      recordType: DHTRecordType.PREKEY,
      peerId: record.peerId,
      bundle: {
        peerId: record.bundle.peerId,
        identityKey: Array.from(record.bundle.identityKey),
        signedPrekeyPublic: Array.from(record.bundle.signedPrekeyPublic),
        signedPrekeyId: record.bundle.signedPrekeyId,
        signedPrekeySignature: Array.from(record.bundle.signedPrekeySignature),
        oneTimePrekeyPublics: record.bundle.oneTimePrekeyPublics.map((otp) => ({
          id: otp.id,
          publicKey: Array.from(otp.publicKey),
        })),
        timestamp: record.bundle.timestamp,
      },
      timestamp: record.timestamp,
    };

    const dataToVerify = new TextEncoder().encode(JSON.stringify(recordData));
    return verifySignature(
      dataToVerify,
      record.signature,
      record.bundle.identityKey
    );
  } catch {
    return false;
  }
}

/**
 * Create a signed signal record
 */
export function createSignalRecord(
  from: string,
  to: string,
  type: "offer" | "answer" | "ice-candidate",
  payload: string,
  privateKey: Uint8Array,
  ttlMs: number = 5 * 60 * 1000 // 5 minutes default
): SignalRecord {
  const id = `${from}-${to}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const timestamp = Date.now();
  const expiresAt = timestamp + ttlMs;

  const recordData = {
    recordType: DHTRecordType.SIGNAL,
    id,
    from,
    to,
    type,
    payload,
    timestamp,
    expiresAt,
  };

  const dataToSign = new TextEncoder().encode(JSON.stringify(recordData));
  const signature = signMessage(dataToSign, privateKey);

  return {
    recordType: DHTRecordType.SIGNAL,
    id,
    from,
    to,
    type,
    payload,
    timestamp,
    expiresAt,
    signature,
  };
}

/**
 * Create a signed message record for offline delivery
 */
export function createMessageRecord(
  senderId: string,
  recipientId: string,
  encryptedPayload: Uint8Array,
  privateKey: Uint8Array,
  priority: "high" | "normal" | "low" = "normal",
  ttlMs: number = 24 * 60 * 60 * 1000 // 24 hours default
): MessageRecord {
  const id = `msg-${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const timestamp = Date.now();
  const expiresAt = timestamp + ttlMs;

  const recordData = {
    recordType: DHTRecordType.MESSAGE,
    id,
    recipientId,
    encryptedPayload: Array.from(encryptedPayload),
    timestamp,
    expiresAt,
    priority,
    senderId,
  };

  const dataToSign = new TextEncoder().encode(JSON.stringify(recordData));
  const signature = signMessage(dataToSign, privateKey);

  return {
    recordType: DHTRecordType.MESSAGE,
    id,
    recipientId,
    encryptedPayload,
    timestamp,
    expiresAt,
    priority,
    senderId,
    signature,
  };
}

/**
 * Serialize a DHT record for storage
 */
export function serializeRecord(record: DHTRecord): Uint8Array {
  // Handle Uint8Array fields
  const serializableRecord = JSON.parse(
    JSON.stringify(record, (key, value) => {
      if (value instanceof Uint8Array) {
        return { __uint8array__: true, data: Array.from(value) };
      }
      return value;
    })
  );

  return new TextEncoder().encode(JSON.stringify(serializableRecord));
}

/**
 * Deserialize a DHT record from storage
 */
export function deserializeRecord(data: Uint8Array): DHTRecord {
  const json = new TextDecoder().decode(data);
  const parsed = JSON.parse(json, (key, value) => {
    if (value && typeof value === "object" && value.__uint8array__) {
      return new Uint8Array(value.data);
    }
    return value;
  });

  return parsed as DHTRecord;
}

/**
 * Convert a record to DHT value format
 */
export function recordToDHTValue(
  record: DHTRecord,
  publisherId: NodeId,
  ttl: number = 3600000 // 1 hour default
): DHTValue {
  return {
    data: serializeRecord(record),
    storedAt: Date.now(),
    ttl,
    publisherId,
  };
}

/**
 * Extract a record from DHT value format
 */
export function dhtValueToRecord(value: DHTValue): DHTRecord {
  return deserializeRecord(value.data);
}

/**
 * Check if a record is expired
 */
export function isRecordExpired(record: DHTRecord): boolean {
  if ("expiresAt" in record) {
    return Date.now() > record.expiresAt;
  }
  return false;
}

/**
 * Get the record type from a DHT record
 */
export function getRecordType(record: DHTRecord): DHTRecordType {
  return record.recordType;
}
