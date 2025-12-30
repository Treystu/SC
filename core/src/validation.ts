/**
 * Validation and sanitization utilities
 */

// Import DOMPurify for HTML sanitization in browser environment
// In Node.js/test environments, provide a fallback
let DOMPurify: any;

if (typeof window !== "undefined") {
  // In the browser, assuming it will be available via global or handled by bundler
  try {
    DOMPurify = require("dompurify");
  } catch {
    DOMPurify = (globalThis as any).DOMPurify;
  }
} else {
  // In Node.js/test environments, try to use jsdom
  try {
    const createDOMPurify = require("dompurify");
    const { JSDOM } = require("jsdom");
    const window = new JSDOM("").window;
    DOMPurify = createDOMPurify(window);
  } catch {
    // Fallback if dependencies missing
  }
}

// Ensure DOMPurify has a sanitize method even if loading failed
if (!DOMPurify || !DOMPurify.sanitize) {
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
