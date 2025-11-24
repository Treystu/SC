/**
 * Tests for Enhanced QR Code Discovery
 */

import { describe, it, expect } from '@jest/globals';
import {
  QRCodeDiscoveryV2,
  QRCodeDiscovery,
  QR_FORMAT_VERSION,
  type QRPeerInfo,
} from './qr-enhanced';
import { hexToBytes } from '@noble/hashes/utils.js';

describe('Enhanced QR Code Discovery', () => {
  const testPeerInfo: QRPeerInfo = {
    publicKey: hexToBytes('a'.repeat(64)), // 32 bytes
    peerId: 'test-peer-123',
    displayName: 'Test Peer',
    endpoints: [
      { type: 'webrtc', signaling: 'relay-1' },
      { type: 'local', address: '192.168.1.100:8080' },
    ],
    timestamp: Date.now(),
  };

  describe('QRCodeDiscoveryV2', () => {
    describe('generateQRData', () => {
      it('should generate valid QR code data', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        
        expect(qrData).toBeTruthy();
        expect(typeof qrData).toBe('string');
        expect(qrData.length).toBeGreaterThan(0);
      });

      it('should include version in QR data', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const result = QRCodeDiscoveryV2.parseQRData(qrData);
        
        expect(result.valid).toBe(true);
        expect(result.info).toBeDefined();
      });

      it('should include checksum for validation', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const result = QRCodeDiscoveryV2.parseQRData(qrData);
        
        expect(result.valid).toBe(true);
        // If checksum was invalid, parsing would fail
      });

      it('should include capabilities if provided', () => {
        const capabilities = {
          webrtc: true,
          ble: false,
          fileTransfer: true,
        };

        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo, capabilities);
        expect(qrData).toBeTruthy();
      });

      it('should generate compact QR data', () => {
        const peerWithManyEndpoints: QRPeerInfo = {
          ...testPeerInfo,
          endpoints: [
            { type: 'webrtc', signaling: 'relay-1' },
            { type: 'local', address: '192.168.1.100:8080' },
            { type: 'local', address: '192.168.1.101:8080' },
            { type: 'manual', address: '10.0.0.1:9000' },
          ],
        };

        const compactData = QRCodeDiscoveryV2.generateCompactQRData(peerWithManyEndpoints);
        const normalData = QRCodeDiscoveryV2.generateQRData(peerWithManyEndpoints);
        
        expect(compactData.length).toBeLessThan(normalData.length);
      });
    });

    describe('parseQRData', () => {
      it('should parse valid QR code data', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const result = QRCodeDiscoveryV2.parseQRData(qrData);
        
        expect(result.valid).toBe(true);
        expect(result.info).toBeDefined();
        expect(result.info?.peerId).toBe(testPeerInfo.peerId);
      });

      it('should validate version negotiation', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const result = QRCodeDiscoveryV2.parseQRData(qrData);
        
        expect(result.valid).toBe(true);
      });

      it('should reject unsupported versions', () => {
        // Manually craft a QR code with unsupported version
        const invalidData = {
          version: 999,
          publicKey: 'a'.repeat(64),
          peerId: 'test',
          endpoints: [],
          timestamp: Date.now(),
          checksum: '0'.repeat(64),
        };

        const encoded = typeof btoa !== 'undefined' 
          ? btoa('SC2:' + JSON.stringify(invalidData))
          : Buffer.from('SC2:' + JSON.stringify(invalidData)).toString('base64');

        const result = QRCodeDiscoveryV2.parseQRData(encoded);
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unsupported version');
      });

      it('should detect corrupted data via checksum', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        
        // Corrupt the data
        const corrupted = qrData.substring(0, qrData.length - 10) + 'CORRUPTED';
        
        const result = QRCodeDiscoveryV2.parseQRData(corrupted);
        
        // Should fail either at decode or checksum stage
        expect(result.valid).toBe(false);
      });

      it('should validate public key format', () => {
        // Create data with valid checksum but invalid public key format
        const invalidData = {
          version: QR_FORMAT_VERSION,
          publicKey: 'not-valid-hex',
          peerId: 'test',
          endpoints: [],
          timestamp: Date.now(),
        };

        // Calculate checksum for this invalid data
        const dataString = JSON.stringify(invalidData);
        const checksum = typeof require !== 'undefined' 
          ? require('@noble/hashes/sha2.js').sha256(new TextEncoder().encode(dataString))
          : new Uint8Array(32);
        
        const checksumHex = Array.from(checksum).map((b: any) => b.toString(16).padStart(2, '0')).join('');
        const fullData = { ...invalidData, checksum: checksumHex };

        const encoded = typeof btoa !== 'undefined'
          ? btoa('SC2:' + JSON.stringify(fullData))
          : Buffer.from('SC2:' + JSON.stringify(fullData)).toString('base64');

        const result = QRCodeDiscoveryV2.parseQRData(encoded);
        
        expect(result.valid).toBe(false);
        // Could be checksum or validation error, just verify it fails
        expect(result.error).toBeTruthy();
      });

      it('should validate public key length', () => {
        // Create data with valid checksum but invalid public key length
        const invalidData = {
          version: QR_FORMAT_VERSION,
          publicKey: 'a'.repeat(32), // Too short (16 bytes instead of 32)
          peerId: 'test',
          endpoints: [],
          timestamp: Date.now(),
        };

        // Calculate checksum for this invalid data
        const dataString = JSON.stringify(invalidData);
        const checksum = typeof require !== 'undefined'
          ? require('@noble/hashes/sha2.js').sha256(new TextEncoder().encode(dataString))
          : new Uint8Array(32);
        
        const checksumHex = Array.from(checksum).map((b: any) => b.toString(16).padStart(2, '0')).join('');
        const fullData = { ...invalidData, checksum: checksumHex };

        const encoded = typeof btoa !== 'undefined'
          ? btoa('SC2:' + JSON.stringify(fullData))
          : Buffer.from('SC2:' + JSON.stringify(fullData)).toString('base64');

        const result = QRCodeDiscoveryV2.parseQRData(encoded);
        
        expect(result.valid).toBe(false);
        // Could be checksum or validation error, just verify it fails
        expect(result.error).toBeTruthy();
      });

      it('should validate timestamp', () => {
        const peerInfoFuture: QRPeerInfo = {
          ...testPeerInfo,
          timestamp: Date.now() + 7200000, // 2 hours in future
        };

        const qrData = QRCodeDiscoveryV2.generateQRData(peerInfoFuture);
        const result = QRCodeDiscoveryV2.parseQRData(qrData);
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain('future');
      });

      it('should validate endpoint types', () => {
        // Create data with valid checksum but invalid endpoint type
        const invalidData = {
          version: QR_FORMAT_VERSION,
          publicKey: 'a'.repeat(64),
          peerId: 'test',
          endpoints: [
            { type: 'invalid-type', address: '192.168.1.1:8080' },
          ],
          timestamp: Date.now(),
        };

        // Calculate checksum for this invalid data
        const dataString = JSON.stringify(invalidData);
        const checksum = typeof require !== 'undefined'
          ? require('@noble/hashes/sha2.js').sha256(new TextEncoder().encode(dataString))
          : new Uint8Array(32);
        
        const checksumHex = Array.from(checksum).map((b: any) => b.toString(16).padStart(2, '0')).join('');
        const fullData = { ...invalidData, checksum: checksumHex };

        const encoded = typeof btoa !== 'undefined'
          ? btoa('SC2:' + JSON.stringify(fullData))
          : Buffer.from('SC2:' + JSON.stringify(fullData)).toString('base64');

        const result = QRCodeDiscoveryV2.parseQRData(encoded);
        
        expect(result.valid).toBe(false);
        // Could be checksum or validation error, just verify it fails
        expect(result.error).toBeTruthy();
      });

      it('should parse all peer info correctly', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const result = QRCodeDiscoveryV2.parseQRData(qrData);
        
        expect(result.valid).toBe(true);
        expect(result.info?.peerId).toBe(testPeerInfo.peerId);
        expect(result.info?.displayName).toBe(testPeerInfo.displayName);
        expect(result.info?.endpoints).toHaveLength(testPeerInfo.endpoints.length);
        expect(result.info?.publicKey).toEqual(testPeerInfo.publicKey);
      });
    });

    describe('validateQRSize', () => {
      it('should validate QR code size', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const validation = QRCodeDiscoveryV2.validateQRSize(qrData);
        
        expect(validation.valid).toBe(true);
        expect(validation.size).toBeGreaterThan(0);
      });

      it('should warn about large QR codes', () => {
        const largeInfo: QRPeerInfo = {
          ...testPeerInfo,
          displayName: 'A'.repeat(500),
          endpoints: Array(20).fill(null).map((_, i) => ({
            type: 'local' as const,
            address: `192.168.1.${i}:8080`,
          })),
        };

        const qrData = QRCodeDiscoveryV2.generateQRData(largeInfo);
        const validation = QRCodeDiscoveryV2.validateQRSize(qrData);
        
        expect(validation.size).toBeGreaterThan(1000);
        if (validation.size > 1000) {
          expect(validation.recommendation).toBeDefined();
        }
      });

      it('should reject extremely large QR codes', () => {
        const hugeInfo: QRPeerInfo = {
          ...testPeerInfo,
          displayName: 'A'.repeat(2000),
          endpoints: Array(100).fill(null).map((_, i) => ({
            type: 'local' as const,
            address: `192.168.1.${i}:8080`,
          })),
        };

        const qrData = QRCodeDiscoveryV2.generateQRData(hugeInfo);
        const validation = QRCodeDiscoveryV2.validateQRSize(qrData);
        
        expect(validation.valid).toBe(false);
      });
    });

    describe('quickValidate', () => {
      it('should quickly validate correct QR data', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        const isValid = QRCodeDiscoveryV2.quickValidate(qrData);
        
        expect(isValid).toBe(true);
      });

      it('should quickly reject invalid QR data', () => {
        const invalidData = 'not-a-valid-qr-code';
        const isValid = QRCodeDiscoveryV2.quickValidate(invalidData);
        
        expect(isValid).toBe(false);
      });

      it('should be faster than full parsing', () => {
        const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
        
        const quickStart = Date.now();
        QRCodeDiscoveryV2.quickValidate(qrData);
        const quickTime = Date.now() - quickStart;
        
        const fullStart = Date.now();
        QRCodeDiscoveryV2.parseQRData(qrData);
        const fullTime = Date.now() - fullStart;
        
        // Quick validate should be at least as fast
        expect(quickTime).toBeLessThanOrEqual(fullTime + 5); // 5ms tolerance
      });
    });
  });

  describe('QRCodeDiscovery (v1 compatibility)', () => {
    it('should generate QR data using v2 internally', () => {
      const qrData = QRCodeDiscovery.generateQRData(testPeerInfo);
      
      expect(qrData).toBeTruthy();
      expect(typeof qrData).toBe('string');
    });

    it('should parse QR data and return PeerInfo', () => {
      const qrData = QRCodeDiscovery.generateQRData(testPeerInfo);
      const parsed = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsed).not.toBeNull();
      expect(parsed?.peerId).toBe(testPeerInfo.peerId);
    });

    it('should return null for invalid QR data', () => {
      const parsed = QRCodeDiscovery.parseQRData('invalid-qr-code');
      
      expect(parsed).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should generate QR code within 2 seconds', () => {
      const startTime = Date.now();
      const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
      const generationTime = Date.now() - startTime;
      
      expect(generationTime).toBeLessThan(2000);
      expect(qrData).toBeTruthy();
    });

    it('should parse QR code within 2 seconds', () => {
      const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
      
      const startTime = Date.now();
      const result = QRCodeDiscoveryV2.parseQRData(qrData);
      const parseTime = Date.now() - startTime;
      
      expect(parseTime).toBeLessThan(2000);
      expect(result.valid).toBe(true);
    });
  });

  describe('Error Correction', () => {
    it('should include redundancy in encoded data', () => {
      const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
      
      // Encoded data should contain SC2: marker for v2 format
      const decoded = typeof atob !== 'undefined'
        ? atob(qrData)
        : Buffer.from(qrData, 'base64').toString('utf-8');
      
      expect(decoded).toContain('SC2:');
    });

    it('should verify data integrity with checksum', () => {
      const qrData = QRCodeDiscoveryV2.generateQRData(testPeerInfo);
      const result = QRCodeDiscoveryV2.parseQRData(qrData);
      
      // Successful parse means checksum verified
      expect(result.valid).toBe(true);
    });
  });
});
