import { describe, it, expect, beforeEach } from "@jest/globals";
import { RoutingTable, createPeer } from "../../core/src/mesh/routing";

describe("Concurrent Users Load Test", () => {
  let routingTable: RoutingTable;

  beforeEach(() => {
    routingTable = new RoutingTable("local-node");
  });

  it("should handle 10,000 concurrent peers", async () => {
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

    // Performance assertion (e.g., adding should be reasonably fast, < 1s for 10k in-memory)
    expect(addDuration).toBeLessThan(2000);
  });
});
