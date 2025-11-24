import {
  bufferToHex,
  hexToBuffer,
  buffersEqual,
  concatBuffers,
  stringToBuffer,
  bufferToString,
} from '../buffer';

describe('Buffer utilities', () => {
  describe('bufferToHex and hexToBuffer', () => {
    it('should convert buffer to hex and back', () => {
      const original = new Uint8Array([0, 1, 15, 16, 255]);
      const hex = bufferToHex(original);
      const converted = hexToBuffer(hex);
      
      expect(converted).toEqual(original);
    });

    it('should produce correct hex format', () => {
      const buffer = new Uint8Array([0, 255]);
      const hex = bufferToHex(buffer);
      
      expect(hex).toBe('00ff');
    });
  });

  describe('buffersEqual', () => {
    it('should return true for equal buffers', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      
      expect(buffersEqual(a, b)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      
      expect(buffersEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([1, 2, 3]);
      
      expect(buffersEqual(a, b)).toBe(false);
    });
  });

  describe('concatBuffers', () => {
    it('should concatenate multiple buffers', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      const c = new Uint8Array([5, 6]);
      
      const result = concatBuffers(a, b, c);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    it('should handle empty buffers', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([]);
      const c = new Uint8Array([3, 4]);
      
      const result = concatBuffers(a, b, c);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });
  });

  describe('stringToBuffer and bufferToString', () => {
    it('should convert string to buffer and back', () => {
      const original = 'Hello, World! 🌍';
      const buffer = stringToBuffer(original);
      const converted = bufferToString(buffer);
      
      expect(converted).toBe(original);
    });

    it('should handle unicode characters', () => {
      const original = '你好世界 مرحبا العالم';
      const buffer = stringToBuffer(original);
      const converted = bufferToString(buffer);
      
      expect(converted).toBe(original);
    });
  });
});
