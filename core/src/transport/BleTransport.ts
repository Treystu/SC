/**
 * BLE Transport Implementation
 * 
 * A Transport abstraction for Bluetooth Low Energy communication.
 * This provides a platform-agnostic interface that can be implemented
 * by platform-specific BLE code (Android, iOS).
 * 
 * This module defines:
 * 1. BleTransport interface extending Transport
 * 2. BleTransportConfig for BLE-specific settings
 * 3. BleTransportEvents for BLE-specific events
 * 4. Mock implementation for testing/web simulation
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
 * BLE-specific advertising mode
 */
export enum BleAdvertisingMode {
  LOW_POWER = "low_power",
  BALANCED = "balanced",
  LOW_LATENCY = "low_latency",
}

/**
 * BLE-specific scan mode
 */
export enum BleScanMode {
  LOW_POWER = "low_power",
  BALANCED = "balanced",
  LOW_LATENCY = "low_latency",
  OPPORTUNISTIC = "opportunistic",
}

/**
 * BLE device discovery result
 */
export interface BleDeviceInfo {
  /** Device identifier (MAC address or UUID) */
  deviceId: string;
  /** Device name if available */
  name?: string;
  /** Signal strength in dBm */
  rssi: number;
  /** Whether the device is connectable */
  connectable: boolean;
  /** Service UUIDs advertised by the device */
  serviceUuids: string[];
  /** Manufacturer data if available */
  manufacturerData?: Uint8Array;
  /** Last seen timestamp */
  lastSeen: number;
}

/**
 * BLE-specific transport configuration
 */
export interface BleTransportConfig extends TransportConfig {
  /** Service UUID for mesh networking */
  serviceUuid?: string;
  /** TX characteristic UUID */
  txCharacteristicUuid?: string;
  /** RX characteristic UUID */
  rxCharacteristicUuid?: string;
  /** Advertising mode */
  advertisingMode?: BleAdvertisingMode;
  /** Scan mode */
  scanMode?: BleScanMode;
  /** Maximum MTU size to negotiate */
  maxMtu?: number;
  /** Scan duration in milliseconds (0 = continuous) */
  scanDuration?: number;
  /** Advertising interval in milliseconds */
  advertisingInterval?: number;
  /** Enable adaptive scanning based on battery */
  adaptiveScanning?: boolean;
  /** Minimum RSSI for connection (filter weak signals) */
  minRssi?: number;
  /** Maximum number of BLE connections */
  maxConnections?: number;
}

/**
 * BLE-specific transport events
 */
export interface BleTransportEvents extends TransportEvents {
  /**
   * Called when a BLE device is discovered during scanning.
   * @param device The discovered device info
   */
  onDeviceDiscovered?(device: BleDeviceInfo): void;

  /**
   * Called when RSSI (signal strength) changes for a connected peer.
   * @param peerId The peer's ID
   * @param rssi The new RSSI value in dBm
   */
  onRssiChanged?(peerId: TransportPeerId, rssi: number): void;

  /**
   * Called when MTU negotiation completes.
   * @param peerId The peer's ID
   * @param mtu The negotiated MTU size
   */
  onMtuNegotiated?(peerId: TransportPeerId, mtu: number): void;

  /**
   * Called when advertising state changes.
   * @param isAdvertising Whether advertising is currently active
   */
  onAdvertisingStateChanged?(isAdvertising: boolean): void;

  /**
   * Called when scanning state changes.
   * @param isScanning Whether scanning is currently active
   */
  onScanningStateChanged?(isScanning: boolean): void;
}

/**
 * Extended peer info for BLE connections
 */
export interface BlePeerInfo extends TransportPeerInfo {
  /** Signal strength in dBm */
  rssi?: number;
  /** Negotiated MTU size */
  mtu?: number;
  /** Whether this peer was discovered via scan or incoming connection */
  discoveredViaScan: boolean;
}

/**
 * BLE Transport interface extending the base Transport interface.
 * Platform-specific implementations (Android, iOS) should implement this interface.
 */
export interface BleTransport extends Transport {
  /**
   * Start BLE advertising to make this device discoverable.
   * @param advertisingData Optional data to include in advertisements
   */
  startAdvertising(advertisingData?: Uint8Array): Promise<void>;

  /**
   * Stop BLE advertising.
   */
  stopAdvertising(): Promise<void>;

  /**
   * Check if advertising is currently active.
   */
  isAdvertising(): boolean;

  /**
   * Start scanning for BLE devices.
   * @param filterUuids Optional service UUIDs to filter by
   */
  startScanning(filterUuids?: string[]): Promise<void>;

  /**
   * Stop scanning for BLE devices.
   */
  stopScanning(): Promise<void>;

  /**
   * Check if scanning is currently active.
   */
  isScanning(): boolean;

  /**
   * Get list of discovered devices.
   */
  getDiscoveredDevices(): BleDeviceInfo[];

  /**
   * Get the current RSSI for a connected peer.
   * @param peerId The peer ID to query
   */
  getRssi(peerId: TransportPeerId): Promise<number | undefined>;

  /**
   * Get the negotiated MTU for a peer.
   * @param peerId The peer ID to query
   */
  getMtu(peerId: TransportPeerId): number | undefined;

  /**
   * Request MTU negotiation with a peer.
   * @param peerId The peer ID
   * @param requestedMtu The MTU size to request
   */
  requestMtu(peerId: TransportPeerId, requestedMtu: number): Promise<number>;

  /**
   * Get BLE-specific peer info.
   * @param peerId The peer ID to query
   */
  getBlePeerInfo(peerId: TransportPeerId): BlePeerInfo | undefined;
}

/**
 * Default BLE service and characteristic UUIDs for SC mesh protocol.
 * These follow the Bluetooth SIG base UUID format.
 */
export const BLE_MESH_SERVICE_UUID = "5c000001-0000-1000-8000-00805f9b34fb";
export const BLE_TX_CHARACTERISTIC_UUID = "5c000002-0000-1000-8000-00805f9b34fb";
export const BLE_RX_CHARACTERISTIC_UUID = "5c000003-0000-1000-8000-00805f9b34fb";
export const BLE_VERSION_CHARACTERISTIC_UUID = "5c000004-0000-1000-8000-00805f9b34fb";
export const BLE_METADATA_CHARACTERISTIC_UUID = "5c000005-0000-1000-8000-00805f9b34fb";

/**
 * Default BLE transport configuration.
 */
export const DEFAULT_BLE_CONFIG: Required<BleTransportConfig> = {
  serviceUuid: BLE_MESH_SERVICE_UUID,
  txCharacteristicUuid: BLE_TX_CHARACTERISTIC_UUID,
  rxCharacteristicUuid: BLE_RX_CHARACTERISTIC_UUID,
  advertisingMode: BleAdvertisingMode.BALANCED,
  scanMode: BleScanMode.BALANCED,
  maxMtu: 517,
  scanDuration: 0, // Continuous
  advertisingInterval: 250,
  adaptiveScanning: true,
  minRssi: -90,
  maxConnections: 7,
  maxPeers: 7,
  connectionTimeout: 30000,
  heartbeatInterval: 30000,
  options: {},
};

/**
 * Mock BLE Transport for testing and web environments.
 * This implementation simulates BLE behavior for testing purposes.
 */
export class MockBleTransport implements BleTransport {
  readonly localPeerId: TransportPeerId;

  private config: Required<BleTransportConfig>;
  private events: BleTransportEvents | null = null;
  private peers: Map<TransportPeerId, BlePeerInfo> = new Map();
  private discoveredDevices: Map<string, BleDeviceInfo> = new Map();
  private isRunning = false;
  private _isAdvertising = false;
  private _isScanning = false;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor(localPeerId: TransportPeerId, config: BleTransportConfig = {}) {
    this.localPeerId = localPeerId;
    this.config = { ...DEFAULT_BLE_CONFIG, ...config };
  }

  async start(events: BleTransportEvents): Promise<void> {
    this.events = events;
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    await this.stopAdvertising();
    await this.stopScanning();
    this.peers.clear();
    this.discoveredDevices.clear();
    this.events = null;
    this.isRunning = false;
  }

  async connect(peerId: TransportPeerId): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Transport not started");
    }

    const peerInfo: BlePeerInfo = {
      peerId,
      state: "connecting",
      transportType: "bluetooth",
      connectionQuality: 80,
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
      rssi: -60,
      mtu: 185,
      discoveredViaScan: true,
    };

    this.peers.set(peerId, peerInfo);
    this.events?.onStateChange?.(peerId, "connecting");

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    peerInfo.state = "connected";
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

  // BLE-specific methods

  async startAdvertising(advertisingData?: Uint8Array): Promise<void> {
    this._isAdvertising = true;
    this.events?.onAdvertisingStateChanged?.(true);
  }

  async stopAdvertising(): Promise<void> {
    this._isAdvertising = false;
    this.events?.onAdvertisingStateChanged?.(false);
  }

  isAdvertising(): boolean {
    return this._isAdvertising;
  }

  async startScanning(filterUuids?: string[]): Promise<void> {
    this._isScanning = true;
    this.events?.onScanningStateChanged?.(true);

    // Simulate periodic device discovery
    this.scanInterval = setInterval(() => {
      // Mock discovered device
      const mockDevice: BleDeviceInfo = {
        deviceId: `mock-device-${Date.now()}`,
        name: "SC Peer",
        rssi: -70 + Math.floor(Math.random() * 30),
        connectable: true,
        serviceUuids: [this.config.serviceUuid],
        lastSeen: Date.now(),
      };
      this.discoveredDevices.set(mockDevice.deviceId, mockDevice);
      this.events?.onDeviceDiscovered?.(mockDevice);
    }, 5000);
  }

  async stopScanning(): Promise<void> {
    this._isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.events?.onScanningStateChanged?.(false);
  }

  isScanning(): boolean {
    return this._isScanning;
  }

  getDiscoveredDevices(): BleDeviceInfo[] {
    return Array.from(this.discoveredDevices.values());
  }

  async getRssi(peerId: TransportPeerId): Promise<number | undefined> {
    return this.peers.get(peerId)?.rssi;
  }

  getMtu(peerId: TransportPeerId): number | undefined {
    return this.peers.get(peerId)?.mtu;
  }

  async requestMtu(peerId: TransportPeerId, requestedMtu: number): Promise<number> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found`);
    }

    // Simulate MTU negotiation (usually returns min of requested and supported)
    const negotiatedMtu = Math.min(requestedMtu, this.config.maxMtu);
    peer.mtu = negotiatedMtu;
    this.events?.onMtuNegotiated?.(peerId, negotiatedMtu);
    return negotiatedMtu;
  }

  getBlePeerInfo(peerId: TransportPeerId): BlePeerInfo | undefined {
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
  async simulateIncomingConnection(peerId: TransportPeerId): Promise<void> {
    const peerInfo: BlePeerInfo = {
      peerId,
      state: "connected",
      transportType: "bluetooth",
      connectionQuality: 75,
      bytesSent: 0,
      bytesReceived: 0,
      lastSeen: Date.now(),
      rssi: -65,
      mtu: 185,
      discoveredViaScan: false,
    };

    this.peers.set(peerId, peerInfo);
    this.events?.onPeerConnected?.(peerId, peerInfo);
  }
}

// Register the mock BLE transport factory
transportRegistry.register("bluetooth", (config?: TransportConfig) => {
  const peerId = `ble-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new MockBleTransport(peerId, config as BleTransportConfig);
});

/**
 * BLE transport factory type
 */
export type BleTransportFactory = (
  localPeerId: TransportPeerId,
  config?: BleTransportConfig
) => BleTransport;
