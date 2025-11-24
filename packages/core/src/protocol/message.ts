import { sha256 } from '@noble/hashes/sha256';
import {
  Message,
  MessageHeader,
  MessageContent,
  MessageType,
  PROTOCOL_VERSION,
  HEADER_SIZE,
} from '../types';
import { signMessage, verifySignature } from '../crypto';

/**
 * Task 1: Define binary message format
 * Serializes a message header to binary format
 */
export function serializeHeader(header: MessageHeader): Uint8Array {
  const buffer = new Uint8Array(HEADER_SIZE);
  let offset = 0;

  // Version (1 byte)
  buffer[offset++] = header.version;

  // Type (1 byte)
  buffer[offset++] = header.type;

  // TTL (1 byte)
  buffer[offset++] = header.ttl;

  // Timestamp (8 bytes, big-endian)
  const view = new DataView(buffer.buffer);
  view.setBigUint64(offset, BigInt(header.timestamp), false);
  offset += 8;

  // Sender ID (32 bytes)
  buffer.set(header.senderId, offset);
  offset += 32;

  // Signature (64 bytes)
  buffer.set(header.signature, offset);
  offset += 64;

  // Payload length (4 bytes, big-endian)
  view.setUint32(offset, header.payloadLength, false);

  return buffer;
}

/**
 * Task 1: Define binary message format
 * Deserializes a message header from binary format
 */
export function deserializeHeader(buffer: Uint8Array): MessageHeader {
  if (buffer.length < HEADER_SIZE) {
    throw new Error(`Invalid header size: expected ${HEADER_SIZE}, got ${buffer.length}`);
  }

  let offset = 0;

  const version = buffer[offset++];
  const type = buffer[offset++] as MessageType;
  const ttl = buffer[offset++];

  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const timestamp = Number(view.getBigUint64(offset, false));
  offset += 8;

  const senderId = buffer.slice(offset, offset + 32);
  offset += 32;

  const signature = buffer.slice(offset, offset + 64);
  offset += 64;

  const payloadLength = view.getUint32(offset, false);

  return {
    version,
    type,
    ttl,
    timestamp,
    senderId,
    signature,
    payloadLength,
  };
}

/**
 * Serializes a complete message
 */
export function serializeMessage(message: Message): Uint8Array {
  const headerBytes = serializeHeader(message.header);
  const result = new Uint8Array(headerBytes.length + message.payload.length);
  result.set(headerBytes, 0);
  result.set(message.payload, headerBytes.length);
  return result;
}

/**
 * Deserializes a complete message
 */
export function deserializeMessage(buffer: Uint8Array): Message {
  const header = deserializeHeader(buffer.slice(0, HEADER_SIZE));
  const payload = buffer.slice(HEADER_SIZE, HEADER_SIZE + header.payloadLength);

  if (payload.length !== header.payloadLength) {
    throw new Error(
      `Payload size mismatch: expected ${header.payloadLength}, got ${payload.length}`
    );
  }

  return { header, payload };
}

/**
 * Creates a message header and signs it
 */
export function createMessageHeader(
  type: MessageType,
  ttl: number,
  senderId: Uint8Array,
  privateKey: Uint8Array,
  payloadLength: number
): MessageHeader {
  const header: MessageHeader = {
    version: PROTOCOL_VERSION,
    type,
    ttl,
    timestamp: Date.now(),
    senderId,
    signature: new Uint8Array(64), // Placeholder
    payloadLength,
  };

  // Create data to sign (everything except signature)
  const dataToSign = new Uint8Array(HEADER_SIZE - 64);
  let offset = 0;
  dataToSign[offset++] = header.version;
  dataToSign[offset++] = header.type;
  dataToSign[offset++] = header.ttl;

  const view = new DataView(dataToSign.buffer);
  view.setBigUint64(offset, BigInt(header.timestamp), false);
  offset += 8;

  dataToSign.set(header.senderId, offset);
  offset += 32;

  view.setUint32(offset, header.payloadLength, false);

  // Sign the header
  header.signature = signMessage(dataToSign, privateKey);

  return header;
}

/**
 * Verifies a message header signature
 */
export function verifyMessageHeader(header: MessageHeader): boolean {
  const dataToVerify = new Uint8Array(HEADER_SIZE - 64);
  let offset = 0;
  dataToVerify[offset++] = header.version;
  dataToVerify[offset++] = header.type;
  dataToVerify[offset++] = header.ttl;

  const view = new DataView(dataToVerify.buffer);
  view.setBigUint64(offset, BigInt(header.timestamp), false);
  offset += 8;

  dataToVerify.set(header.senderId, offset);
  offset += 32;

  view.setUint32(offset, header.payloadLength, false);

  return verifySignature(dataToVerify, header.signature, header.senderId);
}

/**
 * Serializes message content to bytes
 */
export function serializeContent(content: MessageContent): Uint8Array {
  const recipientIdLen = content.recipientId ? content.recipientId.length : 0;
  const contentTypeBytes = new TextEncoder().encode(content.contentType);
  const metadataBytes = content.metadata
    ? new TextEncoder().encode(JSON.stringify(content.metadata))
    : new Uint8Array(0);

  const totalLen =
    1 + recipientIdLen + 2 + contentTypeBytes.length + content.data.length + 4 + metadataBytes.length;
  const buffer = new Uint8Array(totalLen);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  // Recipient ID presence flag and data
  if (content.recipientId) {
    buffer[offset++] = 1;
    buffer.set(content.recipientId, offset);
    offset += recipientIdLen;
  } else {
    buffer[offset++] = 0;
  }

  // Content type length and data
  view.setUint16(offset, contentTypeBytes.length, false);
  offset += 2;
  buffer.set(contentTypeBytes, offset);
  offset += contentTypeBytes.length;

  // Message data
  buffer.set(content.data, offset);
  offset += content.data.length;

  // Metadata length and data
  view.setUint32(offset, metadataBytes.length, false);
  offset += 4;
  if (metadataBytes.length > 0) {
    buffer.set(metadataBytes, offset);
  }

  return buffer;
}

/**
 * Deserializes message content from bytes
 */
export function deserializeContent(buffer: Uint8Array): MessageContent {
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  let offset = 0;

  // Recipient ID
  const hasRecipient = buffer[offset++] === 1;
  const recipientId = hasRecipient ? buffer.slice(offset, offset + 32) : undefined;
  if (hasRecipient) offset += 32;

  // Content type
  const contentTypeLen = view.getUint16(offset, false);
  offset += 2;
  const contentType = new TextDecoder().decode(buffer.slice(offset, offset + contentTypeLen));
  offset += contentTypeLen;

  // Metadata length
  const metadataLen = view.getUint32(buffer.length - 4, false);
  
  // Message data (everything between content type and metadata)
  const dataLen = buffer.length - offset - 4 - metadataLen;
  const data = buffer.slice(offset, offset + dataLen);
  offset += dataLen;

  // Skip metadata length field
  offset += 4;

  // Metadata
  let metadata: Record<string, unknown> | undefined;
  if (metadataLen > 0) {
    const metadataStr = new TextDecoder().decode(buffer.slice(offset, offset + metadataLen));
    metadata = JSON.parse(metadataStr);
  }

  return {
    recipientId,
    contentType,
    data,
    metadata,
  };
}

/**
 * Computes hash of a message for deduplication
 */
export function hashMessage(message: Message): Uint8Array {
  const serialized = serializeMessage(message);
  return sha256(serialized);
}
