# DHT Integration Examples

This document provides practical examples of using the Kademlia DHT integration in Sovereign Communications.

## Basic Setup

### 1. Initialize DHT Routing

```typescript
import {
  RoutingTable,
  RoutingMode,
  KademliaRoutingTable,
  generateNodeId,
  createPeer,
} from '@sc/core';

// Generate a unique node ID for this peer
const myNodeId = generateNodeId();

// Or derive from your public key
import { nodeIdFromPublicKey } from '@sc/core';
const myPublicKey = /* your Ed25519 public key */;
const myNodeId = nodeIdFromPublicKey(myPublicKey);

// Create DHT routing table
const dhtRoutingTable = new KademliaRoutingTable(myNodeId, {
  k: 20,              // Standard Kademlia parameter
  alpha: 3,           // Parallel queries
  pingTimeout: 5000,  // 5 second timeout
});

// Create mesh routing table with DHT mode
const routingTable = new RoutingTable({
  mode: RoutingMode.DHT,
  dhtRoutingTable,
  maxCacheSize: 10000,
  cacheTTL: 60000,
});

// Start DHT maintenance (bucket refresh, value republishing)
dhtRoutingTable.start();
```

## Discovery Integration

### 2. Bootstrap from QR Code

```typescript
import {
  QRCodeDiscoveryV2,
  bootstrapFromQRCode,
} from '@sc/core';

// User scans QR code
const scannedData = await scanQRCode(); // Your QR scanning implementation

// Parse QR data
const parseResult = QRCodeDiscoveryV2.parseQRData(scannedData);

if (!parseResult.valid) {
  console.error('Invalid QR code:', parseResult.error);
  return;
}

// Bootstrap DHT from scanned peer
try {
  const result = await bootstrapFromQRCode(
    dhtRoutingTable,
    parseResult.info
  );
  
  if (result.success) {
    console.log(`✅ Bootstrap successful!`);
    console.log(`   Discovered ${result.nodesDiscovered} nodes`);
    console.log(`   Connected to ${result.respondedNodes.length} bootstrap nodes`);
    console.log(`   Took ${result.duration}ms`);
  } else {
    console.error('Bootstrap failed:', result.error);
  }
} catch (error) {
  console.error('Bootstrap error:', error);
}
```

### 3. Bootstrap from Manual Entry

```typescript
import { bootstrapFromManualEntry } from '@sc/core';

// User enters peer information manually
const manualPeerInfo = {
  peerId: 'abc123def456...',
  publicKey: hexToUint8Array('abcd...'), // Convert hex to Uint8Array
  address: '192.168.1.100:8080',
};

// Bootstrap from manually entered peer
const result = await bootstrapFromManualEntry(
  dhtRoutingTable,
  manualPeerInfo.peerId,
  manualPeerInfo.publicKey,
  manualPeerInfo.address,
  'manual' // Transport type
);

if (result.success) {
  console.log('Successfully bootstrapped from manual entry');
}
```

### 4. Bootstrap from mDNS Discovery

```typescript
import {
  MDNSDiscoverer,
  bootstrapFromDiscoveredPeers,
} from '@sc/core';

// Discover peers via mDNS
const discoverer = new MDNSDiscoverer('_sc._tcp', {
  filter: (service) => service.txtRecord.webrtc === '1',
});

const discoveredPeers: any[] = [];

discoverer.on('peer-found', (peer) => {
  discoveredPeers.push({
    peerId: peer.txtRecord.peerId,
    publicKey: hexToUint8Array(peer.txtRecord.publicKey),
    endpoints: [{
      type: 'webrtc',
      address: `${peer.address}:${peer.port}`,
    }],
  });
});

await discoverer.start();

// Wait for some discoveries
await new Promise(resolve => setTimeout(resolve, 5000));

// Bootstrap from discovered peers
if (discoveredPeers.length > 0) {
  const result = await bootstrapFromDiscoveredPeers(
    dhtRoutingTable,
    discoveredPeers,
    2 // Require at least 2 successful bootstraps
  );
  
  console.log(`Bootstrapped from ${result.nodesDiscovered} peers`);
}
```

## Peer Routing

### 5. Add Peers to Network

```typescript
// When a new peer connects
function onPeerConnected(peer: Peer) {
  // Add to routing table (automatically adds to DHT if enabled)
  routingTable.addPeer(peer);
  
  console.log(`Peer ${peer.id} added to network`);
  
  // Check DHT statistics
  const dhtStats = dhtRoutingTable.getStats();
  console.log(`DHT now has ${dhtStats.nodeCount} nodes`);
}
```

### 6. Find Peers Using DHT

```typescript
async function findPeer(targetPeerId: string) {
  if (!routingTable.isDHTEnabled()) {
    console.warn('DHT not enabled, using flood routing');
    return null;
  }
  
  try {
    // DHT lookup for closest peers
    const closestNodes = await routingTable.findPeerViaDHT(targetPeerId);
    
    console.log(`Found ${closestNodes.length} close peers:`);
    for (const node of closestNodes) {
      console.log(`  - ${node.peerId} (last seen: ${node.lastSeen})`);
    }
    
    return closestNodes;
  } catch (error) {
    console.error('DHT lookup failed:', error);
    return null;
  }
}

// Example usage
const closePeers = await findPeer('target-peer-id-abc123');
```

## Network Monitoring

### 7. Monitor Network State

```typescript
import { NetworkStateManager } from '@sc/core';

const networkState = new NetworkStateManager(dhtRoutingTable, {
  minNodesConnected: 10,
  minNodesDegraded: 3,
  maxAcceptableLatency: 1000,
});

// Listen for state changes
networkState.on('stateChange', (event) => {
  const { oldState, newState } = event.data;
  console.log(`Network state: ${oldState} → ${newState}`);
  
  switch (newState) {
    case 'DISCONNECTED':
      console.log('⚠️ Disconnected from network');
      break;
    case 'BOOTSTRAPPING':
      console.log('🔄 Connecting to network...');
      break;
    case 'DEGRADED':
      console.log('⚠️ Network connection degraded');
      break;
    case 'CONNECTED':
      console.log('✅ Fully connected to network');
      break;
  }
});

// Listen for health warnings
networkState.on('healthWarning', (event) => {
  console.warn('Health warning:', event.data.message);
});

// Listen for topology changes
networkState.on('topologyChange', (event) => {
  const topology = event.data;
  console.log(`Network topology updated:`);
  console.log(`  Nodes: ${topology.totalNodes}`);
  console.log(`  Direct peers: ${topology.directPeers}`);
  console.log(`  Health score: ${topology.healthScore}/100`);
});

// Start monitoring
networkState.start();
```

### 8. Display DHT Statistics

```typescript
function displayDHTStats() {
  const stats = dhtRoutingTable.getStats();
  
  console.log('=== DHT Statistics ===');
  console.log(`Nodes: ${stats.nodeCount}`);
  console.log(`Active buckets: ${stats.activeBuckets}`);
  console.log(`Stored values: ${stats.valueCount}`);
  console.log(`Total lookups: ${stats.totalLookups}`);
  console.log(`Successful: ${stats.successfulLookups} (${
    (stats.successfulLookups / stats.totalLookups * 100).toFixed(1)
  }%)`);
  console.log(`Avg lookup time: ${stats.avgLookupTime.toFixed(1)}ms`);
  console.log(`Memory usage: ${(stats.memoryUsage / 1024).toFixed(1)} KB`);
}

// Call periodically
setInterval(displayDHTStats, 30000); // Every 30 seconds
```

## Advanced Usage

### 9. Store and Retrieve Values in DHT

```typescript
import { generateDHTKey } from '@sc/core';

// Store a value
async function storeValue(key: string, data: Uint8Array) {
  const dhtKey = generateDHTKey(key);
  
  const value = {
    data,
    storedAt: Date.now(),
    ttl: 3600000, // 1 hour
    publisherId: dhtRoutingTable.localNodeId,
  };
  
  const stored = await dhtRoutingTable.store(dhtKey, value);
  console.log(`Value stored at ${stored} nodes`);
}

// Retrieve a value
async function retrieveValue(key: string) {
  const dhtKey = generateDHTKey(key);
  
  const result = await dhtRoutingTable.findValue(dhtKey);
  
  if (result.found && result.value) {
    console.log('Value found!');
    console.log('Data:', result.value.data);
    console.log('Age:', Date.now() - result.value.storedAt, 'ms');
    return result.value.data;
  } else {
    console.log('Value not found');
    console.log(`Queried ${result.queriedNodes.length} nodes`);
    return null;
  }
}
```

### 10. Hybrid Mode for Best Performance

```typescript
// Use hybrid mode for large networks
const routingTable = new RoutingTable({
  mode: RoutingMode.HYBRID,
  dhtRoutingTable,
});

// Hybrid mode uses:
// - DHT for peer discovery (efficient)
// - Flood for message delivery (reliable)

// Best of both worlds!
```

### 11. Custom Bootstrap Progress

```typescript
import { DHTBootstrap } from '@sc/core';

const bootstrap = new DHTBootstrap(dhtRoutingTable, {
  bootstrapNodes: [...], // Your bootstrap nodes
  minBootstrapNodes: 2,
  bootstrapTimeout: 30000,
});

// Monitor progress
bootstrap.onProgress((phase, progress, message) => {
  console.log(`[${phase}] ${progress}% - ${message}`);
  
  // Update UI
  updateProgressBar(progress);
  updateStatusText(message);
});

// Start bootstrap
const result = await bootstrap.bootstrap();
```

## Error Handling

### 12. Robust Error Handling

```typescript
async function robustBootstrap(dhtRoutingTable, peerInfo) {
  try {
    const result = await bootstrapFromQRCode(dhtRoutingTable, peerInfo);
    
    if (!result.success) {
      // Bootstrap failed but didn't throw
      console.error('Bootstrap failed:', result.error);
      
      if (result.nodesDiscovered === 0) {
        // No peers discovered at all
        console.log('No peers found. Check network connectivity.');
      } else {
        // Some peers found but not enough
        console.log(`Only ${result.nodesDiscovered} peers found (need ${
          result.minBootstrapNodes || 1
        })`);
      }
      
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Bootstrap exception:', error);
    
    // Network error, timeout, or configuration error
    if (error.message.includes('timeout')) {
      console.log('Bootstrap timed out. Peer may be offline.');
    } else if (error.message.includes('configuration')) {
      console.log('Invalid bootstrap configuration.');
    }
    
    return false;
  }
}
```

## Testing

### 13. Test DHT Integration

```typescript
import { describe, it, expect } from '@jest/globals';

describe('DHT Integration', () => {
  it('should bootstrap and find peers', async () => {
    const localNodeId = generateNodeId();
    const dhtRoutingTable = new KademliaRoutingTable(localNodeId);
    
    const routingTable = new RoutingTable({
      mode: RoutingMode.DHT,
      dhtRoutingTable,
    });
    
    // Add test peers
    for (let i = 0; i < 10; i++) {
      const peer = createPeer(
        `peer-${i}`,
        generateMockPublicKey(),
        'webrtc'
      );
      routingTable.addPeer(peer);
    }
    
    // Verify DHT has peers
    const stats = dhtRoutingTable.getStats();
    expect(stats.nodeCount).toBe(10);
    
    // Test lookup
    const closestNodes = await routingTable.findPeerViaDHT('peer-5');
    expect(closestNodes.length).toBeGreaterThan(0);
  });
});
```

## Migration from Flood Routing

### 14. Gradual Migration

```typescript
// Phase 1: Start with flood routing (existing code)
const routingTable = new RoutingTable();

// Phase 2: Add DHT but keep flood as primary (testing)
const dhtRoutingTable = new KademliaRoutingTable(myNodeId);
const routingTable = new RoutingTable({
  mode: RoutingMode.FLOOD,
  dhtRoutingTable, // DHT available but not primary
});

// Phase 3: Switch to hybrid mode (gradual rollout)
const routingTable = new RoutingTable({
  mode: RoutingMode.HYBRID,
  dhtRoutingTable,
});

// Phase 4: Full DHT mode (production)
const routingTable = new RoutingTable({
  mode: RoutingMode.DHT,
  dhtRoutingTable,
});
```

## Best Practices

1. **Always start DHT maintenance**: Call `dhtRoutingTable.start()` after initialization
2. **Stop DHT on cleanup**: Call `dhtRoutingTable.stop()` when shutting down
3. **Monitor network state**: Use `NetworkStateManager` for health tracking
4. **Use hybrid mode**: Best balance between efficiency and reliability
5. **Handle bootstrap failures**: Implement retry logic with backoff
6. **Cache bootstrap nodes**: Remember successful bootstrap nodes for faster reconnection
7. **Set appropriate timeouts**: Adjust based on your network conditions
8. **Monitor statistics**: Track DHT performance with `getStats()`

## Troubleshooting

### DHT Not Finding Peers

```typescript
// Check DHT is enabled
if (!routingTable.isDHTEnabled()) {
  console.error('DHT not enabled!');
}

// Check DHT has nodes
const stats = dhtRoutingTable.getStats();
if (stats.nodeCount === 0) {
  console.error('DHT has no nodes. Need to bootstrap first.');
}

// Check network state
const topology = networkState.getTopology();
if (topology.state === 'DISCONNECTED') {
  console.error('Network disconnected. Check connectivity.');
}
```

### Bootstrap Keeps Failing

```typescript
// Try with multiple bootstrap nodes
const result = await bootstrapFromDiscoveredPeers(
  dhtRoutingTable,
  multipleBootstrapPeers,
  1 // Lower minimum requirement
);

// Increase timeout
const bootstrap = new DHTBootstrap(dhtRoutingTable, {
  bootstrapNodes,
  bootstrapTimeout: 60000, // 1 minute
});
```

### High Memory Usage

```typescript
// Reduce DHT parameters
const dhtRoutingTable = new KademliaRoutingTable(myNodeId, {
  k: 10,                    // Smaller buckets
  maxConcurrentLookups: 5,  // Fewer parallel lookups
});

// Monitor memory
const stats = dhtRoutingTable.getStats();
console.log('Memory usage:', (stats.memoryUsage / 1024 / 1024).toFixed(2), 'MB');
```
