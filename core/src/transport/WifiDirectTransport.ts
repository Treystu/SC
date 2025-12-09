/**
 * Wi-Fi Direct Transport Implementation
 * 
 * A Transport abstraction for Wi-Fi Direct (Wi-Fi P2P) communication.
 * This provides a platform-agnostic interface that can be implemented
 * by platform-specific Wi-Fi Direct code (Android, iOS).
 * 
 * Wi-Fi Direct enables high-bandwidth, low-latency peer-to-peer connections
 * without requiring a traditional Wi-Fi network infrastructure.
 */

import {
  Transport,
  TransportPeerId,
  TransportMessage,
  TransportEvents,
  TransportConfig,
  TransportPeerInfo,
  TransportConnectionState,
  SignalingData,
  transportRegistry,
} from "./Transport.js";

/**
 * Wi-Fi Direct group role
 */
export enum WifiDirectRole {
  /** Device that owns the group and acts as an access point */
  GROUP_OWNER = "group_owner",
  /** Device that connects to a group owner */
  CLIENT = "client",
  /** Role not yet determined */
  UNDETERMINED = "undetermined",
}

/**
 * Wi-Fi Direct device status
 */
export enum WifiDirectDeviceStatus {
  CONNECTED = "connected",
  INVITED = "invited",
  FAILED = "failed",
  AVAILABLE = "available",
  UNAVAILABLE = "unavailable",
}

/**
 * Wi-Fi Direct device info from discovery
 */
export interface WifiDirectDeviceInfo {
  /** Device identifier (MAC address) */
  deviceId: string;
  /** Device name */
  name: string;
  /** Device status */
  status: WifiDirectDeviceStatus;
  /** Whether the device is a group owner */
  isGroupOwner: boolean;
  /** Primary device type (e.g., "smartphone") */
  primaryDeviceType?: string;
  /** Secondary device type */
  secondaryDeviceType?: string;
  /** Wi-Fi Protected Setup (WPS) configuration methods */
  wpsConfigMethods?: number;
  /** Service discovery records */
  serviceRecords?: WifiDirectServiceRecord[];
  /** Last seen timestamp */
  lastSeen: number;
}

/**
 * Wi-Fi Direct service record for service discovery
 */
export interface WifiDirectServiceRecord {
  /** Service type (e.g., "_sc._tcp") */
  serviceType: string;
  /** Instance name */
  instanceName: string;
  /** TXT record data */
  txtRecord?: Map<string, string>;
}

/**
 * Wi-Fi Direct group info
 */
export interface WifiDirectGroupInfo {
  /** Network name (SSID) */
  networkName: string;
  /** Passphrase for the group */
  passphrase?: string;
  /** Group owner's device info */
  owner: WifiDirectDeviceInfo;
  /** List of client devices in the group */
  clients: WifiDirectDeviceInfo[];
  /** Whether this device is the group owner */
  isOwner: boolean;
  /** Interface name for the group */
  interfaceName?: string;
  /** Group formation timestamp */
  createdAt: number;
}

/**
 * Wi-Fi Direct-specific transport configuration
 */
export interface WifiDirectTransportConfig extends TransportConfig {
  /** Service type for mDNS discovery */
  serviceType?: string;
  /** Service instance name */
  serviceName?: string;
  /** Port for TCP/UDP communication */
  port?: number;
  /** Whether to prefer being group owner */
  preferGroupOwner?: boolean;
  /** Group owner intent (0-15, higher = more likely to be GO) */
  groupOwnerIntent?: number;
  /** Whether to use persistent groups */
  persistentGroup?: boolean;
  /** Discovery timeout in milliseconds */
  discoveryTimeout?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Enable service discovery (Bonjour/mDNS) */
  enableServiceDiscovery?: boolean;
}

/**
 * Wi-Fi Direct-specific transport events
 */
export interface WifiDirectTransportEvents extends TransportEvents {
  /**
   * Called when a Wi-Fi Direct device is discovered.
   * @param device The discovered device info
   */
  onDeviceDiscovered?(device: WifiDirectDeviceInfo): void;

  /**
   * Called when a Wi-Fi Direct group is formed.
   * @param group The group info
   */
  onGroupFormed?(group: WifiDirectGroupInfo): void;

  /**
   * Called when the Wi-Fi Direct group is removed/disbanded.
   */
  onGroupRemoved?(): void;

  /**
   * Called when this device's role in the group changes.
   * @param role The new role
   */
  onRoleChanged?(role: WifiDirectRole): void;

  /**
   * Called when a connection request is received.
   * @param device The device requesting connection
   */
  onConnectionRequest?(device: WifiDirectDeviceInfo): void;

  /**
   * Called when discovery state changes.
   * @param isDiscovering Whether discovery is active
   */
  onDiscoveryStateChanged?(isDiscovering: boolean): void;

  /**
   * Called when Wi-Fi Direct state changes (enabled/disabled).
   * @param isEnabled Whether Wi-Fi Direct is enabled
   */
  onWifiDirectStateChanged?(isEnabled: boolean): void;
}

/**
 * Extended peer info for Wi-Fi Direct connections
 */
export interface WifiDirectPeerInfo extends TransportPeerInfo {
  /** Device MAC address */
  macAddress?: string;
  /** Device name */
  deviceName?: string;
  /** IP address (available after connection) */
  ipAddress?: string;
  /** Role in the group */
  role: WifiDirectRole;
  /** Whether this peer is the group owner */
  isGroupOwner: boolean;
  /** Bandwidth estimate in Mbps */
  bandwidthMbps?: number;
}

/**
 * Wi-Fi Direct Transport interface extending the base Transport interface.
 */
export interface WifiDirectTransport extends Transport {
  /**
   * Start device discovery to find nearby Wi-Fi Direct devices.
   */
  startDiscovery(): Promise<void>;

  /**
   * Stop device discovery.
   */
  stopDiscovery(): Promise<void>;

  /**
   * Check if discovery is currently active.
   */
  isDiscovering(): boolean;

  /**
   * Get list of discovered devices.
   */
  getDiscoveredDevices(): WifiDirectDeviceInfo[];

  /**
   * Create a Wi-Fi Direct group (become group owner).
   */
  createGroup(): Promise<WifiDirectGroupInfo>;

  /**
   * Remove/disband the current group.
   */
  removeGroup(): Promise<void>;

  /**
   * Get current group info if in a group.
   */
  getGroupInfo(): WifiDirectGroupInfo | undefined;

  /**
   * Get this device's role in the current group.
   */
  getRole(): WifiDirectRole;

  /**
   * Check if Wi-Fi Direct is available on this device.
   */
  isWifiDirectAvailable(): Promise<boolean>;

  /**
   * Request Wi-Fi Direct connection info (IP addresses, etc.).
   */
  requestConnectionInfo(): Promise<{ groupOwnerAddress: string; isGroupOwner: boolean } | undefined>;

  /**
   * Register a local service for service discovery.
   * @param serviceRecord The service record to register
   */
  registerService(serviceRecord: WifiDirectServiceRecord): Promise<void>;

  /**
   * Unregister a previously registered service.
   */
  unregisterService(): Promise<void>;

  /**
   * Start service discovery to find specific services.
   * @param serviceType The service type to discover (e.g., "_sc._tcp")
   */
  discoverServices(serviceType?: string): Promise<void>;

  /**
   * Get Wi-Fi Direct-specific peer info.
   * @param peerId The peer ID to query
   */
  getWifiDirectPeerInfo(peerId: TransportPeerId): WifiDirectPeerInfo | undefined;
}

/**
 * Default Wi-Fi Direct transport configuration.
 */
export const DEFAULT_WIFI_DIRECT_CONFIG: Required<WifiDirectTransportConfig> = {
  serviceType: "_sc._tcp",
  serviceName: "SC Mesh Node",
  port: 8988,
  preferGroupOwner: false,
  groupOwnerIntent: 7,
  persistentGroup: true,
  discoveryTimeout: 30000,
  connectionTimeout: 30000,
  enableServiceDiscovery: true,
  maxPeers: 10,
  heartbeatInterval: 30000,
  options: {},
};

/**
 * Mock Wi-Fi Direct Transport for testing and web environments.
 */
export class MockWifiDirectTransport implements WifiDirectTransport {
  readonly localPeerId: TransportPeerId;

  private config: Required<WifiDirectTransportConfig>;
  private events: WifiDirectTransportEvents | null = null;
  private peers: Map<TransportPeerId, WifiDirectPeerInfo> = new Map();
  private discoveredDevices: Map<string, WifiDirectDeviceInfo> = new Map();
  private isRunning = false;
  private _isDiscovering = false;
  private _role: WifiDirectRole = WifiDirectRole.UNDETERMINED;
  private _groupInfo: WifiDirectGroupInfo | undefined;
  private discoveryInterval: NodeJS.Timeout | null = null;

  constructor(localPeerId: TransportPeerId, config: WifiDirectTransportConfig = {}) {
    this.localPeerId = localPeerId;
    this.config = { ...DEFAULT_WIFI_DIRECT_CONFIG, ...config };
  }

  async start(events: WifiDirectTransportEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    await this.stopDiscovery();
    await this.removeGroup();
    this.peers.clear();
    this.discoveredDevices.clear();
    this.events = null;
    this.isRunning = false;
  }

  async connect(peerId: TransportPeerId): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Transport not started");
    }

    const peerInfo: WifiDirectPeerInfo = {
      peerId,
      state: "connecting",
      transportType: "wifi-direct",
      connectionQuality: 95,
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
      role: WifiDirectRole.CLIENT,
      isGroupOwner: false,
      bandwidthMbps: 250,
    };

    this.peers.set(peerId, peerInfo);
    this.events?.onStateChange?.(peerId, "connecting");

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    peerInfo.state = "connected";
    peerInfo.ipAddress = `192.168.49.${Math.floor(Math.random() * 254) + 1}`;
    this.events?.onStateChange?.(peerId, "connected");
    this.events?.onPeerConnected?.(peerId, peerInfo);
  }

  async disconnect(peerId: TransportPeerId): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.state = "disconnected";
      this.events?.onStateChange?.(peerId, "disconnected");
      this.events?.onPeerDisconnected?.(peerId, "disconnected");
      this.peers.delete(peerId);
    }
  }

  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer || peer.state !== "connected") {
      throw new Error(`Peer ${peerId} not connected`);
    }

    peer.bytesSent = (peer.bytesSent || 0) + payload.length;
    peer.lastSeen = Date.now();
  }

  async broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void> {
    const sendPromises: Promise<void>[] = [];
    for (const [peerId, peer] of this.peers) {
      if (peerId !== excludePeerId && peer.state === "connected") {
        sendPromises.push(this.send(peerId, payload));
      }
    }
    await Promise.all(sendPromises);
  }

  getConnectedPeers(): TransportPeerId[] {
    return Array.from(this.peers.entries())
      .filter(([, peer]) => peer.state === "connected")
      .map(([id]) => id);
  }

  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getConnectionState(peerId: TransportPeerId): TransportConnectionState | undefined {
    return this.peers.get(peerId)?.state;
  }

  // Wi-Fi Direct-specific methods

  async startDiscovery(): Promise<void> {
    this._isDiscovering = true;
    this.events?.onDiscoveryStateChanged?.(true);

    // Simulate periodic device discovery
    this.discoveryInterval = setInterval(() => {
      const mockDevice: WifiDirectDeviceInfo = {
        deviceId: `mock-wfd-${Date.now()}`,
        name: `SC Peer ${Math.floor(Math.random() * 100)}`,
        status: WifiDirectDeviceStatus.AVAILABLE,
        isGroupOwner: Math.random() > 0.7,
        primaryDeviceType: "smartphone",
        lastSeen: Date.now(),
      };
      this.discoveredDevices.set(mockDevice.deviceId, mockDevice);
      this.events?.onDeviceDiscovered?.(mockDevice);
    }, 3000);
  }

  async stopDiscovery(): Promise<void> {
    this._isDiscovering = false;
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.events?.onDiscoveryStateChanged?.(false);
  }

  isDiscovering(): boolean {
    return this._isDiscovering;
  }

  getDiscoveredDevices(): WifiDirectDeviceInfo[] {
    return Array.from(this.discoveredDevices.values());
  }

  async createGroup(): Promise<WifiDirectGroupInfo> {
    this._role = WifiDirectRole.GROUP_OWNER;
    
    const ownerDevice: WifiDirectDeviceInfo = {
      deviceId: this.localPeerId,
      name: "This Device",
      status: WifiDirectDeviceStatus.CONNECTED,
      isGroupOwner: true,
      lastSeen: Date.now(),
    };

    this._groupInfo = {
      networkName: `DIRECT-SC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      passphrase: Math.random().toString(36).slice(2, 10),
      owner: ownerDevice,
      clients: [],
      isOwner: true,
      interfaceName: "p2p-wlan0-0",
      createdAt: Date.now(),
    };

    this.events?.onGroupFormed?.(this._groupInfo);
    this.events?.onRoleChanged?.(WifiDirectRole.GROUP_OWNER);

    return this._groupInfo;
  }

  async removeGroup(): Promise<void> {
    if (this._groupInfo) {
      this._groupInfo = undefined;
      this._role = WifiDirectRole.UNDETERMINED;
      this.events?.onGroupRemoved?.();
      this.events?.onRoleChanged?.(WifiDirectRole.UNDETERMINED);
    }
  }

  getGroupInfo(): WifiDirectGroupInfo | undefined {
    return this._groupInfo;
  }

  getRole(): WifiDirectRole {
    return this._role;
  }

  async isWifiDirectAvailable(): Promise<boolean> {
    // Mock always returns true
    return true;
  }

  async requestConnectionInfo(): Promise<{ groupOwnerAddress: string; isGroupOwner: boolean } | undefined> {
    if (!this._groupInfo) {
      return undefined;
    }

    return {
      groupOwnerAddress: this._groupInfo.isOwner ? "192.168.49.1" : "192.168.49.1",
      isGroupOwner: this._groupInfo.isOwner,
    };
  }

  async registerService(serviceRecord: WifiDirectServiceRecord): Promise<void> {
    // Mock: just log the service registration
    console.log("Registered Wi-Fi Direct service:", serviceRecord);
  }

  async unregisterService(): Promise<void> {
    // Mock: nothing to do
  }

  async discoverServices(serviceType?: string): Promise<void> {
    // Mock: simulate service discovery
    console.log("Discovering Wi-Fi Direct services:", serviceType || this.config.serviceType);
  }

  getWifiDirectPeerInfo(peerId: TransportPeerId): WifiDirectPeerInfo | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Simulate receiving a message from a peer.
   * Used for testing purposes.
   */
  simulateMessage(from: TransportPeerId, payload: Uint8Array): void {
    const peer = this.peers.get(from);
    if (peer) {
      peer.bytesReceived = (peer.bytesReceived || 0) + payload.length;
      peer.lastSeen = Date.now();
    }

    this.events?.onMessage({
      from,
      payload,
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate an incoming connection request.
   * Used for testing purposes.
   */
  simulateConnectionRequest(device: WifiDirectDeviceInfo): void {
    this.events?.onConnectionRequest?.(device);
  }
}

// Register the mock Wi-Fi Direct transport factory
transportRegistry.register("wifi-direct", (config?: TransportConfig) => {
  const peerId = `wfd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new MockWifiDirectTransport(peerId, config as WifiDirectTransportConfig);
});

/**
 * Wi-Fi Direct transport factory type
 */
export type WifiDirectTransportFactory = (
  localPeerId: TransportPeerId,
  config?: WifiDirectTransportConfig
) => WifiDirectTransport;
