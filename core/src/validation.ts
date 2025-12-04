/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * In Node.js environment (tests), we use a simple regex-based approach.
 * In browser, DOMPurify will be used via the web bundle.
 */
export function sanitizeHTML(html: string): string {
  // Simple sanitization for Node.js/test environment
  // Remove all HTML tags
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize user input for display
 */
export function sanitizeUserInput(input: string): string {
  // Remove any HTML tags
  const sanitized = input.replace(/<[^>]*>/g, '');

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
