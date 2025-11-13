import {
  MessageType,
  encodeHeader,
  decodeHeader,
  encodeMessage,
  decodeMessage,
  messageHash,
  PROTOCOL_VERSION,
} from '../protocol/message';

describe('Message Protocol', () => {
  const mockSenderId = new Uint8Array(32).fill(1);
  const mockSignature = new Uint8Array(65).fill(2);

  describe('Header Encoding/Decoding', () => {
    it('should encode and decode headers correctly', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: MessageType.TEXT,
        ttl: 10,
        timestamp: Date.now(),
        senderId: mockSenderId,
        signature: mockSignature,
      };

      const encoded = encodeHeader(header);
      const decoded = decodeHeader(encoded);

      expect(decoded.version).toBe(header.version);
      expect(decoded.type).toBe(header.type);
      expect(decoded.ttl).toBe(header.ttl);
      expect(decoded.timestamp).toBe(header.timestamp);
      expect(decoded.senderId).toEqual(header.senderId);
      expect(decoded.signature).toEqual(header.signature);
    });

    it('should handle different message types', () => {
      const types = [
        MessageType.TEXT,
        MessageType.FILE_METADATA,
        MessageType.VOICE,
        MessageType.CONTROL_PING,
        MessageType.PEER_DISCOVERY,
      ];

      types.forEach(type => {
        const header = {
          version: PROTOCOL_VERSION,
          type,
          ttl: 5,
          timestamp: Date.now(),
          senderId: mockSenderId,
          signature: mockSignature,
        };

        const encoded = encodeHeader(header);
        const decoded = decodeHeader(encoded);

        expect(decoded.type).toBe(type);
      });
    });

    it('should handle timestamps correctly', () => {
      const timestamps = [0, 1000, Date.now(), Number.MAX_SAFE_INTEGER];

      timestamps.forEach(timestamp => {
        const header = {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp,
          senderId: mockSenderId,
          signature: mockSignature,
        };

        const encoded = encodeHeader(header);
        const decoded = decodeHeader(encoded);

        expect(decoded.timestamp).toBe(timestamp);
      });
    });

    it('should throw on invalid header size', () => {
      const tooSmall = new Uint8Array(50);
      expect(() => decodeHeader(tooSmall)).toThrow();
    });
  });

  describe('Message Encoding/Decoding', () => {
    it('should encode and decode complete messages', () => {
      const payload = new TextEncoder().encode('Hello, mesh!');
      const message = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload,
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded.header.version).toBe(message.header.version);
      expect(decoded.header.type).toBe(message.header.type);
      expect(decoded.payload).toEqual(message.payload);
    });

    it('should handle empty payloads', () => {
      const message = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.CONTROL_PING,
          ttl: 10,
          timestamp: Date.now(),
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: new Uint8Array(0),
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded.payload.length).toBe(0);
    });

    it('should handle large payloads', () => {
      const largePayload = new Uint8Array(10000).fill(42);
      const message = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.FILE_CHUNK,
          ttl: 5,
          timestamp: Date.now(),
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: largePayload,
      };

      const encoded = encodeMessage(message);
      const decoded = decodeMessage(encoded);

      expect(decoded.payload).toEqual(largePayload);
    });
  });

  describe('Message Hashing', () => {
    it('should generate consistent hashes', () => {
      const message = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: 12345,
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: new TextEncoder().encode('test'),
      };

      const hash1 = messageHash(message);
      const hash2 = messageHash(message);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different messages', () => {
      const message1 = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: 12345,
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: new TextEncoder().encode('test1'),
      };

      const message2 = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: 12345,
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: new TextEncoder().encode('test2'),
      };

      const hash1 = messageHash(message1);
      const hash2 = messageHash(message2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
