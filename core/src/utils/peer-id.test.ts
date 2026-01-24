/**
 * Tests for Peer ID Utilities
 */

import { extractPeerId, normalizePeerId, peerIdsEqual, PEER_ID_LENGTH } from './peer-id';

describe('Peer ID Utilities', () => {
  describe('PEER_ID_LENGTH constant', () => {
    it('should be 16 characters', () => {
      expect(PEER_ID_LENGTH).toBe(16);
    });
  });

  describe('extractPeerId()', () => {
    it('should extract first 16 hex characters from Uint8Array', () => {
      // 8 bytes = 16 hex characters
      const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0xAA, 0xBB]);
      const result = extractPeerId(bytes);

      expect(result).toBe('123456789ABCDEF0');
      expect(result.length).toBe(PEER_ID_LENGTH);
    });

    it('should return uppercase hex string', () => {
      const bytes = new Uint8Array([0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89]);
      const result = extractPeerId(bytes);

      expect(result).toBe('ABCDEF0123456789');
      expect(result).toBe(result.toUpperCase());
    });

    it('should pad single-digit bytes with leading zero', () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      const result = extractPeerId(bytes);

      expect(result).toBe('0102030405060708');
    });

    it('should only use first 8 bytes even if array is longer', () => {
      const bytes = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, // First 8 bytes
        0xFF, 0xFF, 0xFF, 0xFF  // Extra bytes (ignored)
      ]);
      const result = extractPeerId(bytes);

      expect(result).toBe('123456789ABCDEF0');
      expect(result).not.toContain('FF');
    });

    it('should handle empty-ish arrays gracefully', () => {
      const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = extractPeerId(bytes);

      expect(result).toBe('0000000000000000');
      expect(result.length).toBe(PEER_ID_LENGTH);
    });
  });

  describe('normalizePeerId()', () => {
    it('should convert to uppercase', () => {
      expect(normalizePeerId('abcdef')).toBe('ABCDEF');
    });

    it('should remove whitespace', () => {
      expect(normalizePeerId('AB CD EF')).toBe('ABCDEF');
      expect(normalizePeerId(' ABCD EF ')).toBe('ABCDEF');
      // Note: Currently only removes space characters, not tabs/newlines
      // This is intentional - peer IDs shouldn't have tabs/newlines anyway
    });

    it('should handle already-normalized IDs', () => {
      const normalized = 'ABCDEF0123456789';
      expect(normalizePeerId(normalized)).toBe(normalized);
    });

    it('should handle mixed case and spaces', () => {
      expect(normalizePeerId('aB cD eF 01 23 45')).toBe('ABCDEF012345');
    });
  });

  describe('peerIdsEqual()', () => {
    it('should return true for identical IDs', () => {
      const id = '123456789ABCDEF0';
      expect(peerIdsEqual(id, id)).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(peerIdsEqual('abcdef', 'ABCDEF')).toBe(true);
      expect(peerIdsEqual('ABCDEF', 'abcdef')).toBe(true);
      expect(peerIdsEqual('AbCdEf', 'aBcDeF')).toBe(true);
    });

    it('should ignore whitespace', () => {
      expect(peerIdsEqual('AB CD EF', 'ABCDEF')).toBe(true);
      expect(peerIdsEqual('ABCDEF', 'AB CD EF')).toBe(true);
      expect(peerIdsEqual(' AB CD ', 'ABCD')).toBe(true);
    });

    it('should handle combined case and whitespace differences', () => {
      expect(peerIdsEqual('ab cd ef', 'AB CD EF')).toBe(true);
      expect(peerIdsEqual(' abc def ', 'ABCDEF')).toBe(true);
    });

    it('should return false for different IDs', () => {
      expect(peerIdsEqual('123456', '654321')).toBe(false);
      expect(peerIdsEqual('ABCDEF', 'FEDCBA')).toBe(false);
    });

    it('should handle real peer ID examples', () => {
      const peerId1 = '4214EF6D493D9B7F';
      const peerId2 = '4214ef6d493d9b7f';
      const peerId3 = '4214 EF6D 493D 9B7F';

      expect(peerIdsEqual(peerId1, peerId2)).toBe(true);
      expect(peerIdsEqual(peerId1, peerId3)).toBe(true);
      expect(peerIdsEqual(peerId2, peerId3)).toBe(true);
    });
  });

  describe('Integration: extractPeerId + peerIdsEqual', () => {
    it('should properly compare extracted peer IDs', () => {
      const bytes1 = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
      const bytes2 = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0]);
      const bytes3 = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

      const id1 = extractPeerId(bytes1);
      const id2 = extractPeerId(bytes2);
      const id3 = extractPeerId(bytes3);

      expect(peerIdsEqual(id1, id2)).toBe(true);
      expect(peerIdsEqual(id1, id3)).toBe(false);
    });

    it('should match IDs regardless of extraction format', () => {
      const bytes = new Uint8Array([0xAB, 0xCD, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89]);
      const extracted = extractPeerId(bytes);
      const manual = 'abcdef0123456789';

      expect(peerIdsEqual(extracted, manual)).toBe(true);
    });
  });
});
