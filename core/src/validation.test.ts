/**
 * Tests for validation utilities
 */

import {
  ValidationError,
  required,
  validateStringLength,
  validateNumberRange,
  validateArrayLength,
  validatePublicKey,
  validatePrivateKey,
  validateSignature,
  validateProtocolVersion,
  validateTTL,
  validateTimestamp,
  validatePeerId,
  validateEmail,
  validateUrl,
  validateIPAddress,
  validatePort,
  validateFileName,
  validateMimeType,
  sanitizeHtml,
  sanitizeInput,
  validateUsername,
  validateRequiredFields,
  validateEnum,
  validateArray,
  compose,
  optional,
} from './validation';

describe('Validation Utilities', () => {
  describe('required', () => {
    it('should return value if not null or undefined', () => {
      expect(required('test', 'field')).toBe('test');
      expect(required(0, 'field')).toBe(0);
      expect(required(false, 'field')).toBe(false);
    });
    
    it('should throw for null or undefined', () => {
      expect(() => required(null, 'field')).toThrow(ValidationError);
      expect(() => required(undefined, 'field')).toThrow(ValidationError);
    });
  });
  
  describe('validateStringLength', () => {
    it('should validate minimum length', () => {
      expect(() => validateStringLength('ab', { fieldName: 'test', min: 3 }))
        .toThrow(ValidationError);
      expect(validateStringLength('abc', { fieldName: 'test', min: 3 }))
        .toBe('abc');
    });
    
    it('should validate maximum length', () => {
      expect(() => validateStringLength('abcd', { fieldName: 'test', max: 3 }))
        .toThrow(ValidationError);
      expect(validateStringLength('abc', { fieldName: 'test', max: 3 }))
        .toBe('abc');
    });
    
    it('should validate both min and max', () => {
      expect(validateStringLength('abc', { fieldName: 'test', min: 2, max: 4 }))
        .toBe('abc');
      expect(() => validateStringLength('a', { fieldName: 'test', min: 2, max: 4 }))
        .toThrow(ValidationError);
      expect(() => validateStringLength('abcde', { fieldName: 'test', min: 2, max: 4 }))
        .toThrow(ValidationError);
    });
  });
  
  describe('validateNumberRange', () => {
    it('should validate minimum value', () => {
      expect(() => validateNumberRange(5, { fieldName: 'test', min: 10 }))
        .toThrow(ValidationError);
      expect(validateNumberRange(10, { fieldName: 'test', min: 10 }))
        .toBe(10);
    });
    
    it('should validate maximum value', () => {
      expect(() => validateNumberRange(15, { fieldName: 'test', max: 10 }))
        .toThrow(ValidationError);
      expect(validateNumberRange(10, { fieldName: 'test', max: 10 }))
        .toBe(10);
    });
    
    it('should reject non-finite numbers', () => {
      expect(() => validateNumberRange(NaN, { fieldName: 'test' }))
        .toThrow(ValidationError);
      expect(() => validateNumberRange(Infinity, { fieldName: 'test' }))
        .toThrow(ValidationError);
    });
  });
  
  describe('validateArrayLength', () => {
    it('should validate exact length', () => {
      const arr = new Uint8Array(32);
      expect(validateArrayLength(arr, { fieldName: 'test', exact: 32 }))
        .toBe(arr);
      expect(() => validateArrayLength(arr, { fieldName: 'test', exact: 64 }))
        .toThrow(ValidationError);
    });
    
    it('should validate min and max length', () => {
      const arr = new Uint8Array(32);
      expect(validateArrayLength(arr, { fieldName: 'test', min: 16, max: 64 }))
        .toBe(arr);
      expect(() => validateArrayLength(arr, { fieldName: 'test', min: 64 }))
        .toThrow(ValidationError);
      expect(() => validateArrayLength(arr, { fieldName: 'test', max: 16 }))
        .toThrow(ValidationError);
    });
  });
  
  describe('validatePublicKey', () => {
    it('should validate 32-byte public key', () => {
      const key = new Uint8Array(32);
      expect(validatePublicKey(key)).toBe(key);
    });
    
    it('should reject invalid key sizes', () => {
      expect(() => validatePublicKey(new Uint8Array(31))).toThrow(ValidationError);
      expect(() => validatePublicKey(new Uint8Array(33))).toThrow(ValidationError);
    });
  });
  
  describe('validatePrivateKey', () => {
    it('should validate 32-byte private key', () => {
      const key = new Uint8Array(32);
      expect(validatePrivateKey(key)).toBe(key);
    });
    
    it('should reject invalid key sizes', () => {
      expect(() => validatePrivateKey(new Uint8Array(31))).toThrow(ValidationError);
      expect(() => validatePrivateKey(new Uint8Array(33))).toThrow(ValidationError);
    });
  });
  
  describe('validateSignature', () => {
    it('should validate 64-byte signature', () => {
      const sig = new Uint8Array(64);
      expect(validateSignature(sig)).toBe(sig);
    });
    
    it('should validate 65-byte signature (compact format)', () => {
      const sig = new Uint8Array(65);
      expect(validateSignature(sig)).toBe(sig);
    });
    
    it('should reject invalid signature sizes', () => {
      expect(() => validateSignature(new Uint8Array(63))).toThrow(ValidationError);
      expect(() => validateSignature(new Uint8Array(66))).toThrow(ValidationError);
    });
  });
  
  describe('validateProtocolVersion', () => {
    it('should validate version in range 1-255', () => {
      expect(validateProtocolVersion(1)).toBe(1);
      expect(validateProtocolVersion(255)).toBe(255);
    });
    
    it('should reject out of range versions', () => {
      expect(() => validateProtocolVersion(0)).toThrow(ValidationError);
      expect(() => validateProtocolVersion(256)).toThrow(ValidationError);
    });
  });
  
  describe('validateTTL', () => {
    it('should validate TTL in range 0-255', () => {
      expect(validateTTL(0)).toBe(0);
      expect(validateTTL(255)).toBe(255);
    });
    
    it('should reject out of range TTL', () => {
      expect(() => validateTTL(-1)).toThrow(ValidationError);
      expect(() => validateTTL(256)).toThrow(ValidationError);
    });
  });
  
  describe('validateTimestamp', () => {
    it('should validate recent timestamps', () => {
      const now = Date.now();
      expect(validateTimestamp(now)).toBe(now);
      expect(validateTimestamp(now - 60000)).toBe(now - 60000); // 1 min ago
    });
    
    it('should reject far future timestamps', () => {
      const future = Date.now() + 10 * 60 * 1000; // 10 minutes in future
      expect(() => validateTimestamp(future)).toThrow(ValidationError);
    });
    
    it('should reject very old timestamps', () => {
      const old = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000; // 2 years ago
      expect(() => validateTimestamp(old)).toThrow(ValidationError);
    });
  });
  
  describe('validatePeerId', () => {
    it('should validate alphanumeric peer IDs', () => {
      expect(validatePeerId('peer-123')).toBe('peer-123');
      expect(validatePeerId('ABC-def-456')).toBe('ABC-def-456');
    });
    
    it('should reject invalid peer IDs', () => {
      expect(() => validatePeerId('')).toThrow(ValidationError);
      expect(() => validatePeerId('peer@123')).toThrow(ValidationError);
      expect(() => validatePeerId('peer_123')).toThrow(ValidationError);
    });
  });
  
  describe('validateEmail', () => {
    it('should validate email addresses', () => {
      expect(validateEmail('test@example.com')).toBe('test@example.com');
      expect(validateEmail('user+tag@domain.co.uk')).toBe('user+tag@domain.co.uk');
    });
    
    it('should reject invalid emails', () => {
      expect(() => validateEmail('invalid')).toThrow(ValidationError);
      expect(() => validateEmail('@example.com')).toThrow(ValidationError);
      expect(() => validateEmail('test@')).toThrow(ValidationError);
    });
  });
  
  describe('validateUrl', () => {
    it('should validate URLs', () => {
      expect(validateUrl('https://example.com')).toBe('https://example.com');
      expect(validateUrl('http://localhost:3000/path')).toBe('http://localhost:3000/path');
    });
    
    it('should reject invalid URLs', () => {
      expect(() => validateUrl('not-a-url')).toThrow(ValidationError);
      expect(() => validateUrl('://invalid')).toThrow(ValidationError);
    });
  });
  
  describe('validateIPAddress', () => {
    it('should validate IPv4 addresses', () => {
      expect(validateIPAddress('192.168.1.1')).toBe('192.168.1.1');
      expect(validateIPAddress('127.0.0.1')).toBe('127.0.0.1');
    });
    
    it('should validate IPv6 addresses', () => {
      expect(validateIPAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334'))
        .toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });
    
    it('should reject invalid IP addresses', () => {
      expect(() => validateIPAddress('256.1.1.1')).toThrow(ValidationError);
      expect(() => validateIPAddress('not-an-ip')).toThrow(ValidationError);
    });
  });
  
  describe('validatePort', () => {
    it('should validate port numbers', () => {
      expect(validatePort(80)).toBe(80);
      expect(validatePort(3000)).toBe(3000);
      expect(validatePort(65535)).toBe(65535);
    });
    
    it('should reject invalid ports', () => {
      expect(() => validatePort(0)).toThrow(ValidationError);
      expect(() => validatePort(65536)).toThrow(ValidationError);
    });
  });
  
  describe('validateFileName', () => {
    it('should validate file names', () => {
      expect(validateFileName('document.pdf')).toBe('document.pdf');
      expect(validateFileName('image-2024.jpg')).toBe('image-2024.jpg');
    });
    
    it('should reject directory traversal attempts', () => {
      expect(() => validateFileName('../etc/passwd')).toThrow(ValidationError);
      expect(() => validateFileName('..\\windows\\system32')).toThrow(ValidationError);
    });
  });
  
  describe('validateMimeType', () => {
    it('should validate MIME types', () => {
      expect(validateMimeType('text/plain')).toBe('text/plain');
      expect(validateMimeType('application/json')).toBe('application/json');
      expect(validateMimeType('image/svg+xml')).toBe('image/svg+xml');
    });
    
    it('should reject invalid MIME types', () => {
      expect(() => validateMimeType('invalid')).toThrow(ValidationError);
      expect(() => validateMimeType('text/')).toThrow(ValidationError);
    });
  });
  
  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script>';
      expect(sanitizeHtml(html)).not.toContain('script');
    });
    
    it('should remove event handlers', () => {
      const html = '<div onclick="alert(1)">Click me</div>';
      expect(sanitizeHtml(html)).not.toContain('onclick');
    });
  });
  
  describe('sanitizeInput', () => {
    it('should trim whitespace', () => {
      expect(sanitizeInput('  test  ')).toBe('test');
    });
    
    it('should remove HTML-like characters', () => {
      expect(sanitizeInput('Hello <b>World</b>')).toBe('Hello bWorld/b');
    });
    
    it('should limit length', () => {
      const long = 'a'.repeat(20000);
      expect(sanitizeInput(long).length).toBe(10000);
    });
  });
  
  describe('validateUsername', () => {
    it('should validate usernames', () => {
      expect(validateUsername('john_doe')).toBe('john_doe');
      expect(validateUsername('user-123')).toBe('user-123');
    });
    
    it('should reject invalid usernames', () => {
      expect(() => validateUsername('ab')).toThrow(ValidationError); // too short
      expect(() => validateUsername('user@name')).toThrow(ValidationError);
    });
  });
  
  describe('validateRequiredFields', () => {
    it('should validate all required fields present', () => {
      const obj = { name: 'test', value: 123 };
      expect(validateRequiredFields(obj, ['name', 'value'] as const)).toBe(obj);
    });
    
    it('should throw for missing fields', () => {
      const obj: Record<string, any> = { name: 'test' };
      expect(() => validateRequiredFields(obj, ['name', 'value']))
        .toThrow(ValidationError);
    });
  });
  
  describe('validateEnum', () => {
    enum TestEnum {
      A = 'a',
      B = 'b',
      C = 'c',
    }
    
    it('should validate enum values', () => {
      expect(validateEnum('a', TestEnum, 'test')).toBe('a');
      expect(validateEnum('b', TestEnum, 'test')).toBe('b');
    });
    
    it('should reject invalid enum values', () => {
      expect(() => validateEnum('d', TestEnum, 'test')).toThrow(ValidationError);
    });
  });
  
  describe('validateArray', () => {
    it('should validate array items', () => {
      const arr = [1, 2, 3];
      const validator = (n: number) => {
        if (n < 0) throw new ValidationError('Negative number');
        return n;
      };
      
      expect(validateArray(arr, validator, { fieldName: 'numbers' })).toEqual(arr);
    });
    
    it('should validate array length', () => {
      const arr = [1, 2, 3];
      const validator = (n: number) => n;
      
      expect(() => validateArray(arr, validator, { fieldName: 'numbers', minItems: 5 }))
        .toThrow(ValidationError);
      expect(() => validateArray(arr, validator, { fieldName: 'numbers', maxItems: 2 }))
        .toThrow(ValidationError);
    });
  });
  
  describe('compose', () => {
    it('should compose validators', () => {
      const validator = compose<string>(
        (s) => validateStringLength(s, { fieldName: 'test', min: 3 }),
        (s) => s.toLowerCase()
      );
      
      expect(validator('TEST')).toBe('test');
      expect(() => validator('AB')).toThrow(ValidationError);
    });
  });
  
  describe('optional', () => {
    it('should allow null/undefined', () => {
      const validator = optional((s: string) => 
        validateStringLength(s, { fieldName: 'test', min: 3 })
      );
      
      expect(validator(null)).toBe(null);
      expect(validator(undefined)).toBe(undefined);
      expect(validator('test')).toBe('test');
      expect(() => validator('ab')).toThrow(ValidationError);
    });
  });
});
