/**
 * Node Registration System
 *
 * Handles registering this node in the DHT with its capabilities,
 * addresses, and prekey bundles. Periodically refreshes the registration
 * to maintain presence in the network.
 */

import type { NodeCapabilities } from "./capabilities.js";
import type { PeerAddress, PeerRecord } from "../mesh/dht/records.js";
import {
  createPeerRecord,
  getPeerRecordKey,
  getPrekeyRecordKey,
  createPrekeyRecord,
  recordToDHTValue,
} from "../mesh/dht/records.js";
import type { PrekeyBundle } from "../crypto/x3dh.js";
import type { NodeId, DHTKey, DHTValue } from "../mesh/dht/types.js";
import { signMessage, generateFingerprint } from "../crypto/primitives.js";

/**
 * DHT interface that registration needs
 */
export interface DHTInterface {
  store(key: DHTKey, value: DHTValue): Promise<void>;
  findValue(key: DHTKey): Promise<DHTValue | null>;
  getLocalNodeId(): NodeId;
}

/**
 * Registration configuration
 */
export interface RegistrationConfig {
  /** How often to refresh registration (ms) */
  refreshInterval: number;
  /** TTL for peer records in DHT (ms) */
  peerRecordTTL: number;
  /** TTL for prekey records in DHT (ms) */
  prekeyRecordTTL: number;
}

/**
 * Default registration configuration
 */
export const DEFAULT_REGISTRATION_CONFIG: RegistrationConfig = {
  refreshInterval: 30 * 60 * 1000, // 30 minutes
  peerRecordTTL: 60 * 60 * 1000, // 1 hour
  prekeyRecordTTL: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Registration state
 */
export interface RegistrationState {
  /** Whether the node is currently registered */
  isRegistered: boolean;
  /** Last registration timestamp */
  lastRegistered: number;
  /** Current peer record version */
  version: number;
  /** Number of successful registrations */
  registrationCount: number;
  /** Number of failed registration attempts */
  failureCount: number;
}

/**
 * NodeRegistration manages the node's presence in the DHT network.
 */
export class NodeRegistration {
  private config: RegistrationConfig;
  private state: RegistrationState;
  private refreshHandle?: ReturnType<typeof setInterval>;
  private dht: DHTInterface | null = null;
  private peerId: string;
  private publicKey: Uint8Array;
  private privateKey: Uint8Array;

  constructor(
    peerId: string,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
    config: Partial<RegistrationConfig> = {}
  ) {
    this.peerId = peerId;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.config = { ...DEFAULT_REGISTRATION_CONFIG, ...config };
    this.state = {
      isRegistered: false,
      lastRegistered: 0,
      version: 0,
      registrationCount: 0,
      failureCount: 0,
    };
  }

  /**
   * Set the DHT interface for registration
   */
  setDHT(dht: DHTInterface): void {
    this.dht = dht;
  }

  /**
   * Register this node in the DHT
   */
  async register(
    capabilities: NodeCapabilities,
    addresses: PeerAddress[]
  ): Promise<boolean> {
    if (!this.dht) {
      return false;
    }

    try {
      // Increment version
      this.state.version++;

      // Create signed peer record
      const record = createPeerRecord(
        this.peerId,
        this.publicKey,
        this.privateKey,
        addresses,
        capabilities,
        this.state.version
      );

      // Store in DHT
      const key = getPeerRecordKey(this.peerId);
      const value = recordToDHTValue(
        record,
        this.dht.getLocalNodeId(),
        this.config.peerRecordTTL
      );

      await this.dht.store(key, value);

      this.state.isRegistered = true;
      this.state.lastRegistered = Date.now();
      this.state.registrationCount++;

      return true;
    } catch (error) {
      this.state.failureCount++;
      return false;
    }
  }

  /**
   * Publish prekey bundle to DHT
   */
  async publishPrekeys(bundle: PrekeyBundle): Promise<boolean> {
    if (!this.dht) {
      return false;
    }

    try {
      const record = createPrekeyRecord(
        this.peerId,
        bundle,
        this.privateKey
      );

      const key = getPrekeyRecordKey(this.peerId);
      const value = recordToDHTValue(
        record,
        this.dht.getLocalNodeId(),
        this.config.prekeyRecordTTL
      );

      await this.dht.store(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start periodic registration refresh
   */
  startPeriodicRefresh(
    getCapabilities: () => NodeCapabilities,
    getAddresses: () => PeerAddress[]
  ): void {
    // Stop existing refresh if running
    this.stopPeriodicRefresh();

    // Perform initial registration
    this.register(getCapabilities(), getAddresses());

    // Set up periodic refresh
    this.refreshHandle = setInterval(() => {
      this.register(getCapabilities(), getAddresses());
    }, this.config.refreshInterval);

    // Unref if possible (Node.js)
    try {
      if (this.refreshHandle && typeof (this.refreshHandle as any).unref === 'function') {
        (this.refreshHandle as any).unref();
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Stop periodic registration refresh
   */
  stopPeriodicRefresh(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = undefined;
    }
  }

  /**
   * Lookup a peer's record from DHT
   */
  async lookupPeer(peerId: string): Promise<PeerRecord | null> {
    if (!this.dht) return null;

    try {
      const key = getPeerRecordKey(peerId);
      const value = await this.dht.findValue(key);
      if (!value) return null;

      const json = new TextDecoder().decode(value.data);
      const parsed = JSON.parse(json, (_key, val) => {
        if (val && typeof val === "object" && val.__uint8array__) {
          return new Uint8Array(val.data);
        }
        return val;
      });

      return parsed as PeerRecord;
    } catch {
      return null;
    }
  }

  /**
   * Lookup a peer's prekey bundle from DHT
   */
  async lookupPrekeys(peerId: string): Promise<PrekeyBundle | null> {
    if (!this.dht) return null;

    try {
      const key = getPrekeyRecordKey(peerId);
      const value = await this.dht.findValue(key);
      if (!value) return null;

      const json = new TextDecoder().decode(value.data);
      const parsed = JSON.parse(json, (_key, val) => {
        if (val && typeof val === "object" && val.__uint8array__) {
          return new Uint8Array(val.data);
        }
        return val;
      });

      return parsed.bundle || null;
    } catch {
      return null;
    }
  }

  /**
   * Get registration state
   */
  getState(): RegistrationState {
    return { ...this.state };
  }

  /**
   * Check if registration needs refresh
   */
  needsRefresh(): boolean {
    if (!this.state.isRegistered) return true;
    return Date.now() - this.state.lastRegistered > this.config.refreshInterval;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.stopPeriodicRefresh();
    this.dht = null;
  }
}
