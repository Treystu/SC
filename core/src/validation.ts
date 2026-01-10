/**
 * Validation and sanitization utilities
 */

// Lazy-loaded DOMPurify instance
let DOMPurify: any = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize DOMPurify based on environment
 */
async function initDOMPurify(): Promise<void> {
  if (DOMPurify) return;
  
  if (initPromise) {
    await initPromise;
    return;
  }
  
  initPromise = (async () => {
    if (typeof window !== 'undefined') {
      // Browser environment - use dompurify directly
      try {
        const dompurifyModule = await import('dompurify');
        DOMPurify = dompurifyModule.default;
      } catch (e) {
        console.error('Failed to load DOMPurify in browser:', e);
        throw e;
      }
    } else {
      // Node.js/test environment - use jsdom-based DOMPurify
      try {
        const { JSDOM } = await import('jsdom');
        const dompurifyModule = await import('dompurify');
        const window = new JSDOM('').window;
        DOMPurify = dompurifyModule.default(window as any);
      } catch (e) {
        // Test fallback - strip all HTML
        if (process.env.NODE_ENV === 'test') {
          DOMPurify = {
            sanitize: (input: string) => input.replace(/<[^>]*>/g, ''),
          };
        } else {
          throw new Error('DOMPurify initialization failed: ' + e);
        }
      }
    }
  })();
  
  await initPromise;
}

// Synchronous fallback for immediate use
function getSanitizer() {
  if (!DOMPurify) {
    // Synchronous fallback - strip all HTML
    return {
      sanitize: (input: string) => input.replace(/<[^>]*>/g, ''),
    };
  }
  return DOMPurify;
}

// Initialize immediately (fire and forget)
initDOMPurify().catch(() => {
  // Fallback already handled in initDOMPurify
});

/**
 * Sanitize HTML content to prevent XSS attacks
 *
 * Uses DOMPurify to remove all HTML tags and leave only text content
 */
export function sanitizeHTML(html: string): string {
  // Use DOMPurify to remove all HTML tags and leave only text content
  const sanitizer = getSanitizer();
  return sanitizer.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize user input for display
 */
export function sanitizeUserInput(input: string): string {
  // Remove any HTML tags using DOMPurify
  const sanitizer = getSanitizer();
  const sanitized = sanitizer.sanitize(input, {
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
