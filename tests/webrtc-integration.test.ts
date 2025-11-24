import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebRTCTransport } from '../core/src/webrtc-transport';

describe('WebRTC Integration Tests', () => {
  let transport1: WebRTCTransport;
  let transport2: WebRTCTransport;

  beforeEach(() => {
    transport1 = new WebRTCTransport('peer1');
    transport2 = new WebRTCTransport('peer2');
  });

  afterEach(() => {
    transport1.close();
    transport2.close();
  });

  it('should establish peer connection between two peers', async () => {
    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    expect(transport1.getConnectionState('peer2')).toBe('connected');
    expect(transport2.getConnectionState('peer1')).toBe('connected');
  });

  it('should exchange ICE candidates', async () => {
    const candidates1: RTCIceCandidate[] = [];
    const candidates2: RTCIceCandidate[] = [];

    transport1.on('icecandidate', (peerId, candidate) => {
      if (peerId === 'peer2') candidates1.push(candidate);
    });

    transport2.on('icecandidate', (peerId, candidate) => {
      if (peerId === 'peer1') candidates2.push(candidate);
    });

    const offer = await transport1.createOffer('peer2');
    await transport2.handleOffer('peer1', offer);

    // Wait for ICE gathering
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(candidates1.length).toBeGreaterThan(0);
    expect(candidates2.length).toBeGreaterThan(0);
  });

  it('should send and receive messages over data channel', async () => {
    const receivedMessages: string[] = [];

    transport2.on('message', (peerId, message) => {
      receivedMessages.push(message);
    });

    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 500));

    await transport1.send('peer2', 'Hello from peer1');
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(receivedMessages).toContain('Hello from peer1');
  });

  it('should handle connection state changes', async () => {
    const states: string[] = [];

    transport1.on('connectionstatechange', (peerId, state) => {
      states.push(state);
    });

    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(states).toContain('connecting');
    expect(states).toContain('connected');
  });

  it('should automatically reconnect on connection failure', async () => {
    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    await new Promise(resolve => setTimeout(resolve, 500));
    expect(transport1.getConnectionState('peer2')).toBe('connected');

    // Simulate connection failure
    transport1.simulateConnectionFailure('peer2');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Should attempt reconnection
    expect(transport1.getConnectionState('peer2')).toMatch(/connecting|connected/);
  });

  it('should handle graceful peer disconnection', async () => {
    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    await new Promise(resolve => setTimeout(resolve, 500));

    await transport1.disconnect('peer2');

    expect(transport1.getConnectionState('peer2')).toBe('closed');
  });

  it('should create both reliable and unreliable data channels', async () => {
    const reliableChannel = await transport1.createDataChannel('peer2', 'reliable', true);
    const unreliableChannel = await transport1.createDataChannel('peer2', 'unreliable', false);

    expect(reliableChannel.ordered).toBe(true);
    expect(unreliableChannel.ordered).toBe(false);
    expect(unreliableChannel.maxRetransmits).toBe(0);
  });

  it('should handle multiple simultaneous connections', async () => {
    const transport3 = new WebRTCTransport('peer3');

    const offer1 = await transport1.createOffer('peer2');
    const offer2 = await transport1.createOffer('peer3');

    const answer1 = await transport2.handleOffer('peer1', offer1);
    const answer2 = await transport3.handleOffer('peer1', offer2);

    await transport1.handleAnswer('peer2', answer1);
    await transport1.handleAnswer('peer3', answer2);

    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(transport1.getConnectionState('peer2')).toBe('connected');
    expect(transport1.getConnectionState('peer3')).toBe('connected');

    transport3.close();
  });

  it('should handle large message fragmentation', async () => {
    const largeMessage = 'x'.repeat(100000); // 100KB message
    const receivedMessages: string[] = [];

    transport2.on('message', (peerId, message) => {
      receivedMessages.push(message);
    });

    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    await new Promise(resolve => setTimeout(resolve, 500));

    await transport1.send('peer2', largeMessage);
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(receivedMessages[0]).toBe(largeMessage);
  });

  it('should monitor connection quality metrics', async () => {
    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const metrics = await transport1.getConnectionMetrics('peer2');

    expect(metrics).toHaveProperty('latency');
    expect(metrics).toHaveProperty('bandwidth');
    expect(metrics).toHaveProperty('packetLoss');
    expect(metrics.latency).toBeGreaterThanOrEqual(0);
  });

  it('should handle SDP offer/answer exchange errors', async () => {
    const invalidOffer = 'invalid-sdp';

    await expect(
      transport2.handleOffer('peer1', invalidOffer)
    ).rejects.toThrow();
  });

  it('should clean up resources on close', async () => {
    const offer = await transport1.createOffer('peer2');
    const answer = await transport2.handleOffer('peer1', offer);
    await transport1.handleAnswer('peer2', answer);

    await new Promise(resolve => setTimeout(resolve, 500));

    transport1.close();

    expect(transport1.getConnectionState('peer2')).toBe('closed');
    expect(transport1.getActiveConnections()).toHaveLength(0);
  });
});
