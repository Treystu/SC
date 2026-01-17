/**
 * LoRaTransport - Direct LoRa radio communication
 *
 * For devices with direct LoRa hardware access (not via Meshtastic).
 * Enables 5-15 km range with proper antenna setup.
 *
 * Supported hardware:
 * - SX1276/SX1278 (common modules like RFM95)
 * - SX1262 (newer, more efficient)
 * - RAK Wireless modules
 * - LilyGO T-Beam
 *
 * Regulatory notes:
 * - US: 915 MHz ISM band, max 1W EIRP
 * - EU: 868 MHz, 25 mW with 1% duty cycle
 * - Check local regulations before deployment
 */

import type {
  Transport,
  TransportEvents,
  TransportPeerId,
  TransportPeerInfo,
  TransportConnectionState,
  TransportMessage,
} from "../transport/Transport.js";

/**
 * LoRa radio configuration
 */
export interface LoRaConfig {
  /** Frequency in MHz (e.g., 915 for US, 868 for EU) */
  frequency: number;

  /** Bandwidth in kHz (125, 250, or 500) */
  bandwidth: 125 | 250 | 500;

  /** Spreading factor (7-12, higher = longer range, slower) */
  spreadingFactor: 7 | 8 | 9 | 10 | 11 | 12;

  /** Coding rate (5=4/5, 6=4/6, 7=4/7, 8=4/8) */
  codingRate: 5 | 6 | 7 | 8;

  /** Transmit power in dBm (typically max 17-20) */
  txPower: number;

  /** Sync word for network isolation */
  syncWord: number;

  /** Preamble length (8-65535, longer = better sensitivity) */
  preambleLength: number;

  /** Enable CRC */
  crcEnabled: boolean;
}

/**
 * Default LoRa configuration optimized for range
 */
export const DEFAULT_LORA_CONFIG: LoRaConfig = {
  frequency: 915,        // US ISM band
  bandwidth: 125,        // 125 kHz for best range
  spreadingFactor: 10,   // Good balance of range and speed
  codingRate: 5,         // 4/5 coding for minimal overhead
  txPower: 17,           // 17 dBm (common max for modules)
  syncWord: 0x53,        // "S" for Sovereign
  preambleLength: 8,     // Standard preamble
  crcEnabled: true,
};

/**
 * Regional LoRa configurations
 */
export const REGIONAL_CONFIGS: Record<string, Partial<LoRaConfig>> = {
  'US': {
    frequency: 915,
    txPower: 20, // Up to 30 dBm allowed with proper antenna
  },
  'EU': {
    frequency: 868,
    txPower: 14, // 25 mW limit
  },
  'AU': {
    frequency: 915,
    txPower: 20,
  },
  'JP': {
    frequency: 920,
    txPower: 13,
  },
  'IN': {
    frequency: 865,
    txPower: 14,
  },
};

/**
 * LoRa transport capabilities
 */
export const LORA_CAPABILITIES = {
  /** Maximum payload size */
  maxPayloadSize: 255,
  /** Effective data rate at SF10/125kHz */
  dataRateBps: 980,
  /** Typical latency */
  latencyMs: 1000,
  /** Range category */
  range: 'long' as const,
  /** Power usage */
  powerUsage: 'medium' as const,
  /** Bidirectional */
  bidirectional: true,
  /** No internet required */
  requiresInternet: false,
};

/**
 * LoRa packet structure
 */
export interface LoRaPacket {
  /** Destination address (0xFFFF for broadcast) */
  destAddr: number;
  /** Source address */
  srcAddr: number;
  /** Packet sequence number */
  sequence: number;
  /** Packet flags */
  flags: number;
  /** Payload data */
  payload: Uint8Array;
}

/**
 * Received packet with metadata
 */
export interface ReceivedPacket extends LoRaPacket {
  /** Received signal strength (dBm) */
  rssi: number;
  /** Signal-to-noise ratio (dB) */
  snr: number;
  /** Receive timestamp */
  timestamp: number;
}

/**
 * LoRa modem status
 */
export interface LoRaStatus {
  /** Radio is initialized */
  initialized: boolean;
  /** Currently transmitting */
  transmitting: boolean;
  /** Last RSSI value */
  lastRssi: number;
  /** Last SNR value */
  lastSnr: number;
  /** Packets transmitted */
  txCount: number;
  /** Packets received */
  rxCount: number;
  /** Packets dropped (CRC error, etc.) */
  dropCount: number;
  /** Channel activity detected */
  channelBusy: boolean;
}

/**
 * LoRaTransport provides direct LoRa radio communication
 */
export class LoRaTransport implements Transport {
  readonly name = 'lora';
  private _localPeerId: TransportPeerId;

  private config: LoRaConfig;
  private events?: TransportEvents;
  private initialized = false;
  private sequence = 0;

  private status: LoRaStatus = {
    initialized: false,
    transmitting: false,
    lastRssi: 0,
    lastSnr: 0,
    txCount: 0,
    rxCount: 0,
    dropCount: 0,
    channelBusy: false,
  };

  constructor(config: Partial<LoRaConfig> = {}) {
    this.config = { ...DEFAULT_LORA_CONFIG, ...config };
    this._localPeerId = `lora:${this.generateAddress()}` as TransportPeerId;
  }

  get localPeerId(): TransportPeerId {
    return this._localPeerId;
  }

  /**
   * Initialize the LoRa radio
   */
  async start(events: TransportEvents): Promise<void> {
    this.events = events;

    console.log('[LoRaTransport] Initializing radio...');
    console.log(`[LoRaTransport] Frequency: ${this.config.frequency} MHz`);
    console.log(`[LoRaTransport] SF: ${this.config.spreadingFactor}, BW: ${this.config.bandwidth} kHz`);

    // Hardware initialization would happen here
    // This is a stub - real implementation would use:
    // - Web Serial API for USB modems
    // - Native modules for mobile apps
    // - GPIO/SPI for embedded systems

    await this.initializeHardware();

    this.initialized = true;
    this.status.initialized = true;

    console.log('[LoRaTransport] Radio initialized');
  }

  /**
   * Stop the LoRa radio
   */
  async stop(): Promise<void> {
    console.log('[LoRaTransport] Stopping radio');
    this.initialized = false;
    this.status.initialized = false;
  }

  /**
   * Send data to a specific peer
   */
  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    const destAddr = this.peerIdToAddress(peerId);
    await this.transmit(destAddr, payload);
  }

  /**
   * Broadcast data to all peers
   */
  async broadcast(payload: Uint8Array, excludePeerId?: TransportPeerId): Promise<void> {
    await this.transmit(0xFFFF, payload); // 0xFFFF = broadcast
  }

  /**
   * Connect to a peer (not applicable for LoRa)
   */
  async connect(peerId: TransportPeerId): Promise<void> {
    // LoRa is connectionless
    console.log(`[LoRaTransport] LoRa is connectionless, no connect needed for ${peerId}`);
  }

  /**
   * Disconnect from a peer (not applicable for LoRa)
   */
  async disconnect(peerId: TransportPeerId): Promise<void> {
    // LoRa is connectionless
  }

  /**
   * Get connected peers (peers we've heard from)
   */
  getConnectedPeers(): TransportPeerId[] {
    // Would track recently heard peers
    return [];
  }

  /**
   * Get peer info (LoRa peers are connectionless)
   */
  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    // LoRa is connectionless - return basic info for known peers
    return {
      peerId,
      state: 'connected' as TransportConnectionState,
      transportType: 'lora',
      connectionQuality: this.status.lastSnr > 0 ? Math.min(100, this.status.lastSnr * 10) : 50,
      lastSeen: Date.now(),
    };
  }

  /**
   * Get connection state (LoRa is connectionless, so always "connected" if initialized)
   */
  getConnectionState(peerId: TransportPeerId): TransportConnectionState | undefined {
    return this.initialized ? 'connected' : 'disconnected';
  }

  /**
   * Configure LoRa radio parameters
   */
  async configure(config: Partial<LoRaConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    if (this.initialized) {
      // Reconfigure hardware
      await this.applyConfig();
    }

    console.log('[LoRaTransport] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): LoRaConfig {
    return { ...this.config };
  }

  /**
   * Get radio status
   */
  getStatus(): LoRaStatus {
    return { ...this.status };
  }

  /**
   * Get current RSSI (signal strength)
   */
  async getRSSI(): Promise<number> {
    return this.status.lastRssi;
  }

  /**
   * Get current SNR (signal-to-noise ratio)
   */
  async getSNR(): Promise<number> {
    return this.status.lastSnr;
  }

  /**
   * Enable Channel Activity Detection
   * Prevents transmitting when channel is busy
   */
  async enableCAD(enabled: boolean): Promise<void> {
    console.log(`[LoRaTransport] CAD ${enabled ? 'enabled' : 'disabled'}`);
    // Would configure hardware CAD
  }

  /**
   * Calculate airtime for a packet
   * Useful for duty cycle management
   */
  calculateAirtime(payloadSize: number): number {
    // Formula based on LoRa specs
    const sf = this.config.spreadingFactor;
    const bw = this.config.bandwidth * 1000; // Convert to Hz
    const cr = this.config.codingRate;
    const preamble = this.config.preambleLength;

    // Symbol time
    const tsym = Math.pow(2, sf) / bw;

    // Preamble time
    const tpreamble = (preamble + 4.25) * tsym;

    // Payload symbols (simplified calculation)
    const payloadSymbols = 8 + Math.max(
      Math.ceil((8 * payloadSize - 4 * sf + 28) / (4 * (sf - 2))) * cr,
      0
    );

    // Total time in seconds
    const tpacket = tpreamble + payloadSymbols * tsym;

    return tpacket * 1000; // Return in milliseconds
  }

  /**
   * Check if we're within duty cycle limits
   * EU regulations require max 1% duty cycle
   */
  checkDutyCycle(region: string = 'US'): { allowed: boolean; waitMs: number } {
    // EU: 1% duty cycle
    // US: No duty cycle limit (but FCC power limits apply)

    if (region === 'EU') {
      // Track recent transmissions and calculate duty cycle
      // Stub implementation
      return { allowed: true, waitMs: 0 };
    }

    // No duty cycle limit for other regions
    return { allowed: true, waitMs: 0 };
  }

  // ============== Private Methods ==============

  private async initializeHardware(): Promise<void> {
    // Stub - would initialize actual hardware
    console.log('[LoRaTransport] Hardware initialization (stub)');
    await this.applyConfig();
  }

  private async applyConfig(): Promise<void> {
    // Stub - would configure radio with current settings
    console.log('[LoRaTransport] Applying configuration (stub)');
  }

  private async transmit(destAddr: number, payload: Uint8Array): Promise<void> {
    if (!this.initialized) {
      throw new Error('LoRa radio not initialized');
    }

    if (payload.length > LORA_CAPABILITIES.maxPayloadSize) {
      throw new Error(`Payload too large: ${payload.length} > ${LORA_CAPABILITIES.maxPayloadSize}`);
    }

    // Check duty cycle
    const dutyCycle = this.checkDutyCycle();
    if (!dutyCycle.allowed) {
      throw new Error(`Duty cycle limit: wait ${dutyCycle.waitMs}ms`);
    }

    this.status.transmitting = true;

    try {
      const packet: LoRaPacket = {
        destAddr,
        srcAddr: this.getLocalAddress(),
        sequence: this.sequence++,
        flags: 0,
        payload,
      };

      // Calculate expected airtime
      const airtime = this.calculateAirtime(payload.length);
      console.log(`[LoRaTransport] Transmitting ${payload.length} bytes (${airtime.toFixed(0)}ms airtime)`);

      // Stub - would actually transmit via hardware
      await new Promise(resolve => setTimeout(resolve, airtime));

      this.status.txCount++;
    } finally {
      this.status.transmitting = false;
    }
  }

  private onReceive(packet: ReceivedPacket): void {
    this.status.rxCount++;
    this.status.lastRssi = packet.rssi;
    this.status.lastSnr = packet.snr;

    const peerId = `lora:${packet.srcAddr.toString(16).padStart(4, '0')}` as TransportPeerId;

    console.log(`[LoRaTransport] Received ${packet.payload.length} bytes from ${peerId} (RSSI: ${packet.rssi}, SNR: ${packet.snr})`);

    // Notify transport layer
    if (this.events) {
      const message: TransportMessage = {
        from: peerId,
        to: this._localPeerId,
        payload: packet.payload,
        timestamp: packet.timestamp,
      };
      this.events.onMessage(message);
    }
  }

  private generateAddress(): string {
    // Generate random 16-bit address
    const bytes = new Uint8Array(2);
    crypto.getRandomValues(bytes);
    return bytes[0].toString(16).padStart(2, '0') + bytes[1].toString(16).padStart(2, '0');
  }

  private getLocalAddress(): number {
    const addr = this._localPeerId.split(':')[1];
    return parseInt(addr, 16);
  }

  private peerIdToAddress(peerId: TransportPeerId): number {
    const parts = peerId.split(':');
    if (parts[0] !== 'lora') {
      throw new Error(`Invalid LoRa peer ID: ${peerId}`);
    }
    return parseInt(parts[1], 16);
  }
}

/**
 * Create a LoRa transport instance
 */
export function createLoRaTransport(config?: Partial<LoRaConfig>): LoRaTransport {
  return new LoRaTransport(config);
}

/**
 * Get regional LoRa configuration
 */
export function getRegionalConfig(region: string): LoRaConfig {
  const regional = REGIONAL_CONFIGS[region] ?? {};
  return { ...DEFAULT_LORA_CONFIG, ...regional };
}
