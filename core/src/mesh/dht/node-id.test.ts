/**
 * Node ID Utilities Tests
 */

import {
  generateNodeId,
  nodeIdFromPublicKey,
  generateDHTKey,
  xorDistance,
  compareDistance,
  isCloser,
  bucketIndexFromDistance,
  getBucketIndex,
  nodeIdToHex,
  hexToNodeId,
  nodeIdsEqual,
  isValidNodeId,
  copyNodeId,
  sortByDistance,
  getClosestContacts,
  generateIdInBucket,
  NODE_ID_BYTES,
} from './node-id';

describe('Node ID Utilities', () => {
  describe('generateNodeId', () => {
    it('should generate a 20-byte node ID', () => {
      const nodeId = generateNodeId();
      expect(nodeId).toBeInstanceOf(Uint8Array);
      expect(nodeId.length).toBe(NODE_ID_BYTES);
    });

    it('should generate unique node IDs', () => {
      const id1 = generateNodeId();
      const id2 = generateNodeId();
      expect(nodeIdsEqual(id1, id2)).toBe(false);
    });
  });

  describe('nodeIdFromPublicKey', () => {
    it('should generate consistent node ID from public key', () => {
      const publicKey = new Uint8Array(32).fill(1);
      const id1 = nodeIdFromPublicKey(publicKey);
      const id2 = nodeIdFromPublicKey(publicKey);
      
      expect(id1.length).toBe(NODE_ID_BYTES);
      expect(nodeIdsEqual(id1, id2)).toBe(true);
    });

    it('should generate different IDs for different public keys', () => {
      const pk1 = new Uint8Array(32).fill(1);
      const pk2 = new Uint8Array(32).fill(2);
      
      const id1 = nodeIdFromPublicKey(pk1);
      const id2 = nodeIdFromPublicKey(pk2);
      
      expect(nodeIdsEqual(id1, id2)).toBe(false);
    });
  });

  describe('generateDHTKey', () => {
    it('should generate key from string', () => {
      const key = generateDHTKey('test-key');
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(NODE_ID_BYTES);
    });

    it('should generate key from Uint8Array', () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const key = generateDHTKey(data);
      expect(key.length).toBe(NODE_ID_BYTES);
    });

    it('should generate consistent keys', () => {
      const key1 = generateDHTKey('test');
      const key2 = generateDHTKey('test');
      expect(nodeIdsEqual(key1, key2)).toBe(true);
    });
  });

  describe('xorDistance', () => {
    it('should compute XOR distance', () => {
      const a = new Uint8Array([0xFF, 0x00]);
      const b = new Uint8Array([0x00, 0xFF]);
      const distance = xorDistance(a, b);
      
      expect(distance[0]).toBe(0xFF);
      expect(distance[1]).toBe(0xFF);
    });

    it('should return zero for same IDs', () => {
      const a = new Uint8Array([0xFF, 0x0F]);
      const distance = xorDistance(a, a);
      
      expect(distance[0]).toBe(0);
      expect(distance[1]).toBe(0);
    });

    it('should throw for mismatched lengths', () => {
      const a = new Uint8Array([0xFF]);
      const b = new Uint8Array([0xFF, 0xFF]);
      
      expect(() => xorDistance(a, b)).toThrow();
    });
  });

  describe('compareDistance', () => {
    it('should return 0 for equal distances', () => {
      const a = new Uint8Array([0x10, 0x20]);
      const b = new Uint8Array([0x10, 0x20]);
      expect(compareDistance(a, b)).toBe(0);
    });

    it('should return -1 when a < b', () => {
      const a = new Uint8Array([0x10, 0x20]);
      const b = new Uint8Array([0x20, 0x10]);
      expect(compareDistance(a, b)).toBe(-1);
    });

    it('should return 1 when a > b', () => {
      const a = new Uint8Array([0x20, 0x10]);
      const b = new Uint8Array([0x10, 0x20]);
      expect(compareDistance(a, b)).toBe(1);
    });
  });

  describe('isCloser', () => {
    it('should return true when a is closer', () => {
      const a = new Uint8Array([0x01]);
      const b = new Uint8Array([0x02]);
      expect(isCloser(a, b)).toBe(true);
    });

    it('should return false when b is closer', () => {
      const a = new Uint8Array([0x02]);
      const b = new Uint8Array([0x01]);
      expect(isCloser(a, b)).toBe(false);
    });
  });

  describe('bucketIndexFromDistance', () => {
    it('should return -1 for zero distance', () => {
      const distance = new Uint8Array(20).fill(0);
      expect(bucketIndexFromDistance(distance)).toBe(-1);
    });

    it('should return 0 for maximum distance (first bit set)', () => {
      const distance = new Uint8Array(20);
      distance[0] = 0x80; // 10000000
      expect(bucketIndexFromDistance(distance)).toBe(0);
    });

    it('should return correct index for various distances', () => {
      const distance1 = new Uint8Array(20);
      distance1[0] = 0x40; // 01000000 -> index 1
      expect(bucketIndexFromDistance(distance1)).toBe(1);

      const distance2 = new Uint8Array(20);
      distance2[0] = 0x01; // 00000001 -> index 7
      expect(bucketIndexFromDistance(distance2)).toBe(7);

      const distance3 = new Uint8Array(20);
      distance3[1] = 0x80; // Second byte, first bit -> index 8
      expect(bucketIndexFromDistance(distance3)).toBe(8);
    });
  });

  describe('getBucketIndex', () => {
    it('should return bucket index for two different IDs', () => {
      const local = new Uint8Array(20).fill(0);
      const target = new Uint8Array(20).fill(0);
      target[0] = 0x80;
      
      const index = getBucketIndex(local, target);
      expect(index).toBe(0);
    });
  });

  describe('nodeIdToHex and hexToNodeId', () => {
    it('should convert to hex and back', () => {
      const original = generateNodeId();
      const hex = nodeIdToHex(original);
      const restored = hexToNodeId(hex);
      
      expect(hex.length).toBe(NODE_ID_BYTES * 2);
      expect(nodeIdsEqual(original, restored)).toBe(true);
    });

    it('should throw for invalid hex length', () => {
      expect(() => hexToNodeId('abc')).toThrow();
    });
  });

  describe('nodeIdsEqual', () => {
    it('should return true for equal IDs', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(nodeIdsEqual(a, b)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      expect(nodeIdsEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2]);
      expect(nodeIdsEqual(a, b)).toBe(false);
    });
  });

  describe('isValidNodeId', () => {
    it('should validate correct node IDs', () => {
      const valid = new Uint8Array(NODE_ID_BYTES);
      expect(isValidNodeId(valid)).toBe(true);
    });

    it('should reject invalid types', () => {
      expect(isValidNodeId('not-a-uint8array')).toBe(false);
      expect(isValidNodeId(null)).toBe(false);
      expect(isValidNodeId(undefined)).toBe(false);
      expect(isValidNodeId(123)).toBe(false);
    });

    it('should reject wrong length', () => {
      expect(isValidNodeId(new Uint8Array(10))).toBe(false);
    });
  });

  describe('copyNodeId', () => {
    it('should create an independent copy', () => {
      const original = generateNodeId();
      const copy = copyNodeId(original);
      
      expect(nodeIdsEqual(original, copy)).toBe(true);
      
      // Modify copy
      copy[0] = (copy[0] + 1) % 256;
      expect(nodeIdsEqual(original, copy)).toBe(false);
    });
  });

  describe('sortByDistance', () => {
    it('should sort contacts by distance to target', () => {
      const target = new Uint8Array(20).fill(0);
      
      const contacts = [
        { nodeId: new Uint8Array(20).fill(0xFF) },
        { nodeId: new Uint8Array(20).fill(0x01) },
        { nodeId: new Uint8Array(20).fill(0x7F) },
      ];
      
      const sorted = sortByDistance(contacts, target);
      
      // Closest should be 0x01 (smallest XOR with 0x00)
      expect(sorted[0].nodeId[0]).toBe(0x01);
      expect(sorted[1].nodeId[0]).toBe(0x7F);
      expect(sorted[2].nodeId[0]).toBe(0xFF);
    });
  });

  describe('getClosestContacts', () => {
    it('should return n closest contacts', () => {
      const target = new Uint8Array(20).fill(0);
      
      const contacts = [
        { nodeId: new Uint8Array(20).fill(0xFF) },
        { nodeId: new Uint8Array(20).fill(0x01) },
        { nodeId: new Uint8Array(20).fill(0x7F) },
        { nodeId: new Uint8Array(20).fill(0x3F) },
      ];
      
      const closest = getClosestContacts(contacts, target, 2);
      
      expect(closest.length).toBe(2);
      expect(closest[0].nodeId[0]).toBe(0x01);
      expect(closest[1].nodeId[0]).toBe(0x3F);
    });

    it('should return all contacts if n > contacts.length', () => {
      const target = new Uint8Array(20).fill(0);
      const contacts = [{ nodeId: generateNodeId() }];
      
      const closest = getClosestContacts(contacts, target, 10);
      expect(closest.length).toBe(1);
    });
  });

  describe('generateIdInBucket', () => {
    it('should generate ID in correct bucket', () => {
      const localId = new Uint8Array(20).fill(0);
      
      for (const bucketIndex of [0, 10, 50, 100, 159]) {
        const generatedId = generateIdInBucket(localId, bucketIndex);
        const actualBucket = getBucketIndex(localId, generatedId);
        
        // The generated ID should fall in exactly the target bucket
        // The implementation deterministically places the ID in the correct bucket
        expect(actualBucket).toBe(bucketIndex);
      }
    });

    it('should throw for invalid bucket index', () => {
      const localId = generateNodeId();
      expect(() => generateIdInBucket(localId, -1)).toThrow();
      expect(() => generateIdInBucket(localId, 160)).toThrow();
    });
  });
});
