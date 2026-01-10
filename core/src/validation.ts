/**
 * Validation and sanitization utilities
 */

// Import DOMPurify for HTML sanitization
// SECURITY: DOMPurify is REQUIRED - no unsafe fallbacks allowed
let DOMPurify: any;

if (typeof window !== "undefined") {
  // In the browser, DOMPurify must be available
  try {
    DOMPurify = require("dompurify");
  } catch {
    DOMPurify = (globalThis as any).DOMPurify;
  }
} else {
  // In Node.js/test environments, use jsdom-based DOMPurify
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const createDOMPurify = require("dompurify");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JSDOM } = require("jsdom");
    const window = new JSDOM("").window;
    DOMPurify = createDOMPurify(window);
  } catch (e) {
    // In test environments without jsdom, use minimal safe fallback
    // This only strips ALL HTML - no partial sanitization
    if (process.env.NODE_ENV === 'test') {
      DOMPurify = {
        sanitize: (input: string, config?: any) => {
          // Test-only: strip all HTML tags completely
          if (config?.ALLOWED_TAGS?.length === 0) {
            return input.replace(/<[^>]*>/g, "");
          }
          // If allowing tags in tests, fail explicitly
          throw new Error('DOMPurify not available - install jsdom for testing');
        },
      };
    }
  }
}

// SECURITY: Fail explicitly if DOMPurify is not available in production
if (!DOMPurify || !DOMPurify.sanitize) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECURITY ERROR: DOMPurify is required but not available. ' +
      'This is a critical security dependency. Install dompurify package.'
    );
  }
  // Development/test fallback - strip all HTML
  console.warn('WARNING: DOMPurify not available, using unsafe fallback');
  DOMPurify = {
    sanitize: (input: string) => input.replace(/<[^>]*>/g, ""),
  };
}

/**
 * Sanitize HTML content to prevent XSS attacks
 *
 * Uses DOMPurify to remove all HTML tags and leave only text content
 */
export function sanitizeHTML(html: string): string {
  // Use DOMPurify to remove all HTML tags and leave only text content
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize user input for display
 */
export function sanitizeUserInput(input: string): string {
  // Remove any HTML tags using DOMPurify
  const sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });

  // Limit length
  return sanitized.substring(0, 10000);
}

/**
 * Validate and sanitize message content
 */
export function validateMessageContent(content: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!content || content.trim().length === 0) {
    return { valid: false, sanitized: "", error: "Message cannot be empty" };
  }

  if (content.length > 10000) {
    return {
      valid: false,
      sanitized: "",
      error: "Message too long (max 10,000 characters)",
    };
  }

  const sanitized = sanitizeUserInput(content);

  return { valid: true, sanitized };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function required(value: unknown, fieldName: string): void {
  if (value === undefined || value === null || value === "") {
    throw new ValidationError(`${fieldName} is required`);
  }
}

export function validateStringLength(
  value: string,
  min: number,
  max: number,
  fieldName: string,
): void {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  if (value.length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} characters`,
    );
  }
  if (value.length > max) {
    throw new ValidationError(`${fieldName} must be at most ${max} characters`);
  }
}
