import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [], // No HTML tags allowed in messages
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
}

/**
 * Sanitize user input for display
 */
export function sanitizeUserInput(input: string): string {
  // Remove any HTML tags
  const sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
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
    return { valid: false, sanitized: '', error: 'Message cannot be empty' };
  }
  
  if (content.length > 10000) {
    return { valid: false, sanitized: '', error: 'Message too long (max 10,000 characters)' };
  }
  
  const sanitized = sanitizeUserInput(content);
  
  return { valid: true, sanitized };
}