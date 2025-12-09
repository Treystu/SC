/**
 * Tests for BLE Transport Implementation
 */

import {
  MockBleTransport,
  BleAdvertisingMode,
  BleScanMode,
  BLE_MESH_SERVICE_UUID,
  DEFAULT_BLE_CONFIG,
  BleTransportEvents,
  BleDeviceInfo,
} from "./BleTransport.js";

describe("BleTransport", () => {
  let transport: MockBleTransport;
  const localPeerId = "test-local-peer";

  beforeEach(() => {
    transport = new MockBleTransport(localPeerId);
  });

  afterEach(async () => {
    await transport.stop();
  });

  describe("Initialization", () => {
    it("should create transport with default config", () => {
      expect(transport.localPeerId).toBe(localPeerId);
    });

    it("should create transport with custom config", () => {
      const customTransport = new MockBleTransport(localPeerId, {
        maxMtu: 256,
        minRssi: -80,
      });
      expect(customTransport.localPeerId).toBe(localPeerId);
    });
  });

  describe("Lifecycle", () => {
    it("should start and stop transport", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      expect(transport.getConnectedPeers()).toHaveLength(0);

      await transport.stop();
    });
  });

  describe("Advertising", () => {
    it("should start and stop advertising", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
        onAdvertisingStateChanged: jest.fn(),
      };

      await transport.start(events);

      expect(transport.isAdvertising()).toBe(false);

      await transport.startAdvertising();
      expect(transport.isAdvertising()).toBe(true);
      expect(events.onAdvertisingStateChanged).toHaveBeenCalledWith(true);

      await transport.stopAdvertising();
      expect(transport.isAdvertising()).toBe(false);
      expect(events.onAdvertisingStateChanged).toHaveBeenCalledWith(false);
    });
  });

  describe("Scanning", () => {
    it("should start and stop scanning", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
        onScanningStateChanged: jest.fn(),
      };

      await transport.start(events);

      expect(transport.isScanning()).toBe(false);

      await transport.startScanning();
      expect(transport.isScanning()).toBe(true);
      expect(events.onScanningStateChanged).toHaveBeenCalledWith(true);

      await transport.stopScanning();
      expect(transport.isScanning()).toBe(false);
      expect(events.onScanningStateChanged).toHaveBeenCalledWith(false);
    });

    it("should return discovered devices", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      
      const devices = transport.getDiscoveredDevices();
      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe("Connection", () => {
    it("should connect to a peer", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
        onPeerConnected: jest.fn(),
        onStateChange: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      expect(events.onStateChange).toHaveBeenCalledWith("remote-peer", "connecting");
      expect(events.onStateChange).toHaveBeenCalledWith("remote-peer", "connected");
      expect(events.onPeerConnected).toHaveBeenCalled();
      expect(transport.getConnectedPeers()).toContain("remote-peer");
    });

    it("should disconnect from a peer", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
        onPeerDisconnected: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");
      await transport.disconnect("remote-peer");

      expect(events.onPeerDisconnected).toHaveBeenCalledWith("remote-peer", "disconnected");
      expect(transport.getConnectedPeers()).not.toContain("remote-peer");
    });
  });

  describe("Messaging", () => {
    it("should send message to connected peer", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(transport.send("remote-peer", payload)).resolves.not.toThrow();

      const peerInfo = transport.getBlePeerInfo("remote-peer");
      expect(peerInfo?.bytesSent).toBe(5);
    });

    it("should fail to send to disconnected peer", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);

      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(transport.send("unknown-peer", payload)).rejects.toThrow();
    });

    it("should broadcast to all connected peers", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("peer1");
      await transport.connect("peer2");

      const payload = new Uint8Array([1, 2, 3]);
      await transport.broadcast(payload);

      const peer1Info = transport.getBlePeerInfo("peer1");
      const peer2Info = transport.getBlePeerInfo("peer2");
      expect(peer1Info?.bytesSent).toBe(3);
      expect(peer2Info?.bytesSent).toBe(3);
    });

    it("should exclude peer from broadcast", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("peer1");
      await transport.connect("peer2");

      const payload = new Uint8Array([1, 2, 3]);
      await transport.broadcast(payload, "peer1");

      const peer1Info = transport.getBlePeerInfo("peer1");
      const peer2Info = transport.getBlePeerInfo("peer2");
      expect(peer1Info?.bytesSent).toBe(0);
      expect(peer2Info?.bytesSent).toBe(3);
    });

    it("should receive simulated messages", async () => {
      const onMessage = jest.fn();
      const events: BleTransportEvents = {
        onMessage,
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const payload = new Uint8Array([10, 20, 30]);
      transport.simulateMessage("remote-peer", payload);

      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "remote-peer",
          payload,
        })
      );
    });
  });

  describe("MTU Negotiation", () => {
    it("should request MTU", async () => {
      const onMtuNegotiated = jest.fn();
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
        onMtuNegotiated,
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const negotiatedMtu = await transport.requestMtu("remote-peer", 256);
      expect(negotiatedMtu).toBeLessThanOrEqual(256);
      expect(onMtuNegotiated).toHaveBeenCalledWith("remote-peer", negotiatedMtu);
    });

    it("should get MTU for connected peer", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const mtu = transport.getMtu("remote-peer");
      expect(mtu).toBeGreaterThan(0);
    });
  });

  describe("RSSI", () => {
    it("should get RSSI for connected peer", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const rssi = await transport.getRssi("remote-peer");
      expect(rssi).toBeDefined();
      expect(rssi).toBeLessThan(0); // RSSI is negative dBm
    });
  });

  describe("Peer Info", () => {
    it("should return BLE-specific peer info", async () => {
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const peerInfo = transport.getBlePeerInfo("remote-peer");
      expect(peerInfo).toBeDefined();
      expect(peerInfo?.transportType).toBe("bluetooth");
      expect(peerInfo?.rssi).toBeDefined();
      expect(peerInfo?.mtu).toBeDefined();
      expect(peerInfo?.discoveredViaScan).toBeDefined();
    });

    it("should return undefined for unknown peer", () => {
      const peerInfo = transport.getBlePeerInfo("unknown-peer");
      expect(peerInfo).toBeUndefined();
    });
  });

  describe("Incoming Connections", () => {
    it("should handle simulated incoming connections", async () => {
      const onPeerConnected = jest.fn();
      const events: BleTransportEvents = {
        onMessage: jest.fn(),
        onPeerConnected,
      };

      await transport.start(events);
      await transport.simulateIncomingConnection("incoming-peer");

      expect(onPeerConnected).toHaveBeenCalledWith(
        "incoming-peer",
        expect.objectContaining({
          peerId: "incoming-peer",
          state: "connected",
          discoveredViaScan: false,
        })
      );
    });
  });
});

describe("BLE Constants", () => {
  it("should have valid service UUID", () => {
    expect(BLE_MESH_SERVICE_UUID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("should have valid default config", () => {
    expect(DEFAULT_BLE_CONFIG.serviceUuid).toBeDefined();
    expect(DEFAULT_BLE_CONFIG.maxMtu).toBeGreaterThan(0);
    expect(DEFAULT_BLE_CONFIG.maxConnections).toBeGreaterThan(0);
  });
});
