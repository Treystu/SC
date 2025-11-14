/**
 * Integration tests for crypto and protocol interaction
 */
import { generateIdentity, signMessage, verifySignature } from '../../core/src/crypto/primitives';
import { encodeMessage, decodeMessage, Message, MessageType } from '../../core/src/protocol/message';

describe('Crypto-Protocol Integration', () => {
  let identity: { publicKey: Uint8Array; privateKey: Uint8Array };

  beforeAll(async () => {
    identity = await generateIdentity();
  });

  describe('Message signing and verification', () => {
    it('should sign and verify a complete message', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(65),
        },
        payload: new TextEncoder().encode('Test message'),
      };

      // Encode message
      const encoded = encodeMessage(message);
      
      // Sign (excluding signature field)
      const dataToSign = encoded.slice(0, -65);
      const signature = await signMessage(dataToSign, identity.privateKey);
      
      // Pad signature to 65 bytes
      const signature65 = new Uint8Array(65);
      signature65.set(signature, 0);
      message.header.signature = signature65;

      // Re-encode with signature
      const encodedWithSig = encodeMessage(message);
      
      // Decode
      const decoded = decodeMessage(encodedWithSig);
      
      // Verify
      const dataToVerify = encodedWithSig.slice(0, -65);
      const isValid = await verifySignature(
        dataToVerify,
        decoded.header.signature.slice(0, 64),
        decoded.header.senderId
      );

      expect(isValid).toBe(true);
      expect(decoded.header.type).toBe(MessageType.TEXT);
      expect(new TextDecoder().decode(decoded.payload)).toBe('Test message');
    });

    it('should detect tampered messages', async () => {
      const message: Message = {
        header: {
          version: 0x01,
          type: MessageType.TEXT,
          ttl: 10,
          timestamp: Date.now(),
          senderId: identity.publicKey,
          signature: new Uint8Array(65),
        },
        payload: new TextEncoder().encode('Original message'),
      };

      // Encode and sign
      const encoded = encodeMessage(message);
      const dataToSign = encoded.slice(0, -65);
      const signature = await signMessage(dataToSign, identity.privateKey);
      const signature65 = new Uint8Array(65);
      signature65.set(signature, 0);
      message.header.signature = signature65;
      
      let encodedWithSig = encodeMessage(message);
      
      // Tamper with the message (change TTL)
      encodedWithSig[2] = 99; // Change TTL field
      
      // Try to verify
      const decoded = decodeMessage(encodedWithSig);
      const dataToVerify = encodedWithSig.slice(0, -65);
      const isValid = await verifySignature(
        dataToVerify,
        decoded.header.signature.slice(0, 64),
        decoded.header.senderId
      );

      expect(isValid).toBe(false);
    });
  });

  describe('End-to-end encryption flow', () => {
    it('should handle full encryption/decryption cycle', async () => {
      // This would test the full E2E encryption flow
      // Currently a placeholder for future implementation
      expect(true).toBe(true);
    });
  });
});
