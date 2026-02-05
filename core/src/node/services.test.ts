/**
 * Tests for Node Services - Capability-gated service handler
 */

import {
  NodeServices,
  ServiceRequestType,
  type ServiceRequest,
  type ServiceCallbacks,
} from "./services";
import type { NodeCapabilities } from "./capabilities";
import { NATType } from "../nat/NATDetector";

function createMockCapabilities(
  overrides: Partial<NodeCapabilities> = {}
): NodeCapabilities {
  return {
    hasPublicIP: false,
    isAlwaysOn: false,
    bandwidth: "medium",
    storage: 500,
    batteryPowered: false,
    natType: NATType.UNKNOWN,
    canSignal: false,
    canRelay: false,
    canStore: false,
    canDHT: true,
    lastChecked: Date.now(),
    connectionQuality: 70,
    maxConnections: 20,
    ...overrides,
  };
}

function createMockCallbacks(
  overrides: Partial<ServiceCallbacks> = {}
): ServiceCallbacks {
  return {
    sendToPeer: jest.fn().mockResolvedValue(undefined),
    handleDHTQuery: jest.fn().mockResolvedValue({
      requestId: "test",
      success: true,
      timestamp: Date.now(),
    }),
    onMessage: jest.fn(),
    onSignal: jest.fn(),
    ...overrides,
  };
}

describe("NodeServices", () => {
  describe("Ping handling", () => {
    it("should respond to ping requests", async () => {
      const caps = createMockCapabilities();
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const request = NodeServices.createRequest(
        ServiceRequestType.PING,
        "SENDER_PEER_ID_01",
        new Uint8Array(0)
      );

      const response = await services.handleRequest(request);

      expect(response.success).toBe(true);
      expect(response.payload).toBeDefined();

      const payload = JSON.parse(
        new TextDecoder().decode(response.payload!)
      );
      expect(payload).toHaveProperty("uptime");
      expect(payload).toHaveProperty("timestamp");
    });
  });

  describe("Capabilities query", () => {
    it("should return node capabilities", async () => {
      const caps = createMockCapabilities({
        canSignal: true,
        canRelay: true,
        canStore: true,
      });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const request = NodeServices.createRequest(
        ServiceRequestType.CAPABILITIES,
        "SENDER_PEER_ID_01",
        new Uint8Array(0)
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(true);

      const payload = JSON.parse(
        new TextDecoder().decode(response.payload!)
      );
      expect(payload.canSignal).toBe(true);
      expect(payload.canRelay).toBe(true);
      expect(payload.canStore).toBe(true);
      expect(payload.canDHT).toBe(true);
    });
  });

  describe("Signal relay", () => {
    it("should relay signals when canSignal is true", async () => {
      const caps = createMockCapabilities({ canSignal: true });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const signalPayload = JSON.stringify({
        to: "TARGET_PEER_ID_01",
        type: "offer",
        sdp: "test-sdp",
      });

      const request = NodeServices.createRequest(
        ServiceRequestType.SIGNAL,
        "SENDER_PEER_ID_01",
        new TextEncoder().encode(signalPayload)
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(true);
      expect(callbacks.sendToPeer).toHaveBeenCalledWith(
        "TARGET_PEER_ID_01",
        expect.any(Uint8Array)
      );
    });

    it("should reject signal relay when canSignal is false", async () => {
      const caps = createMockCapabilities({ canSignal: false });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const request = NodeServices.createRequest(
        ServiceRequestType.SIGNAL,
        "SENDER_PEER_ID_01",
        new TextEncoder().encode(JSON.stringify({ to: "TARGET" }))
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(false);
      expect(response.error).toContain("does not support signaling");
    });
  });

  describe("Relay service", () => {
    it("should relay data when canRelay is true", async () => {
      const caps = createMockCapabilities({ canRelay: true });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const relayPayload = JSON.stringify({
        destinationId: "DEST_PEER_ID_0001",
        sessionId: "session-123",
        data: "hello relay",
      });

      const request = NodeServices.createRequest(
        ServiceRequestType.RELAY,
        "SENDER_PEER_ID_01",
        new TextEncoder().encode(relayPayload)
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(true);
      expect(callbacks.sendToPeer).toHaveBeenCalled();
    });

    it("should reject relay when canRelay is false", async () => {
      const caps = createMockCapabilities({ canRelay: false });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const request = NodeServices.createRequest(
        ServiceRequestType.RELAY,
        "SENDER_PEER_ID_01",
        new TextEncoder().encode(
          JSON.stringify({ destinationId: "DEST", data: "test" })
        )
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(false);
      expect(response.error).toContain("does not support data relay");
    });
  });

  describe("Message handling", () => {
    it("should handle direct messages for all nodes", async () => {
      const caps = createMockCapabilities();
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const payload = new TextEncoder().encode("Hello direct message");
      const request = NodeServices.createRequest(
        ServiceRequestType.MESSAGE,
        "SENDER_PEER_ID_01",
        payload
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(true);
      expect(callbacks.onMessage).toHaveBeenCalledWith(
        "SENDER_PEER_ID_01",
        payload
      );
    });
  });

  describe("DHT query handling", () => {
    it("should forward DHT queries to handler", async () => {
      const caps = createMockCapabilities();
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      const request = NodeServices.createRequest(
        ServiceRequestType.DHT_QUERY,
        "SENDER_PEER_ID_01",
        new Uint8Array(10)
      );

      const response = await services.handleRequest(request);
      expect(response.success).toBe(true);
      expect(callbacks.handleDHTQuery).toHaveBeenCalled();
    });
  });

  describe("Service availability", () => {
    it("should report correct service availability", () => {
      const caps = createMockCapabilities({
        canSignal: true,
        canRelay: false,
        canStore: true,
      });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      expect(
        services.isServiceAvailable(ServiceRequestType.SIGNAL)
      ).toBe(true);
      expect(
        services.isServiceAvailable(ServiceRequestType.RELAY)
      ).toBe(false);
      // canStore requires messageStore too
      expect(
        services.isServiceAvailable(ServiceRequestType.STORE)
      ).toBe(false);
      expect(
        services.isServiceAvailable(ServiceRequestType.DHT_QUERY)
      ).toBe(true);
      expect(
        services.isServiceAvailable(ServiceRequestType.MESSAGE)
      ).toBe(true);
      expect(
        services.isServiceAvailable(ServiceRequestType.PING)
      ).toBe(true);
    });
  });

  describe("Statistics", () => {
    it("should track request statistics", async () => {
      const caps = createMockCapabilities();
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      // Make some requests
      for (let i = 0; i < 5; i++) {
        await services.handleRequest(
          NodeServices.createRequest(
            ServiceRequestType.PING,
            "SENDER_PEER_ID_01",
            new Uint8Array(0)
          )
        );
      }

      const stats = services.getStats();
      expect(stats.totalRequests).toBe(5);
      expect(stats.requestsByType[ServiceRequestType.PING]).toBe(5);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Serialization", () => {
    it("should serialize and deserialize requests", () => {
      const request = NodeServices.createRequest(
        ServiceRequestType.PING,
        "SENDER_PEER_ID_01",
        new TextEncoder().encode("test payload")
      );

      const serialized = NodeServices.serializeRequest(request);
      const deserialized = NodeServices.deserializeRequest(serialized);

      expect(deserialized.type).toBe(request.type);
      expect(deserialized.from).toBe(request.from);
      expect(deserialized.requestId).toBe(request.requestId);
      expect(deserialized.timestamp).toBe(request.timestamp);
      expect(new TextDecoder().decode(deserialized.payload)).toBe(
        "test payload"
      );
    });

    it("should serialize and deserialize responses", () => {
      const response = {
        requestId: "req-123",
        success: true,
        payload: new TextEncoder().encode("response data"),
        timestamp: Date.now(),
      };

      const serialized = NodeServices.serializeResponse(response);
      const deserialized = NodeServices.deserializeResponse(serialized);

      expect(deserialized.requestId).toBe(response.requestId);
      expect(deserialized.success).toBe(true);
      expect(new TextDecoder().decode(deserialized.payload!)).toBe(
        "response data"
      );
    });
  });

  describe("Capability updates", () => {
    it("should update capabilities dynamically", () => {
      const caps = createMockCapabilities({ canSignal: false });
      const callbacks = createMockCallbacks();
      const services = new NodeServices(caps, callbacks);

      expect(
        services.isServiceAvailable(ServiceRequestType.SIGNAL)
      ).toBe(false);

      services.updateCapabilities(
        createMockCapabilities({ canSignal: true })
      );

      expect(
        services.isServiceAvailable(ServiceRequestType.SIGNAL)
      ).toBe(true);
    });
  });
});
