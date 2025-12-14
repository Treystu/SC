# Scalable Mesh Routing Algorithm Design

## Current Implementation Analysis

The existing mesh routing implementation in `core/src/mesh/network.ts` and `core/src/mesh/routing.ts` uses **flood routing**, where messages are broadcast to all known peers. Key characteristics:

- **Routing Logic**: Messages without a direct route are broadcast to all peers (`peerPool.broadcast(encodedMessage)`).
- **Routing Table**: Maintains a map of routes with hop counts, latency, reliability, and bandwidth metrics.
- **Message Deduplication**: Uses a Bloom filter and message cache to prevent re-processing.
- **Scalability Issues**:
  - O(n) message overhead where n is the number of peers.
  - Exponential traffic growth in dense networks.
  - High bandwidth consumption.
  - Unpredictable latency and delivery guarantees.
  - Not suitable for 1,000,000+ concurrent users.

## Alternative Routing Algorithms Analysis

### 1. DHT-Based Routing (Kademlia)

**Description**: Uses a distributed hash table with XOR-based distance metric for O(log n) lookups.

**Advantages**:
- **Scalability**: O(log n) lookup complexity, efficient for large networks.
- **Decentralization**: Fully distributed, no central points of failure.
- **Deterministic Routing**: Guaranteed delivery through structured overlay.
- **Sovereignty**: No reliance on centralized infrastructure.
- **Proven**: Used in BitTorrent, IPFS, Ethereum.

**Disadvantages**:
- **Latency**: Higher lookup latency compared to direct routing.
- **Maintenance Overhead**: Requires periodic routing table updates.
- **Churn Handling**: Complex to handle peer joins/leaves.
- **Storage**: Each peer stores O(log n) routing information.

**Suitability for Sovereignty and Scalability**: Excellent - maintains full decentralization while scaling logarithmically.

### 2. Gossip-Based Routing

**Description**: Probabilistic routing using epidemic dissemination (e.g., GossipSub in libp2p).

**Advantages**:
- **Scalability**: Bounded degree overlay networks.
- **Fault Tolerance**: High resilience to node failures.
- **Low Latency**: Fast message propagation in mesh overlays.
- **Simple**: Easy to implement and maintain.

**Disadvantages**:
- **Probabilistic Delivery**: No guaranteed message delivery.
- **High Overhead**: Control messages for mesh maintenance.
- **Inefficient for Unicast**: Better suited for pubsub than point-to-point routing.
- **Network Partitioning**: Susceptible to splits in sparse networks.

**Suitability for Sovereignty and Scalability**: Good scalability but compromises on deterministic delivery, which may conflict with sovereignty requirements for reliable communication.

### 3. Landmark-Based Routing

**Description**: Uses predefined "landmark" nodes as reference points for hierarchical routing.

**Advantages**:
- **Scalability**: Hierarchical structure reduces routing complexity.
- **Low Latency**: Direct routing through landmarks.
- **Predictable**: Structured approach to path selection.

**Disadvantages**:
- **Centralization Risk**: Landmarks become single points of failure.
- **Sovereignty Issues**: Requires trusted landmark nodes.
- **Maintenance**: Complex landmark selection and updates.
- **Not Fully Decentralized**: Hierarchical nature introduces centralization.

**Suitability for Sovereignty and Scalability**: Poor - compromises sovereignty through centralized landmarks, though scalable in structure.

## Recommended Algorithm: Kademlia DHT

**Recommendation**: Implement Kademlia DHT-based routing for the sovereign P2P network.

**Rationale**:
- Provides O(log n) scalability suitable for 1,000,000+ users.
- Maintains full decentralization and sovereignty.
- Offers deterministic routing with guaranteed delivery.
- Well-established protocol with mature implementations.
- Aligns with requirements for decentralized P2P networking.

## High-Level Architectural Plan

### Integration Overview

Replace flood routing with DHT-based peer discovery and routing while preserving existing transport and security layers.

```
graph TD
    A[Application] --> B[MeshNetwork]
    B --> C[DHT Routing Layer]
    C --> D[Kademlia DHT]
    D --> E[Peer Connection Pool]
    E --> F[WebRTC/Transport Layer]
```

### Required Changes to Core Module

1. **New DHT Implementation** (`core/src/mesh/kademlia.ts`):
   - Kademlia node with XOR distance metric.
   - Routing table management (k-buckets).
   - Lookup protocol for peer discovery.
   - Bootstrap mechanism for initial peer discovery.

2. **Routing Table Refactor** (`core/src/mesh/routing.ts`):
   - Integrate DHT routing table with existing peer management.
   - Add peer ID hashing for XOR distance calculations.
   - Update route selection to use DHT lookups instead of flooding.

3. **Network Manager Updates** (`core/src/mesh/network.ts`):
   - Replace broadcast logic with DHT-based routing.
   - Implement peer lookup before message sending.
   - Add DHT bootstrap process during network initialization.
   - Maintain backward compatibility with existing peer connections.

4. **Message Relay Updates** (`core/src/mesh/relay.ts`):
   - Update forwarding logic to use DHT-resolved next hops.
   - Implement iterative routing for multi-hop messages.
   - Add timeout handling for DHT lookups.

### Implementation Phases

1. **Phase 1: DHT Core**
   - Implement basic Kademlia protocol.
   - Add peer ID generation and distance functions.

2. **Phase 2: Integration**
   - Integrate DHT with existing routing table.
   - Replace flooding with DHT lookups.

3. **Phase 3: Optimization**
   - Add caching and performance optimizations.
   - Implement fault tolerance and recovery.

4. **Phase 4: Testing**
   - Load testing with simulated large networks.
   - Compatibility testing with existing transports.

### Migration Strategy

- Maintain dual routing during transition: DHT + fallback to flooding.
- Gradual rollout with feature flags.
- Backward compatibility with existing peer discovery mechanisms.