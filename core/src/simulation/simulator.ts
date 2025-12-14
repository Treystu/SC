import { MeshNetwork } from "../mesh/network.js";
import { IdentityKeyPair, generateIdentity } from "../crypto/primitives.js";

interface SimNode {
  id: string;
  network: MeshNetwork;
  identity: IdentityKeyPair;
}

export class NetworkSimulator {
  nodes: Map<string, SimNode> = new Map();
  latency: number = 10; // ms
  dropRate: number = 0.0;

  constructor() {}

  async createNode(): Promise<SimNode> {
    const identity = await generateIdentity();
    const network = new MeshNetwork({
      identity: identity,
      maxPeers: 50,
    });

    // Hook up transport
    network.registerOutboundTransport(async (targetId, data) => {
      await this.deliver(identity.publicKey, targetId, data);
    });

    const id = Buffer.from(identity.publicKey).toString("hex");
    const node: SimNode = { id, network, identity };
    this.nodes.set(id, node);

    // Start network
    // We don't need to await this if it's just setting up listeners
    // network.start(); // Assuming start method exists or is implicitly ready

    return node;
  }

  async deliver(senderKey: Uint8Array, targetId: string, data: Uint8Array) {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, this.latency));

    if (Math.random() < this.dropRate) return;

    const target = this.nodes.get(targetId);
    if (target) {
      // console.log(`DELIVER: ${Buffer.from(senderKey).toString('hex').substring(0,8)} -> ${targetId.substring(0,8)} (${data.length} bytes)`);
      const senderId = Buffer.from(senderKey).toString("hex");
      // We need to pass the sender ID to handleIncomingPacket so it knows who it's from
      // The MeshNetwork.handleIncomingPacket signature is (peerId: string, data: Uint8Array)
      await target.network.handleIncomingPacket(senderId, data);
    } else {
      console.warn(`DELIVER FAIL: Target ${targetId} not found`);
    }
  }

  /**
   * Connect two nodes (Virtual Connection)
   * This forces them to know each other in their routing tables.
   */
  async connect(nodeA: SimNode, nodeB: SimNode) {
    // Manually inject into routing tables to simulate connection
    const peerA = {
      id: nodeA.id,
      publicKey: nodeA.identity.publicKey,
      lastSeen: Date.now(),
      transportType: "native",
      state: "connected",
      metadata: { capabilities: {} },
    };

    const peerB = {
      id: nodeB.id,
      publicKey: nodeB.identity.publicKey,
      lastSeen: Date.now(),
      transportType: "native",
      state: "connected",
      metadata: { capabilities: {} },
    };

    // Access private routingTable via cast
    (nodeA.network as any).routingTable.addPeer(peerB);
    (nodeB.network as any).routingTable.addPeer(peerA);
  }
}
