import { compressMessage, decompressMessage, getCompressionRatio, CompressionResult } from './compression';

describe('Compression', () => {
  describe('compressMessage', () => {
    it('should return uncompressed data for small messages', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const result = compressMessage(data);

      expect(result.compressed).toBe(false);
      expect(result.data).toEqual(data);
      expect(result.originalSize).toBe(5);
      expect(result.compressedSize).toBe(5);
    });

    it('should compress large messages with repetitive data', () => {
      const data = new Uint8Array(2048).fill(65); // 2KB of 'A's - highly compressible
      const result = compressMessage(data);

      expect(result.compressed).toBe(true);
      expect(result.originalSize).toBe(2048);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
      // Repetitive data compresses very well
      expect(result.compressedSize).toBeLessThan(result.originalSize * 0.1);
    });

    it('should handle empty data', () => {
      const data = new Uint8Array(0);
      const result = compressMessage(data);

      expect(result.compressed).toBe(false);
      expect(result.data).toEqual(data);
      expect(result.originalSize).toBe(0);
      expect(result.compressedSize).toBe(0);
    });

    it('should return consistent results for same input', () => {
      const data = new Uint8Array([10, 20, 30, 40, 50]);
      const result1 = compressMessage(data);
      const result2 = compressMessage(data);

      expect(result1).toEqual(result2);
    });
  });

  describe('decompressMessage', () => {
    it('should return original data if not compressed', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const result = decompressMessage(data, false);

      expect(result).toEqual(data);
    });

    it('should throw error for invalid compressed data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      // Trying to decompress invalid data should throw
      expect(() => decompressMessage(data, true)).toThrow('Failed to decompress message');
    });

    it('should handle empty data', () => {
      const data = new Uint8Array(0);
      const result = decompressMessage(data, false);

      expect(result).toEqual(data);
    });
  });

  describe('getCompressionRatio', () => {
    it('should return 1.0 for uncompressed data', () => {
      const result: CompressionResult = {
        data: new Uint8Array([1, 2, 3]),
        compressed: false,
        originalSize: 100,
        compressedSize: 100,
      };

      expect(getCompressionRatio(result)).toBe(1.0);
    });

    it('should calculate ratio correctly for compressed data', () => {
      const result: CompressionResult = {
        data: new Uint8Array([1, 2]),
        compressed: true,
        originalSize: 100,
        compressedSize: 50,
      };

      expect(getCompressionRatio(result)).toBe(0.5);
    });

    it('should handle 0% compression (ratio 1.0)', () => {
      const result: CompressionResult = {
        data: new Uint8Array([1, 2, 3]),
        compressed: true,
        originalSize: 100,
        compressedSize: 100,
      };

      expect(getCompressionRatio(result)).toBe(1.0);
    });

    it('should handle perfect compression (small ratio)', () => {
      const result: CompressionResult = {
        data: new Uint8Array([1]),
        compressed: true,
        originalSize: 1000,
        compressedSize: 10,
      };

      expect(getCompressionRatio(result)).toBe(0.01);
    });
  });

  describe('Integration', () => {
    it('should compress and decompress successfully', () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const compressed = compressMessage(originalData);
      const decompressed = decompressMessage(compressed.data, compressed.compressed);

      expect(decompressed).toEqual(originalData);
    });

    it('should maintain data integrity through compress/decompress cycle', () => {
      const originalData = new Uint8Array(500);
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = i % 256;
      }

      const compressed = compressMessage(originalData);
      const decompressed = decompressMessage(compressed.data, compressed.compressed);

      expect(decompressed).toEqual(originalData);
    });
  });
});
