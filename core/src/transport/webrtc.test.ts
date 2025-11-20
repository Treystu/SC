import { WebRTCPeer, PeerConnectionPool } from './webrtc';

// Note: WebRTC tests are skipped in Node.js environment
// RTCPeerConnection is not available outside of a browser context
describe('WebRTC Module', () => {
  describe('Exports', () => {
    it('should export WebRTCPeer class', () => {
      expect(WebRTCPeer).toBeDefined();
      expect(typeof WebRTCPeer).toBe('function');
    });

    it('should export PeerConnectionPool class', () => {
      expect(PeerConnectionPool).toBeDefined();
      expect(typeof PeerConnectionPool).toBe('function');
    });
  });

  // WebRTC functionality tests require a browser environment with RTCPeerConnection
  // These would be tested in integration/E2E tests with proper WebRTC support
});
