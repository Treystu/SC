/**
 * Message types in the Sovereign Communications protocol
 * Task 1: Define binary message format
 */
export enum MessageType {
  TEXT = 0x01,
  FILE = 0x02,
  VOICE = 0x03,
  CONTROL = 0x04,
  PEER_ANNOUNCE = 0x05,
  PEER_INTRODUCE = 0x06,
  HEARTBEAT = 0x07,
  ACK = 0x08,
}

/**
 * Binary message header structure
 * Total size: 111 bytes (fixed)
 * Fields: version(1) + type(1) + ttl(1) + timestamp(8) + senderId(32) + signature(64) + payloadLength(4)
 */
export interface MessageHeader {
  version: number;        // 1 byte - Protocol version
  type: MessageType;      // 1 byte - Message type
  ttl: number;           // 1 byte - Time to live (hop count)
  timestamp: number;     // 8 bytes - Unix timestamp in milliseconds
  senderId: Uint8Array;  // 32 bytes - Ed25519 public key of sender
  signature: Uint8Array; // 64 bytes - Ed25519 signature
  payloadLength: number; // 4 bytes - Length of encrypted payload
}

/**
 * Complete message structure
 */
export interface Message {
  header: MessageHeader;
  payload: Uint8Array;   // Encrypted with ChaCha20-Poly1305
}

/**
 * Decrypted message content
 */
export interface MessageContent {
  recipientId?: Uint8Array; // Optional: specific recipient (null for broadcast)
  contentType: string;       // MIME type for payload
  data: Uint8Array;          // Actual message data
  metadata?: Record<string, unknown>; // Optional metadata
}

/**
 * Session key for perfect forward secrecy (Task 9)
 */
export interface SessionKey {
  keyId: Uint8Array;     // 32 bytes - Unique identifier for this session key
  key: Uint8Array;       // 32 bytes - ChaCha20 key
  nonce: Uint8Array;     // 12 bytes - ChaCha20-Poly1305 nonce
  createdAt: number;     // Timestamp when key was created
  expiresAt: number;     // Timestamp when key expires
}

/**
 * Message priority levels (Task 21)
 */
export enum MessagePriority {
  CONTROL = 0,   // Highest priority
  VOICE = 1,
  TEXT = 2,
  FILE = 3,      // Lowest priority
}

/**
 * Protocol constants
 */
export const PROTOCOL_VERSION = 1;
export const MAX_TTL = 16;
export const HEADER_SIZE = 111; // 1 + 1 + 1 + 8 + 32 + 64 + 4
export const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB max payload
export const SESSION_KEY_LIFETIME = 3600000; // 1 hour in milliseconds
export const MAX_FRAGMENT_SIZE = 64 * 1024; // 64KB per fragment
