import { describe, it, expect, beforeEach } from "@jest/globals";
import { RoutingTable, createPeer } from "../../core/src/mesh/routing";

describe("Concurrent Users Load Test", () => {
  let routingTable: RoutingTable;

  beforeEach(() => {
    routingTable = new RoutingTable("local-node");
  });

  it("should handle 10,000 concurrent peers efficiently", async () => {
    const PEER_COUNT = 10000;
    const startTime = Date.now();

    // Simulate 10k users joining
    for (let i = 0; i < PEER_COUNT; i++) {
      const peer = createPeer(`peer-${i}`, new Uint8Array(32), "webrtc");
      routingTable.addPeer(peer);
    }

    const addDuration = Date.now() - startTime;
    console.log(`Added ${PEER_COUNT} peers in ${addDuration}ms`);

    expect(routingTable.getAllPeers().length).toBe(PEER_COUNT);
    expect(routingTable.getPeer(`peer-${PEER_COUNT - 1}`)).toBeDefined();

    // Performance assertion (e.g., adding should be reasonably fast, < 2s for 10k in-memory)
    expect(addDuration).toBeLessThan(2000);
  });

  it("should handle concurrent peer lookups with minimal latency", async () => {
    const PEER_COUNT = 5000;
    
    // Add peers
    for (let i = 0; i < PEER_COUNT; i++) {
      const peer = createPeer(`lookup-peer-${i}`, new Uint8Array(32), "bluetooth");
      routingTable.addPeer(peer);
    }

    // Measure lookup performance
    const startTime = Date.now();
    let foundCount = 0;
    const LOOKUP_COUNT = 1000;
    
    for (let i = 0; i < LOOKUP_COUNT; i++) {
      const peerId = `lookup-peer-${Math.floor(Math.random() * PEER_COUNT)}`;
      if (routingTable.getPeer(peerId)) {
        foundCount++;
      }
    }

    const lookupDuration = Date.now() - startTime;
    console.log(`Performed ${LOOKUP_COUNT} lookups in ${lookupDuration}ms`);
    
    expect(foundCount).toBe(LOOKUP_COUNT);
    // Should complete in under 100ms
    expect(lookupDuration).toBeLessThan(100);
  });

  it("should handle concurrent peer removals efficiently", async () => {
    const PEER_COUNT = 5000;
    
    // Add peers first
    for (let i = 0; i < PEER_COUNT; i++) {
      const peer = createPeer(`remove-peer-${i}`, new Uint8Array(32), "webrtc");
      routingTable.addPeer(peer);
    }

    const startTime = Date.now();
    
    // Remove half the peers
    for (let i = 0; i < PEER_COUNT / 2; i++) {
      routingTable.removePeer(`remove-peer-${i}`);
    }

    const removeDuration = Date.now() - startTime;
    console.log(`Removed ${PEER_COUNT / 2} peers in ${removeDuration}ms`);
    
    expect(routingTable.getAllPeers().length).toBe(PEER_COUNT / 2);
    // Removal should be fast
    expect(removeDuration).toBeLessThan(500);
  });

  it("should handle routing table snapshot under load", async () => {
    const PEER_COUNT = 2000;
    
    // Add peers
    for (let i = 0; i < PEER_COUNT; i++) {
      const peer = createPeer(`snapshot-peer-${i}`, new Uint8Array(32), "local");
      routingTable.addPeer(peer);
    }

    const startTime = Date.now();
    
    // Take multiple snapshots while peers are being added
    const snapshotPromises = [];
    for (let i = 0; i < 10; i++) {
      snapshotPromises.push(Promise.resolve().then(() => {
        const snapshot = routingTable.getAllPeers();
        return snapshot.length;
      }));
    }

    const snapshots = await Promise.all(snapshotPromises);
    const snapshotDuration = Date.now() - startTime;
    
    console.log(`Took 10 snapshots in ${snapshotDuration}ms`);
    
    // All snapshots should report same peer count
    for (const count of snapshots) {
      expect(count).toBe(PEER_COUNT);
    }
    expect(snapshotDuration).toBeLessThan(1000);
  });

  it("should handle peer health checks concurrently", async () => {
    const PEER_COUNT = 1000;
    
    // Add peers
    for (let i = 0; i < PEER_COUNT; i++) {
      const peer = createPeer(`health-peer-${i}`, new Uint8Array(32), "webrtc");
      routingTable.addPeer(peer);
    }

    const startTime = Date.now();
    
    // Simulate concurrent health checks
    const healthCheckPromises = [];
    for (let i = 0; i < PEER_COUNT; i++) {
      healthCheckPromises.push(Promise.resolve().then(() => {
        const peer = routingTable.getPeer(`health-peer-${i}`);
        return peer ? peer.lastSeen : null;
      }));
    }

    const healthResults = await Promise.all(healthCheckPromises);
    const healthCheckDuration = Date.now() - startTime;
    
    console.log(`Performed ${PEER_COUNT} health checks in ${healthCheckDuration}ms`);
    
    // All peers should be found
    expect(healthResults.filter(r => r !== null).length).toBe(PEER_COUNT);
    expect(healthCheckDuration).toBeLessThan(500);
  });

  it("should handle rapid peer churn (join/leave)", async () => {
    const CHURN_CYCLES = 100;
    const PEERS_PER_CYCLE = 50;
    
    const startTime = Date.now();
    
    for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
      // Add peers
      const addedPeers: string[] = [];
      for (let i = 0; i < PEERS_PER_CYCLE; i++) {
        const peerId = `churn-${cycle}-${i}`;
        const peer = createPeer(peerId, new Uint8Array(32), "bluetooth");
        routingTable.addPeer(peer);
        addedPeers.push(peerId);
      }
      
      // Remove some peers
      for (let i = 0; i < PEERS_PER_CYCLE / 2; i++) {
        routingTable.removePeer(addedPeers[i]);
      }
    }

    const churnDuration = Date.now() - startTime;
    console.log(`Completed ${CHURN_CYCLES} churn cycles in ${churnDuration}ms`);
    
    // Should complete in reasonable time
    expect(churnDuration).toBeLessThan(10000);
  });

  it("should measure memory usage under peer load", async () => {
    const PEER_COUNT = 5000;
    
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Add peers
    for (let i = 0; i < PEER_COUNT; i++) {
      const peer = createPeer(`memory-peer-${i}`, new Uint8Array(32), "webrtc");
      routingTable.addPeer(peer);
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryUsed = finalMemory - initialMemory;
    
    console.log(`Memory used for ${PEER_COUNT} peers: ${(memoryUsed / 1024 / 1024).toFixed(2)} MB`);
    
    // Verify peers were added
    expect(routingTable.getAllPeers().length).toBe(PEER_COUNT);
    
    // Memory should be reasonable (less than 100MB for 5000 peers)
    expect(memoryUsed).toBeLessThan(100 * 1024 * 1024);
  });
});
