/**
 * Tests for Local Network Server
 */

import { LocalNetworkServer } from '../localNetworkServer';
import type { PendingInvite } from '@sc/core';

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  onicecandidate: ((event: any) => void) | null = null;
  
  createDataChannel() {}
  
  async createOffer() {
    return { type: 'offer', sdp: 'mock-sdp' };
  }
  
  async setLocalDescription() {}
  
  close() {}
  
  // Simulate ICE candidate gathering
  simulateICECandidate(ip: string, type: string = 'host') {
    if (this.onicecandidate) {
      this.onicecandidate({
        candidate: {
          candidate: `candidate:1 1 udp 2130706431 ${ip} 12345 typ ${type}`,
        },
      });
    }
  }
  
  // Simulate ICE gathering complete
  simulateICEComplete() {
    if (this.onicecandidate) {
      this.onicecandidate({ candidate: null });
    }
  }
}

// Mock Service Worker
const mockServiceWorker = {
  ready: Promise.resolve({
    active: {
      postMessage: jest.fn(),
    },
  }),
};

const originalRTCPeerConnection = global.RTCPeerConnection;

beforeEach(() => {
  // Mock RTCPeerConnection
  (global as any).RTCPeerConnection = MockRTCPeerConnection;

  // Mock Service Worker
  Object.defineProperty(global.navigator, 'serviceWorker', {
    value: mockServiceWorker,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Restore RTCPeerConnection
  (global as any).RTCPeerConnection = originalRTCPeerConnection;
});

describe('LocalNetworkServer', () => {
  const mockInvite: PendingInvite = {
    code: 'test-invite-code-123',
    inviterPeerId: 'peer-123',
    inviterPublicKey: new Uint8Array(32),
    inviterName: 'Test User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    signature: new Uint8Array(64),
    bootstrapPeers: [],
  };

  describe('startSharing', () => {
    it('should discover local IPs and build URLs', async () => {
      const server = new LocalNetworkServer();
      
      // Start sharing (this will create a PeerConnection)
      const resultPromise = server.startSharing(mockInvite);
      
      // Wait a bit for PeerConnection to be created
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Simulate ICE candidates
      const pc = (global as any).RTCPeerConnection.mock?.instances?.[0];
      if (pc) {
        pc.simulateICECandidate('192.168.1.100');
        pc.simulateICECandidate('10.0.0.50');
        pc.simulateICEComplete();
      }
      
      const result = await resultPromise;
      
      // Should have URLs for discovered IPs
      expect(result.urls).toBeDefined();
      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.qrCodes).toBeDefined();
    });

    it('should filter IPv6 addresses', async () => {
      const server = new LocalNetworkServer();
      const resultPromise = server.startSharing(mockInvite);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const pc = (global as any).RTCPeerConnection.mock?.instances?.[0];
      if (pc) {
        pc.simulateICECandidate('192.168.1.100');
        pc.simulateICECandidate('fe80::1'); // IPv6 - should be filtered
        pc.simulateICEComplete();
      }
      
      const result = await resultPromise;
      
      // Should not contain IPv6 addresses
      const hasIPv6 = result.urls.some(url => url.includes('fe80'));
      expect(hasIPv6).toBe(false);
    });

    it('should register invite with service worker', async () => {
      const server = new LocalNetworkServer();
      
      await server.startSharing(mockInvite);
      
      // Wait for service worker registration
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const registration = await mockServiceWorker.ready;
      expect(registration.active.postMessage).toHaveBeenCalledWith({
        type: 'REGISTER_INVITE',
        invite: {
          code: mockInvite.code,
          inviterName: mockInvite.inviterName,
        },
      });
    });

    it('should fallback to hostname when no IPs found', async () => {
      const server = new LocalNetworkServer();
      const resultPromise = server.startSharing(mockInvite);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const pc = (global as any).RTCPeerConnection.mock?.instances?.[0];
      if (pc) {
        // Don't simulate any candidates, just complete
        pc.simulateICEComplete();
      }
      
      const result = await resultPromise;
      
      // Should fallback to current hostname
      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.urls[0]).toContain('localhost');
    });
  });

  describe('stopSharing', () => {
    it('should unregister invite from service worker', async () => {
      const server = new LocalNetworkServer();
      
      await server.stopSharing();
      
      const registration = await mockServiceWorker.ready;
      expect(registration.active.postMessage).toHaveBeenCalledWith({
        type: 'UNREGISTER_INVITE',
      });
    });

    it('should handle service worker not available', async () => {
      // Remove service worker
      Object.defineProperty(global.navigator, 'serviceWorker', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const server = new LocalNetworkServer();
      
      // Should not throw
      await expect(server.stopSharing()).resolves.toBeUndefined();
    });
  });
});
