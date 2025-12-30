import {
  validateMessageContent,
  validateStringLength,
  sanitizeUserInput,
} from "../../core/src/validation";

describe("Input Validation Security Test", () => {
  describe("Message Size Limits", () => {
    it("should reject messages exceeding maximum payload size", () => {
      const maxSize = 10000; // Matches validation.ts limit
      const oversizedMessage = "x".repeat(maxSize + 1);

      const result = validateMessageContent(oversizedMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("should accept messages at maximum payload size", () => {
      const maxSize = 10000;
      const maxPayload = "x".repeat(maxSize);

      const result = validateMessageContent(maxPayload);
      expect(result.valid).toBe(true);
    });
  });

  describe("Content Sanitization", () => {
    it("should sanitize HTML content", () => {
      const maliciousContent = "Hello <script>alert(1)</script>";
      const result = validateMessageContent(maliciousContent);

      expect(result.valid).toBe(true);
      expect(result.sanitized).not.toContain("<script>");
      // The current fallback sanitizer only strips tags, leaving text content.
      expect(result.sanitized).toBe("Hello alert(1)");
    });

    it("should handle empty messages", () => {
      const result = validateMessageContent("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Message cannot be empty");
    });
  });

  describe("String Length Validation", () => {
    it("should validate string length correct range", () => {
      expect(() => {
        validateStringLength("abc", 1, 5, "testField");
      }).not.toThrow();
    });

    it("should throw on too short string", () => {
      expect(() => {
        validateStringLength("a", 5, 10, "testField");
      }).toThrow("must be at least 5");
    });

    it("should throw on too long string", () => {
      expect(() => {
        validateStringLength("abcdef", 1, 5, "testField");
      }).toThrow("must be at most 5");
    });
  });
});
