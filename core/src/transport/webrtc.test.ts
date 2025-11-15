import { WebRTCTransport } from './webrtc';
import { Message } from '../protocol/message';

describe('WebRTCTransport', () => {
  let transport: WebRTCTransport;
  let mockPeerId: string;

  beforeEach(() => {
    mockPeerId = 'test-peer-123';
    transport = new WebRTCTransport(mockPeerId);
  });

  afterEach(() => {
    transport.close();
  });

  describe('Connection Management', () => {
    it('should initialize with correct peer ID', () => {
      expect(transport.peerId).toBe(mockPeerId);
    });

    it('should create peer connection with proper configuration', () => {
      const config = transport.getConfiguration();
      expect(config).toBeDefined();
      expect(config.iceServers).toBeDefined();
    });

    it('should handle connection state changes', () => {
      const callback = jest.fn();
      transport.onConnectionStateChange(callback);
      
      transport.simulateStateChange('connected');
      expect(callback).toHaveBeenCalledWith('connected');
    });

    it('should create data channel', () => {
      const channel = transport.createDataChannel('test-channel');
      expect(channel).toBeDefined();
      expect(channel.label).toBe('test-channel');
    });

    it('should handle multiple data channels', () => {
      const channel1 = transport.createDataChannel('channel-1');
      const channel2 = transport.createDataChannel('channel-2');
      
      expect(channel1.label).toBe('channel-1');
      expect(channel2.label).toBe('channel-2');
    });
  });

  describe('Signaling', () => {
    it('should create offer', async () => {
      const offer = await transport.createOffer();
      expect(offer).toBeDefined();
      expect(offer.type).toBe('offer');
      expect(offer.sdp).toBeDefined();
    });

    it('should create answer', async () => {
      const offer = await transport.createOffer();
      await transport.setRemoteDescription(offer);
      
      const answer = await transport.createAnswer();
      expect(answer).toBeDefined();
      expect(answer.type).toBe('answer');
    });

    it('should handle ICE candidates', () => {
      const callback = jest.fn();
      transport.onIceCandidate(callback);
      
      const candidate = {
        candidate: 'candidate:1 1 udp 2113937151 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      };
      
      transport.addIceCandidate(candidate);
      expect(callback).toHaveBeenCalled();
    });

    it('should handle trickle ICE', async () => {
      const candidates: any[] = [];
      transport.onIceCandidate((candidate) => {
        candidates.push(candidate);
      });
      
      await transport.createOffer();
      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe('Data Transfer', () => {
    it('should send message through data channel', () => {
      const channel = transport.createDataChannel('data');
      const message: Message = {
        type: 'text',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now()
      };
      
      expect(() => transport.send(message)).not.toThrow();
    });

    it('should receive messages', (done) => {
      transport.onMessage((message) => {
        expect(message).toBeDefined();
        expect(message.type).toBe('text');
        done();
      });
      
      const mockMessage: Message = {
        type: 'text',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now()
      };
      
      transport.simulateIncomingMessage(mockMessage);
    });

    it('should handle binary data', () => {
      const channel = transport.createDataChannel('binary');
      const data = new Uint8Array([10, 20, 30, 40, 50]);
      
      expect(() => transport.sendBinary(data)).not.toThrow();
    });

    it('should buffer messages when not connected', () => {
      const message: Message = {
        type: 'text',
        payload: new Uint8Array([1, 2, 3]),
        timestamp: Date.now()
      };
      
      transport.send(message);
      expect(transport.getBufferedAmount()).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors', () => {
      const callback = jest.fn();
      transport.onError(callback);
      
      transport.simulateError(new Error('Connection failed'));
      expect(callback).toHaveBeenCalled();
    });

    it('should handle ICE connection failures', () => {
      const callback = jest.fn();
      transport.onConnectionStateChange(callback);
      
      transport.simulateStateChange('failed');
      expect(callback).toHaveBeenCalledWith('failed');
    });

    it('should handle data channel errors', () => {
      const channel = transport.createDataChannel('error-test');
      const callback = jest.fn();
      
      channel.addEventListener('error', callback);
      channel.dispatchEvent(new Event('error'));
      
      expect(callback).toHaveBeenCalled();
    });

    it('should recover from temporary failures', () => {
      transport.simulateStateChange('disconnected');
      expect(transport.isConnected()).toBe(false);
      
      transport.simulateStateChange('connected');
      expect(transport.isConnected()).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should close cleanly', () => {
      const channel = transport.createDataChannel('cleanup-test');
      transport.close();
      
      expect(transport.isClosed()).toBe(true);
    });

    it('should remove event listeners on close', () => {
      const callback = jest.fn();
      transport.onMessage(callback);
      
      transport.close();
      transport.simulateIncomingMessage({
        type: 'text',
        payload: new Uint8Array([1]),
        timestamp: Date.now()
      });
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should close all data channels', () => {
      const channel1 = transport.createDataChannel('ch1');
      const channel2 = transport.createDataChannel('ch2');
      
      transport.close();
      
      expect(channel1.readyState).toBe('closed');
      expect(channel2.readyState).toBe('closed');
    });
  });

  describe('Statistics', () => {
    it('should track bytes sent', () => {
      const data = new Uint8Array(100);
      transport.sendBinary(data);
      
      const stats = transport.getStats();
      expect(stats.bytesSent).toBeGreaterThanOrEqual(100);
    });

    it('should track bytes received', () => {
      const data = new Uint8Array(50);
      transport.simulateIncomingBinary(data);
      
      const stats = transport.getStats();
      expect(stats.bytesReceived).toBeGreaterThanOrEqual(50);
    });

    it('should track message count', () => {
      const message: Message = {
        type: 'text',
        payload: new Uint8Array([1]),
        timestamp: Date.now()
      };
      
      transport.send(message);
      transport.send(message);
      
      const stats = transport.getStats();
      expect(stats.messagesSent).toBe(2);
    });
  });

  describe('Configuration', () => {
    it('should use custom ICE servers', () => {
      const customConfig = {
        iceServers: [{ urls: 'stun:custom.stun.server:3478' }]
      };
      
      const customTransport = new WebRTCTransport(mockPeerId, customConfig);
      const config = customTransport.getConfiguration();
      
      expect(config.iceServers).toEqual(customConfig.iceServers);
      customTransport.close();
    });

    it('should support custom data channel options', () => {
      const options = {
        ordered: false,
        maxRetransmits: 0
      };
      
      const channel = transport.createDataChannel('custom', options);
      expect(channel.ordered).toBe(false);
    });

    it('should configure bundle policy', () => {
      const config = transport.getConfiguration();
      expect(config.bundlePolicy).toBeDefined();
    });
  });

  describe('ICE Gathering', () => {
    it('should gather ICE candidates', async () => {
      const candidates: any[] = [];
      transport.onIceCandidate((candidate) => {
        if (candidate) candidates.push(candidate);
      });
      
      await transport.createOffer();
      await transport.waitForICEGathering();
      
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('should handle ICE gathering state changes', () => {
      const callback = jest.fn();
      transport.onIceGatheringStateChange(callback);
      
      transport.simulateICEGatheringState('gathering');
      expect(callback).toHaveBeenCalledWith('gathering');
    });

    it('should complete ICE gathering', async () => {
      await transport.createOffer();
      await transport.waitForICEGathering();
      
      expect(transport.getICEGatheringState()).toBe('complete');
    });
  });

  describe('SDP Manipulation', () => {
    it('should modify SDP for bandwidth limits', async () => {
      const offer = await transport.createOffer();
      const modifiedSDP = transport.setBandwidthLimit(offer.sdp!, 1000);
      
      expect(modifiedSDP).toContain('b=AS:1000');
    });

    it('should add codec preferences', async () => {
      const offer = await transport.createOffer();
      const modifiedSDP = transport.setCodecPreference(offer.sdp!, 'opus');
      
      expect(modifiedSDP).toContain('opus');
    });
  });

  describe('Connection Quality', () => {
    it('should monitor connection quality', async () => {
      const quality = await transport.getConnectionQuality();
      
      expect(quality).toBeDefined();
      expect(quality.rtt).toBeGreaterThanOrEqual(0);
    });

    it('should detect poor connection', async () => {
      transport.simulatePoorConnection();
      const quality = await transport.getConnectionQuality();
      
      expect(quality.quality).toBe('poor');
    });
  });
});
