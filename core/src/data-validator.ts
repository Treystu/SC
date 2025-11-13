// Data Validator - Validates and sanitizes user input
// Task 220: Input validation and sanitization

export class DataValidator {
  // Validate message content
  static validateMessage(content: string): { valid: boolean; error?: string; sanitized?: string } {
    if (!content) {
      return { valid: false, error: 'Message cannot be empty' };
    }

    if (content.length > 10000) {
      return { valid: false, error: 'Message exceeds maximum length (10,000 characters)' };
    }

    // Sanitize HTML/script tags
    const sanitized = this.sanitizeHtml(content);

    return { valid: true, sanitized };
  }

  // Validate peer ID
  static validatePeerId(peerId: string): { valid: boolean; error?: string } {
    if (!peerId) {
      return { valid: false, error: 'Peer ID cannot be empty' };
    }

    // Peer ID should be a valid hex string (64 characters for 32-byte hash)
    const peerIdRegex = /^[a-f0-9]{64}$/i;
    if (!peerIdRegex.test(peerId)) {
      return { valid: false, error: 'Invalid peer ID format' };
    }

    return { valid: true };
  }

  // Validate public key
  static validatePublicKey(publicKey: string): { valid: boolean; error?: string } {
    if (!publicKey) {
      return { valid: false, error: 'Public key cannot be empty' };
    }

    // Ed25519 public key should be 32 bytes (64 hex characters)
    const publicKeyRegex = /^[a-f0-9]{64}$/i;
    if (!publicKeyRegex.test(publicKey)) {
      return { valid: false, error: 'Invalid public key format' };
    }

    return { valid: true };
  }

  // Validate IP address
  static validateIpAddress(ip: string): { valid: boolean; error?: string; version?: 'ipv4' | 'ipv6' } {
    if (!ip) {
      return { valid: false, error: 'IP address cannot be empty' };
    }

    // IPv4 validation
    const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
    if (ipv4Regex.test(ip)) {
      return { valid: true, version: 'ipv4' };
    }

    // IPv6 validation (simplified)
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4})$/;
    if (ipv6Regex.test(ip)) {
      return { valid: true, version: 'ipv6' };
    }

    return { valid: false, error: 'Invalid IP address format' };
  }

  // Validate port number
  static validatePort(port: number): { valid: boolean; error?: string } {
    if (port < 1 || port > 65535) {
      return { valid: false, error: 'Port must be between 1 and 65535' };
    }

    return { valid: true };
  }

  // Validate username/contact name
  static validateName(name: string): { valid: boolean; error?: string; sanitized?: string } {
    if (!name) {
      return { valid: false, error: 'Name cannot be empty' };
    }

    if (name.length < 2) {
      return { valid: false, error: 'Name must be at least 2 characters' };
    }

    if (name.length > 50) {
      return { valid: false, error: 'Name cannot exceed 50 characters' };
    }

    // Remove special characters except basic punctuation
    const sanitized = name.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();

    if (!sanitized) {
      return { valid: false, error: 'Name contains no valid characters' };
    }

    return { valid: true, sanitized };
  }

  // Validate file upload
  static validateFile(
    file: File,
    options: { maxSize?: number; allowedTypes?: string[] } = {}
  ): { valid: boolean; error?: string } {
    const maxSize = options.maxSize || 100 * 1024 * 1024; // Default 100MB
    const allowedTypes = options.allowedTypes || [];

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum (${(maxSize / (1024 * 1024)).toFixed(0)}MB)`,
      };
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    return { valid: true };
  }

  // Sanitize HTML content
  private static sanitizeHtml(html: string): string {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }

  // Validate URL
  static validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url);

      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  // Validate email (for backup/recovery purposes)
  static validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email) {
      return { valid: false, error: 'Email cannot be empty' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true };
  }

  // Validate timestamp
  static validateTimestamp(timestamp: number): { valid: boolean; error?: string } {
    const now = Date.now();
    const maxFuture = 60000; // 1 minute in future
    const maxPast = 30 * 24 * 60 * 60 * 1000; // 30 days in past

    if (timestamp > now + maxFuture) {
      return { valid: false, error: 'Timestamp is too far in the future' };
    }

    if (timestamp < now - maxPast) {
      return { valid: false, error: 'Timestamp is too old' };
    }

    return { valid: true };
  }
}
