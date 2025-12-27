/**
 * Integration tests for crypto and protocol interaction
 */
import { generateIdentity, signMessage, verifySignature } from '../../core/src/crypto/primitives';
import type { Message } from '../../core/src/protocol/message';
import { encodeMessage, decodeMessage, MessageType } from '../../core/src/protocol/message';

describe('Crypto-Protocol Integration', () => {
  let identity: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeAll(() => {
    identity = generateIdentity();
  });

  describe('Message signing and verification', () => {
    it('should sign and verify a complete message', () => {
      // Create message with placeholder signature
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(64), // Zero placeholder
        },
        payload: new TextEncoder().encode('Test message'),
      };

      // Encode the entire message (including placeholder signature)
      const messageBytes = encodeMessage(message);
      
      // Sign the entire encoded message (Ed25519 produces 64-byte signature)
      const signature = signMessage(messageBytes, identity.privateKey);
      
      // Update message header with real signature (Ed25519 signature is already 64 bytes)
      message.header.signature = signature;

      // Encode the final message with real signature
      const encodedFinal = encodeMessage(message);
      
      // Decode to verify we can read it back
      const decoded = decodeMessage(encodedFinal);
      
      // To verify: we need to reconstruct the message with placeholder signature
      // and verify the signature was created from that
      const verifyMessage: Message = {
        header: {
          ...decoded.header,
          signature: new Uint8Array(64), // Use placeholder for verification
        },
        payload: decoded.payload,
      };
      const verifyBytes = encodeMessage(verifyMessage);
      
      const isValid = verifySignature(
        verifyBytes,
        decoded.header.signature.slice(0, 64),
        decoded.header.senderId
      );

      expect(isValid).toBe(true);
      expect(decoded.header.type).toBe(MessageType.TEXT);
      expect(new TextDecoder().decode(decoded.payload)).toBe('Test message');
    });

    it('should detect tampered messages', () => {
      // Create message with placeholder signature
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(64), // Zero placeholder
        },
        payload: new TextEncoder().encode('Original message'),
      };

      // Encode and sign (Ed25519 produces 64-byte signature)
      const messageBytes = encodeMessage(message);
      const signature = signMessage(messageBytes, identity.privateKey);
      
      // Update message header with real signature (Ed25519 signature is already 64 bytes)
      message.header.signature = signature;
      
      // Encode with real signature
      let encodedFinal = encodeMessage(message);
      
      // Decode first to get the message
      const decoded = decodeMessage(encodedFinal);
      
      // Now tamper with the decoded message
      const tamperedMessage: Message = {
        header: {
          ...decoded.header,
          ttl: 99, // Change TTL
        },
        payload: decoded.payload,
      };
      
      // Try to verify the tampered message (reconstruct with placeholder)
      const verifyMessage: Message = {
        header: {
          ...tamperedMessage.header,
          signature: new Uint8Array(64), // Placeholder
        },
        payload: tamperedMessage.payload,
      };
      const verifyBytes = encodeMessage(verifyMessage);
      
      const isValid = verifySignature(
        verifyBytes,
        decoded.header.signature.slice(0, 64),
        decoded.header.senderId
      );

      // Signature should be invalid because message was tampered
      expect(isValid).toBe(false);
    });
  });

  describe('End-to-end encryption flow', () => {
    it('should handle full encryption/decryption cycle', () => {
      // This would test the full E2E encryption flow
      // Currently a placeholder for future implementation
      expect(true).toBe(true);
    });
  });
});
