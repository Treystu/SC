# Knowledge Base for Sovereign Communications

This file provides contextual information to help you understand and work with the Sovereign Communications codebase effectively.

## Project Goals

Build a completely decentralized, peer-to-peer communication platform that:
- Works without any central servers
- Provides end-to-end encryption for all messages
- Enables mesh networking across multiple devices
- Supports Web, Android, and iOS platforms
- Maintains perfect forward secrecy
- Operates in disconnected/offline scenarios

## Key Concepts

### Mesh Networking

Messages are routed through multiple hops in a peer-to-peer network:
1. **Flood Routing**: Messages forwarded to all connected peers except sender
2. **TTL (Time-To-Live)**: Decremented at each hop to prevent infinite loops
3. **Deduplication**: SHA-256 hash cache prevents processing same message twice
4. **Priority Queuing**: Control > Voice > Text > File transfers
5. **Store-and-Forward**: Messages queued for offline peers

### Cryptographic Design

Multi-layer security model:
- **Identity**: Ed25519 keypair (32-byte public key, 32-byte private key)
- **Signing**: Ed25519 signatures (64 bytes, padded to 65 for compact format)
- **Key Exchange**: X25519 ECDH for establishing shared secrets
- **Encryption**: XChaCha20-Poly1305 AEAD (extended nonce prevents reuse)
- **Session Keys**: Automatic rotation for perfect forward secrecy
- **Hashing**: SHA-256 for message deduplication and fingerprints

### Message Protocol

Fixed 109-byte header format:
```
Offset | Size | Field       | Description
-------|------|-------------|----------------------------------
0      | 1    | Version     | Protocol version (0x01)
1      | 1    | Type        | Message type enum
2      | 1    | TTL         | Time-to-live (hop count)
3      | 1    | Reserved    | Reserved for future use
4      | 8    | Timestamp   | Unix timestamp in milliseconds
12     | 32   | Sender ID   | Ed25519 public key
44     | 65   | Signature   | Compact Ed25519 signature + recovery byte
109    | Var  | Payload     | Encrypted message content
```

## Core Modules

### routing.ts - Routing Table & Peer Management
- **Purpose**: Maintain routes to all known peers, track peer health
- **Key Classes**: `RoutingTable`, `MessageQueue`
- **Features**: Route metrics, peer reputation, blacklisting, LRU cache
- **Memory Management**: Configurable limits with automatic cleanup

### health.ts - Peer Health Monitoring
- **Purpose**: Monitor peer connectivity with adaptive heartbeats
- **Key Classes**: `PeerHealthMonitor`
- **Features**: RTT tracking, packet loss, health scoring, adaptive intervals
- **Metrics**: Latency history, health score (0-100), missed heartbeats

### relay.ts - Message Relay & Fragmentation
- **Purpose**: Forward messages through mesh, handle large messages
- **Key Classes**: `MessageRelay`, `MessageReassembler`
- **Features**: Store-and-forward, loop detection, rate limiting, fragmentation
- **Protection**: Flood detection, peer rate limits, memory limits

### bandwidth.ts - Bandwidth Scheduling
- **Purpose**: Adaptive message scheduling based on network capacity
- **Key Classes**: `BandwidthScheduler`
- **Features**: Token bucket, congestion detection, priority-based scheduling
- **Metrics**: Bandwidth utilization, messages/sec, packet loss

## State Management

### Peer States
```typescript
enum PeerState {
  CONNECTING = 'connecting',  // Initial connection in progress
  CONNECTED = 'connected',    // Healthy connection
  DEGRADED = 'degraded',      // Connection issues detected
  DISCONNECTED = 'disconnected' // No longer connected
}
```

State transitions:
- CONNECTING → CONNECTED (successful handshake)
- CONNECTED → DEGRADED (reputation < 20 or health score < 50)
- DEGRADED → CONNECTED (reputation > 40 and health recovered)
- Any → DISCONNECTED (timeout, blacklist, or manual removal)

### Message Types
```typescript
enum MessageType {
  TEXT = 0x01,              // Text message
  FILE_METADATA = 0x02,     // File transfer metadata
  FILE_CHUNK = 0x03,        // File transfer chunk
  VOICE = 0x04,             // Voice message
  CONTROL_PING = 0x10,      // Heartbeat ping
  CONTROL_PONG = 0x11,      // Heartbeat response
  CONTROL_ACK = 0x12,       // Acknowledgment
  PEER_DISCOVERY = 0x20,    // Peer announcement
  PEER_INTRODUCTION = 0x21, // Peer introduction
  KEY_EXCHANGE = 0x30,      // Session key exchange
}
```

## Data Structures

### Peer Object
```typescript
interface Peer {
  id: string;                    // Hex-encoded public key
  publicKey: Uint8Array;         // 32-byte Ed25519 public key
  lastSeen: number;              // Unix timestamp (ms)
  connectedAt: number;           // Unix timestamp (ms)
  transportType: 'webrtc' | 'bluetooth' | 'local';
  connectionQuality: number;     // 0-100
  bytesSent: number;
  bytesReceived: number;
  state: PeerState;
  metadata: PeerMetadata;        // Capabilities, reputation, etc.
}
```

### Route Object
```typescript
interface Route {
  destination: string;           // Peer ID
  nextHop: string;               // Next hop peer ID
  hopCount: number;              // Number of hops
  timestamp: number;             // Route creation time
  metrics: RouteMetrics;         // Performance metrics
  expiresAt: number;             // Expiration timestamp
}
```

### PeerMetadata
```typescript
interface PeerMetadata {
  capabilities: PeerCapabilities;  // Protocol features
  reputation: number;              // 0-100 score
  blacklisted: boolean;
  blacklistExpiry?: number;
  failureCount: number;
  successCount: number;
}
```

## Configuration

### Default Values
```typescript
// Routing Table
maxCacheSize: 10000             // Message deduplication cache
cacheTTL: 60000                 // 60 seconds
routeTTL: 300000                // 5 minutes
maxRoutes: 10000

// Health Monitoring
interval: 30000                 // 30 seconds
timeout: 90000                  // 90 seconds
maxMissed: 3                    // Max missed heartbeats
adaptiveInterval: true
minInterval: 10000              // 10 seconds
maxInterval: 60000              // 60 seconds

// Message Relay
maxStoredMessages: 1000
storeTimeout: 300000            // 5 minutes
maxRetries: 3
retryBackoff: 5000              // 5 seconds
floodRateLimit: 100             // msg/sec per peer

// Fragmentation
MAX_FRAGMENT_SIZE: 16384        // 16 KB
MIN_FRAGMENT_SIZE: 512          // 512 bytes
MAX_REASSEMBLY_BUFFER: 104857600 // 100 MB

// Priority Queue
ESCALATION_THRESHOLD: 30000     // 30 seconds
STARVATION_CHECK_INTERVAL: 5000 // 5 seconds
```

## Performance Characteristics

### Time Complexity
- Message lookup (deduplication): O(1) with Bloom filter pre-check
- Route lookup: O(1) hash table
- Priority queue dequeue: O(k) where k = number of priority levels (7)
- Fragment reassembly: O(n) where n = number of fragments

### Space Complexity
- Per peer: ~200 bytes
- Per route: ~100 bytes
- Per cached message hash: ~50 bytes
- Per stored message: variable (depends on payload size)

## Testing Strategy

### Unit Tests (Jest)
- Test individual functions and classes
- Mock external dependencies
- Use beforeEach/afterEach for setup/cleanup
- Aim for 100% code coverage of critical paths

### Test Files
- `routing.test.ts` - Basic routing table functionality
- `routing-advanced.test.ts` - Advanced routing features
- `health-advanced.test.ts` - Health monitoring tests
- `relay-advanced.test.ts` - Relay and fragmentation tests
- `priority-queue-advanced.test.ts` - Priority queue tests

### Integration Tests
- Test inter-module communication
- Simulate network conditions
- Test failure scenarios
- Verify end-to-end message flow

## Common Workflows

### Adding a New Feature
1. Review existing code and patterns
2. Write failing tests first (TDD)
3. Implement minimal code to pass tests
4. Refactor for clarity and performance
5. Update documentation
6. Run full test suite
7. Commit with descriptive message

### Debugging Network Issues
1. Enable debug logging in mesh components
2. Check peer health scores and RTT
3. Verify message deduplication is working
4. Check for TTL expiration or routing loops
5. Monitor bandwidth utilization
6. Review peer reputation scores

### Optimizing Performance
1. Profile with appropriate tools
2. Check memory usage (getMemoryUsage())
3. Review cache hit rates
4. Monitor message throughput
5. Adjust configuration parameters
6. Benchmark before and after changes

## Dependencies

### Core Dependencies
- `@noble/curves`: Ed25519 and X25519 cryptography
- `@noble/ciphers`: XChaCha20-Poly1305 encryption
- `@noble/hashes`: SHA-256 and other hashing

### Dev Dependencies
- `typescript`: Type checking and compilation
- `jest`: Unit testing framework
- `ts-jest`: TypeScript support for Jest
- `eslint`: Code linting

## Future Enhancements

Planned features not yet implemented:
- BLE mesh networking (mobile)
- Multi-device sync
- Group messaging
- Voice calls (Opus codec)
- File transfer resume
- Message search/indexing
- QR code scanner UI
- mDNS/Bonjour discovery
- STUN/TURN fallback

## Troubleshooting

### Common Build Errors
- **TS2739 Missing properties**: Use `createPeer()` helper for peer objects
- **Invalid signature length**: Pad 64-byte Ed25519 signatures to 65 bytes
- **Module not found**: Run `npm install` in workspace directory

### Common Runtime Issues
- **High memory usage**: Check cache sizes, adjust limits
- **Poor performance**: Review route metrics, peer health scores
- **Message loops**: Verify TTL is being decremented
- **Duplicate messages**: Check deduplication cache is working

## Additional Resources

- [Protocol Specification](../docs/protocol.md)
- [Security Model](../docs/security.md)
- [Setup Guide](../docs/SETUP.md)
- [README](../README.md)
