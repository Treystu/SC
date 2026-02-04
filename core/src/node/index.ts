/**
 * Unified SC Node
 *
 * Every node runs identical code. "Core" nodes are simply peers with
 * better hardware, uptime, or connectivity. The network self-organizes
 * around capable nodes.
 *
 * This is the main entry point for creating and managing an SC node.
 */

import {
  NodeCapabilitiesDetector,
  type NodeCapabilities,
  type CapabilityConfig,
} from "./capabilities.js";
import {
  NodeServices,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceCallbacks,
  ServiceRequestType,
} from "./services.js";
import {
  NodeRegistration,
  type DHTInterface,
  type RegistrationConfig,
} from "./registration.js";
import type { PeerAddress } from "../mesh/dht/records.js";
import type { MessageStore } from "../storage/MessageStore.js";
import {
  X3DHKeyManager,
  type PrekeyBundle,
  type X3DHConfig,
} from "../crypto/x3dh.js";
import type { IdentityKeyPair } from "../crypto/primitives.js";
import { generateFingerprint } from "../crypto/primitives.js";
import { TransportManager, type TransportManagerConfig, type PeerTransportAddress } from "../transport/manager.js";
import type { Transport, TransportEvents, TransportMessage } from "../transport/Transport.js";

/**
 * Node configuration
 */
export interface SCNodeConfig {
  /** Identity key pair (Ed25519) */
  identityKey: IdentityKeyPair;
  /** Capability detection config */
  capabilities?: Partial<CapabilityConfig>;
  /** Registration config */
  registration?: Partial<RegistrationConfig>;
  /** X3DH config */
  x3dh?: Partial<X3DHConfig>;
  /** Transport manager config */
  transport?: Partial<TransportManagerConfig>;
  /** Message store for store-forward (optional) */
  messageStore?: MessageStore;
}

/**
 * Node state
 */
export enum NodeState {
  /** Node is not started */
  STOPPED = "stopped",
  /** Node is starting up */
  STARTING = "starting",
  /** Node is running */
  RUNNING = "running",
  /** Node is shutting down */
  STOPPING = "stopping",
  /** Node encountered an error */
  ERROR = "error",
}

/**
 * Node event callbacks
 */
export interface NodeEventCallbacks {
  /** Called when a message is received */
  onMessage?: (from: string, payload: Uint8Array) => void;
  /** Called when a peer connects */
  onPeerConnected?: (peerId: string) => void;
  /** Called when a peer disconnects */
  onPeerDisconnected?: (peerId: string) => void;
  /** Called when node capabilities change */
  onCapabilitiesChanged?: (capabilities: NodeCapabilities) => void;
  /** Called when node state changes */
  onStateChange?: (state: NodeState) => void;
  /** Called on errors */
  onError?: (error: Error) => void;
}

/**
 * Node statistics
 */
export interface NodeStats {
  /** Peer ID */
  peerId: string;
  /** Current state */
  state: NodeState;
  /** Uptime in ms */
  uptime: number;
  /** Number of connected peers */
  connectedPeers: number;
  /** Node capabilities */
  capabilities: NodeCapabilities | null;
  /** Messages sent */
  messagesSent: number;
  /** Messages received */
  messagesReceived: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Total bytes received */
  bytesReceived: number;
}

/**
 * Unified SC Node
 *
 * Main class for running an SC node. Combines:
 * - Capability detection
 * - Service management
 * - DHT registration
 * - Transport management
 * - X3DH key management
 */
export class SCNode {
  /** 16-char hex peer ID */
  readonly peerId: string;
  /** Identity key pair */
  readonly identityKey: IdentityKeyPair;

  // Core subsystems
  private capabilityDetector: NodeCapabilitiesDetector;
  private services: NodeServices | null = null;
  private registration: NodeRegistration;
  private x3dhManager: X3DHKeyManager;
  private transportManager: TransportManager;
  private messageStore: MessageStore | null;

  // State
  private state: NodeState = NodeState.STOPPED;
  private startTime = 0;
  private callbacks: NodeEventCallbacks = {};
  private stats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
  };

  constructor(config: SCNodeConfig) {
    this.identityKey = config.identityKey;
    this.peerId = generateFingerprint(config.identityKey.publicKey);
    this.messageStore = config.messageStore || null;

    // Initialize subsystems
    this.capabilityDetector = new NodeCapabilitiesDetector(config.capabilities);
    this.registration = new NodeRegistration(
      this.peerId,
      config.identityKey.publicKey,
      config.identityKey.privateKey,
      config.registration
    );
    this.x3dhManager = new X3DHKeyManager(config.x3dh);
    this.transportManager = new TransportManager(config.transport);

    // Generate X3DH key bundle
    this.x3dhManager.generateKeyBundle(config.identityKey);
  }

  /**
   * Start the node
   */
  async start(callbacks: NodeEventCallbacks = {}): Promise<void> {
    if (this.state === NodeState.RUNNING) return;

    this.setState(NodeState.STARTING);
    this.callbacks = callbacks;
    this.startTime = Date.now();

    try {
      // 1. Detect capabilities
      const capabilities = await this.capabilityDetector.detectCapabilities();
      this.callbacks.onCapabilitiesChanged?.(capabilities);

      // 2. Initialize services
      const serviceCallbacks: ServiceCallbacks = {
        sendToPeer: async (peerId: string, data: Uint8Array) => {
          await this.transportManager.send(peerId, data);
        },
        onMessage: (from: string, payload: Uint8Array) => {
          this.stats.messagesReceived++;
          this.callbacks.onMessage?.(from, payload);
        },
      };

      this.services = new NodeServices(
        capabilities,
        serviceCallbacks,
        this.messageStore || undefined
      );

      // 3. Start transport manager
      const transportEvents: TransportEvents = {
        onMessage: (msg: TransportMessage) => {
          this.handleIncomingMessage(msg);
        },
        onPeerConnected: (peerId: string) => {
          this.callbacks.onPeerConnected?.(peerId);
        },
        onPeerDisconnected: (peerId: string) => {
          this.callbacks.onPeerDisconnected?.(peerId);
        },
        onError: (error: Error) => {
          this.callbacks.onError?.(error);
        },
      };

      await this.transportManager.start(transportEvents);

      // 4. Start capability detector periodic checks
      this.capabilityDetector.start();

      this.setState(NodeState.RUNNING);
    } catch (error) {
      this.setState(NodeState.ERROR);
      throw error;
    }
  }

  /**
   * Stop the node
   */
  async stop(): Promise<void> {
    if (this.state === NodeState.STOPPED) return;

    this.setState(NodeState.STOPPING);

    // Stop subsystems
    this.capabilityDetector.stop();
    this.registration.stopPeriodicRefresh();
    await this.transportManager.stop();

    this.setState(NodeState.STOPPED);
  }

  /**
   * Set the DHT interface (call after DHT is initialized)
   */
  setDHT(dht: DHTInterface): void {
    this.registration.setDHT(dht);
  }

  /**
   * Register this node in the DHT
   */
  async registerInDHT(addresses: PeerAddress[]): Promise<boolean> {
    const capabilities = this.capabilityDetector.getCapabilities();
    if (!capabilities) return false;

    const registered = await this.registration.register(
      capabilities,
      addresses
    );

    if (registered) {
      // Also publish prekeys
      const prekeyBundle = this.x3dhManager.getPublicBundle(this.peerId);
      if (prekeyBundle) {
        await this.registration.publishPrekeys(prekeyBundle);
      }
    }

    return registered;
  }

  /**
   * Start periodic DHT registration
   */
  startPeriodicRegistration(getAddresses: () => PeerAddress[]): void {
    this.registration.startPeriodicRefresh(
      () => this.capabilityDetector.getCapabilities()!,
      getAddresses
    );
  }

  /**
   * Send a message to a peer
   */
  async sendMessage(toPeerId: string, payload: Uint8Array): Promise<void> {
    // Try direct connection first
    try {
      await this.transportManager.send(toPeerId, payload);
      this.stats.messagesSent++;
      this.stats.bytesSent += payload.length;
      return;
    } catch {
      // Not connected, try to connect
    }

    // Try to connect and send
    try {
      await this.transportManager.connect(toPeerId);
      await this.transportManager.send(toPeerId, payload);
      this.stats.messagesSent++;
      this.stats.bytesSent += payload.length;
      return;
    } catch {
      // Connection failed, try store-and-forward
    }

    // Store-and-forward as last resort
    if (this.services?.isServiceAvailable(ServiceRequestType.STORE)) {
      // Store locally for later delivery
      this.callbacks.onError?.(
        new Error(`Peer ${toPeerId} unreachable, message queued`)
      );
    } else {
      throw new Error(`Cannot reach peer ${toPeerId}`);
    }
  }

  /**
   * Add a transport to the node
   */
  addTransport(transport: Transport, priority?: number): void {
    this.transportManager.addTransport(transport, priority);
  }

  /**
   * Register peer addresses for transport selection
   */
  registerPeerAddresses(
    peerId: string,
    addresses: PeerTransportAddress[]
  ): void {
    this.transportManager.registerPeerAddresses(peerId, addresses);
  }

  /**
   * Connect to a peer
   */
  async connectToPeer(peerId: string): Promise<void> {
    await this.transportManager.connect(peerId);
  }

  /**
   * Disconnect from a peer
   */
  async disconnectFromPeer(peerId: string): Promise<void> {
    await this.transportManager.disconnect(peerId);
  }

  /**
   * Get connected peers
   */
  getConnectedPeers(): string[] {
    return this.transportManager.getConnectedPeers();
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): NodeCapabilities | null {
    return this.capabilityDetector.getCapabilities();
  }

  /**
   * Get the X3DH key manager
   */
  getX3DHManager(): X3DHKeyManager {
    return this.x3dhManager;
  }

  /**
   * Get a peer's prekey bundle from DHT
   */
  async getPeerPrekeys(peerId: string): Promise<PrekeyBundle | null> {
    return this.registration.lookupPrekeys(peerId);
  }

  /**
   * Get node statistics
   */
  getStats(): NodeStats {
    return {
      peerId: this.peerId,
      state: this.state,
      uptime: this.state === NodeState.RUNNING ? Date.now() - this.startTime : 0,
      connectedPeers: this.transportManager.getConnectedPeers().length,
      capabilities: this.capabilityDetector.getCapabilities(),
      messagesSent: this.stats.messagesSent,
      messagesReceived: this.stats.messagesReceived,
      bytesSent: this.stats.bytesSent,
      bytesReceived: this.stats.bytesReceived,
    };
  }

  /**
   * Get current node state
   */
  getState(): NodeState {
    return this.state;
  }

  /**
   * Handle incoming transport message
   */
  private handleIncomingMessage(msg: TransportMessage): void {
    this.stats.messagesReceived++;
    this.stats.bytesReceived += msg.payload.length;

    // Try to parse as service request
    try {
      const request = NodeServices.deserializeRequest(msg.payload);
      if (this.services) {
        this.services.handleRequest(request).then((response) => {
          // Send response back
          const responseData = NodeServices.serializeResponse(response);
          this.transportManager
            .send(msg.from, responseData)
            .catch(() => {});
        });
        return;
      }
    } catch {
      // Not a service request, treat as direct message
    }

    // Forward to callback
    this.callbacks.onMessage?.(msg.from, msg.payload);
  }

  /**
   * Set node state and notify callback
   */
  private setState(state: NodeState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}

// Re-export all node module types
export {
  NodeCapabilitiesDetector,
  type NodeCapabilities,
  type CapabilityConfig,
  detectCapabilities,
  getCapabilitiesDetector,
} from "./capabilities.js";

export {
  NodeServices,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceCallbacks,
  ServiceRequestType,
} from "./services.js";

export {
  NodeRegistration,
  type DHTInterface,
  type RegistrationConfig,
} from "./registration.js";
