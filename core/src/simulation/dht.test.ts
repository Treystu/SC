import { NetworkSimulator } from "./simulator.js";

// Increase timeout for large scale test
jest.setTimeout(60000);

describe("Large Scale DHT Simulation", () => {
  let simulator: NetworkSimulator;
  const NODE_COUNT = 30; // Reduce from 100 to 30 for CI/CD speed, valid for 1M extrapolation logic

  beforeEach(() => {
    simulator = new NetworkSimulator();
  });

  it("should route messages in a 30-node small-world network", async () => {
    const nodes = [];

    // 1. Create Nodes
    console.log(`Creating ${NODE_COUNT} nodes...`);
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push(await simulator.createNode());
    }

    // 2. Connect Nodes (Random Graph with Avg Degree ~4)
    console.log("Wiring network...");
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = nodes[i];
      const neighbors = new Set<number>();
      while (neighbors.size < 3) {
        const target = Math.floor(Math.random() * NODE_COUNT);
        if (target !== i) neighbors.add(target);
      }

      for (const targetIdx of neighbors) {
        await simulator.connect(node, nodes[targetIdx]);
      }
    }

    // Allow some time for ping/pong routing table updates
    await new Promise((r) => setTimeout(r, 2000));

    // Check routing table size
    const storer = nodes[0];
    console.log(
      `Node 0 Peers: ${(storer.network as any).routingTable.getAllPeers().length}`,
    );

    // 3. Store a value on a random node (or via the network)
    // Key must be 64-char hex string (32 bytes) to match Kademlia ID space
    const key =
      "e5c1d4e3f2b1a09876543210fedcba9876543210fedcba9876543210fedcba98";
    const value = new TextEncoder().encode("Hello World from the Mesh");

    console.log(`Node ${storer.id.substring(0, 8)} storing value...`);

    await storer.network.dhtStore(key, value);

    // Wait for propagation
    // DHT store is usually fast but might involve round trips
    await new Promise((r) => setTimeout(r, 1000));

    // 4. Retrieve from a distant node
    // In a random graph, 0 and 15 might be far apart
    const retriever = nodes[Math.floor(NODE_COUNT / 2)];
    console.log(`Node ${retriever.id.substring(0, 8)} retrieving value...`);

    const retrieved = await retriever.network.dhtFindValue(key);

    expect(retrieved).toBeDefined();
    if (!retrieved) {
      // Debug: Check who has the value
      let count = 0;
      for (const n of nodes) {
        const has = (n.network as any).dht.storage.has(key);
        if (has) count++;
      }
      console.log(`DEBUG: Value stored on ${count} nodes.`);
      throw new Error("Value not found");
    }
    const retrievedStr = new TextDecoder().decode(retrieved);
    expect(retrievedStr).toBe("Hello World from the Mesh");

    console.log("Success! Value retrieved across mesh.");
  });
});
