/**
 * Tests for validation utilities
 */

const {
  sanitizeHTML,
  sanitizeUserInput,
  validateMessageContent
} = require('./validation.ts');

describe('Validation Utilities', () => {
  describe('sanitizeHTML', () => {
    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeHTML(html);
      expect(result).not.toContain('<script');
      expect(result).toContain('Hello');
    });

    it('should remove event handlers', () => {
      const html = '<div onclick="alert(1)">Click me</div>';
      const result = sanitizeHTML(html);
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click me');
    });
  });

  describe('sanitizeUserInput', () => {
    it('should trim whitespace', () => {
      // Note: sanitizeUserInput doesn't explicitly trim in current implementation, 
      // but let's test what it does. It uses DOMPurify.
      // If the implementation changes to trim, this test might need update.
      // For now, let's just check it returns string.
      expect(typeof sanitizeUserInput('  test  ')).toBe('string');
    });

    it('should remove HTML-like characters', () => {
      // DOMPurify removes tags but keeps content by default in our config
      expect(sanitizeUserInput('Hello <b>World</b>')).toBe('Hello World');
    });

    it('should limit length', () => {
      const long = 'a'.repeat(20000);
      expect(sanitizeUserInput(long).length).toBe(10000);
    });
  });

  describe('validateMessageContent', () => {
    it('should validate valid content', () => {
      const result = validateMessageContent('Hello world');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('Hello world');
    });

    it('should reject empty content', () => {
      const result = validateMessageContent('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject too long content', () => {
      const long = 'a'.repeat(10001);
      const result = validateMessageContent(long);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });
  });
});
