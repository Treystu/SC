/**
 * Node Services - Capability-gated service handler
 *
 * Every node runs the same code, but capabilities determine
 * which services are active. This module handles incoming
 * requests and routes them to the appropriate service based
 * on the node's detected capabilities.
 */

import type { NodeCapabilities } from "./capabilities.js";
import type {
  MessageStore,
  StoredMessage,
  MessagePriority,
  DeliveryStatus,
} from "../storage/MessageStore.js";
import type { SignalRecord, MessageRecord } from "../mesh/dht/records.js";

/**
 * Request types that nodes can handle
 */
export enum ServiceRequestType {
  /** WebRTC signaling relay */
  SIGNAL = "signal",
  /** Store message for offline peer */
  STORE = "store",
  /** Relay data between peers */
  RELAY = "relay",
  /** DHT query (FIND_NODE, FIND_VALUE, STORE) */
  DHT_QUERY = "dht_query",
  /** Direct message delivery */
  MESSAGE = "message",
  /** Retrieve stored messages */
  RETRIEVE = "retrieve",
  /** Capability query */
  CAPABILITIES = "capabilities",
  /** Ping/health check */
  PING = "ping",
}

/**
 * Service request envelope
 */
export interface ServiceRequest {
  /** Request type */
  type: ServiceRequestType;
  /** Sender peer ID */
  from: string;
  /** Request payload */
  payload: Uint8Array;
  /** Request timestamp */
  timestamp: number;
  /** Request ID for response correlation */
  requestId: string;
}

/**
 * Service response envelope
 */
export interface ServiceResponse {
  /** Corresponding request ID */
  requestId: string;
  /** Whether the request was handled successfully */
  success: boolean;
  /** Response payload (if any) */
  payload?: Uint8Array;
  /** Error message (if failed) */
  error?: string;
  /** Response timestamp */
  timestamp: number;
}

/**
 * Relay session tracking
 */
interface RelaySession {
  /** Session ID */
  id: string;
  /** Source peer ID */
  sourceId: string;
  /** Destination peer ID */
  destinationId: string;
  /** Bytes relayed */
  bytesRelayed: number;
  /** When session was created */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * NodeServices statistics
 */
export interface NodeServiceStats {
  /** Total requests handled */
  totalRequests: number;
  /** Requests by type */
  requestsByType: Record<string, number>;
  /** Signals relayed */
  signalsRelayed: number;
  /** Messages stored for offline delivery */
  messagesStored: number;
  /** Messages delivered from store */
  messagesDelivered: number;
  /** Active relay sessions */
  activeRelaySessions: number;
  /** Total bytes relayed */
  totalBytesRelayed: number;
  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Callbacks for service events
 */
export interface ServiceCallbacks {
  /** Called when a message needs to be sent to a peer */
  sendToPeer: (peerId: string, data: Uint8Array) => Promise<void>;
  /** Called when a DHT query needs to be handled */
  handleDHTQuery?: (request: ServiceRequest) => Promise<ServiceResponse>;
  /** Called when a direct message is received */
  onMessage?: (from: string, payload: Uint8Array) => void;
  /** Called when a signal is received for this node */
  onSignal?: (signal: SignalRecord) => void;
}

/**
 * Node Services Manager
 *
 * Handles incoming requests and routes them based on node capabilities.
 * All nodes handle DHT queries and direct messages. Signaling, relay,
 * and store-forward are enabled based on capability detection.
 */
export class NodeServices {
  private capabilities: NodeCapabilities;
  private callbacks: ServiceCallbacks;
  private messageStore: MessageStore | null;
  private relaySessions: Map<string, RelaySession> = new Map();
  private stats: NodeServiceStats;
  private startTime: number;

  /** Maximum relay sessions per node */
  private readonly MAX_RELAY_SESSIONS = 50;
  /** Relay session timeout (10 minutes) */
  private readonly RELAY_SESSION_TIMEOUT = 10 * 60 * 1000;
  /** Maximum message size for store-forward (1MB) */
  private readonly MAX_STORE_MESSAGE_SIZE = 1024 * 1024;

  constructor(
    capabilities: NodeCapabilities,
    callbacks: ServiceCallbacks,
    messageStore?: MessageStore
  ) {
    this.capabilities = capabilities;
    this.callbacks = callbacks;
    this.messageStore = messageStore || null;
    this.startTime = Date.now();
    this.stats = {
      totalRequests: 0,
      requestsByType: {},
      signalsRelayed: 0,
      messagesStored: 0,
      messagesDelivered: 0,
      activeRelaySessions: 0,
      totalBytesRelayed: 0,
      uptime: 0,
    };
  }

  /**
   * Handle an incoming service request
   */
  async handleRequest(request: ServiceRequest): Promise<ServiceResponse> {
    this.stats.totalRequests++;
    this.stats.requestsByType[request.type] =
      (this.stats.requestsByType[request.type] || 0) + 1;

    switch (request.type) {
      case ServiceRequestType.SIGNAL:
        return this.handleSignalRequest(request);

      case ServiceRequestType.STORE:
        return this.handleStoreRequest(request);

      case ServiceRequestType.RELAY:
        return this.handleRelayRequest(request);

      case ServiceRequestType.DHT_QUERY:
        return this.handleDHTQueryRequest(request);

      case ServiceRequestType.MESSAGE:
        return this.handleMessageRequest(request);

      case ServiceRequestType.RETRIEVE:
        return this.handleRetrieveRequest(request);

      case ServiceRequestType.CAPABILITIES:
        return this.handleCapabilitiesRequest(request);

      case ServiceRequestType.PING:
        return this.handlePingRequest(request);

      default:
        return {
          requestId: request.requestId,
          success: false,
          error: `Unknown request type: ${request.type}`,
          timestamp: Date.now(),
        };
    }
  }

  /**
   * Handle signaling relay request
   */
  private async handleSignalRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    if (!this.capabilities.canSignal) {
      return {
        requestId: request.requestId,
        success: false,
        error: "This node does not support signaling relay",
        timestamp: Date.now(),
      };
    }

    try {
      // Parse signal data
      const signalData = JSON.parse(new TextDecoder().decode(request.payload));
      const targetPeerId = signalData.to;

      if (!targetPeerId) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Missing target peer ID in signal",
          timestamp: Date.now(),
        };
      }

      // Forward the signal to the target peer
      await this.callbacks.sendToPeer(targetPeerId, request.payload);
      this.stats.signalsRelayed++;

      return {
        requestId: request.requestId,
        success: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        error: `Signal relay failed: ${error instanceof Error ? error.message : "unknown"}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Handle store-and-forward request
   */
  private async handleStoreRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    if (!this.capabilities.canStore || !this.messageStore) {
      return {
        requestId: request.requestId,
        success: false,
        error: "This node does not support message storage",
        timestamp: Date.now(),
      };
    }

    try {
      // Check message size
      if (request.payload.length > this.MAX_STORE_MESSAGE_SIZE) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Message too large for storage",
          timestamp: Date.now(),
        };
      }

      // Parse the message record
      const messageData = JSON.parse(
        new TextDecoder().decode(request.payload)
      );

      // Store the message
      const storedMessage: StoredMessage = {
        id: messageData.id || request.requestId,
        message: messageData.message,
        recipientId: messageData.recipientId,
        priority: messageData.priority || 1, // NORMAL
        sizeBytes: request.payload.length,
        createdAt: Date.now(),
        expiresAt: messageData.expiresAt || Date.now() + 24 * 60 * 60 * 1000,
        status: "pending" as DeliveryStatus,
        attempts: 0,
        lastAttempt: 0,
        hopCount: messageData.hopCount || 0,
        maxHops: messageData.maxHops || 255,
        routeAttempts: [],
        isOwnMessage: false,
        relayedAt: Date.now(),
      };

      await this.messageStore.store(storedMessage);
      this.stats.messagesStored++;

      return {
        requestId: request.requestId,
        success: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        error: `Store failed: ${error instanceof Error ? error.message : "unknown"}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Handle relay request (forward data between peers)
   */
  private async handleRelayRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    if (!this.capabilities.canRelay) {
      return {
        requestId: request.requestId,
        success: false,
        error: "This node does not support data relay",
        timestamp: Date.now(),
      };
    }

    try {
      // Parse relay header
      const relayData = JSON.parse(new TextDecoder().decode(request.payload));
      const { destinationId, sessionId, data } = relayData;

      if (!destinationId || !data) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Missing destination or data in relay request",
          timestamp: Date.now(),
        };
      }

      // Manage relay session
      this.pruneRelaySessions();

      if (this.relaySessions.size >= this.MAX_RELAY_SESSIONS) {
        return {
          requestId: request.requestId,
          success: false,
          error: "Maximum relay sessions reached",
          timestamp: Date.now(),
        };
      }

      const effectiveSessionId = sessionId || request.requestId;

      // Track or update session
      let session = this.relaySessions.get(effectiveSessionId);
      if (!session) {
        session = {
          id: effectiveSessionId,
          sourceId: request.from,
          destinationId,
          bytesRelayed: 0,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };
        this.relaySessions.set(effectiveSessionId, session);
      }

      const dataBytes = new Uint8Array(
        typeof data === "string" ? new TextEncoder().encode(data) : data
      );

      session.bytesRelayed += dataBytes.length;
      session.lastActivity = Date.now();
      this.stats.totalBytesRelayed += dataBytes.length;

      // Forward to destination
      await this.callbacks.sendToPeer(destinationId, dataBytes);

      return {
        requestId: request.requestId,
        success: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        error: `Relay failed: ${error instanceof Error ? error.message : "unknown"}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Handle DHT query request (all nodes handle this)
   */
  private async handleDHTQueryRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    // All nodes participate in DHT
    if (this.callbacks.handleDHTQuery) {
      return this.callbacks.handleDHTQuery(request);
    }

    return {
      requestId: request.requestId,
      success: false,
      error: "DHT query handler not configured",
      timestamp: Date.now(),
    };
  }

  /**
   * Handle direct message request (all nodes handle this)
   */
  private async handleMessageRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    // All nodes handle direct messages
    if (this.callbacks.onMessage) {
      this.callbacks.onMessage(request.from, request.payload);
    }

    return {
      requestId: request.requestId,
      success: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Handle retrieve request (get stored messages for a peer)
   */
  private async handleRetrieveRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    if (!this.capabilities.canStore || !this.messageStore) {
      return {
        requestId: request.requestId,
        success: false,
        error: "This node does not support message storage",
        timestamp: Date.now(),
      };
    }

    try {
      // Get pending messages for the requesting peer
      const messages = await this.messageStore.getPendingForRecipient(
        request.from
      );

      if (messages.length === 0) {
        return {
          requestId: request.requestId,
          success: true,
          payload: new TextEncoder().encode("[]"),
          timestamp: Date.now(),
        };
      }

      // Serialize and return messages
      const serialized = JSON.stringify(
        messages.map((m) => ({
          id: m.id,
          message: m.message,
          recipientId: m.recipientId,
          createdAt: m.createdAt,
        }))
      );

      // Mark as delivered
      for (const msg of messages) {
        await this.messageStore.markDelivered(msg.id);
        this.stats.messagesDelivered++;
      }

      return {
        requestId: request.requestId,
        success: true,
        payload: new TextEncoder().encode(serialized),
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        error: `Retrieve failed: ${error instanceof Error ? error.message : "unknown"}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Handle capabilities query
   */
  private handleCapabilitiesRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    const capsData = JSON.stringify({
      canSignal: this.capabilities.canSignal,
      canRelay: this.capabilities.canRelay,
      canStore: this.capabilities.canStore,
      canDHT: this.capabilities.canDHT,
      bandwidth: this.capabilities.bandwidth,
      connectionQuality: this.capabilities.connectionQuality,
      maxConnections: this.capabilities.maxConnections,
    });

    return Promise.resolve({
      requestId: request.requestId,
      success: true,
      payload: new TextEncoder().encode(capsData),
      timestamp: Date.now(),
    });
  }

  /**
   * Handle ping request
   */
  private handlePingRequest(
    request: ServiceRequest
  ): Promise<ServiceResponse> {
    return Promise.resolve({
      requestId: request.requestId,
      success: true,
      payload: new TextEncoder().encode(
        JSON.stringify({
          uptime: Date.now() - this.startTime,
          timestamp: Date.now(),
        })
      ),
      timestamp: Date.now(),
    });
  }

  /**
   * Prune expired relay sessions
   */
  private pruneRelaySessions(): void {
    const now = Date.now();
    for (const [id, session] of this.relaySessions) {
      if (now - session.lastActivity > this.RELAY_SESSION_TIMEOUT) {
        this.relaySessions.delete(id);
      }
    }
    this.stats.activeRelaySessions = this.relaySessions.size;
  }

  /**
   * Update node capabilities (e.g., after periodic re-detection)
   */
  updateCapabilities(capabilities: NodeCapabilities): void {
    this.capabilities = capabilities;
  }

  /**
   * Get current service statistics
   */
  getStats(): NodeServiceStats {
    this.stats.uptime = Date.now() - this.startTime;
    this.stats.activeRelaySessions = this.relaySessions.size;
    return { ...this.stats };
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): NodeCapabilities {
    return this.capabilities;
  }

  /**
   * Check if a specific service is available
   */
  isServiceAvailable(type: ServiceRequestType): boolean {
    switch (type) {
      case ServiceRequestType.SIGNAL:
        return this.capabilities.canSignal;
      case ServiceRequestType.STORE:
      case ServiceRequestType.RETRIEVE:
        return this.capabilities.canStore && !!this.messageStore;
      case ServiceRequestType.RELAY:
        return this.capabilities.canRelay;
      case ServiceRequestType.DHT_QUERY:
        return this.capabilities.canDHT;
      case ServiceRequestType.MESSAGE:
      case ServiceRequestType.CAPABILITIES:
      case ServiceRequestType.PING:
        return true; // Always available
      default:
        return false;
    }
  }

  /**
   * Create a service request
   */
  static createRequest(
    type: ServiceRequestType,
    from: string,
    payload: Uint8Array
  ): ServiceRequest {
    return {
      type,
      from,
      payload,
      timestamp: Date.now(),
      requestId: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  /**
   * Serialize a service request for transmission
   */
  static serializeRequest(request: ServiceRequest): Uint8Array {
    const json = JSON.stringify({
      type: request.type,
      from: request.from,
      payload: Array.from(request.payload),
      timestamp: request.timestamp,
      requestId: request.requestId,
    });
    return new TextEncoder().encode(json);
  }

  /**
   * Deserialize a service request from transmission
   */
  static deserializeRequest(data: Uint8Array): ServiceRequest {
    const json = new TextDecoder().decode(data);
    const obj = JSON.parse(json);
    return {
      type: obj.type,
      from: obj.from,
      payload: new Uint8Array(obj.payload),
      timestamp: obj.timestamp,
      requestId: obj.requestId,
    };
  }

  /**
   * Serialize a service response for transmission
   */
  static serializeResponse(response: ServiceResponse): Uint8Array {
    const json = JSON.stringify({
      requestId: response.requestId,
      success: response.success,
      payload: response.payload ? Array.from(response.payload) : undefined,
      error: response.error,
      timestamp: response.timestamp,
    });
    return new TextEncoder().encode(json);
  }

  /**
   * Deserialize a service response from transmission
   */
  static deserializeResponse(data: Uint8Array): ServiceResponse {
    const json = new TextDecoder().decode(data);
    const obj = JSON.parse(json);
    return {
      requestId: obj.requestId,
      success: obj.success,
      payload: obj.payload ? new Uint8Array(obj.payload) : undefined,
      error: obj.error,
      timestamp: obj.timestamp,
    };
  }
}
