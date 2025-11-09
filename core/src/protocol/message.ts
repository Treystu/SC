/**
 * Binary Message Format for Sovereign Communications
 * 
 * Header Structure (fixed 64 bytes):
 * - Version (1 byte): Protocol version
 * - Type (1 byte): Message type
 * - TTL (1 byte): Time-to-live for mesh routing
 * - Reserved (1 byte): Reserved for future use
 * - Timestamp (8 bytes): Unix timestamp in milliseconds
 * - Sender ID (32 bytes): Ed25519 public key
 * - Signature (64 bytes): Ed25519 signature
 * 
 * Body:
 * - Encrypted payload (variable length)
 */

export enum MessageType {
  TEXT = 0x01,
  FILE_METADATA = 0x02,
  FILE_CHUNK = 0x03,
  VOICE = 0x04,
  CONTROL_ACK = 0x10,
  CONTROL_PING = 0x11,
  CONTROL_PONG = 0x12,
  PEER_DISCOVERY = 0x20,
  PEER_INTRODUCTION = 0x21,
  KEY_EXCHANGE = 0x30,
  SESSION_KEY = 0x31,
}

export const PROTOCOL_VERSION = 0x01;
export const HEADER_SIZE = 109; // 1 + 1 + 1 + 1 + 8 + 32 + 65 (compact signature)

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
 * Encode a message header to binary format
 */
export function encodeHeader(header: MessageHeader): Uint8Array {
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

  // Signature (65 bytes - compact format)
  buffer.set(header.signature, offset);

  return buffer;
}

/**
 * Decode a message header from binary format
 */
export function decodeHeader(buffer: Uint8Array): MessageHeader {
  if (buffer.length < HEADER_SIZE) {
    throw new Error(`Invalid header size: ${buffer.length}, expected ${HEADER_SIZE}`);
  }

  let offset = 0;

  const version = buffer[offset++];
  const type = buffer[offset++] as MessageType;
  const ttl = buffer[offset++];
  offset++; // Skip reserved byte

  // Timestamp (8 bytes, big-endian)
  let timestamp = 0;
  for (let i = 0; i < 8; i++) {
    timestamp = (timestamp * 256) + buffer[offset++];
  }

  // Sender ID (32 bytes)
  const senderId = buffer.slice(offset, offset + 32);
  offset += 32;

  // Signature (65 bytes)
  const signature = buffer.slice(offset, offset + 65);

  return {
    version,
    type,
    ttl,
    timestamp,
    senderId,
    signature,
  };
}

/**
 * Encode a complete message (header + payload)
 */
export function encodeMessage(message: Message): Uint8Array {
  const headerBytes = encodeHeader(message.header);
  const result = new Uint8Array(headerBytes.length + message.payload.length);
  result.set(headerBytes, 0);
  result.set(message.payload, headerBytes.length);
  return result;
}

/**
 * Decode a complete message (header + payload)
 */
export function decodeMessage(buffer: Uint8Array): Message {
  const header = decodeHeader(buffer.slice(0, HEADER_SIZE));
  const payload = buffer.slice(HEADER_SIZE);
  return { header, payload };
}

/**
 * Create a message hash for deduplication
 */
export function messageHash(message: Message): string {
  const messageBytes = encodeMessage(message);
  
  // Use a simple hash for now (works in both browser and Node.js)
  // In production, this should use SHA-256
  let hash = 0;
  for (let i = 0; i < messageBytes.length; i++) {
    hash = ((hash << 5) - hash) + messageBytes[i];
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
