# Future Routing Enhancements

This document tracks planned improvements to the Silent Mesh routing architecture.

## Current Implementation (Silent Mesh v1.0)

The Silent Mesh architecture provides:

1. **Architectural Separation**: Mesh neighbors (technical connections) are separate from social contacts
2. **Eternal Ledger**: Persistent known nodes registry that survives identity resets
3. **Watering Hole Delivery**: Store-and-forward for offline nodes via known gateways
4. **Light Ping Protocol**: Startup bootstrap using recent nodes from the ledger
5. **Device Profile Awareness**: Power-aware discovery throttling

## Planned Enhancements

### 1. Advanced 'Friends of Friends' Routing

**Status**: Not Started
**Priority**: High

Leverage the Eternal Ledger to implement multi-hop routing through trusted intermediaries.

#### Implementation Plan:
- [ ] Add relationship strength metric to KnownNode (connection frequency, message volume)
- [ ] Implement trust propagation algorithm (transitive trust with decay)
- [ ] Add route discovery through trusted intermediaries
- [ ] Implement secure relay protocol with end-to-end encryption
- [ ] Add route caching with TTL

#### Key Considerations:
- Privacy: Don't leak social graph to intermediaries
- Security: Prevent relay abuse and amplification attacks
- Performance: Balance route optimality vs discovery overhead

### 2. Heuristics for 'Watering Hole' Overlap Prediction

**Status**: Not Started
**Priority**: Medium

Predict where offline nodes might reappear based on historical patterns.

#### Implementation Plan:
- [ ] Track temporal patterns (time of day, day of week)
- [ ] Track gateway affinity (which gateways a node uses most)
- [ ] Implement location clustering (without tracking actual locations)
- [ ] Add probabilistic delivery scoring
- [ ] Implement preemptive message staging at likely gateways

#### Data Points to Track:
- Connection timestamps (hour buckets, not precise times)
- Gateway IDs and frequency
- Connection duration patterns
- Network type (WiFi vs cellular indicators)

### 3. Mesh Health Scoring

**Status**: Not Started
**Priority**: Medium

Implement a scoring system to evaluate overall mesh health and suggest improvements.

#### Metrics to Track:
- [ ] Path redundancy (multiple routes to key nodes)
- [ ] Average hop count to reach nodes
- [ ] Gateway availability
- [ ] Ledger freshness distribution
- [ ] Connection success rates

### 4. Smart Relay Selection

**Status**: Not Started
**Priority**: Low

Improve relay node selection based on historical performance.

#### Implementation Plan:
- [ ] Track relay success rates per node
- [ ] Monitor relay latency
- [ ] Consider bandwidth capacity
- [ ] Implement relay reputation system

### 5. Offline Message Compression

**Status**: Not Started
**Priority**: Low

Reduce storage requirements for watering hole messages.

#### Implementation Plan:
- [ ] Implement message compression (zstd or similar)
- [ ] Add message bundling for same destination
- [ ] Implement priority-based eviction

## Security Considerations

All routing enhancements must maintain:

1. **End-to-end encryption**: Message content never exposed to relays
2. **Metadata minimization**: Don't leak more than necessary to intermediaries
3. **Sybil resistance**: Prevent fake node attacks
4. **Denial of service protection**: Rate limiting and resource bounds
5. **IP spoofing detection**: Validate node identity against ledger

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Ledger lookup | O(1) | O(1) |
| Route discovery | O(n) | O(log n) |
| Message delivery latency (direct) | < 100ms | < 100ms |
| Message delivery latency (1-hop relay) | < 500ms | < 300ms |
| Watering hole delivery | < 24h | < 1h (when available) |

## Testing Strategy

Each enhancement requires:

1. Unit tests for new data structures and algorithms
2. Integration tests with multi-node scenarios
3. Performance benchmarks
4. Security audit for new attack surfaces
5. Battery impact measurement on mobile devices

## References

- [Kademlia DHT Paper](https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf)
- [Gossip Protocol Comparison](https://www.cs.cornell.edu/home/rvr/papers/GossipBook.pdf)
- [Secure Multi-Hop Messaging](https://signal.org/docs/)
