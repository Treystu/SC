import { validateFile, validateFileList, FILE_LIMITS } from './file-validation';

describe('File Validation', () => {
  // Mock File object since it's not available in Node.js environment by default
  class MockFile {
    name: string;
    size: number;
    type: string;

    constructor(parts: string[], name: string, options: { type: string }) {
      this.name = name;
      this.size = parts.join('').length;
      this.type = options.type;
    }
  }

  // @ts-ignore
  global.File = MockFile;

  describe('validateFile', () => {
    it('should validate valid file', () => {
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.sanitizedName).toBe('test.jpg');
    });

    it('should reject file too large', () => {
      const largeContent = 'a'.repeat(FILE_LIMITS.MAX_SIZE + 1);
      const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File too large');
    });

    it('should reject invalid file type', () => {
      const file = new File(['content'], 'test.exe', { type: 'application/x-msdownload' });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File type not allowed');
    });

    it('should reject blocked extension', () => {
      const file = new File(['content'], 'script.js', { type: 'text/javascript' });
      // Even if type was allowed (it's not in the list), extension is blocked
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      // Note: In the implementation, type check comes first. 
      // If we use a valid type but invalid extension:
      const file2 = new File(['content'], 'malicious.exe', { type: 'text/plain' });
      const result2 = validateFile(file2);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('File extension not allowed');
    });

    it('should sanitize filename', () => {
      const file = new File(['content'], '../etc/passwd.jpg', { type: 'image/jpeg' });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.sanitizedName).not.toContain('..');
      expect(result.sanitizedName).toBe('etc_passwd.jpg');
    });
  });

  describe('validateFileList', () => {
    it('should validate list of files', () => {
      const files = [
        new File(['content'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['content'], 'test2.png', { type: 'image/png' })
      ];
      const result = validateFileList(files);
      expect(result.valid).toBe(true);
    });

    it('should reject too many files', () => {
      const files = [];
      for (let i = 0; i < FILE_LIMITS.MAX_FILES_PER_MESSAGE + 1; i++) {
        files.push(new File(['content'], `test${i}.jpg`, { type: 'image/jpeg' }));
      }
      const result = validateFileList(files);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Too many files');
    });

    it('should reject if any file is invalid', () => {
      const files = [
        new File(['content'], 'valid.jpg', { type: 'image/jpeg' }),
        new File(['content'], 'invalid.exe', { type: 'application/x-msdownload' })
      ];
      const result = validateFileList(files);
      expect(result.valid).toBe(false);
    });
  });
});