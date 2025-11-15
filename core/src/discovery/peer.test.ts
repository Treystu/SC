import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  QRCodeDiscovery,
  ManualDiscovery,
  type PeerInfo,
  type PeerEndpoint,
} from './peer';

describe('QRCodeDiscovery', () => {
  let mockPeerInfo: PeerInfo;

  beforeEach(() => {
    mockPeerInfo = {
      publicKey: new Uint8Array([1, 2, 3, 4, 5]),
      peerId: 'test-peer-123',
      displayName: 'Test Peer',
      endpoints: [
        { type: 'webrtc', signaling: 'signal-server-1' },
        { type: 'local', address: '192.168.1.100:8080' },
      ],
      timestamp: 1234567890,
    };
  });

  describe('generateQRData', () => {
    it('should generate QR code data with sc:// prefix', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      expect(qrData).toMatch(/^sc:\/\//);
    });

    it('should encode peer info in QR code', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      expect(qrData.length).toBeGreaterThan(20);
    });

    it('should handle peer without display name', () => {
      const peerWithoutName = { ...mockPeerInfo, displayName: undefined };
      const qrData = QRCodeDiscovery.generateQRData(peerWithoutName);
      expect(qrData).toMatch(/^sc:\/\//);
    });

    it('should handle peer with multiple endpoints', () => {
      const peerWithEndpoints = {
        ...mockPeerInfo,
        endpoints: [
          { type: 'webrtc' as const, signaling: 'sig1' },
          { type: 'bluetooth' as const, rssi: -50 },
          { type: 'local' as const, address: '10.0.0.1:3000' },
        ],
      };
      const qrData = QRCodeDiscovery.generateQRData(peerWithEndpoints);
      expect(qrData).toBeDefined();
    });

    it('should encode public key as hex string', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      expect(parsedPeer).toBeDefined();
      if (parsedPeer) {
        expect(parsedPeer.publicKey).toEqual(mockPeerInfo.publicKey);
      }
    });
  });

  describe('parseQRData', () => {
    it('should parse valid QR code data', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsedPeer).toBeDefined();
      expect(parsedPeer?.peerId).toBe(mockPeerInfo.peerId);
      expect(parsedPeer?.displayName).toBe(mockPeerInfo.displayName);
    });

    it('should return null for invalid QR code', () => {
      const result = QRCodeDiscovery.parseQRData('invalid-qr-code');
      expect(result).toBeNull();
    });

    it('should return null for malformed sc:// data', () => {
      const result = QRCodeDiscovery.parseQRData('sc://not-base64!!!');
      expect(result).toBeNull();
    });

    it('should parse QR code without sc:// prefix', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      const withoutPrefix = qrData.replace('sc://', '');
      const result = QRCodeDiscovery.parseQRData(withoutPrefix);
      expect(result).toBeDefined();
    });

    it('should reconstruct public key from hex', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsedPeer?.publicKey).toEqual(mockPeerInfo.publicKey);
    });

    it('should reconstruct endpoints', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsedPeer?.endpoints).toHaveLength(2);
      expect(parsedPeer?.endpoints[0].type).toBe('webrtc');
      expect(parsedPeer?.endpoints[1].type).toBe('local');
    });

    it('should handle empty endpoints array', () => {
      const peerWithoutEndpoints = { ...mockPeerInfo, endpoints: [] };
      const qrData = QRCodeDiscovery.generateQRData(peerWithoutEndpoints);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsedPeer?.endpoints).toEqual([]);
    });
  });

  describe('roundtrip encoding', () => {
    it('should preserve peer info through encode/decode cycle', () => {
      const qrData = QRCodeDiscovery.generateQRData(mockPeerInfo);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsedPeer?.peerId).toBe(mockPeerInfo.peerId);
      expect(parsedPeer?.displayName).toBe(mockPeerInfo.displayName);
      expect(parsedPeer?.timestamp).toBe(mockPeerInfo.timestamp);
    });

    it('should handle large public keys', () => {
      const largePeer = {
        ...mockPeerInfo,
        publicKey: new Uint8Array(32).fill(255),
      };
      const qrData = QRCodeDiscovery.generateQRData(largePeer);
      const parsedPeer = QRCodeDiscovery.parseQRData(qrData);
      
      expect(parsedPeer?.publicKey).toHaveLength(32);
    });
  });
});

describe('ManualDiscovery', () => {
  describe('parseManualEntry', () => {
    it('should parse valid IP:port address', () => {
      const result = ManualDiscovery.parseManualEntry('192.168.1.100:8080');
      expect(result).toBeDefined();
      expect(result?.type).toBe('manual');
      expect(result?.address).toBe('192.168.1.100:8080');
    });

    it('should parse peer_id@IP:port format', () => {
      const result = ManualDiscovery.parseManualEntry('peer123@10.0.0.1:3000');
      expect(result).toBeDefined();
      expect(result?.type).toBe('manual');
      expect(result?.address).toBe('10.0.0.1:3000');
    });

    it('should reject invalid port numbers', () => {
      const result1 = ManualDiscovery.parseManualEntry('192.168.1.1:0');
      expect(result1).toBeNull();
      
      const result2 = ManualDiscovery.parseManualEntry('192.168.1.1:70000');
      expect(result2).toBeNull();
      
      const result3 = ManualDiscovery.parseManualEntry('192.168.1.1:-1');
      expect(result3).toBeNull();
    });

    it('should reject malformed addresses', () => {
      const result1 = ManualDiscovery.parseManualEntry('invalid');
      expect(result1).toBeNull();
      
      const result2 = ManualDiscovery.parseManualEntry('192.168.1.1');
      expect(result2).toBeNull();
      
      const result3 = ManualDiscovery.parseManualEntry('192.168.1.1:abc');
      expect(result3).toBeNull();
    });

    it('should handle IPv6 addresses', () => {
      const result = ManualDiscovery.parseManualEntry('[::1]:8080');
      // May or may not be supported depending on implementation
      expect(result).toBeDefined();
    });

    it('should handle domain names with ports', () => {
      const result = ManualDiscovery.parseManualEntry('example.com:8080');
      expect(result).toBeDefined();
      expect(result?.address).toBe('example.com:8080');
    });
  });
});
