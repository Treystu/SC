/**
 * MeshtasticBridge - Bridge to Meshtastic long-range mesh network
 *
 * Meshtastic is an existing LoRa mesh network ecosystem with:
 * - 10-15 km range (line of sight)
 * - Low power consumption
 * - Growing community of solar-powered relay nodes
 *
 * This bridge wraps SC messages in Meshtastic packets, enabling:
 * - Long-range message relay when phones are out of BLE range
 * - Integration with existing Meshtastic infrastructure
 * - Continental-scale message propagation
 *
 * Meshtastic devices connect via:
 * - Serial USB (for development)
 * - Bluetooth LE (for mobile)
 * - TCP/IP (for network gateways)
 */

import type {
  Transport,
  TransportEvents,
  TransportPeerId,
  TransportPeerInfo,
  TransportConnectionState,
  SignalingData,
} from "../transport/Transport.js";
import type { StoredMessage } from "../storage/MessageStore.js";

/**
 * Meshtastic connection types
 */
export type MeshtasticConnectionType = 'serial' | 'ble' | 'tcp';

/**
 * Meshtastic connection options
 */
export interface MeshtasticConnection {
  type: MeshtasticConnectionType;
  /** Serial port path (for type='serial') */
  port?: string;
  /** BLE device ID (for type='ble') */
  deviceId?: string;
  /** TCP host (for type='tcp') */
  host?: string;
  /** TCP port (for type='tcp', default: 4403) */
  tcpPort?: number;
}

/**
 * Meshtastic network info
 */
export interface MeshtasticNetworkInfo {
  /** Number of nodes seen */
  nodeCount: number;
  /** Our node ID */
  myNodeId: number;
  /** Our node name */
  myNodeName: string;
  /** Channel settings */
  channelName: string;
  /** Percentage of airtime used */
  airtimePercent: number;
  /** Nodes and when they were last heard */
  lastHeard: Map<number, number>;
  /** Signal quality to each node */
  signalQuality: Map<number, { snr: number; rssi: number }>;
}

/**
 * SC message wrapped for Meshtastic transport
 * Must fit in Meshtastic's 237-byte payload limit
 */
export interface MeshtasticPacket {
  /** Magic bytes to identify SC packets: 0x5343 = "SC" */
  magic: number;
  /** Protocol version */
  version: number;
  /** First 8 bytes of message ID (for dedup) */
  messageIdPrefix: string;
  /** Fragment index (0-based) */
  fragmentIndex: number;
  /** Total fragment count */
  fragmentCount: number;
  /** Payload fragment */
  payload: Uint8Array;
  /** CRC32 checksum */
  checksum: number;
}

/**
 * Meshtastic transport capabilities
 */
export const MESHTASTIC_CAPABILITIES = {
  /** Maximum payload size per packet */
  maxPayloadSize: 200, // Leave room for headers in 237-byte limit
  /** Effective bandwidth (bytes/sec) */
  maxBandwidth: 100,
  /** Typical latency (ms) */
  latencyMs: 5000,
  /** Range category */
  range: 'long' as const,
  /** Power usage */
  powerUsage: 'low' as const,
  /** Bidirectional communication */
  bidirectional: true,
  /** Requires internet */
  requiresInternet: false,
};

/**
 * Magic bytes for SC-over-Meshtastic packets
 */
export const SC_MESHTASTIC_MAGIC = 0x5343; // "SC" in ASCII

/**
 * Meshtastic portnum for SC messages (private app port)
 */
export const SC_MESHTASTIC_PORTNUM = 256; // PRIVATE_APP

/**
 * Reassembly buffer for fragmented messages
 */
interface ReassemblyBuffer {
  messageId: string;
  fragments: Map<number, Uint8Array>;
  totalFragments: number;
  receivedAt: number;
  lastFragment: number;
}

/**
 * MeshtasticBridge connects SC to Meshtastic network
 */
export class MeshtasticBridge implements Transport {
  readonly name = 'meshtastic';
  private _localPeerId: TransportPeerId = 'meshtastic:unknown';

  private connection: MeshtasticConnection | null = null;
  private connected = false;
  private events?: TransportEvents;

  private reassemblyBuffers: Map<string, ReassemblyBuffer> = new Map();
  private readonly REASSEMBLY_TIMEOUT = 60000; // 60 seconds

  private networkInfo: MeshtasticNetworkInfo = {
    nodeCount: 0,
    myNodeId: 0,
    myNodeName: '',
    channelName: '',
    airtimePercent: 0,
    lastHeard: new Map(),
    signalQuality: new Map(),
  };

  get localPeerId(): TransportPeerId {
    return this._localPeerId;
  }

  /**
   * Connect to a Meshtastic device (call this to set up the hardware connection)
   */
  async connectDevice(connection: MeshtasticConnection): Promise<void> {
    this.connection = connection;

    console.log(`[MeshtasticBridge] Connecting via ${connection.type}...`);

    // Implementation depends on connection type
    switch (connection.type) {
      case 'serial':
        await this.connectSerial(connection.port!);
        break;
      case 'ble':
        await this.connectBLE(connection.deviceId!);
        break;
      case 'tcp':
        await this.connectTCP(connection.host!, connection.tcpPort ?? 4403);
        break;
    }

    this.connected = true;
    console.log(`[MeshtasticBridge] Connected to Meshtastic device`);
  }

  /**
   * Connect to a peer (Transport interface - Meshtastic is broadcast-based)
   */
  async connect(peerId: TransportPeerId, signalingData?: SignalingData): Promise<void> {
    // Meshtastic is a broadcast mesh - no direct peer connection needed
    console.log(`[MeshtasticBridge] Meshtastic is broadcast-based, no direct connect needed for ${peerId}`);
  }

  /**
   * Disconnect from a peer (Transport interface)
   */
  async disconnect(peerId?: TransportPeerId): Promise<void> {
    if (peerId) {
      // Meshtastic is broadcast-based - no per-peer disconnect
      console.log(`[MeshtasticBridge] Meshtastic is broadcast-based, no per-peer disconnect for ${peerId}`);
      return;
    }
    // Disconnect from device
    console.log('[MeshtasticBridge] Disconnecting from device...');
    this.connected = false;
    this.connection = null;
  }

  /**
   * Disconnect from Meshtastic device
   */
  async disconnectDevice(): Promise<void> {
    console.log('[MeshtasticBridge] Disconnecting from device...');
    this.connected = false;
    this.connection = null;
  }

  /**
   * Send an SC message via Meshtastic
   */
  async sendMessage(message: StoredMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to Meshtastic device');
    }

    // Serialize the message
    const serialized = this.serializeMessage(message);

    // Fragment if needed
    const fragments = this.fragment(serialized, message.id);

    console.log(`[MeshtasticBridge] Sending message ${message.id} in ${fragments.length} fragments`);

    // Send each fragment
    for (const packet of fragments) {
      await this.sendPacket(packet);
    }
  }

  /**
   * Register callback for received SC messages
   */
  onMessage(callback: (message: StoredMessage) => void): void {
    // This would be called from the packet receive handler
    // after reassembly is complete
  }

  /**
   * Get Meshtastic network info
   */
  getNetworkInfo(): MeshtasticNetworkInfo {
    return { ...this.networkInfo };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ============== Transport Interface ==============

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    console.log('[MeshtasticBridge] Transport started');
  }

  async stop(): Promise<void> {
    await this.disconnect();
    console.log('[MeshtasticBridge] Transport stopped');
  }

  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    // For broadcast mesh, we send to all
    await this.broadcast(payload);
  }

  async broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to Meshtastic device');
    }

    // Fragment and send
    const fragments = this.fragment(payload, this.generateMessageId());

    for (const packet of fragments) {
      await this.sendPacket(packet);
    }
  }

  getConnectedPeers(): TransportPeerId[] {
    // Return known Meshtastic nodes
    return Array.from(this.networkInfo.lastHeard.keys())
      .map(nodeId => `meshtastic:${nodeId}` as TransportPeerId);
  }

  /**
   * Get peer info for a Meshtastic node
   */
  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    const nodeIdStr = peerId.split(':')[1];
    const nodeId = parseInt(nodeIdStr, 10);

    const lastSeen = this.networkInfo.lastHeard.get(nodeId);
    const signalQuality = this.networkInfo.signalQuality.get(nodeId);

    if (!lastSeen) return undefined;

    return {
      peerId,
      state: 'connected' as TransportConnectionState,
      transportType: 'meshtastic',
      connectionQuality: signalQuality ? Math.min(100, (signalQuality.snr + 20) * 3) : 50,
      lastSeen,
    };
  }

  /**
   * Get connection state for a peer
   */
  getConnectionState(peerId: TransportPeerId): TransportConnectionState | undefined {
    if (!this.connected) return 'disconnected';

    const nodeIdStr = peerId.split(':')[1];
    const nodeId = parseInt(nodeIdStr, 10);

    const lastSeen = this.networkInfo.lastHeard.get(nodeId);
    if (!lastSeen) return undefined;

    // Consider peer "connected" if heard in last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastSeen > fiveMinutesAgo ? 'connected' : 'disconnected';
  }

  // ============== Private Methods ==============

  private async connectSerial(port: string): Promise<void> {
    // Serial connection implementation
    // Would use Web Serial API or Node.js serialport
    console.log(`[MeshtasticBridge] Serial connection to ${port} (stub)`);
    this._localPeerId = `meshtastic:serial:${port}` as TransportPeerId;
  }

  private async connectBLE(deviceId: string): Promise<void> {
    // BLE connection to Meshtastic device
    // Would use Web Bluetooth API or native BLE
    console.log(`[MeshtasticBridge] BLE connection to ${deviceId} (stub)`);
    this._localPeerId = `meshtastic:ble:${deviceId}` as TransportPeerId;
  }

  private async connectTCP(host: string, port: number): Promise<void> {
    // TCP connection to Meshtastic gateway
    console.log(`[MeshtasticBridge] TCP connection to ${host}:${port} (stub)`);
    this._localPeerId = `meshtastic:tcp:${host}` as TransportPeerId;
  }

  private serializeMessage(message: StoredMessage): Uint8Array {
    // Compact serialization for Meshtastic's limited bandwidth
    const json = JSON.stringify({
      id: message.id,
      r: message.recipientId, // short keys
      p: message.priority,
      c: message.createdAt,
      e: message.expiresAt,
      g: message.destinationGeoZone,
      m: Array.from(message.message.payload),
    });

    return new TextEncoder().encode(json);
  }

  private deserializeMessage(data: Uint8Array): StoredMessage | null {
    try {
      const json = new TextDecoder().decode(data);
      const obj = JSON.parse(json);

      // Reconstruct StoredMessage
      // This is a simplified version - full implementation would
      // properly reconstruct the Message object
      return {
        id: obj.id,
        recipientId: obj.r,
        priority: obj.p,
        createdAt: obj.c,
        expiresAt: obj.e,
        destinationGeoZone: obj.g,
        // ... other fields would need reconstruction
      } as StoredMessage;
    } catch (err) {
      console.error('[MeshtasticBridge] Deserialization error:', err);
      return null;
    }
  }

  private fragment(data: Uint8Array, messageId: string): MeshtasticPacket[] {
    const fragments: MeshtasticPacket[] = [];
    const maxPayload = MESHTASTIC_CAPABILITIES.maxPayloadSize - 20; // Reserve for packet headers

    const fragmentCount = Math.ceil(data.length / maxPayload);

    for (let i = 0; i < fragmentCount; i++) {
      const start = i * maxPayload;
      const end = Math.min(start + maxPayload, data.length);
      const payload = data.slice(start, end);

      fragments.push({
        magic: SC_MESHTASTIC_MAGIC,
        version: 1,
        messageIdPrefix: messageId.substring(0, 16),
        fragmentIndex: i,
        fragmentCount,
        payload,
        checksum: this.crc32(payload),
      });
    }

    return fragments;
  }

  private reassemble(packet: MeshtasticPacket): Uint8Array | null {
    const key = packet.messageIdPrefix;

    // Get or create reassembly buffer
    let buffer = this.reassemblyBuffers.get(key);
    if (!buffer) {
      buffer = {
        messageId: key,
        fragments: new Map(),
        totalFragments: packet.fragmentCount,
        receivedAt: Date.now(),
        lastFragment: Date.now(),
      };
      this.reassemblyBuffers.set(key, buffer);
    }

    // Verify checksum
    if (this.crc32(packet.payload) !== packet.checksum) {
      console.warn(`[MeshtasticBridge] Checksum mismatch for fragment ${packet.fragmentIndex}`);
      return null;
    }

    // Store fragment
    buffer.fragments.set(packet.fragmentIndex, packet.payload);
    buffer.lastFragment = Date.now();

    // Check if complete
    if (buffer.fragments.size === buffer.totalFragments) {
      // Reassemble
      let totalSize = 0;
      for (const frag of buffer.fragments.values()) {
        totalSize += frag.length;
      }

      const result = new Uint8Array(totalSize);
      let offset = 0;

      for (let i = 0; i < buffer.totalFragments; i++) {
        const frag = buffer.fragments.get(i);
        if (!frag) {
          console.error(`[MeshtasticBridge] Missing fragment ${i}`);
          return null;
        }
        result.set(frag, offset);
        offset += frag.length;
      }

      // Clean up buffer
      this.reassemblyBuffers.delete(key);

      return result;
    }

    return null; // Not yet complete
  }

  private async sendPacket(packet: MeshtasticPacket): Promise<void> {
    // Encode packet to bytes
    const encoded = this.encodePacket(packet);

    // Send via Meshtastic (implementation depends on connection type)
    // This is a stub - real implementation would use Meshtastic's protobuf API
    console.log(`[MeshtasticBridge] Sending packet (${encoded.length} bytes)`);
  }

  private encodePacket(packet: MeshtasticPacket): Uint8Array {
    // Simple encoding for now
    // Real implementation would use Meshtastic's protobuf format
    const header = new Uint8Array(20);
    const view = new DataView(header.buffer);

    view.setUint16(0, packet.magic, false);
    view.setUint8(2, packet.version);
    view.setUint8(3, packet.fragmentIndex);
    view.setUint8(4, packet.fragmentCount);
    view.setUint32(5, packet.checksum, false);

    // Message ID prefix (8 bytes)
    const idBytes = new TextEncoder().encode(packet.messageIdPrefix.padEnd(16, '\0'));
    header.set(idBytes.slice(0, 8), 9);

    // Combine header and payload
    const result = new Uint8Array(header.length + packet.payload.length);
    result.set(header);
    result.set(packet.payload, header.length);

    return result;
  }

  private generateMessageId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private crc32(data: Uint8Array): number {
    // Simple CRC32 implementation
    let crc = 0xFFFFFFFF;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * Clean up old reassembly buffers
   */
  pruneReassemblyBuffers(): void {
    const now = Date.now();
    for (const [key, buffer] of this.reassemblyBuffers) {
      if (now - buffer.receivedAt > this.REASSEMBLY_TIMEOUT) {
        console.log(`[MeshtasticBridge] Pruning incomplete message ${key}`);
        this.reassemblyBuffers.delete(key);
      }
    }
  }
}

/**
 * Create a Meshtastic bridge instance
 */
export function createMeshtasticBridge(): MeshtasticBridge {
  return new MeshtasticBridge();
}
