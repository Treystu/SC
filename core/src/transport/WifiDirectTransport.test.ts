/**
 * Tests for Wi-Fi Direct Transport Implementation
 */

import {
  MockWifiDirectTransport,
  WifiDirectRole,
  WifiDirectDeviceStatus,
  DEFAULT_WIFI_DIRECT_CONFIG,
  WifiDirectTransportEvents,
  WifiDirectDeviceInfo,
  WifiDirectServiceRecord,
} from "./WifiDirectTransport.js";

describe("WifiDirectTransport", () => {
  let transport: MockWifiDirectTransport;
  const localPeerId = "test-local-peer";

  beforeEach(() => {
    transport = new MockWifiDirectTransport(localPeerId);
  });

  afterEach(async () => {
    await transport.stop();
  });

  describe("Initialization", () => {
    it("should create transport with default config", () => {
      expect(transport.localPeerId).toBe(localPeerId);
    });

    it("should create transport with custom config", () => {
      const customTransport = new MockWifiDirectTransport(localPeerId, {
        port: 9000,
        preferGroupOwner: true,
      });
      expect(customTransport.localPeerId).toBe(localPeerId);
    });
  });

  describe("Lifecycle", () => {
    it("should start and stop transport", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      expect(transport.getConnectedPeers()).toHaveLength(0);

      await transport.stop();
    });
  });

  describe("Discovery", () => {
    it("should start and stop discovery", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
        onDiscoveryStateChanged: jest.fn(),
      };

      await transport.start(events);

      expect(transport.isDiscovering()).toBe(false);

      await transport.startDiscovery();
      expect(transport.isDiscovering()).toBe(true);
      expect(events.onDiscoveryStateChanged).toHaveBeenCalledWith(true);

      await transport.stopDiscovery();
      expect(transport.isDiscovering()).toBe(false);
      expect(events.onDiscoveryStateChanged).toHaveBeenCalledWith(false);
    });

    it("should return discovered devices", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      
      const devices = transport.getDiscoveredDevices();
      expect(Array.isArray(devices)).toBe(true);
    });
  });

  describe("Group Management", () => {
    it("should create a group as group owner", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
        onGroupFormed: jest.fn(),
        onRoleChanged: jest.fn(),
      };

      await transport.start(events);
      const groupInfo = await transport.createGroup();

      expect(groupInfo).toBeDefined();
      expect(groupInfo.isOwner).toBe(true);
      expect(groupInfo.networkName).toMatch(/^DIRECT-SC-/);
      expect(events.onGroupFormed).toHaveBeenCalledWith(groupInfo);
      expect(events.onRoleChanged).toHaveBeenCalledWith(WifiDirectRole.GROUP_OWNER);
      expect(transport.getRole()).toBe(WifiDirectRole.GROUP_OWNER);
    });

    it("should remove a group", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
        onGroupRemoved: jest.fn(),
        onRoleChanged: jest.fn(),
      };

      await transport.start(events);
      await transport.createGroup();
      await transport.removeGroup();

      expect(transport.getGroupInfo()).toBeUndefined();
      expect(transport.getRole()).toBe(WifiDirectRole.UNDETERMINED);
      expect(events.onGroupRemoved).toHaveBeenCalled();
    });

    it("should get group info when in a group", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.createGroup();

      const groupInfo = transport.getGroupInfo();
      expect(groupInfo).toBeDefined();
      expect(groupInfo?.owner).toBeDefined();
    });

    it("should return undefined when not in a group", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);

      const groupInfo = transport.getGroupInfo();
      expect(groupInfo).toBeUndefined();
    });
  });

  describe("Connection", () => {
    it("should connect to a peer", async () => {
      const events: WifiDirectTransportEvents = {
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
      const events: WifiDirectTransportEvents = {
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
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(transport.send("remote-peer", payload)).resolves.not.toThrow();

      const peerInfo = transport.getWifiDirectPeerInfo("remote-peer");
      expect(peerInfo?.bytesSent).toBe(5);
    });

    it("should fail to send to disconnected peer", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);

      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(transport.send("unknown-peer", payload)).rejects.toThrow();
    });

    it("should broadcast to all connected peers", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("peer1");
      await transport.connect("peer2");

      const payload = new Uint8Array([1, 2, 3]);
      await transport.broadcast(payload);

      const peer1Info = transport.getWifiDirectPeerInfo("peer1");
      const peer2Info = transport.getWifiDirectPeerInfo("peer2");
      expect(peer1Info?.bytesSent).toBe(3);
      expect(peer2Info?.bytesSent).toBe(3);
    });

    it("should receive simulated messages", async () => {
      const onMessage = jest.fn();
      const events: WifiDirectTransportEvents = {
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

  describe("Wi-Fi Direct Availability", () => {
    it("should check if Wi-Fi Direct is available", async () => {
      const isAvailable = await transport.isWifiDirectAvailable();
      expect(typeof isAvailable).toBe("boolean");
    });
  });

  describe("Connection Info", () => {
    it("should request connection info when in a group", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.createGroup();

      const connInfo = await transport.requestConnectionInfo();
      expect(connInfo).toBeDefined();
      expect(connInfo?.groupOwnerAddress).toBeDefined();
      expect(connInfo?.isGroupOwner).toBe(true);
    });

    it("should return undefined when not in a group", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);

      const connInfo = await transport.requestConnectionInfo();
      expect(connInfo).toBeUndefined();
    });
  });

  describe("Service Discovery", () => {
    it("should register and unregister service", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);

      const serviceRecord: WifiDirectServiceRecord = {
        serviceType: "_sc._tcp",
        instanceName: "TestService",
        txtRecord: new Map([["version", "1.0"]]),
      };

      await expect(transport.registerService(serviceRecord)).resolves.not.toThrow();
      await expect(transport.unregisterService()).resolves.not.toThrow();
    });

    it("should discover services", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);

      await expect(transport.discoverServices("_sc._tcp")).resolves.not.toThrow();
    });
  });

  describe("Peer Info", () => {
    it("should return Wi-Fi Direct-specific peer info", async () => {
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
      };

      await transport.start(events);
      await transport.connect("remote-peer");

      const peerInfo = transport.getWifiDirectPeerInfo("remote-peer");
      expect(peerInfo).toBeDefined();
      expect(peerInfo?.transportType).toBe("wifi-direct");
      expect(peerInfo?.role).toBeDefined();
      expect(peerInfo?.isGroupOwner).toBeDefined();
      expect(peerInfo?.bandwidthMbps).toBeDefined();
    });

    it("should return undefined for unknown peer", () => {
      const peerInfo = transport.getWifiDirectPeerInfo("unknown-peer");
      expect(peerInfo).toBeUndefined();
    });
  });

  describe("Connection Requests", () => {
    it("should handle simulated connection requests", async () => {
      const onConnectionRequest = jest.fn();
      const events: WifiDirectTransportEvents = {
        onMessage: jest.fn(),
        onConnectionRequest,
      };

      await transport.start(events);

      const device: WifiDirectDeviceInfo = {
        deviceId: "incoming-device",
        name: "Test Device",
        status: WifiDirectDeviceStatus.AVAILABLE,
        isGroupOwner: false,
        lastSeen: Date.now(),
      };

      transport.simulateConnectionRequest(device);

      expect(onConnectionRequest).toHaveBeenCalledWith(device);
    });
  });
});

describe("Wi-Fi Direct Constants", () => {
  it("should have valid default config", () => {
    expect(DEFAULT_WIFI_DIRECT_CONFIG.serviceType).toBeDefined();
    expect(DEFAULT_WIFI_DIRECT_CONFIG.port).toBeGreaterThan(0);
    expect(DEFAULT_WIFI_DIRECT_CONFIG.maxPeers).toBeGreaterThan(0);
  });

  it("should have valid role enum", () => {
    expect(WifiDirectRole.GROUP_OWNER).toBe("group_owner");
    expect(WifiDirectRole.CLIENT).toBe("client");
    expect(WifiDirectRole.UNDETERMINED).toBe("undetermined");
  });

  it("should have valid device status enum", () => {
    expect(WifiDirectDeviceStatus.CONNECTED).toBe("connected");
    expect(WifiDirectDeviceStatus.AVAILABLE).toBe("available");
    expect(WifiDirectDeviceStatus.UNAVAILABLE).toBe("unavailable");
  });
});
