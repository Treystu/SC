# WebRTC Production-Ready Implementation Guide

## Overview

This document describes the production-ready WebRTC implementation for Sovereign Communications that achieves all requirements for Category 3: WebRTC Peer-to-Peer (Tasks 23-32).

## Architecture

### Core Components

1. **WebRTCPeerEnhanced** - Main peer connection class
2. **WebRTCConnectionPool** - Manages multiple peer connections
3. **Data Channels** - Separate channels for different traffic types
4. **Event System** - Comprehensive event notifications
5. **Metrics Collection** - Real-time connection statistics

## Configuration

### Basic Configuration

```typescript
import { WebRTCPeerEnhanced, WebRTCConfig } from './transport/webrtc-enhanced';

const config: WebRTCConfig = {
  peerId: 'peer-1',
  
  // ICE Servers (STUN/TURN)
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:turn.example.com:3478',
      username: 'user',
      credential: 'pass',
      credentialType: 'password'
    }
  ],
  
  // Connection parameters
  connectionTimeout: 30000,
  reconnectMaxAttempts: 5,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 30000,
  
  // Data channel parameters
  maxBufferedAmount: 16 * 1024 * 1024, // 16MB
  lowWaterMark: 1024 * 1024,           // 1MB
  
  // Metrics
  metricsEnabled: true,
  metricsInterval: 5000,
};

const peer = new WebRTCPeerEnhanced(config);
```

### Advanced Configuration

```typescript
const advancedConfig: WebRTCConfig = {
  peerId: 'peer-1',
  
  // ICE configuration
  iceTransportPolicy: 'all',      // 'all' or 'relay'
  bundlePolicy: 'max-bundle',     // Optimal for performance
  rtcpMuxPolicy: 'require',       // Required for WebRTC
  iceCandidatePoolSize: 10,       // Pre-gather candidates
  
  // ... other options
};
```

## Data Channels

### Channel Types

The implementation provides four specialized data channels:

1. **Control Channel** (`control`)
   - Ordered, reliable delivery
   - High priority for signaling messages
   - Always created by default

2. **Reliable Channel** (`reliable`)
   - Ordered, guaranteed delivery
   - For text messages, important data
   - Default channel for general use

3. **Unreliable Channel** (`unreliable`)
   - Unordered, no retransmissions
   - For real-time data (voice, video, live updates)
   - Low latency, accepts packet loss

4. **File Channel** (`file`)
   - Ordered, reliable delivery
   - For file transfers
   - Optimized for large data

### Using Channels

```typescript
// Send message on specific channel
const message = new TextEncoder().encode('Hello!');
peer.send(message, 'reliable');

// Send real-time data
const voiceData = new Uint8Array(1024);
peer.send(voiceData, 'unreliable');

// Send file data
const fileChunk = new Uint8Array(16384);
peer.send(fileChunk, 'file');
```

## Connection Lifecycle

### 1. Initialization

```typescript
const peer = new WebRTCPeerEnhanced({ peerId: 'peer-1' });

peer.on('initialized', (data) => {
  console.log('Peer initialized:', data.peerId);
});

peer.on('channel-created', (data) => {
  console.log('Channel created:', data.type, data.label);
});
```

### 2. Offer/Answer Exchange

```typescript
// Create offer
const offer = await peer1.createOffer();

// Send offer to peer2 via signaling

// On peer2:
const answer = await peer2.createAnswer(offer);

// Send answer back to peer1 via signaling

// On peer1:
await peer1.setRemoteAnswer(answer);
```

### 3. ICE Candidate Exchange (Trickle ICE)

```typescript
// Listen for ICE candidates
peer.on('ice-candidate', (data) => {
  // Send candidate to remote peer via signaling
  sendToRemotePeer({
    type: 'ice-candidate',
    candidate: data.candidate
  });
});

// Add received candidates
peer.on('receive-ice-candidate', async (candidate) => {
  await peer.addIceCandidate(candidate);
});
```

### 4. Connection State Monitoring

```typescript
peer.on('state-change', (data) => {
  console.log(`State: ${data.oldState} -> ${data.newState}`);
  
  switch (data.newState) {
    case 'connecting':
      // Show connecting UI
      break;
    case 'connected':
      // Enable messaging
      break;
    case 'disconnected':
      // Show reconnecting UI
      break;
    case 'failed':
      // Show error
      break;
    case 'closed':
      // Clean up
      break;
  }
});
```

## Automatic Reconnection

### Exponential Backoff

The implementation uses exponential backoff with jitter for reconnection attempts:

- Initial delay: 1s (configurable)
- Exponential growth: delay × 2^attempt
- Maximum delay: 30s (configurable)
- Jitter: +0-1s random to prevent thundering herd
- Maximum attempts: 5 (configurable)

```typescript
peer.on('reconnect-scheduled', (data) => {
  console.log(`Reconnecting in ${data.delay}ms (attempt ${data.attempt})`);
});

peer.on('reconnect-attempt', (data) => {
  console.log(`Attempting reconnection #${data.attempt}`);
});

peer.on('reconnect-failed', (data) => {
  console.log(`Reconnection failed after ${data.attempts} attempts`);
});
```

## Backpressure Handling

### Message Queue

Messages are automatically queued when:
- Channel is not yet open
- Buffer is full (exceeds `maxBufferedAmount`)

```typescript
peer.on('message-queued', (data) => {
  console.log(`Message queued on ${data.type}, size: ${data.size}`);
});

peer.on('backpressure', (data) => {
  console.log(`Backpressure on ${data.type}, buffered: ${data.bufferedAmount}`);
});

peer.on('message-sent', (data) => {
  console.log(`Message sent on ${data.type}, size: ${data.size}`);
});

// Check queue size
const queueSize = peer.getQueueSize();
```

## Metrics Collection

### Real-time Metrics

```typescript
peer.on('metrics', (data) => {
  const m = data.metrics;
  console.log('Connection Metrics:', {
    bytesReceived: m.bytesReceived,
    bytesSent: m.bytesSent,
    packetsReceived: m.packetsReceived,
    packetsSent: m.packetsSent,
    packetsLost: m.packetsLost,
    roundTripTime: m.roundTripTime * 1000, // ms
    jitter: m.jitter * 1000,                // ms
  });
});

// Get current metrics
const metrics = peer.getMetrics();
```

### Connection Quality

```typescript
// Estimate connection quality
function getConnectionQuality(metrics) {
  if (!metrics) return 'unknown';
  
  const rtt = metrics.roundTripTime * 1000; // ms
  const lossRate = metrics.packetsLost / (metrics.packetsReceived || 1);
  
  if (rtt < 100 && lossRate < 0.01) return 'excellent';
  if (rtt < 200 && lossRate < 0.05) return 'good';
  if (rtt < 400 && lossRate < 0.10) return 'fair';
  return 'poor';
}
```

## NAT Traversal

### NAT Type Detection

```typescript
const natType = await peer.detectNATType();

console.log('NAT Type:', natType.type);
console.log('Direct connection possible:', natType.supportsDirectConnection);
console.log('Requires relay:', natType.requiresRelay);

// Types: 'open', 'full-cone', 'restricted', 'port-restricted', 'symmetric', 'unknown'
```

### Handling Different NAT Types

```typescript
switch (natType.type) {
  case 'open':
    // Direct connection works
    config.iceTransportPolicy = 'all';
    break;
  
  case 'symmetric':
    // May need TURN relay
    config.iceTransportPolicy = 'all';
    // Ensure TURN server is configured
    break;
  
  default:
    config.iceTransportPolicy = 'all';
}
```

## Connection Pool

### Managing Multiple Peers

```typescript
import { WebRTCConnectionPool } from './transport/webrtc-enhanced';

const pool = new WebRTCConnectionPool({
  // Default config for all peers
  metricsEnabled: true,
  reconnectMaxAttempts: 3,
});

// Create peers
const peer1 = pool.createPeer('peer-1');
const peer2 = pool.createPeer('peer-2');
const peer3 = pool.createPeer('peer-3');

// Get peer
const peer = pool.getPeer('peer-1');

// Get all connected peers
const connected = pool.getConnectedPeers();

// Broadcast message
const message = new TextEncoder().encode('Hello everyone!');
pool.broadcast(message, 'reliable', 'peer-1'); // Exclude sender

// Get statistics
const stats = pool.getStats();
console.log('Pool Stats:', {
  totalPeers: stats.totalPeers,
  connectedPeers: stats.connectedPeers,
  states: stats.states,
});

// Listen to pool events
pool.on('state-change', (data) => {
  console.log(`Peer ${data.peerId}: ${data.oldState} -> ${data.newState}`);
});

pool.on('message', (data) => {
  console.log(`Message from ${data.peerId}:`, data.data);
});

// Cleanup
pool.closeAll();
```

## Error Handling

### Comprehensive Error Events

```typescript
peer.on('error', (data) => {
  console.error(`Error [${data.type}]:`, data.error);
  
  switch (data.type) {
    case 'initialization':
      // Failed to create peer connection
      break;
    
    case 'offer-creation':
    case 'answer-creation':
    case 'answer-set':
      // SDP negotiation failed
      break;
    
    case 'ice-candidate':
      // ICE candidate error
      break;
    
    case 'ice-restart':
      // ICE restart failed
      break;
    
    case 'send':
      // Message send failed
      break;
    
    case 'message-handling':
      // Error processing received message
      break;
  }
});

// Channel-specific errors
peer.on('channel-error', (data) => {
  console.error(`Channel ${data.type} error:`, data.error);
});
```

## Best Practices

### 1. Always Handle Events

```typescript
// Required event handlers
peer.on('error', handleError);
peer.on('state-change', handleStateChange);
peer.on('message', handleMessage);

// Recommended event handlers
peer.on('reconnect-failed', handleReconnectFailed);
peer.on('backpressure', handleBackpressure);
```

### 2. Clean Up Resources

```typescript
// Always close connections when done
peer.on('closed', () => {
  // Remove event listeners
  peer.off('message', handleMessage);
  // Clean up application state
});

// Graceful shutdown
window.addEventListener('beforeunload', () => {
  peer.close();
});
```

### 3. Configure Timeouts Appropriately

```typescript
const config: WebRTCConfig = {
  peerId: 'peer-1',
  
  // Mobile networks may need longer timeouts
  connectionTimeout: 60000,      // 60s for mobile
  
  // Desktop/WiFi can use shorter timeouts
  connectionTimeout: 30000,      // 30s for desktop
  
  // Adjust reconnection based on network
  reconnectMaxAttempts: 5,       // More attempts for unstable networks
  reconnectMaxDelay: 60000,      // Cap delay at 60s
};
```

### 4. Monitor Connection Quality

```typescript
// Periodically check metrics
peer.on('metrics', (data) => {
  const quality = getConnectionQuality(data.metrics);
  
  if (quality === 'poor') {
    // Notify user
    showNotification('Poor connection quality');
    
    // Consider switching to unreliable channel
    // for real-time data
  }
});
```

### 5. Handle Mobile Network Switching

```typescript
// Listen for network changes
window.addEventListener('online', () => {
  // Network came back, peer will auto-reconnect
});

window.addEventListener('offline', () => {
  // Network lost, show offline UI
});

// iOS/Android specific
if ('connection' in navigator) {
  navigator.connection.addEventListener('change', () => {
    console.log('Network type changed:', navigator.connection.effectiveType);
    // May need to adjust quality settings
  });
}
```

## Performance Considerations

### Memory Management

- **Connection Pool**: Supports 50+ simultaneous connections
- **Message Queue**: Bounded by `maxBufferedAmount` (default 16MB per peer)
- **Metrics**: Collected every 5s (configurable)
- **Event Handlers**: Use WeakMap internally to prevent leaks

### Throughput

- **Reliable Channel**: ~1-10 MB/s depending on network
- **Unreliable Channel**: Lower latency but may lose packets
- **File Channel**: Optimized for large transfers

### Latency

- **Connection Setup**: Sub-2s typical (depends on NAT traversal)
- **Message Delivery**: 
  - Local network: 10-50ms
  - Internet: 50-200ms
  - TURN relay: 100-400ms

## Troubleshooting

### Connection Fails Immediately

```typescript
// Check ICE server configuration
peer.on('error', (data) => {
  if (data.type === 'initialization') {
    // Verify ICE servers are reachable
    // Try fallback STUN servers
  }
});
```

### No ICE Candidates

```typescript
peer.on('ice-gathering-state', (data) => {
  if (data.state === 'complete') {
    const candidates = /* get collected candidates */;
    if (candidates.length === 0) {
      // Firewall blocking UDP?
      // TURN server needed?
    }
  }
});
```

### Messages Not Sending

```typescript
// Check queue size
if (peer.getQueueSize() > 100) {
  // Queue is backing up
  // Check connection state
  // May need to reduce send rate
}

// Monitor backpressure
peer.on('backpressure', () => {
  // Slow down sending
  // Wait for 'channel-ready' event
});
```

### High Packet Loss

```typescript
peer.on('metrics', (data) => {
  const lossRate = data.metrics.packetsLost / data.metrics.packetsReceived;
  
  if (lossRate > 0.10) {
    // Network congestion
    // Consider reducing send rate
    // Switch to unreliable channel for real-time data
  }
});
```

## Testing

### Unit Tests

```bash
# Run WebRTC tests
npm test -- webrtc-enhanced.test.ts

# Run all tests
npm test
```

### Integration Testing

```typescript
// Test connection between two peers
const peer1 = new WebRTCPeerEnhanced({ peerId: 'peer-1' });
const peer2 = new WebRTCPeerEnhanced({ peerId: 'peer-2' });

const offer = await peer1.createOffer();
const answer = await peer2.createAnswer(offer);
await peer1.setRemoteAnswer(answer);

// Wait for connection
await waitForConnection(peer1, peer2);

// Test message exchange
peer2.on('message', (data) => {
  console.log('Received:', data.data);
});

peer1.send(new TextEncoder().encode('test'), 'reliable');
```

## API Reference

See inline documentation in `webrtc-enhanced.ts` for complete API reference.

### Main Classes

- `WebRTCPeerEnhanced` - Main peer connection class
- `WebRTCConnectionPool` - Connection pool manager

### Interfaces

- `WebRTCConfig` - Configuration options
- `DataChannelType` - Channel type enumeration
- `ConnectionMetrics` - Metrics data structure
- `NATType` - NAT type information

### Events

- `initialized`, `state-change`, `message`, `error`
- `ice-candidate`, `ice-gathering-state`, `ice-connection-state`
- `channel-created`, `channel-open`, `channel-close`, `channel-error`
- `reconnect-scheduled`, `reconnect-attempt`, `reconnect-failed`
- `backpressure`, `message-queued`, `message-sent`
- `metrics`, `closed`

## Future Enhancements

- [ ] Bandwidth estimation and adaptive bitrate
- [ ] Congestion control algorithms
- [ ] Priority scheduling for multi-stream
- [ ] Support for reliable ordered channels
- [ ] SCTP extensions (unordered reliable)
- [ ] Better NAT prediction
- [ ] Connection migration (IP changes)
- [ ] ICE consent freshness
- [ ] DTLS 1.3 support
