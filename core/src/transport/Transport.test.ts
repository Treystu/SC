/**
 * Tests for Transport Abstraction Layer
 */

import {
  Transport,
  TransportMessage,
  TransportEvents,
  TransportPeerId,
  DefaultTransportRegistry,
  transportRegistry,
} from "./Transport";
import { MockTransport, clearMockNetwork, getMockNetworkPeers } from "./__mocks__/MockTransport";

describe("Transport Abstraction", () => {
  afterEach(() => {
    clearMockNetwork();
  });

  describe("MockTransport", () => {
    it("should start and stop correctly", async () => {
      const transport = new MockTransport("peer-1");
      const events: TransportEvents = {
        onMessage: jest.fn(),
      };

      expect(transport.isTransportRunning()).toBe(false);

      await transport.start(events);
      expect(transport.isTransportRunning()).toBe(true);
      expect(getMockNetworkPeers()).toContain("peer-1");

      await transport.stop();
      expect(transport.isTransportRunning()).toBe(false);
      expect(getMockNetworkPeers()).not.toContain("peer-1");
    });

    it("should connect two peers", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      const events1: TransportEvents = {
        onMessage: jest.fn(),
        onPeerConnected: jest.fn(),
      };

      const events2: TransportEvents = {
        onMessage: jest.fn(),
        onPeerConnected: jest.fn(),
      };

      await transport1.start(events1);
      await transport2.start(events2);

      await transport1.connect("peer-2");

      expect(transport1.getConnectedPeers()).toContain("peer-2");
      expect(transport2.getConnectedPeers()).toContain("peer-1");
      expect(events1.onPeerConnected).toHaveBeenCalledWith("peer-2", expect.any(Object));
      expect(events2.onPeerConnected).toHaveBeenCalledWith("peer-1", expect.any(Object));
    });

    it("should send messages between peers", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      const receivedMessages: TransportMessage[] = [];

      const events1: TransportEvents = {
        onMessage: jest.fn(),
      };

      const events2: TransportEvents = {
        onMessage: (msg: TransportMessage) => receivedMessages.push(msg),
      };

      await transport1.start(events1);
      await transport2.start(events2);
      await transport1.connect("peer-2");

      const testPayload = new TextEncoder().encode("Hello, peer-2!");
      await transport1.send("peer-2", testPayload);

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].from).toBe("peer-1");
      expect(new TextDecoder().decode(receivedMessages[0].payload)).toBe("Hello, peer-2!");
    });

    it("should track sent and received messages", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: jest.fn() });
      await transport1.connect("peer-2");

      await transport1.send("peer-2", new Uint8Array([1, 2, 3]));
      await transport1.send("peer-2", new Uint8Array([4, 5, 6]));

      expect(transport1.sentMessages.length).toBe(2);
      expect(transport2.receivedMessages.length).toBe(2);
    });

    it("should broadcast to all connected peers", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");
      const transport3 = new MockTransport("peer-3");

      const received2: TransportMessage[] = [];
      const received3: TransportMessage[] = [];

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: (m: TransportMessage) => received2.push(m) });
      await transport3.start({ onMessage: (m: TransportMessage) => received3.push(m) });

      await transport1.connect("peer-2");
      await transport1.connect("peer-3");

      await transport1.broadcast(new TextEncoder().encode("Broadcast!"));

      expect(received2.length).toBe(1);
      expect(received3.length).toBe(1);
    });

    it("should exclude specified peer from broadcast", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");
      const transport3 = new MockTransport("peer-3");

      const received2: TransportMessage[] = [];
      const received3: TransportMessage[] = [];

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: (m: TransportMessage) => received2.push(m) });
      await transport3.start({ onMessage: (m: TransportMessage) => received3.push(m) });

      await transport1.connect("peer-2");
      await transport1.connect("peer-3");

      await transport1.broadcast(new TextEncoder().encode("Broadcast!"), "peer-2");

      expect(received2.length).toBe(0);
      expect(received3.length).toBe(1);
    });

    it("should disconnect peers correctly", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      const disconnected: TransportPeerId[] = [];

      const events1: TransportEvents = {
        onMessage: jest.fn(),
        onPeerDisconnected: (id: TransportPeerId) => disconnected.push(id),
      };

      await transport1.start(events1);
      await transport2.start({ onMessage: jest.fn() });
      await transport1.connect("peer-2");

      expect(transport1.getConnectedPeers()).toContain("peer-2");

      await transport1.disconnect("peer-2");

      expect(transport1.getConnectedPeers()).not.toContain("peer-2");
      expect(disconnected).toContain("peer-2");
    });

    it("should handle connection failures", async () => {
      const transport = new MockTransport("peer-1", { failConnections: true });
      const errors: Error[] = [];

      await transport.start({
        onMessage: jest.fn(),
        onError: (err: Error) => errors.push(err),
      });

      await expect(transport.connect("peer-2")).rejects.toThrow("Connection to peer-2 failed");
      expect(errors.length).toBe(1);
    });

    it("should handle send failures", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: jest.fn() });
      await transport1.connect("peer-2");

      transport1.updateConfig({ failSends: true });

      const errors: Error[] = [];
      transport1["events"] = {
        onMessage: jest.fn(),
        onError: (err: Error) => errors.push(err),
      };

      await expect(transport1.send("peer-2", new Uint8Array([1]))).rejects.toThrow();
      expect(errors.length).toBe(1);
    });

    it("should simulate latency", async () => {
      const transport1 = new MockTransport("peer-1", { latencyMs: 50 });
      const transport2 = new MockTransport("peer-2");

      let receivedAt = 0;
      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({
        onMessage: () => {
          receivedAt = Date.now();
        },
      });
      await transport1.connect("peer-2");

      const sentAt = Date.now();
      await transport1.send("peer-2", new Uint8Array([1]));

      // Should have some latency
      expect(receivedAt - sentAt).toBeGreaterThanOrEqual(40); // Allow some variance
    });

    it("should simulate packet loss", async () => {
      const transport1 = new MockTransport("peer-1", { packetLossRate: 1 }); // 100% loss
      const transport2 = new MockTransport("peer-2");

      const received: TransportMessage[] = [];

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: (m: TransportMessage) => received.push(m) });
      await transport1.connect("peer-2");

      await transport1.send("peer-2", new Uint8Array([1]));
      await transport1.send("peer-2", new Uint8Array([2]));
      await transport1.send("peer-2", new Uint8Array([3]));

      expect(received.length).toBe(0); // All messages lost
    });

    it("should get peer info correctly", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: jest.fn() });
      await transport1.connect("peer-2");

      const peerInfo = transport1.getPeerInfo("peer-2");
      expect(peerInfo).toBeDefined();
      expect(peerInfo?.peerId).toBe("peer-2");
      expect(peerInfo?.state).toBe("connected");
      expect(peerInfo?.transportType).toBe("mock");
    });

    it("should track connection attempts", async () => {
      const transport = new MockTransport("peer-1");
      await transport.start({ onMessage: jest.fn() });

      await transport.connect("peer-2");
      await transport.connect("peer-3");

      expect(transport.connectionAttempts).toEqual(["peer-2", "peer-3"]);
    });

    it("should reset tracking data", async () => {
      const transport = new MockTransport("peer-1");
      await transport.start({ onMessage: jest.fn() });

      await transport.connect("peer-2");
      transport.sentMessages.push({} as TransportMessage);
      transport.receivedMessages.push({} as TransportMessage);

      transport.resetTracking();

      expect(transport.sentMessages.length).toBe(0);
      expect(transport.receivedMessages.length).toBe(0);
      expect(transport.connectionAttempts.length).toBe(0);
    });
  });

  describe("TransportRegistry", () => {
    it("should register and retrieve transport factories", () => {
      const registry = new DefaultTransportRegistry();
      const factory = jest.fn(() => new MockTransport("test"));

      registry.register("test-transport", factory);

      const retrieved = registry.get("test-transport");
      expect(retrieved).toBe(factory);
    });

    it("should return undefined for unregistered types", () => {
      const registry = new DefaultTransportRegistry();
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should list all registered types", () => {
      const registry = new DefaultTransportRegistry();
      registry.register("type1", jest.fn());
      registry.register("type2", jest.fn());
      registry.register("type3", jest.fn());

      const types = registry.getTypes();
      expect(types).toContain("type1");
      expect(types).toContain("type2");
      expect(types).toContain("type3");
    });
  });

  describe("clearMockNetwork", () => {
    it("should clear all registered mock transports", async () => {
      const transport1 = new MockTransport("peer-1");
      const transport2 = new MockTransport("peer-2");

      await transport1.start({ onMessage: jest.fn() });
      await transport2.start({ onMessage: jest.fn() });

      expect(getMockNetworkPeers().length).toBe(2);

      clearMockNetwork();

      expect(getMockNetworkPeers().length).toBe(0);
    });
  });
});
