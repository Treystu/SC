import {
  serializeHeader,
  deserializeHeader,
  serializeMessage,
  deserializeMessage,
  createMessageHeader,
  verifyMessageHeader,
} from '../message';
import { MessageType } from '../../types';
import { generateIdentity } from '../../crypto';

describe('Protocol Message', () => {
  describe('Header serialization', () => {
    it('should serialize and deserialize a header', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        16,
        identity.publicKey,
        identity.privateKey,
        100
      );

      const serialized = serializeHeader(header);
      const deserialized = deserializeHeader(serialized);

      expect(deserialized.version).toBe(header.version);
      expect(deserialized.type).toBe(header.type);
      expect(deserialized.ttl).toBe(header.ttl);
      expect(deserialized.timestamp).toBe(header.timestamp);
      expect(deserialized.senderId).toEqual(header.senderId);
      expect(deserialized.signature).toEqual(header.signature);
      expect(deserialized.payloadLength).toBe(header.payloadLength);
    });
  });

  describe('Message serialization', () => {
    it('should serialize and deserialize a complete message', () => {
      const identity = generateIdentity();
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      const header = createMessageHeader(
        MessageType.TEXT,
        16,
        identity.publicKey,
        identity.privateKey,
        payload.length
      );

      const message = { header, payload };
      const serialized = serializeMessage(message);
      const deserialized = deserializeMessage(serialized);

      expect(deserialized.header.version).toBe(message.header.version);
      expect(deserialized.header.type).toBe(message.header.type);
      expect(deserialized.payload).toEqual(message.payload);
    });
  });

  describe('Header verification', () => {
    it('should verify a valid header signature', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        16,
        identity.publicKey,
        identity.privateKey,
        100
      );

      const isValid = verifyMessageHeader(header);
      expect(isValid).toBe(true);
    });

    it('should reject a tampered header', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        16,
        identity.publicKey,
        identity.privateKey,
        100
      );

      // Tamper with the payload length
      header.payloadLength = 200;

      const isValid = verifyMessageHeader(header);
      expect(isValid).toBe(false);
    });
  });
});
