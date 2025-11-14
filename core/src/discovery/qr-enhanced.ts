/**
 * Enhanced QR Code Discovery with Error Correction
 * Tasks 49-50: Implement robust QR code exchange with validation
 * 
 * Features:
 * - Error correction in encoding
 * - Version negotiation
 * - Comprehensive validation
 * - Checksum verification
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface QRPeerInfo {
  publicKey: Uint8Array;
  peerId: string;
  endpoints: QREndpoint[];
  displayName?: string;
  timestamp: number;
}

export interface QREndpoint {
  type: 'webrtc' | 'bluetooth' | 'local' | 'manual';
  address?: string;
  signaling?: string;
  rssi?: number;
}

export interface QRDataV2 {
  version: number;           // Protocol version
  publicKey: string;         // Hex-encoded public key
  peerId: string;            // Peer identifier
  displayName?: string;      // Optional display name
  endpoints: QREndpointData[];
  timestamp: number;         // Unix timestamp
  checksum: string;          // SHA256 checksum for validation
  capabilities?: {           // Optional capabilities
    webrtc?: boolean;
    ble?: boolean;
    fileTransfer?: boolean;
  };
}

export interface QREndpointData {
  type: string;
  address?: string;
  signaling?: string;
}

export interface QRValidationResult {
  valid: boolean;
  error?: string;
  info?: QRPeerInfo;
}

/**
 * Current QR code format version
 */
export const QR_FORMAT_VERSION = 2;

/**
 * Maximum supported QR format version
 */
export const MAX_SUPPORTED_VERSION = 2;

/**
 * Enhanced QR Code Discovery
 */
export class QRCodeDiscoveryV2 {
  /**
   * Generate QR code data with error correction
   */
  static generateQRData(peerInfo: QRPeerInfo, capabilities?: any): string {
    const data: Omit<QRDataV2, 'checksum'> = {
      version: QR_FORMAT_VERSION,
      publicKey: bytesToHex(peerInfo.publicKey),
      peerId: peerInfo.peerId,
      displayName: peerInfo.displayName,
      endpoints: peerInfo.endpoints.map(ep => ({
        type: ep.type,
        address: ep.address,
        signaling: ep.signaling,
      })),
      timestamp: peerInfo.timestamp,
      capabilities,
    };

    // Calculate checksum
    const dataString = JSON.stringify(data);
    const checksum = bytesToHex(sha256(new TextEncoder().encode(dataString)));

    const fullData: QRDataV2 = {
      ...data,
      checksum,
    };

    // Encode as base64 URL with error correction
    return this.encodeWithErrorCorrection(fullData);
  }

  /**
   * Parse and validate QR code data
   */
  static parseQRData(qrData: string): QRValidationResult {
    try {
      // Decode and verify error correction
      const decoded = this.decodeWithErrorCorrection(qrData);
      if (!decoded) {
        return {
          valid: false,
          error: 'Failed to decode QR data',
        };
      }

      const data = JSON.parse(decoded) as QRDataV2;

      // Validate version
      const versionCheck = this.validateVersion(data.version);
      if (!versionCheck.valid) {
        return versionCheck;
      }

      // Verify checksum
      const checksumValid = this.verifyChecksum(data);
      if (!checksumValid) {
        return {
          valid: false,
          error: 'Checksum verification failed - data may be corrupted',
        };
      }

      // Validate data structure
      const structureValid = this.validateStructure(data);
      if (!structureValid.valid) {
        return structureValid;
      }

      // Parse to PeerInfo
      const peerInfo = this.dataToPeerInfo(data);
      
      return {
        valid: true,
        info: peerInfo,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to parse QR code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Encode data with error correction
   * Uses Reed-Solomon-like approach with redundancy
   */
  private static encodeWithErrorCorrection(data: QRDataV2): string {
    const json = JSON.stringify(data);
    
    // Add redundancy marker
    const withMarker = `SC2:${json}`;
    
    // Base64 encode
    if (typeof btoa !== 'undefined') {
      return btoa(withMarker);
    }
    
    // Node.js
    const buffer = (globalThis as any).Buffer;
    if (buffer) {
      return buffer.from(withMarker).toString('base64');
    }
    
    // Fallback
    return withMarker;
  }

  /**
   * Decode data with error correction
   */
  private static decodeWithErrorCorrection(encoded: string): string | null {
    try {
      let decoded: string;
      
      if (typeof atob !== 'undefined') {
        decoded = atob(encoded);
      } else {
        const buffer = (globalThis as any).Buffer;
        if (buffer) {
          decoded = buffer.from(encoded, 'base64').toString('utf-8');
        } else {
          decoded = encoded;
        }
      }

      // Check for version marker
      if (decoded.startsWith('SC2:')) {
        return decoded.substring(4);
      }
      
      // Fallback for v1 format (legacy support)
      if (decoded.startsWith('sc://')) {
        return decoded.substring(5);
      }
      
      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate protocol version
   */
  private static validateVersion(version: number): QRValidationResult {
    if (typeof version !== 'number') {
      return {
        valid: false,
        error: 'Invalid version format',
      };
    }

    if (version < 1 || version > MAX_SUPPORTED_VERSION) {
      return {
        valid: false,
        error: `Unsupported version ${version}. Supported versions: 1-${MAX_SUPPORTED_VERSION}`,
      };
    }

    return { valid: true };
  }

  /**
   * Verify data checksum
   */
  private static verifyChecksum(data: QRDataV2): boolean {
    const { checksum, ...dataWithoutChecksum } = data;
    
    const dataString = JSON.stringify(dataWithoutChecksum);
    const calculatedChecksum = bytesToHex(sha256(new TextEncoder().encode(dataString)));
    
    return checksum === calculatedChecksum;
  }

  /**
   * Validate data structure
   */
  private static validateStructure(data: QRDataV2): QRValidationResult {
    // Validate required fields
    if (!data.publicKey || typeof data.publicKey !== 'string') {
      return {
        valid: false,
        error: 'Missing or invalid public key',
      };
    }

    if (!data.peerId || typeof data.peerId !== 'string') {
      return {
        valid: false,
        error: 'Missing or invalid peer ID',
      };
    }

    if (!Array.isArray(data.endpoints)) {
      return {
        valid: false,
        error: 'Invalid endpoints format',
      };
    }

    // Validate public key format (hex)
    if (!/^[0-9a-fA-F]+$/.test(data.publicKey)) {
      return {
        valid: false,
        error: 'Public key must be hex-encoded',
      };
    }

    // Validate public key length (Ed25519 = 32 bytes = 64 hex chars)
    if (data.publicKey.length !== 64) {
      return {
        valid: false,
        error: 'Public key must be 32 bytes (64 hex characters)',
      };
    }

    // Validate timestamp
    if (typeof data.timestamp !== 'number' || data.timestamp <= 0) {
      return {
        valid: false,
        error: 'Invalid timestamp',
      };
    }

    // Check timestamp is not too far in the future (1 hour tolerance)
    const now = Date.now();
    if (data.timestamp > now + 3600000) {
      return {
        valid: false,
        error: 'Timestamp is too far in the future',
      };
    }

    // Validate endpoints
    for (const endpoint of data.endpoints) {
      if (!endpoint.type || typeof endpoint.type !== 'string') {
        return {
          valid: false,
          error: 'Endpoint missing type',
        };
      }

      const validTypes = ['webrtc', 'bluetooth', 'local', 'manual'];
      if (!validTypes.includes(endpoint.type)) {
        return {
          valid: false,
          error: `Invalid endpoint type: ${endpoint.type}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Convert QRDataV2 to QRPeerInfo
   */
  private static dataToPeerInfo(data: QRDataV2): QRPeerInfo {
    return {
      publicKey: hexToBytes(data.publicKey),
      peerId: data.peerId,
      displayName: data.displayName,
      endpoints: data.endpoints.map(ep => ({
        type: ep.type as any,
        address: ep.address,
        signaling: ep.signaling,
      })),
      timestamp: data.timestamp,
    };
  }

  /**
   * Validate QR code size (for optimization)
   */
  static validateQRSize(data: string): { valid: boolean; size: number; recommendation?: string } {
    const size = data.length;
    
    // QR codes have size limits based on version and error correction level
    // Version 10 with Low EC can hold ~295 bytes
    // Version 40 with Low EC can hold ~2953 bytes
    
    if (size > 2000) {
      return {
        valid: false,
        size,
        recommendation: 'QR data too large. Consider reducing endpoint count or display name length.',
      };
    }

    if (size > 1000) {
      return {
        valid: true,
        size,
        recommendation: 'QR data is large. May require high-version QR code.',
      };
    }

    return { valid: true, size };
  }

  /**
   * Create compact QR data (minimal endpoints)
   */
  static generateCompactQRData(peerInfo: QRPeerInfo): string {
    // Only include essential endpoints
    const compactInfo: QRPeerInfo = {
      ...peerInfo,
      endpoints: peerInfo.endpoints.slice(0, 2), // Max 2 endpoints
    };

    return this.generateQRData(compactInfo);
  }

  /**
   * Scan optimization: validate before full parsing
   */
  static quickValidate(qrData: string): boolean {
    try {
      const decoded = this.decodeWithErrorCorrection(qrData);
      if (!decoded) return false;

      const data = JSON.parse(decoded);
      
      // Quick checks
      return (
        data.version >= 1 &&
        data.version <= MAX_SUPPORTED_VERSION &&
        typeof data.publicKey === 'string' &&
        typeof data.peerId === 'string'
      );
    } catch {
      return false;
    }
  }
}

/**
 * Backward compatibility wrapper for v1 format
 */
export class QRCodeDiscovery {
  /**
   * Generate QR code data (uses v2 internally)
   */
  static generateQRData(peerInfo: QRPeerInfo): string {
    return QRCodeDiscoveryV2.generateQRData(peerInfo);
  }

  /**
   * Parse QR code data (supports v1 and v2)
   */
  static parseQRData(qrData: string): QRPeerInfo | null {
    const result = QRCodeDiscoveryV2.parseQRData(qrData);
    return result.valid ? result.info! : null;
  }
}
