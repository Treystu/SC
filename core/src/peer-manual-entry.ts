/**
 * Manual IP:Port Peer Entry
 * Task 53: Implement manual IP:port peer entry
 * 
 * Allows users to manually enter peer connection information
 */

export interface ManualPeerEntry {
  ip: string;
  port: number;
  publicKey?: string;
  nickname?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class ManualPeerEntryManager {
  private savedPeers: Map<string, ManualPeerEntry> = new Map();
  
  /**
   * Validate IP address (IPv4 and IPv6)
   */
  validateIP(ip: string): ValidationResult {
    // IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.');
      const valid = parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
      
      if (!valid) {
        return { valid: false, error: 'Invalid IPv4 address. Each octet must be 0-255.' };
      }
      
      // Check for private/reserved IPs
      if (ip === '0.0.0.0' || ip.startsWith('127.')) {
        return { valid: false, error: 'Loopback addresses are not allowed.' };
      }
      
      return { valid: true };
    }
    
    // IPv6 validation (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv6Regex.test(ip)) {
      return { valid: true };
    }
    
    // Hostname validation
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (hostnameRegex.test(ip)) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid IP address or hostname format.' };
  }
  
  /**
   * Validate port number
   */
  validatePort(port: number): ValidationResult {
    if (!Number.isInteger(port)) {
      return { valid: false, error: 'Port must be an integer.' };
    }
    
    if (port < 1 || port > 65535) {
      return { valid: false, error: 'Port must be between 1 and 65535.' };
    }
    
    // Warn about well-known ports
    if (port < 1024) {
      return { valid: true, error: 'Warning: Using a well-known port (< 1024) may require elevated privileges.' };
    }
    
    return { valid: true };
  }
  
  /**
   * Validate public key format
   */
  validatePublicKey(key: string): ValidationResult {
    if (!key) {
      return { valid: true }; // Optional
    }
    
    // Check for base64 format (Ed25519 public keys are 32 bytes = 44 chars base64)
    const base64Regex = /^[A-Za-z0-9+/=]{43,}$/;
    if (!base64Regex.test(key)) {
      return { valid: false, error: 'Public key must be valid base64 format.' };
    }
    
    // Check length
    if (key.length !== 43 && key.length !== 44) {
      return { valid: false, error: 'Ed25519 public key should be 43-44 characters (base64).' };
    }
    
    return { valid: true };
  }
  
  /**
   * Parse connection string (formats: ip:port, ip:port:publickey)
   */
  parseConnectionString(connectionString: string): ManualPeerEntry | ValidationResult {
    const parts = connectionString.trim().split(':');
    
    if (parts.length < 2) {
      return { valid: false, error: 'Format must be IP:PORT or IP:PORT:PUBLICKEY' };
    }
    
    const ip = parts[0];
    const portStr = parts[1];
    const publicKey = parts.length > 2 ? parts.slice(2).join(':') : undefined;
    
    // Validate IP
    const ipResult = this.validateIP(ip);
    if (!ipResult.valid) {
      return ipResult;
    }
    
    // Validate port
    const port = parseInt(portStr, 10);
    const portResult = this.validatePort(port);
    if (!portResult.valid) {
      return portResult;
    }
    
    // Validate public key if provided
    if (publicKey) {
      const keyResult = this.validatePublicKey(publicKey);
      if (!keyResult.valid) {
        return keyResult;
      }
    }
    
    return { ip, port, publicKey };
  }
  
  /**
   * Add manual peer entry
   */
  addPeer(entry: ManualPeerEntry): ValidationResult {
    const ipResult = this.validateIP(entry.ip);
    if (!ipResult.valid) return ipResult;
    
    const portResult = this.validatePort(entry.port);
    if (!portResult.valid) return portResult;
    
    if (entry.publicKey) {
      const keyResult = this.validatePublicKey(entry.publicKey);
      if (!keyResult.valid) return keyResult;
    }
    
    const key = `${entry.ip}:${entry.port}`;
    this.savedPeers.set(key, entry);
    
    return { valid: true };
  }
  
  /**
   * Remove peer entry
   */
  removePeer(ip: string, port: number): boolean {
    const key = `${ip}:${port}`;
    return this.savedPeers.delete(key);
  }
  
  /**
   * Get all saved peers
   */
  getSavedPeers(): ManualPeerEntry[] {
    return Array.from(this.savedPeers.values());
  }
  
  /**
   * Get connection URL for WebRTC signaling
   */
  getConnectionURL(entry: ManualPeerEntry): string {
    return `ws://${entry.ip}:${entry.port}`;
  }
  
  /**
   * Export peers to JSON
   */
  exportPeers(): string {
    const peers = this.getSavedPeers();
    return JSON.stringify(peers, null, 2);
  }
  
  /**
   * Import peers from JSON
   */
  importPeers(json: string): ValidationResult {
    try {
      const peers = JSON.parse(json);
      
      if (!Array.isArray(peers)) {
        return { valid: false, error: 'Import data must be an array of peers.' };
      }
      
      for (const peer of peers) {
        const result = this.addPeer(peer);
        if (!result.valid) {
          return result;
        }
      }
      
      return { valid: true };
    } catch (e) {
      return { valid: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }
  
  /**
   * Clear all saved peers
   */
  clear(): void {
    this.savedPeers.clear();
  }
}
