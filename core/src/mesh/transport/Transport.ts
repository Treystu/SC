/**
 * Transport Manager
 *
 * Orchestrates multiple Transport implementations (WebRTC, BLE, etc.)
 * and provides a unified interface for the MeshNetwork.
 */

import {
  Transport,
  TransportEvents,
  TransportMessage,
  TransportPeerId,
  TransportConnectionState,
} from "../../transport/Transport.js";

// Re-export types for consumers
export * from "../../transport/Transport.js";

export class TransportManager {
  private transports: Map<string, Transport> = new Map();

  // Callbacks for MeshNetwork
  private messageCallbacks: Set<(peerId: string, data: Uint8Array) => void> =
    new Set();
  private connectedCallbacks: Set<(peerId: string) => void> = new Set();
  private disconnectedCallbacks: Set<(peerId: string) => void> = new Set();

  constructor() {}

  registerTransport(transport: Transport): void {
    // Assuming 'transport' has a 'name' or we use class name?
    // The complex interface doesn't enforce a 'name' property on the instance,
    // but the Registry uses it.
    // For now, let's assume we can map it or we add 'name' to the interface if allowed,
    // or we pass name during registration.
    // Actually, `WebRTCTransport` has a `name` property in my previous implementation.
    // Let's assume we can cast or it's known.
    // Ideally, we'd pass the name to registerTransport.

    // For compatibility with the complex interface which might not have 'name',
    // we might need to handle this.
    // However, for this refactor, let's treat it as:
    const name = transport.name || "unknown";

    if (this.transports.has(name)) {
      console.warn(`Transport ${name} already registered.`);
      return;
    }
    this.transports.set(name, transport);
  }

  /**
   * Start all registered transports
   */
  async start(): Promise<void> {
    const promises = Array.from(this.transports.values()).map((transport) => {
      // Create event handlers for this specific transport
      const events: TransportEvents = {
        onMessage: (msg: TransportMessage) => {
          this.handleMessage(msg.from, msg.payload);
        },
        onPeerConnected: (peerId: TransportPeerId) => {
          this.handlePeerConnected(peerId);
        },
        onPeerDisconnected: (peerId: TransportPeerId) => {
          this.handlePeerDisconnected(peerId);
        },
        onStateChange: (
          peerId: TransportPeerId,
          state: TransportConnectionState,
        ) => {
          // Optional: handle fine-grained state changes
          if (state === "connected") this.handlePeerConnected(peerId);
          if (state === "disconnected") this.handlePeerDisconnected(peerId);
        },
        onError: (error: Error) => {
          console.error("Transport error:", error);
        },
      };
      return transport.start(events);
    });

    await Promise.all(promises);
  }

  async stop(): Promise<void> {
    const promises = Array.from(this.transports.values()).map((t) => t.stop());
    await Promise.all(promises);
  }

  async connect(peerId: string, preferredTransport?: string): Promise<void> {
    if (preferredTransport) {
      const transport = this.transports.get(preferredTransport);
      if (transport) {
        return transport.connect(peerId);
      }
    }

    // Attempt all transports?
    // Without discovery info, we can't really know which transport to use.
    // Default to WebRTC if available?
    const webrtc = this.transports.get("webrtc");
    if (webrtc) {
      return webrtc.connect(peerId);
    }

    throw new Error("No suitable transport found for connection.");
  }

  async send(
    peerId: string,
    data: Uint8Array,
    preferredTransport?: string,
  ): Promise<void> {
    // Normalize peer ID for consistent lookup
    const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();
    
    console.log(`[TransportManager] send() to ${normalizedPeerId}, data size: ${data.length}`);
    
    let lastError: Error | null = null;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 1. Try preferred
      if (preferredTransport) {
        const transport = this.transports.get(preferredTransport);
        if (transport) {
          try {
            // Check if connected before sending?
            const state = transport.getConnectionState(normalizedPeerId);
            console.log(`[TransportManager] Preferred transport ${preferredTransport} state for ${normalizedPeerId}: ${state}`);
            if (state === "connected") {
              await transport.send(normalizedPeerId, data);
              console.log(`[TransportManager] Sent via preferred transport ${preferredTransport}`);
              return;
            }
          } catch (e) {
            lastError = e as Error;
            console.warn(
              `Failed to send via preferred transport ${preferredTransport} (attempt ${attempt}):`,
              e,
            );
          }
        }
      }

      // 2. Try any connected transport
      for (const transport of this.transports.values()) {
        if (transport.name === preferredTransport) continue;

        const state = transport.getConnectionState(normalizedPeerId);
        console.log(`[TransportManager] Transport ${transport.name} state for ${normalizedPeerId}: ${state}`);
        if (state === "connected") {
          try {
            await transport.send(normalizedPeerId, data);
            console.log(`[TransportManager] Sent via transport ${transport.name}`);
            return;
          } catch (e) {
            lastError = e as Error;
            console.warn(`[TransportManager] Failed to send via ${transport.name} (attempt ${attempt}):`, e);
            // Continue to next transport
          }
        }
      }

      // If we have attempts left and got an error, wait before retry
      if (attempt < maxRetries && lastError) {
        console.log(`[TransportManager] Retry ${attempt}/${maxRetries} failed, waiting ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // 3. Last ditch: try ANY transport even if we don't think we're connected
    // (UDP-like behavior or auto-connect?)
    // No, standard is to fail if not connected.
    console.error(`[TransportManager] No connected transport found for ${normalizedPeerId} after ${maxRetries} attempts`);
    throw new Error(
      `Failed to send message to ${normalizedPeerId}: Peer not connected via any transport. Last error: ${lastError?.message || 'Unknown'}`,
    );
  }

  // Internal Event Handlers
  private handleMessage(peerId: string, data: Uint8Array): void {
    this.messageCallbacks.forEach((cb) => cb(peerId, data));
  }

  private handlePeerConnected(peerId: string): void {
    this.connectedCallbacks.forEach((cb) => cb(peerId));
  }

  private handlePeerDisconnected(peerId: string): void {
    // Check if connected via any other transport
    for (const transport of this.transports.values()) {
      try {
        if (transport.getConnectionState(peerId) === "connected") {
          return;
        }
      } catch (e) {
        // Find faulty transport connection check
      }
    }
    this.disconnectedCallbacks.forEach((cb) => cb(peerId));
  }

  // Public Event Subscription
  onMessage(callback: (peerId: string, data: Uint8Array) => void): void {
    this.messageCallbacks.add(callback);
  }

  onPeerConnected(callback: (peerId: string) => void): void {
    this.connectedCallbacks.add(callback);
  }

  onPeerDisconnected(callback: (peerId: string) => void): void {
    this.disconnectedCallbacks.add(callback);
  }

  // Expose specific transport retrieval
  getTransport(name: string): Transport | undefined {
    return this.transports.get(name);
  }
}
