# Peer Discovery Documentation

## Overview

Sovereign Communications implements multiple peer discovery mechanisms to enable zero-configuration networking across different platforms and environments.

## Discovery Methods

### 1. mDNS/Bonjour (Local Network Discovery)

**Purpose:** Automatic discovery of peers on the same local network.

**Implementation:** `core/src/discovery/mdns.ts`

**Features:**
- Service type registration (`_sc._tcp.local.`)
- TXT records for capabilities advertising
- Service instance naming
- Discovery filtering
- Automatic service expiration (TTL-based)

**Usage:**
```typescript
import { MDNSBroadcaster, MDNSDiscoverer } from '@sc/core';

// Broadcast service
const broadcaster = new MDNSBroadcaster({
  serviceName: 'My Device',
  serviceType: '_sc._tcp',
  domain: 'local.',
  port: 8080,
  capabilities: {
    version: '1.0.0',
    peerId: 'abc123',
    publicKey: 'base64-encoded-key',
    supportsWebRTC: true,
    supportsBLE: false,
    supportsFileTransfer: true,
    supportsVoice: true,
    supportsVideo: false,
  },
});

await broadcaster.start();

// Discover peers
const discoverer = new MDNSDiscoverer('_sc._tcp', {
  filter: (service) => service.txtRecord.webrtc === '1',
});

discoverer.on('peer-found', (peer) => {
  console.log('Found peer:', peer.name);
});

await discoverer.start();
```

**Performance Target:** <5 seconds for local network discovery

**Platform Support:**
- ✅ macOS/iOS: Native Bonjour support
- ✅ Linux: Avahi
- ✅ Windows: Bonjour for Windows
- ⚠️ Browser: Not directly supported (requires native bridge)

### 2. QR Code Exchange

**Purpose:** Quick pairing via visual code scanning.

**Implementation:** `core/src/discovery/qr-enhanced.ts`

**Features:**
- Version negotiation (v1, v2)
- Error correction (SC2: marker + checksum)
- SHA-256 checksum validation
- Public key validation
- Timestamp validation
- Compact mode for size optimization

**QR Data Format (v2):**
```json
{
  "version": 2,
  "publicKey": "hex-encoded-32-byte-key",
  "peerId": "unique-peer-id",
  "displayName": "Device Name",
  "endpoints": [
    { "type": "webrtc", "signaling": "relay-id" },
    { "type": "local", "address": "192.168.1.100:8080" }
  ],
  "timestamp": 1234567890,
  "checksum": "sha256-hex",
  "capabilities": {
    "webrtc": true,
    "ble": false,
    "fileTransfer": true
  }
}
```

**Usage:**
```typescript
import { QRCodeDiscoveryV2 } from '@sc/core';

// Generate QR code
const qrData = QRCodeDiscoveryV2.generateQRData({
  publicKey: peerPublicKey,
  peerId: 'my-peer-id',
  displayName: 'My Device',
  endpoints: [
    { type: 'webrtc', signaling: 'relay-1' },
  ],
  timestamp: Date.now(),
});

// Display as QR code (use QR library)
// qrcode.generate(qrData);

// Parse scanned QR code
const result = QRCodeDiscoveryV2.parseQRData(scannedData);
if (result.valid) {
  console.log('Peer info:', result.info);
} else {
  console.error('Invalid QR code:', result.error);
}
```

**Performance Target:** <2 seconds for complete pairing

**Security:**
- Public keys are validated (32 bytes, hex-encoded)
- Timestamp prevents replay attacks
- Checksum detects data corruption
- Version negotiation ensures compatibility

### 3. Audio Tone Pairing (DTMF)

**Purpose:** Pairing via audio transmission when visual QR is unavailable.

**Implementation:** `core/src/discovery/audio-pairing.ts`

**Features:**
- DTMF encoding (dual-tone multi-frequency)
- Start/end markers (#)
- Configurable tone duration
- Noise tolerance

**DTMF Frequencies:**
```
      1209 Hz  1336 Hz  1477 Hz
697 Hz    1        2        3
770 Hz    4        5        6
852 Hz    7        8        9
941 Hz    *        0        #
```

**Usage:**
```typescript
import { AudioTonePairing } from '@sc/core';

const pairing = new AudioTonePairing({
  toneDuration: 100,    // 100ms per tone
  pauseDuration: 50,    // 50ms pause
  sampleRate: 44100,    // Standard audio rate
});

// Transmit peer ID
await pairing.playPeerId('abc123def456');

// Listen for incoming transmission
const receivedId = await pairing.listenForPeerId(10000); // 10s timeout
```

**Performance Target:** <10 seconds for complete pairing

**Limitations:**
- Requires microphone permission
- Sensitive to background noise
- Limited data capacity (short peer IDs only)

### 4. Proximity Pairing (BLE RSSI)

**Purpose:** Automatic pairing when devices are physically close.

**Implementation:** `core/src/discovery/proximity.ts`

**Features:**
- RSSI-based distance estimation
- Configurable proximity threshold
- Automatic device discovery
- Signal strength filtering

**Distance Estimation:**
```
Formula: distance = 10^((A - RSSI) / (10 * n))
Where:
  A = measured power at 1 meter (-59 dBm typical)
  n = path loss exponent (2 for free space)
```

**Usage:**
```typescript
import { ProximityPairing } from '@sc/core';

const proximity = new ProximityPairing({
  rssiThreshold: -60,      // Strong signal (-60 dBm)
  proximityTimeout: 30000, // 30 seconds
  scanInterval: 5000,      // Scan every 5s
});

// Update from BLE scans
proximity.updateDevice('device-id', -55, 'Device Name');

// Wait for proximity
const device = await proximity.waitForProximity();
if (device) {
  console.log('Device in range:', device.name);
  console.log('Estimated distance:', device.distance, 'meters');
}
```

**RSSI Calibration:**
- `-30 to -50 dBm`: Very close (<1 meter)
- `-50 to -70 dBm`: Close (1-5 meters)
- `-70 to -90 dBm`: Medium (5-15 meters)
- `<-90 dBm`: Far (>15 meters)

**Platform Support:**
- ✅ iOS: Core Bluetooth
- ✅ Android: Bluetooth LE
- ❌ Web: Not supported (Web Bluetooth has limitations)

### 5. Manual IP Entry

**Purpose:** Direct connection when network discovery fails.

**Implementation:** `core/src/peer-manual-entry.ts`

**Features:**
- IPv4 validation
- IPv6 validation
- Hostname/DNS resolution
- Port validation (1-65535)
- Connection verification

**Usage:**
```typescript
import { ManualPeerEntryManager } from '@sc/core';

const manager = new ManualPeerEntryManager();

// Validate IP
const ipResult = manager.validateIP('192.168.1.100');
if (!ipResult.valid) {
  console.error(ipResult.error);
}

// Validate port
const portResult = manager.validatePort(8080);
if (!portResult.valid) {
  console.error(portResult.error);
}

// Connect
await manager.connectToPeer({
  ip: '192.168.1.100',
  port: 8080,
  publicKey: 'optional-key',
});
```

**Supported Formats:**
- IPv4: `192.168.1.100`
- IPv6: `2001:0db8::1` or `::1`
- Hostname: `peer.local`
- With port: `192.168.1.100:8080`
- With peer ID: `peer-id@192.168.1.100:8080`

### 6. Peer Introduction Relay

**Purpose:** A introduces B to C, enabling indirect discovery.

**Implementation:** `core/src/peer-introduce-relay.ts`

**Features:**
- Authentication of introductions
- Rate limiting (prevent spam)
- Introduction verification
- Trust model (only from trusted peers)

**Protocol:**
```
1. Peer A knows Peer B and Peer C
2. A sends introduction message to B about C
3. Message includes:
   - C's public key
   - C's endpoints
   - A's signature (proves authenticity)
4. B verifies A's signature
5. B can now connect to C
```

**Usage:**
```typescript
import { PeerIntroductionManager } from '@sc/core';

const manager = new PeerIntroductionManager();

// A introduces C to B
await manager.introducePeer({
  introducerPeerId: 'peer-a',
  introducedPeer: {
    publicKey: peerCKey,
    peerId: 'peer-c',
    endpoints: peerCEndpoints,
  },
  recipientPeerId: 'peer-b',
});
```

**Security:**
- Introduction must be signed by introducer
- Rate limit: Max 10 introductions per hour
- Only accept from trusted peers
- Verify introduced peer's public key

### 7. Peer Announcements

**Purpose:** Broadcast presence to mesh network.

**Implementation:** `core/src/discovery/announcement.ts`

**Features:**
- TTL-based flooding
- Deduplication
- Authentication
- Rate limiting
- Capability advertising

**Announcement Format:**
```json
{
  "peerId": "unique-id",
  "publicKey": "hex-key",
  "endpoints": ["192.168.1.100:8080"],
  "capabilities": {
    "supportsWebRTC": true,
    "supportsBLE": false,
    "supportsFileTransfer": true,
    "supportsVoice": true,
    "supportsVideo": false,
    "maxFileSize": 104857600,
    "protocolVersion": "1.0.0"
  },
  "timestamp": 1234567890,
  "ttl": 3
}
```

**Usage:**
```typescript
import { PeerAnnouncementManager } from '@sc/core';

const manager = new PeerAnnouncementManager(meshNetwork);

// Start periodic announcements (every 60 seconds)
manager.startPeriodicAnnouncements(
  'my-peer-id',
  myPublicKey,
  ['192.168.1.100:8080'],
  {
    supportsWebRTC: true,
    supportsBLE: false,
    supportsFileTransfer: true,
    supportsVoice: true,
    supportsVideo: false,
    protocolVersion: '1.0.0',
  }
);

// Listen for announcements
manager.on('peer-announced', (announcement) => {
  console.log('Peer announced:', announcement.peerId);
});
```

**Flooding Algorithm:**
1. Peer broadcasts announcement with TTL=3
2. Receiving peers relay if TTL>0 (decrementing TTL)
3. Duplicate announcements are ignored (SHA-256 hash)
4. Old announcements expire (3 minutes)

**Rate Limiting:**
- Max 1 announcement per minute per peer
- Max 10 relays per minute
- Blacklist spamming peers

### 8. Reachability Verification

**Purpose:** Test if peer is actually reachable before connecting.

**Implementation:** `core/src/discovery/peer.ts` (PeerReachability class)

**Features:**
- Ping/pong protocol
- Latency measurement
- Reachability caching
- Event notifications
- Multi-method testing (WebRTC, direct, relay)

**Protocol:**
```
1. Send PING message to peer
2. Wait for PONG response (5s timeout)
3. Measure round-trip time
4. Cache result (1 minute)
5. Retry up to 3 times on failure
```

**Usage:**
```typescript
import { PeerReachability } from '@sc/core';

const reachability = new PeerReachability();

// Test reachability
const isReachable = await reachability.testReachability(
  'peer-id',
  async (peerId) => {
    // Send ping and wait for pong
    return await sendPing(peerId);
  }
);

// Get cached status
const status = reachability.getReachabilityStatus('peer-id');
// Returns: 'reachable' | 'unreachable' | 'unknown'
```

**Latency Targets:**
- Direct connection: <50ms
- Local relay: <100ms
- Internet relay: <500ms

## Discovery Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Discovery Methods                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. mDNS/Bonjour (Local Network)                        │
│     └─> Automatic, <5s                                  │
│                                                          │
│  2. QR Code (Visual)                                    │
│     └─> User-initiated, <2s                             │
│                                                          │
│  3. Audio Tones (DTMF)                                  │
│     └─> User-initiated, <10s                            │
│                                                          │
│  4. Proximity (BLE RSSI)                                │
│     └─> Automatic, continuous                           │
│                                                          │
│  5. Manual IP Entry                                     │
│     └─> User-initiated, <5s                             │
│                                                          │
│  6. Peer Introduction                                   │
│     └─> Via existing peer, <5s                          │
│                                                          │
│  7. Peer Announcements                                  │
│     └─> Mesh broadcast, instant                         │
│                                                          │
│  8. Reachability Test                                   │
│     └─> Verification, <5s                               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Platform Compatibility Matrix

| Method              | Web | iOS | Android | Desktop |
|---------------------|-----|-----|---------|---------|
| mDNS/Bonjour        | ⚠️  | ✅  | ✅      | ✅      |
| QR Code             | ✅  | ✅  | ✅      | ✅      |
| Audio Tones         | ✅  | ✅  | ✅      | ✅      |
| Proximity (BLE)     | ❌  | ✅  | ✅      | ⚠️      |
| Manual IP           | ✅  | ✅  | ✅      | ✅      |
| Peer Introduction   | ✅  | ✅  | ✅      | ✅      |
| Peer Announcements  | ✅  | ✅  | ✅      | ✅      |
| Reachability Test   | ✅  | ✅  | ✅      | ✅      |

Legend:
- ✅ Fully supported
- ⚠️ Limited support or requires native bridge
- ❌ Not supported

## Best Practices

### 1. Use Multiple Methods
Always implement multiple discovery methods for redundancy:
```typescript
// Try mDNS first (fastest for local network)
const mdnsResult = await discoverViaMDNS(timeout: 5000);

// Fallback to announcements
if (!mdnsResult) {
  const announcementResult = await waitForAnnouncement(timeout: 10000);
}

// Last resort: manual entry
if (!announcementResult) {
  promptManualEntry();
}
```

### 2. Validate All Discoveries
Always verify peer identity before connecting:
```typescript
const peerInfo = await discoverPeer();

// Verify public key
if (!validatePublicKey(peerInfo.publicKey)) {
  throw new Error('Invalid public key');
}

// Test reachability
const reachable = await testReachability(peerInfo.peerId);
if (!reachable) {
  throw new Error('Peer not reachable');
}

// Connect
await connectToPeer(peerInfo);
```

### 3. Handle Discovery Errors Gracefully
```typescript
try {
  const peer = await discoverPeer();
} catch (error) {
  if (error.code === 'TIMEOUT') {
    // Show retry option
  } else if (error.code === 'INVALID_DATA') {
    // Show error message with details
  } else {
    // Fallback to another method
  }
}
```

### 4. Respect User Privacy
- Always ask permission before accessing microphone (audio pairing)
- Ask permission for Bluetooth scanning (proximity)
- Don't automatically broadcast user's presence
- Provide opt-out options

### 5. Optimize for Performance
- Cache discovery results (1-5 minutes)
- Use progressive timeouts (start short, increase if needed)
- Prefer local methods over internet relays
- Batch multiple discoveries together

## Security Considerations

### Authentication
- All discovery methods must verify peer identity
- Use Ed25519 signatures for announcements and introductions
- Validate public keys (length, format, uniqueness)

### Denial of Service Protection
- Rate limit announcements (1 per minute)
- Rate limit introductions (10 per hour)
- Blacklist peers that spam
- Limit TTL for announcements (max 5 hops)

### Privacy
- Don't broadcast sensitive information
- Use ephemeral peer IDs when possible
- Encrypt capabilities in public networks
- Support "invisible" mode (no broadcasting)

### Replay Protection
- Include timestamps in all messages
- Reject messages older than 5 minutes
- Use nonces for critical operations

## Testing

Run discovery tests:
```bash
cd core
npm test -- discovery/
```

Expected results:
- ✅ mDNS tests: 30+ passing
- ✅ QR code tests: 27 passing
- ✅ Audio pairing tests: 15+ passing
- ✅ Proximity tests: 10+ passing
- ✅ Integration tests: All passing

## Troubleshooting

### mDNS Not Working
- Check firewall settings (UDP port 5353)
- Verify multicast is enabled on network
- Ensure same subnet (VLAN issues)

### QR Code Won't Scan
- Increase screen brightness
- Use higher error correction level
- Reduce data size (use compact mode)
- Clean camera lens

### Audio Pairing Fails
- Reduce background noise
- Increase volume
- Adjust tone duration (slower = more reliable)
- Use headphones for better quality

### Proximity Not Detecting
- Enable Bluetooth
- Grant location permission (Android requirement)
- Move devices closer (<1 meter)
- Re-calibrate RSSI threshold

### Manual Entry Fails
- Verify IP address is correct
- Check port is open (firewall)
- Ensure peer is actually listening
- Try DNS name instead of IP

## Kademlia DHT Mode

### Overview

Sovereign Communications supports **Kademlia DHT-based routing** as an alternative to flood-based routing. This provides more efficient peer discovery and message routing in large networks.

### Routing Modes

The mesh network supports three routing modes:

1. **FLOOD** (default) - Traditional flood-based routing for simplicity and reliability
2. **DHT** - Pure Kademlia DHT routing for scalability
3. **HYBRID** - DHT for discovery, flood for delivery (best of both)

### Enabling DHT Mode

```typescript
import {
  RoutingTable,
  RoutingMode,
  KademliaRoutingTable,
  generateNodeId,
} from '@sc/core';

// Create DHT routing table
const localNodeId = generateNodeId();
const dhtRoutingTable = new KademliaRoutingTable(localNodeId);

// Create mesh routing table with DHT mode
const routingTable = new RoutingTable({
  mode: RoutingMode.DHT, // or RoutingMode.HYBRID
  dhtRoutingTable,
});

// Start DHT maintenance tasks
dhtRoutingTable.start();
```

### Bootstrap from Discovery

DHT automatically integrates with all discovery mechanisms:

#### Bootstrap from QR Code

```typescript
import { bootstrapFromQRCode } from '@sc/core';

// Scan QR code
const peerInfo = QRCodeDiscoveryV2.parseQRData(scannedData);

if (peerInfo.valid) {
  // Bootstrap DHT from scanned peer
  const result = await bootstrapFromQRCode(
    dhtRoutingTable,
    peerInfo.info
  );
  
  console.log('Bootstrap success:', result.success);
  console.log('Nodes discovered:', result.nodesDiscovered);
}
```

#### Bootstrap from Manual Entry

```typescript
import { bootstrapFromManualEntry } from '@sc/core';

const result = await bootstrapFromManualEntry(
  dhtRoutingTable,
  peerId,
  publicKey,
  '192.168.1.100:8080',
  'manual'
);

if (result.success) {
  console.log(`Bootstrapped with ${result.nodesDiscovered} nodes`);
}
```

#### Bootstrap from Multiple Peers

```typescript
import { bootstrapFromDiscoveredPeers } from '@sc/core';

// After mDNS or other bulk discovery
const result = await bootstrapFromDiscoveredPeers(
  dhtRoutingTable,
  discoveredPeers,
  3 // Minimum required bootstrap nodes
);
```

### DHT Features

- **Iterative Lookup**: Find peers in O(log n) hops
- **Value Storage**: Store and retrieve metadata in the DHT
- **K-bucket Management**: Automatic routing table optimization
- **Bucket Refresh**: Periodic bucket maintenance
- **Network State Awareness**: Track network health and topology

### DHT Configuration

```typescript
const dhtRoutingTable = new KademliaRoutingTable(localNodeId, {
  k: 20,                    // Bucket size (contacts per bucket)
  alpha: 3,                 // Parallel queries
  pingTimeout: 5000,        // Ping timeout (ms)
  refreshInterval: 3600000, // Bucket refresh (1 hour)
  republishInterval: 3600000, // Value republish (1 hour)
  maxConcurrentLookups: 10, // Max parallel lookups
});
```

### Using DHT for Peer Lookup

```typescript
// Find a peer using DHT
const closestNodes = await routingTable.findPeerViaDHT(targetPeerId);

// closestNodes contains the k closest peers to the target
for (const node of closestNodes) {
  console.log('Node:', node.peerId);
  console.log('Distance:', node.nodeId);
  console.log('Last seen:', node.lastSeen);
}
```

### DHT Statistics

```typescript
const stats = dhtRoutingTable.getStats();

console.log('Nodes in DHT:', stats.nodeCount);
console.log('Active buckets:', stats.activeBuckets);
console.log('Total lookups:', stats.totalLookups);
console.log('Success rate:', 
  (stats.successfulLookups / stats.totalLookups) * 100
);
console.log('Average lookup time:', stats.avgLookupTime, 'ms');
```

### Network State Monitoring

```typescript
import { NetworkStateManager } from '@sc/core';

const stateManager = new NetworkStateManager(dhtRoutingTable);

stateManager.on('stateChange', (event) => {
  console.log('Network state:', event.data.state);
  // DISCONNECTED, BOOTSTRAPPING, DEGRADED, CONNECTED
});

stateManager.on('healthWarning', (event) => {
  console.log('Health warning:', event.data);
});

stateManager.start();
```

### Performance Comparison

| Metric | Flood Routing | DHT Routing |
|--------|---------------|-------------|
| Discovery Time | O(n) hops | O(log n) hops |
| Bandwidth Usage | High (floods) | Low (targeted) |
| Scalability | Up to ~100 peers | Thousands of peers |
| Resilience | High (redundant) | Medium (depends on k) |
| Complexity | Low | Medium |

### When to Use DHT Mode

**Use DHT when:**
- Network has >50 peers
- Bandwidth is limited
- Need global peer discovery
- Want efficient routing

**Use FLOOD when:**
- Network has <50 peers
- Reliability is critical
- Simple deployment needed
- Low latency is priority

**Use HYBRID when:**
- Best of both worlds
- Medium to large networks
- Variable network conditions

### Regional Bootstrap Nodes

For production deployments, configure regional bootstrap nodes:

```typescript
import { getRegionalBootstrapNodes } from '@sc/core';

// Get bootstrap nodes for your region
const bootstrapNodes = getRegionalBootstrapNodes('north-america');

// Add to DHT bootstrap
const bootstrap = new DHTBootstrap(dhtRoutingTable, {
  bootstrapNodes,
  minBootstrapNodes: 2,
});

await bootstrap.bootstrap();
```

### Integration with Existing Code

DHT mode is **fully backward compatible**. Existing code continues to work:

```typescript
// Old code - still works
const routingTable = new RoutingTable();

// New code - explicit flood mode
const routingTable = new RoutingTable({
  mode: RoutingMode.FLOOD
});

// DHT mode - opt-in
const routingTable = new RoutingTable({
  mode: RoutingMode.DHT,
  dhtRoutingTable,
});
```

## References

- RFC 6762: Multicast DNS
- RFC 6763: DNS-Based Service Discovery
- ITU-T Q.23: DTMF Signaling
- Bluetooth Core Specification 5.0+
- Kademlia: A Peer-to-peer Information System Based on the XOR Metric (Maymounkov & Mazières, 2002)
