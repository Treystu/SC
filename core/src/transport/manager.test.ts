/**
 * Tests for TransportManager - Multi-transport connection management
 */

import { TransportManager, type PeerTransportAddress } from "./manager";
import type {
  Transport,
  TransportPeerId,
  TransportEvents,
  TransportPeerInfo,
  TransportConnectionState,
  SignalingData,
  TransportConfig,
} from "./Transport";

/**
 * Mock transport for testing
 */
class MockTransport implements Transport {
  readonly localPeerId: string;
  readonly name: string;
  private events: TransportEvents | null = null;
  private connected: Set<string> = new Set();
  private started = false;
  public failOnConnect = false;

  constructor(localPeerId: string, name: string) {
    this.localPeerId = localPeerId;
    this.name = name;
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    this.connected.clear();
  }

  async connect(peerId: string, _signalingData?: SignalingData): Promise<void> {
    if (this.failOnConnect) {
      throw new Error(`MockTransport ${this.name}: connection failed`);
    }
    this.connected.add(peerId);
    this.events?.onPeerConnected?.(peerId, {
      peerId,
      state: "connected",
      transportType: this.name,
    });
  }

  async disconnect(peerId: string): Promise<void> {
    this.connected.delete(peerId);
    this.events?.onPeerDisconnected?.(peerId, "disconnected");
  }

  async send(peerId: string, payload: Uint8Array): Promise<void> {
    if (!this.connected.has(peerId)) {
      throw new Error(`Not connected to ${peerId}`);
    }
  }

  async broadcast(payload: Uint8Array, _excludePeerId?: string): Promise<void> {
    // No-op for mock
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connected);
  }

  getPeerInfo(peerId: string): TransportPeerInfo | undefined {
    if (!this.connected.has(peerId)) return undefined;
    return {
      peerId,
      state: "connected",
      transportType: this.name,
    };
  }

  getConnectionState(peerId: string): TransportConnectionState | undefined {
    return this.connected.has(peerId) ? "connected" : undefined;
  }

  simulateMessage(from: string, payload: Uint8Array): void {
    this.events?.onMessage({
      from,
      payload,
      timestamp: Date.now(),
    });
  }
}

describe("TransportManager", () => {
  let manager: TransportManager;
  let webrtcTransport: MockTransport;
  let wsTransport: MockTransport;
  let messageHandler: jest.Mock;

  beforeEach(async () => {
    manager = new TransportManager({
      maxConnections: 10,
      connectionTimeout: 5000,
      enableFallback: true,
      idleTimeout: 30000,
      cleanupInterval: 60000,
    });

    webrtcTransport = new MockTransport("LOCAL_PEER_ID", "webrtc");
    wsTransport = new MockTransport("LOCAL_PEER_ID", "websocket");

    manager.addTransport(webrtcTransport, 1); // Higher priority
    manager.addTransport(wsTransport, 2); // Lower priority

    messageHandler = jest.fn();
    await manager.start({
      onMessage: messageHandler,
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
    });
  });

  afterEach(async () => {
    await manager.stop();
  });

  describe("Transport registration", () => {
    it("should have registered transports", () => {
      expect(manager.hasTransport("webrtc")).toBe(true);
      expect(manager.hasTransport("websocket")).toBe(true);
      expect(manager.hasTransport("bluetooth")).toBe(false);
    });

    it("should return transports by name", () => {
      expect(manager.getTransport("webrtc")).toBe(webrtcTransport);
      expect(manager.getTransport("websocket")).toBe(wsTransport);
      expect(manager.getTransport("bluetooth")).toBeUndefined();
    });

    it("should list available transports in stats", () => {
      const stats = manager.getStats();
      expect(stats.availableTransports).toContain("webrtc");
      expect(stats.availableTransports).toContain("websocket");
    });
  });

  describe("Connection management", () => {
    it("should connect using highest priority transport", async () => {
      const usedTransport = await manager.connect("PEER_A_ID_0001234");
      expect(usedTransport).toBe("webrtc");
      expect(manager.getConnectedPeers()).toContain("PEER_A_ID_0001234");
    });

    it("should fallback to secondary transport on failure", async () => {
      webrtcTransport.failOnConnect = true;
      const usedTransport = await manager.connect("PEER_A_ID_0001234");
      expect(usedTransport).toBe("websocket");
    });

    it("should throw when all transports fail", async () => {
      webrtcTransport.failOnConnect = true;
      wsTransport.failOnConnect = true;

      await expect(
        manager.connect("PEER_A_ID_0001234")
      ).rejects.toThrow("Failed to connect");
    });

    it("should not double-connect to same peer", async () => {
      await manager.connect("PEER_A_ID_0001234");
      // Second connect should return immediately
      const usedTransport = await manager.connect("PEER_A_ID_0001234");
      expect(usedTransport).toBe("webrtc");
    });

    it("should disconnect from peers", async () => {
      await manager.connect("PEER_A_ID_0001234");
      expect(manager.getConnectedPeers()).toContain("PEER_A_ID_0001234");

      await manager.disconnect("PEER_A_ID_0001234");
      expect(manager.getConnectedPeers()).not.toContain("PEER_A_ID_0001234");
    });

    it("should enforce max connections", async () => {
      // Connect up to max
      for (let i = 0; i < 10; i++) {
        await manager.connect(`PEER_ID_${i.toString().padStart(10, "0")}`);
      }

      // Next connection should fail
      await expect(
        manager.connect("PEER_ID_OVERFLOW_1")
      ).rejects.toThrow("Maximum connections reached");
    });
  });

  describe("Sending data", () => {
    it("should send data to connected peer", async () => {
      await manager.connect("PEER_A_ID_0001234");
      const payload = new TextEncoder().encode("hello");

      // Should not throw
      await manager.send("PEER_A_ID_0001234", payload);
    });

    it("should throw when sending to disconnected peer", async () => {
      await expect(
        manager.send("NONEXISTENT_PEER_", new Uint8Array(5))
      ).rejects.toThrow("Not connected");
    });

    it("should broadcast to all connected peers", async () => {
      await manager.connect("PEER_A_ID_0001234");
      await manager.connect("PEER_B_ID_0001234");

      const payload = new TextEncoder().encode("broadcast");
      // Should not throw
      await manager.broadcast(payload);
    });
  });

  describe("Peer info", () => {
    it("should return peer info for connected peers", async () => {
      await manager.connect("PEER_A_ID_0001234");
      const info = manager.getPeerInfo("PEER_A_ID_0001234");

      expect(info).toBeDefined();
      expect(info!.peerId).toBe("PEER_A_ID_0001234");
      expect(info!.state).toBe("connected");
    });

    it("should return undefined for unknown peers", () => {
      expect(manager.getPeerInfo("NONEXISTENT")).toBeUndefined();
    });

    it("should return connection state", async () => {
      await manager.connect("PEER_A_ID_0001234");
      expect(manager.getConnectionState("PEER_A_ID_0001234")).toBe(
        "connected"
      );
      expect(
        manager.getConnectionState("NONEXISTENT")
      ).toBeUndefined();
    });
  });

  describe("Statistics", () => {
    it("should track connection stats", async () => {
      await manager.connect("PEER_A_ID_0001234");
      await manager.connect("PEER_B_ID_0001234");

      const stats = manager.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.connectionsByTransport["webrtc"]).toBe(2);
    });
  });

  describe("Peer addresses", () => {
    it("should register and use peer addresses", async () => {
      manager.registerPeerAddresses("PEER_A_ID_0001234", [
        {
          transportType: "websocket",
          address: "ws://peer-a.example.com",
          priority: 10,
        },
      ]);

      const usedTransport = await manager.connect("PEER_A_ID_0001234");
      // Should use WebRTC (higher priority) even though we registered WS address
      expect(usedTransport).toBe("webrtc");
    });
  });

  describe("Message handling", () => {
    it("should forward messages to event handler", async () => {
      await manager.connect("PEER_A_ID_0001234");

      const payload = new TextEncoder().encode("test message");
      webrtcTransport.simulateMessage("PEER_A_ID_0001234", payload);

      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "PEER_A_ID_0001234",
          payload,
        })
      );
    });
  });
});
