import {
  MessageType,
  encodeHeader,
  decodeHeader,
  encodeMessage,
  decodeMessage,
  messageHash,
  PROTOCOL_VERSION,
  MessageValidationError,
  validateHeader,
  validateMessage,
  isVersionSupported,
  getMessageTypeName,
  MAX_PAYLOAD_SIZE,
  MAX_TTL,
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

  describe('Message Validation', () => {
    it('should validate correct headers', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: MessageType.TEXT,
        ttl: 10,
        timestamp: Date.now(),
        senderId: mockSenderId,
        signature: mockSignature,
      };

      expect(() => validateHeader(header)).not.toThrow();
    });

    it('should reject invalid version', () => {
      const header = {
        version: 0xFF,
        type: MessageType.TEXT,
        ttl: 10,
        timestamp: Date.now(),
        senderId: mockSenderId,
        signature: mockSignature,
      };

      expect(() => validateHeader(header)).toThrow(MessageValidationError);
      expect(() => validateHeader(header)).toThrow(/version/i);
    });

    it('should reject invalid message type', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: 0xFF as MessageType,
        ttl: 10,
        timestamp: Date.now(),
        senderId: mockSenderId,
        signature: mockSignature,
      };

      expect(() => validateHeader(header)).toThrow(MessageValidationError);
      expect(() => validateHeader(header)).toThrow(/type/i);
    });

    it('should reject invalid TTL', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: MessageType.TEXT,
        ttl: MAX_TTL + 1,
        timestamp: Date.now(),
        senderId: mockSenderId,
        signature: mockSignature,
      };

      expect(() => validateHeader(header)).toThrow(MessageValidationError);
      expect(() => validateHeader(header)).toThrow(/TTL/i);
    });

    it('should reject invalid timestamp', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: MessageType.TEXT,
        ttl: 10,
        timestamp: -1,
        senderId: mockSenderId,
        signature: mockSignature,
      };

      expect(() => validateHeader(header)).toThrow(MessageValidationError);
      expect(() => validateHeader(header)).toThrow(/timestamp/i);
    });

    it('should reject invalid sender ID length', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: MessageType.TEXT,
        ttl: 10,
        timestamp: Date.now(),
        senderId: new Uint8Array(16), // Wrong size
        signature: mockSignature,
      };

      expect(() => validateHeader(header)).toThrow(MessageValidationError);
      expect(() => validateHeader(header)).toThrow(/sender ID/i);
    });

    it('should reject invalid signature length', () => {
      const header = {
        version: PROTOCOL_VERSION,
        type: MessageType.TEXT,
        ttl: 10,
        timestamp: Date.now(),
        senderId: mockSenderId,
        signature: new Uint8Array(32), // Wrong size
      };

      expect(() => validateHeader(header)).toThrow(MessageValidationError);
      expect(() => validateHeader(header)).toThrow(/signature/i);
    });

    it('should reject payload too large', () => {
      const message = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: new Uint8Array(MAX_PAYLOAD_SIZE + 1),
      };

      expect(() => validateMessage(message)).toThrow(MessageValidationError);
      expect(() => validateMessage(message)).toThrow(/too large/i);
    });

    it('should accept maximum payload size', () => {
      const message = {
        header: {
          version: PROTOCOL_VERSION,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: mockSenderId,
          signature: mockSignature,
        },
        payload: new Uint8Array(MAX_PAYLOAD_SIZE),
      };

      expect(() => validateMessage(message)).not.toThrow();
    });
  });

  describe('Version Support', () => {
    it('should recognize supported versions', () => {
      expect(isVersionSupported(0x01)).toBe(true);
    });

    it('should reject unsupported versions', () => {
      expect(isVersionSupported(0x00)).toBe(false);
      expect(isVersionSupported(0xFF)).toBe(false);
    });
  });

  describe('Message Type Names', () => {
    it('should return correct names for known types', () => {
      expect(getMessageTypeName(MessageType.TEXT)).toBe('TEXT');
      expect(getMessageTypeName(MessageType.CONTROL_PING)).toBe('CONTROL_PING');
      expect(getMessageTypeName(MessageType.KEY_EXCHANGE)).toBe('KEY_EXCHANGE');
    });

    it('should handle unknown types', () => {
      const unknownType = 0xFF as MessageType;
      const name = getMessageTypeName(unknownType);
      expect(name).toContain('UNKNOWN');
      expect(name).toContain('ff');
    });
  });

  describe('Fuzzing Tests', () => {
    it('should handle random malformed headers', () => {
      for (let i = 0; i < 100; i++) {
        const randomBuffer = new Uint8Array(Math.floor(Math.random() * 200));
        crypto.getRandomValues(randomBuffer);
        
        // Should either decode successfully or throw validation error
        try {
          const decoded = decodeHeader(randomBuffer);
          // If it decoded, validate should catch issues
          if (randomBuffer.length >= 109) {
            // May pass or fail validation depending on random data
            try {
              validateHeader(decoded);
            } catch (e) {
              expect(e).toBeInstanceOf(MessageValidationError);
            }
          }
        } catch (e) {
          expect(e).toBeInstanceOf(MessageValidationError);
        }
      }
    });

    it('should handle random malformed messages', () => {
      for (let i = 0; i < 100; i++) {
        const randomBuffer = new Uint8Array(Math.floor(Math.random() * 2000));
        crypto.getRandomValues(randomBuffer);
        
        try {
          const decoded = decodeMessage(randomBuffer);
          // Validation should catch issues in random data
          try {
            validateMessage(decoded);
          } catch (e) {
            expect(e).toBeInstanceOf(MessageValidationError);
          }
        } catch (e) {
          expect(e).toBeInstanceOf(MessageValidationError);
        }
      }
    });
  });
});
