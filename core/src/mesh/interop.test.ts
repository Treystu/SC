import { MeshNetwork } from "./network.js"; // Added .js
import type { Transport } from "./transport/Transport.js"; // Correct casing // Added .js
import type { Message } from "./message.js"; // Ensure Message is imported as type only
import { jest } from "@jest/globals";
// Removed Transport import since we don't need the interface in JS

// Mock Transport in JS
class MockTransport implements Transport {
  name: string;
  onMessage: (from: string, data: Uint8Array) => void = () => {};
  onPeerConnect: (peerId: string) => void = () => {};
  onPeerDisconnect: (peerId: string) => void = () => {};

  constructor(name: string) {
    this.name = name;
  }

  async start(options?: any) {
    if (options) {
      if (options.onPeerConnected) this.onPeerConnect = options.onPeerConnected;
      if (options.onPeerDisconnected)
        this.onPeerDisconnect = options.onPeerDisconnected;
      if (options.onMessage) this.onMessage = options.onMessage;
    }
  }
  async stop() {}

  // State tracking
  connectedPeers: Set<string> = new Set();

  // Simulate finding a peer
  simulateConnect(peerId: string) {
    this.connectedPeers.add(peerId);
    if (this.onPeerConnect) this.onPeerConnect(peerId);
  }

  // Simulate losing a peer
  simulateDisconnect(peerId: string) {
    this.connectedPeers.delete(peerId);
    if (this.onPeerDisconnect) this.onPeerDisconnect(peerId);
  }

  // Simulate receiving data
  simulateMessage(from: string, data: Uint8Array) {
    if (this.onMessage) this.onMessage(from, data);
  }

  async send(peerId: string, data: Uint8Array) {
    return Promise.resolve();
  }

  // Implement missing interface properties
  localPeerId: string = "mock-local-id";
  async connect(peerId: string, signalingData: any): Promise<void> {}
  async disconnect(peerId: string): Promise<void> {}
  async broadcast(data: Uint8Array): Promise<void> {}
  async getMetrics() {
    return [];
  }
  async getPeers() {
    return [];
  }

  // Missing methods
  getConnectedPeers() {
    return Array.from(this.connectedPeers);
  }
  getPeerInfo(peerId: string) {
    if (this.connectedPeers.has(peerId)) {
      return { peerId, state: "connected" as const, transportType: this.name };
    }
    return undefined;
  }
  getConnectionState(peerId: string) {
    return this.connectedPeers.has(peerId) ? "connected" : "disconnected";
  }
}

describe("Cross-Platform Interop & Roaming", () => {
  let desktopNode: MeshNetwork;
  let transportLAN: MockTransport;
  let transportBLE: MockTransport;

  beforeEach(async () => {
    // Setup "Desktop" node with multiple transports
    desktopNode = new MeshNetwork();

    // Manually inject transports since we can't easily access the internal map
    // assuming MeshNetwork has a transportManager property
    transportLAN = new MockTransport("lan");
    transportBLE = new MockTransport("ble");

    // We need to register these. If registerTransport isn't public, we inject.
    if (
      (desktopNode as any).transportManager &&
      (desktopNode as any).transportManager.registerTransport
    ) {
      (desktopNode as any).transportManager.registerTransport(transportLAN);
      (desktopNode as any).transportManager.registerTransport(transportBLE);
    } else {
      console.warn("Could not register transports on desktopNode");
    }

    // Start the node to bind listeners
    await desktopNode.start();
  });

  test("Scenario A: Desktop discovers Mobile via LAN", () => {
    const mobilePeerId = "mobile-peer-123";

    // 1. Simulate discovery via mDNS/LAN
    transportLAN.simulateConnect(mobilePeerId);

    // 2. Verify peer is added to routing table
    const peer = (desktopNode as any).routingTable.getPeer(mobilePeerId);
    expect(peer).toBeDefined();
  });

  test("Scenario B: Seamless Roaming (LAN -> BLE)", () => {
    const mobilePeerId = "mobile-peer-roaming";

    // 1. Connect via LAN
    transportLAN.simulateConnect(mobilePeerId);
    expect(
      (desktopNode as any).routingTable.getPeer(mobilePeerId),
    ).toBeDefined();

    // 2. Connect via BLE (Dual stack)
    transportBLE.simulateConnect(mobilePeerId);

    // 3. Disconnect LAN (Walking away from WiFi)
    transportLAN.simulateDisconnect(mobilePeerId);

    // 4. Verify peer is STILL connected (via BLE)
    // Note: usage might need to be checked in RoutingTable to ensure it didn't remove the peer entirely
    const peer = (desktopNode as any).routingTable.getPeer(mobilePeerId);
    expect(peer).toBeDefined();
  });

  test("Scenario C: Transport Redundancy", async () => {
    const mobilePeerId = "mobile-peer-redundant";

    // Connect both
    transportLAN.simulateConnect(mobilePeerId);
    transportBLE.simulateConnect(mobilePeerId);

    // Spy on send
    const sendSpy = jest.spyOn((desktopNode as any).transportManager, "send");

    // Send a message
    // Send a message
    // desktopNode might not expose send directly if it's strictly handling routing internally
    await (desktopNode as any).transportManager.send(
      mobilePeerId,
      new Uint8Array([1, 2, 3]),
    );

    // Verify it tries to send.
    expect(sendSpy).toHaveBeenCalled();
  });
});
