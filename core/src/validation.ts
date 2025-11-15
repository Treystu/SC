/**
 * Input Validation Utilities
 * Comprehensive validation for security and data integrity
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate that value is not null or undefined
 */
export function required<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`, fieldName, value);
  }
  return value;
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string,
  options: {
    fieldName: string;
    min?: number;
    max?: number;
  }
): string {
  const { fieldName, min, max } = options;
  
  if (min !== undefined && value.length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} characters`,
      fieldName,
      value
    );
  }
  
  if (max !== undefined && value.length > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max} characters`,
      fieldName,
      value
    );
  }
  
  return value;
}

/**
 * Validate number range
 */
export function validateNumberRange(
  value: number,
  options: {
    fieldName: string;
    min?: number;
    max?: number;
  }
): number {
  const { fieldName, min, max } = options;
  
  if (!Number.isFinite(value)) {
    throw new ValidationError(
      `${fieldName} must be a finite number`,
      fieldName,
      value
    );
  }
  
  if (min !== undefined && value < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min}`,
      fieldName,
      value
    );
  }
  
  if (max !== undefined && value > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max}`,
      fieldName,
      value
    );
  }
  
  return value;
}

/**
 * Validate Uint8Array length
 */
export function validateArrayLength(
  value: Uint8Array,
  options: {
    fieldName: string;
    min?: number;
    max?: number;
    exact?: number;
  }
): Uint8Array {
  const { fieldName, min, max, exact } = options;
  
  if (exact !== undefined && value.length !== exact) {
    throw new ValidationError(
      `${fieldName} must be exactly ${exact} bytes`,
      fieldName,
      value
    );
  }
  
  if (min !== undefined && value.length < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min} bytes`,
      fieldName,
      value
    );
  }
  
  if (max !== undefined && value.length > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max} bytes`,
      fieldName,
      value
    );
  }
  
  return value;
}

/**
 * Validate Ed25519 public key
 */
export function validatePublicKey(key: Uint8Array): Uint8Array {
  return validateArrayLength(key, {
    fieldName: 'Public key',
    exact: 32,
  });
}

/**
 * Validate Ed25519 private key
 */
export function validatePrivateKey(key: Uint8Array): Uint8Array {
  return validateArrayLength(key, {
    fieldName: 'Private key',
    exact: 32,
  });
}

/**
 * Validate Ed25519 signature
 */
export function validateSignature(signature: Uint8Array): Uint8Array {
  // Ed25519 signatures can be 64 or 65 bytes (compact format with recovery byte)
  if (signature.length !== 64 && signature.length !== 65) {
    throw new ValidationError(
      'Signature must be 64 or 65 bytes',
      'signature',
      signature
    );
  }
  return signature;
}

/**
 * Validate protocol version
 */
export function validateProtocolVersion(version: number): number {
  return validateNumberRange(version, {
    fieldName: 'Protocol version',
    min: 0x01,
    max: 0xFF,
  });
}

/**
 * Validate message TTL
 */
export function validateTTL(ttl: number): number {
  return validateNumberRange(ttl, {
    fieldName: 'TTL',
    min: 0,
    max: 255,
  });
}

/**
 * Validate timestamp
 */
export function validateTimestamp(timestamp: number): number {
  const now = Date.now();
  const maxFuture = 5 * 60 * 1000; // 5 minutes
  const maxPast = 365 * 24 * 60 * 60 * 1000; // 1 year
  
  if (timestamp > now + maxFuture) {
    throw new ValidationError(
      'Timestamp is too far in the future',
      'timestamp',
      timestamp
    );
  }
  
  if (timestamp < now - maxPast) {
    throw new ValidationError(
      'Timestamp is too far in the past',
      'timestamp',
      timestamp
    );
  }
  
  return timestamp;
}

/**
 * Validate peer ID format
 */
export function validatePeerId(peerId: string): string {
  validateStringLength(peerId, {
    fieldName: 'Peer ID',
    min: 1,
    max: 128,
  });
  
  // Peer ID should be alphanumeric with hyphens
  if (!/^[a-zA-Z0-9-]+$/.test(peerId)) {
    throw new ValidationError(
      'Peer ID must be alphanumeric with hyphens',
      'peerId',
      peerId
    );
  }
  
  return peerId;
}

/**
 * Validate conversation ID format
 */
export function validateConversationId(conversationId: string): string {
  return validateStringLength(conversationId, {
    fieldName: 'Conversation ID',
    min: 1,
    max: 128,
  });
}

/**
 * Validate message content
 */
export function validateMessageContent(content: string): string {
  return validateStringLength(content, {
    fieldName: 'Message content',
    min: 1,
    max: 10000, // 10K characters max
  });
}

/**
 * Validate email address
 */
export function validateEmail(email: string): string {
  validateStringLength(email, {
    fieldName: 'Email',
    min: 3,
    max: 254,
  });
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(
      'Invalid email address format',
      'email',
      email
    );
  }
  
  return email;
}

/**
 * Validate URL
 */
export function validateUrl(url: string): string {
  try {
    new URL(url);
    return url;
  } catch {
    throw new ValidationError(
      'Invalid URL format',
      'url',
      url
    );
  }
}

/**
 * Validate IP address
 */
export function validateIPAddress(ip: string): string {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    if (parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    })) {
      return ip;
    }
  }
  
  // IPv6 (simplified check)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Regex.test(ip)) {
    return ip;
  }
  
  throw new ValidationError(
    'Invalid IP address format',
    'ip',
    ip
  );
}

/**
 * Validate port number
 */
export function validatePort(port: number): number {
  return validateNumberRange(port, {
    fieldName: 'Port',
    min: 1,
    max: 65535,
  });
}

/**
 * Validate file size
 */
export function validateFileSize(
  size: number,
  maxSize: number = 100 * 1024 * 1024 // 100MB default
): number {
  return validateNumberRange(size, {
    fieldName: 'File size',
    min: 1,
    max: maxSize,
  });
}

/**
 * Validate file name
 */
export function validateFileName(fileName: string): string {
  validateStringLength(fileName, {
    fieldName: 'File name',
    min: 1,
    max: 255,
  });
  
  // Prevent directory traversal
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new ValidationError(
      'File name contains invalid characters',
      'fileName',
      fileName
    );
  }
  
  return fileName;
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string): string {
  const mimeRegex = /^[a-z]+\/[a-z0-9\-\+\.]+$/i;
  if (!mimeRegex.test(mimeType)) {
    throw new ValidationError(
      'Invalid MIME type format',
      'mimeType',
      mimeType
    );
  }
  
  return mimeType;
}

/**
 * Sanitize HTML to prevent XSS
 * 
 * WARNING: This is a BASIC sanitizer and should NOT be used for untrusted HTML in production.
 * For production use, use a library like DOMPurify: https://github.com/cure53/DOMPurify
 * 
 * This function is provided as a fallback and educational example only.
 * It is intentionally simple and has known limitations.
 * 
 * Recommended approach for production:
 * ```typescript
 * import DOMPurify from 'dompurify';
 * const clean = DOMPurify.sanitize(dirty);
 * ```
 */
export function sanitizeHtml(html: string): string {
  // WARNING: Basic sanitization only - NOT SECURE for untrusted HTML
  // This is a placeholder implementation
  // In production, use DOMPurify or similar library
  
  let sanitized = html;
  let previousLength = 0;
  let iterations = 0;
  const maxIterations = 10; // Prevent infinite loops
  
  // Keep removing until no changes occur (handles nested patterns)
  while (sanitized.length !== previousLength && iterations < maxIterations) {
    previousLength = sanitized.length;
    iterations++;
    
    // Remove script tags with whitespace tolerance
    // Note: This regex has known limitations and may not catch all cases
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script[\s\S]*?>/gi, '');
    
    // Remove event handlers
    // Note: This may not catch all event handler patterns
    sanitized = sanitized.replace(/on\w+[\s\S]*?=[\s\S]*?(["'])[^"']*\1/gi, '');
    sanitized = sanitized.replace(/on\w+[\s\S]*?=[^\s>]*/gi, '');
  }
  
  return sanitized;
}

/**
 * Validate and sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 10000); // Limit length
}

/**
 * Validate rate limit token
 */
export function validateRateLimitToken(token: string): string {
  return validateStringLength(token, {
    fieldName: 'Rate limit token',
    min: 1,
    max: 64,
  });
}

/**
 * Validate JWT-like token
 */
export function validateToken(token: string): string {
  validateStringLength(token, {
    fieldName: 'Token',
    min: 1,
    max: 2048,
  });
  
  // Basic JWT format check (header.payload.signature)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new ValidationError(
      'Invalid token format',
      'token',
      token
    );
  }
  
  return token;
}

/**
 * Validate session key
 */
export function validateSessionKey(key: Uint8Array): Uint8Array {
  return validateArrayLength(key, {
    fieldName: 'Session key',
    exact: 32, // ChaCha20-Poly1305 uses 32-byte keys
  });
}

/**
 * Validate nonce
 */
export function validateNonce(nonce: Uint8Array): Uint8Array {
  return validateArrayLength(nonce, {
    fieldName: 'Nonce',
    exact: 24, // XChaCha20-Poly1305 uses 24-byte nonces
  });
}

/**
 * Validate username
 */
export function validateUsername(username: string): string {
  validateStringLength(username, {
    fieldName: 'Username',
    min: 3,
    max: 32,
  });
  
  // Username should be alphanumeric with underscores and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new ValidationError(
      'Username must be alphanumeric with underscores and hyphens',
      'username',
      username
    );
  }
  
  return username;
}

/**
 * Validate display name
 */
export function validateDisplayName(displayName: string): string {
  return validateStringLength(displayName, {
    fieldName: 'Display name',
    min: 1,
    max: 64,
  });
}

/**
 * Validate object has required fields
 */
export function validateRequiredFields<T extends Record<string, any>>(
  obj: T,
  requiredFields: (keyof T)[]
): T {
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      throw new ValidationError(
        `Missing required field: ${String(field)}`,
        String(field)
      );
    }
  }
  return obj;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends Record<string, string | number>>(
  value: unknown,
  enumObj: T,
  fieldName: string
): T[keyof T] {
  const enumValues = Object.values(enumObj);
  if (!enumValues.includes(value as any)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${enumValues.join(', ')}`,
      fieldName,
      value
    );
  }
  return value as T[keyof T];
}

/**
 * Validate array items
 */
export function validateArray<T>(
  array: T[],
  validator: (item: T, index: number) => T,
  options: {
    fieldName: string;
    minItems?: number;
    maxItems?: number;
  }
): T[] {
  const { fieldName, minItems, maxItems } = options;
  
  if (!Array.isArray(array)) {
    throw new ValidationError(
      `${fieldName} must be an array`,
      fieldName,
      array
    );
  }
  
  if (minItems !== undefined && array.length < minItems) {
    throw new ValidationError(
      `${fieldName} must have at least ${minItems} items`,
      fieldName,
      array
    );
  }
  
  if (maxItems !== undefined && array.length > maxItems) {
    throw new ValidationError(
      `${fieldName} must have at most ${maxItems} items`,
      fieldName,
      array
    );
  }
  
  return array.map(validator);
}

/**
 * Create a validator that combines multiple validators
 */
export function compose<T>(
  ...validators: Array<(value: T) => T>
): (value: T) => T {
  return (value: T) => {
    return validators.reduce((acc, validator) => validator(acc), value);
  };
}

/**
 * Create optional validator (allows null/undefined)
 */
export function optional<T>(
  validator: (value: T) => T
): (value: T | null | undefined) => T | null | undefined {
  return (value: T | null | undefined) => {
    if (value === null || value === undefined) {
      return value;
    }
    return validator(value);
  };
}
