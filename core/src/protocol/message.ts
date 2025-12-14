/**
 * Binary Message Format for Sovereign Communications
 *
 * Wire Protocol Documentation:
 * ===========================
 *
 * Endianness: All multi-byte integers use Big Endian (network byte order)
 *
 * Header Structure (fixed 108 bytes):
 * Offset | Size | Field      | Description
 * -------|------|------------|------------------------------------------
 * 0      | 1    | Version    | Protocol version (current: 0x01)
 * 1      | 1    | Type       | Message type (see MessageType enum)
 * 2      | 1    | TTL        | Time-to-live for mesh routing (max: 255)
 * 3      | 1    | Reserved   | Reserved for future use (must be 0x00)
 * 4      | 8    | Timestamp  | Unix timestamp in milliseconds (big-endian)
 * 12     | 32   | Sender ID  | Ed25519 public key of sender
 * 44     | 64   | Signature  | Compact Ed25519 signature of message
 *
 * Body:
 * - Encrypted payload (variable length, max: MAX_PAYLOAD_SIZE)
 *
 * Version Migration:
 * - v1 (0x01): Initial protocol version
 * - Future versions will maintain backward compatibility where possible
 */

import { sha256 } from "@noble/hashes/sha2.js";

export enum MessageType {
  // Data messages
  TEXT = 0x01,
  FILE_METADATA = 0x02,
  FILE_CHUNK = 0x03,
  VOICE = 0x04,
  // Control messages
  CONTROL_ACK = 0x10,
  CONTROL_PING = 0x11,
  CONTROL_PONG = 0x12,
  // Peer management
  PEER_DISCOVERY = 0x20,
  PEER_INTRODUCTION = 0x21,
  // Cryptographic
  KEY_EXCHANGE = 0x30,
  SESSION_KEY = 0x31,
  // DHT / Kademlia
  DHT_FIND_NODE = 0x40,
  DHT_FOUND_NODES = 0x41,
  DHT_FIND_VALUE = 0x42,
  DHT_STORE = 0x43,
  DHT_STORE_ACK = 0x44,
  DHT_FOUND_VALUE = 0x45,
  // Self-update
  UPDATE_MANIFEST = 0x50,
}

// Protocol constants
export const PROTOCOL_VERSION = 0x01;
export const MIN_SUPPORTED_VERSION = 0x01;
export const MAX_SUPPORTED_VERSION = 0x01;
export const HEADER_SIZE = 108; // 1 + 1 + 1 + 1 + 8 + 32 + 64 (compact signature)
export const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1 MB max payload
export const MAX_TTL = 255;

export interface MessageHeader {
  version: number;
  type: MessageType;
  ttl: number;
  timestamp: number;
  senderId: Uint8Array;
  signature: Uint8Array;
}

export interface Message {
  header: MessageHeader;
  payload: Uint8Array;
}

/**
 * Validation error with detailed context
 */
export class MessageValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
  ) {
    super(message);
    this.name = "MessageValidationError";
  }
}

/**
 * Validate message header fields
 * @throws {MessageValidationError} if validation fails
 */
export function validateHeader(header: MessageHeader): void {
  // Validate version
  if (
    header.version < MIN_SUPPORTED_VERSION ||
    header.version > MAX_SUPPORTED_VERSION
  ) {
    throw new MessageValidationError(
      `Unsupported protocol version: ${header.version}. Supported: ${MIN_SUPPORTED_VERSION}-${MAX_SUPPORTED_VERSION}`,
      "version",
      header.version,
    );
  }

  // Validate message type
  const validTypes = Object.values(MessageType).filter(
    (v) => typeof v === "number",
  );
  if (!validTypes.includes(header.type)) {
    throw new MessageValidationError(
      `Invalid message type: 0x${header.type.toString(16).padStart(2, "0")}`,
      "type",
      header.type,
    );
  }

  // Validate TTL
  if (header.ttl < 0 || header.ttl > MAX_TTL) {
    throw new MessageValidationError(
      `Invalid TTL: ${header.ttl}. Must be 0-${MAX_TTL}`,
      "ttl",
      header.ttl,
    );
  }

  // Validate timestamp
  if (!Number.isSafeInteger(header.timestamp) || header.timestamp < 0) {
    throw new MessageValidationError(
      `Invalid timestamp: ${header.timestamp}`,
      "timestamp",
      header.timestamp,
    );
  }

  // Validate sender ID size
  if (header.senderId.length !== 32) {
    throw new MessageValidationError(
      `Invalid sender ID length: ${header.senderId.length}. Expected: 32`,
      "senderId",
      header.senderId.length,
    );
  }

  // Validate signature size
  // Ed25519 signatures can be 64 bytes (standard) or 65 bytes (compact with recovery byte)
  if (header.signature.length !== 64 && header.signature.length !== 65) {
    throw new MessageValidationError(
      `Invalid signature length: ${header.signature.length}. Expected: 64 or 65`,
      "signature",
      header.signature.length,
    );
  }
}

/**
 * Validate complete message
 * @throws {MessageValidationError} if validation fails
 */
export function validateMessage(message: Message): void {
  validateHeader(message.header);

  // Validate payload size
  if (message.payload.length > MAX_PAYLOAD_SIZE) {
    throw new MessageValidationError(
      `Payload too large: ${message.payload.length} bytes. Max: ${MAX_PAYLOAD_SIZE}`,
      "payload",
      message.payload.length,
    );
  }
}

/**
 * Encode a message header to binary format (Big Endian)
 * @throws {MessageValidationError} if header is invalid
 */
export function encodeHeader(header: MessageHeader): Uint8Array {
  // Validate before encoding
  validateHeader(header);

  const buffer = new Uint8Array(HEADER_SIZE);
  let offset = 0;

  // Version (1 byte)
  buffer[offset++] = header.version;

  // Type (1 byte)
  buffer[offset++] = header.type;

  // TTL (1 byte)
  buffer[offset++] = header.ttl;

  // Reserved (1 byte)
  buffer[offset++] = 0;

  // Timestamp (8 bytes, big-endian)
  const timestamp = BigInt(header.timestamp);
  for (let i = 7; i >= 0; i--) {
    buffer[offset++] = Number((timestamp >> BigInt(i * 8)) & BigInt(0xff));
  }

  // Sender ID (32 bytes)
  buffer.set(header.senderId, offset);
  offset += 32;

  // Signature (64 bytes - Ed25519 signature)
  buffer.set(header.signature, offset);

  return buffer;
}

/**
 * Decode a message header from binary format (Big Endian)
 * @throws {MessageValidationError} if buffer is invalid or too small
 */
export function decodeHeader(buffer: Uint8Array): MessageHeader {
  if (buffer.length < HEADER_SIZE) {
    throw new MessageValidationError(
      `Invalid header size: ${buffer.length} bytes. Expected: ${HEADER_SIZE} bytes`,
      "buffer",
      buffer.length,
    );
  }

  let offset = 0;

  const version = buffer[offset++];
  const type = buffer[offset++] as MessageType;
  const ttl = buffer[offset++];
  offset++; // Skip reserved byte

  // Timestamp (8 bytes, big-endian)
  let timestamp = 0;
  for (let i = 0; i < 8; i++) {
    timestamp = timestamp * 256 + buffer[offset++];
  }

  // Sender ID (32 bytes)
  const senderId = buffer.slice(offset, offset + 32);
  offset += 32;

  // Signature (64 bytes)
  const signature = buffer.slice(offset, offset + 64);

  const header: MessageHeader = {
    version,
    type,
    ttl,
    timestamp,
    senderId,
    signature,
  };

  // Validate decoded header
  validateHeader(header);

  return header;
}

/**
 * Encode a complete message (header + payload)
 * @throws {MessageValidationError} if message is invalid
 */
export function encodeMessage(message: Message): Uint8Array {
  // Validate before encoding
  validateMessage(message);

  const headerBytes = encodeHeader(message.header);
  const result = new Uint8Array(headerBytes.length + message.payload.length);
  result.set(headerBytes, 0);
  result.set(message.payload, headerBytes.length);
  return result;
}

/**
 * Decode a complete message (header + payload)
 * @throws {MessageValidationError} if buffer is invalid
 */
export function decodeMessage(buffer: Uint8Array): Message {
  if (buffer.length < HEADER_SIZE) {
    throw new MessageValidationError(
      `Buffer too small: ${buffer.length} bytes. Minimum: ${HEADER_SIZE} bytes`,
      "buffer",
      buffer.length,
    );
  }

  const header = decodeHeader(buffer.slice(0, HEADER_SIZE));
  const payload = buffer.slice(HEADER_SIZE);

  const message: Message = { header, payload };

  // Validate complete message
  validateMessage(message);

  return message;
}

/**
 * Create a cryptographically secure message hash for deduplication
 * Uses SHA-256 for collision resistance
 */
export function messageHash(message: Message): string {
  const messageBytes = encodeMessage(message);
  const hash = sha256(messageBytes);

  // Convert to hex string
  return Array.from(hash)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Check if a version is supported
 */
export function isVersionSupported(version: number): boolean {
  return version >= MIN_SUPPORTED_VERSION && version <= MAX_SUPPORTED_VERSION;
}

/**
 * Get human-readable message type name
 */
export function getMessageTypeName(type: MessageType): string {
  const typeNames: Record<number, string> = {
    [MessageType.TEXT]: "TEXT",
    [MessageType.FILE_METADATA]: "FILE_METADATA",
    [MessageType.FILE_CHUNK]: "FILE_CHUNK",
    [MessageType.VOICE]: "VOICE",
    [MessageType.CONTROL_ACK]: "CONTROL_ACK",
    [MessageType.CONTROL_PING]: "CONTROL_PING",
    [MessageType.CONTROL_PONG]: "CONTROL_PONG",
    [MessageType.PEER_DISCOVERY]: "PEER_DISCOVERY",
    [MessageType.PEER_INTRODUCTION]: "PEER_INTRODUCTION",
    [MessageType.KEY_EXCHANGE]: "KEY_EXCHANGE",
    [MessageType.SESSION_KEY]: "SESSION_KEY",
    [MessageType.DHT_FIND_NODE]: "DHT_FIND_NODE",
    [MessageType.DHT_FOUND_NODES]: "DHT_FOUND_NODES",
    [MessageType.DHT_FIND_VALUE]: "DHT_FIND_VALUE",
    [MessageType.DHT_STORE]: "DHT_STORE",
    [MessageType.DHT_STORE_ACK]: "DHT_STORE_ACK",
    [MessageType.DHT_FOUND_VALUE]: "DHT_FOUND_VALUE",
    [MessageType.UPDATE_MANIFEST]: "UPDATE_MANIFEST",
  };
  return typeNames[type] || `UNKNOWN(0x${type.toString(16).padStart(2, "0")})`;
}
