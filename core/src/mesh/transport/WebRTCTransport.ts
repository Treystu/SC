import {
  Transport,
  TransportEvents,
  TransportPeerId,
  TransportConnectionState,
  TransportPeerInfo,
  SignalingData,
} from "./Transport.js";
import { PeerConnectionPool } from "../../transport/webrtc.js";

export class WebRTCTransport implements Transport {
  name = "webrtc";
  readonly localPeerId: TransportPeerId;
  private pool: PeerConnectionPool;
  private events?: TransportEvents;
  private connectedPeers: Set<TransportPeerId> = new Set();

  constructor(localPeerId: string = "unknown") {
    // Usually localPeerId is passed in, but PeerConnectionPool might manage it or it's global.
    // For now we accept it or default.
    this.localPeerId = localPeerId;
    this.pool = new PeerConnectionPool();
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;

    // Bind to Pool events
    this.pool.onMessage((peerId, data) => {
      this.events?.onMessage({
        from: peerId,
        payload: data,
        timestamp: Date.now(),
      });
    });

    // We need to hook into peer creation to monitor state
    // Since PeerConnectionPool doesn't have a global "onReference" or similar,
    // we rely on the fact that when we use `getOrCreatePeer`, we attach listeners.
    // But for incoming connections (which we don't fully control creation of here yet),
    // we assume the upper layer (MeshNetwork) handles signaling -> getOrCreatePeer.
  }

  async stop(): Promise<void> {
    this.pool.closeAll();
  }

  async connect(
    peerId: TransportPeerId,
    signalingData?: SignalingData,
  ): Promise<void> {
    console.log(`[WebRTCTransport] connect called for ${peerId}`);
    
    const peer = this.pool.getOrCreatePeer(peerId);

    // Attach listeners if not already attached?
    // PeerConnectionPool might duplicate listeners if we are not careful.
    // But assuming idempotency or checking listeners would be good.
    // For now, simple re-attach (might leak if called multiple times, need fix later).

    peer.onStateChange((state) => {
      const transportState = this.mapState(state);
      console.log(`[WebRTCTransport] Peer ${peerId} state changed: ${state} -> ${transportState}`);
      this.events?.onStateChange?.(peerId, transportState);

      if (transportState === "connected") {
        console.log(`[WebRTCTransport] ✅ Connected to ${peerId}`);
        this.connectedPeers.add(peerId);
        this.events?.onPeerConnected?.(peerId, this.getPeerInfo(peerId));
      } else if (
        transportState === "disconnected" ||
        transportState === "failed" ||
        transportState === "closed"
      ) {
        console.log(`[WebRTCTransport] ❌ Disconnected from ${peerId}: ${state}`);
        this.connectedPeers.delete(peerId);
        this.events?.onPeerDisconnected?.(peerId, state);
      }
    });

    // Handle signaling if provided?
    // WebRTC connection usually starts with creating an Offer.
    try {
      peer.createDataChannel({ label: "reliable", ordered: true });
      peer.createDataChannel({
        label: "unreliable",
        ordered: false,
        maxRetransmits: 0,
      });
      // We do NOT await offer creation here because that requires signaling exchange which happens outside?
      // Or if signalingData IS provided (e.g. an Answer), we feed it?

      if (signalingData && signalingData.type === "answer") {
        // Handle answer
        // peer.signal(signalingData.data);
      }
    } catch (e) {
      console.error("WebRTCTransport connect error", e);
      throw e;
    }
  }

  async disconnect(peerId: TransportPeerId): Promise<void> {
    this.pool.removePeer(peerId);
  }

  async send(peerId: TransportPeerId, payload: Uint8Array): Promise<void> {
    const peer = this.pool.getPeer(peerId);
    if (!peer) {
      console.error(`[WebRTCTransport] Cannot send to ${peerId}: peer not found in pool`);
      console.log(`[WebRTCTransport] Available peers:`, Array.from(this.pool.getConnectedPeers()));
      throw new Error(`Peer ${peerId} not found in WebRTC pool`);
    }
    
    const state = peer.getState();
    if (state !== "connected") {
      console.warn(`[WebRTCTransport] Attempting to send to ${peerId} but state is ${state}`);
    }
    
    console.log(`[WebRTCTransport] Sending ${payload.byteLength} bytes to ${peerId} (state: ${state})`);
    peer.send(payload, "reliable");
  }

  async broadcast(
    payload: Uint8Array,
    excludePeerId?: TransportPeerId,
  ): Promise<void> {
    const peers = this.getConnectedPeers();
    for (const peerId of peers) {
      if (peerId === excludePeerId) continue;
      try {
        await this.send(peerId, payload);
      } catch (e) {
        // Ignore failures during broadcast
      }
    }
  }

  getConnectedPeers(): TransportPeerId[] {
    return Array.from(this.connectedPeers);
  }

  getPeerInfo(peerId: TransportPeerId): TransportPeerInfo | undefined {
    const peer = this.pool.getPeer(peerId);
    if (!peer) return undefined;

    return {
      peerId,
      state: this.mapState(peer.getState()),
      transportType: "webrtc",
      // Metrics could be pulled from peer stats
      lastSeen: Date.now(),
    };
  }

  getConnectionState(
    peerId: TransportPeerId,
  ): TransportConnectionState | undefined {
    const peer = this.pool.getPeer(peerId);
    return peer ? this.mapState(peer.getState()) : undefined;
  }

  // Helper
  private mapState(rtcState: string): TransportConnectionState {
    switch (rtcState) {
      case "connected":
        return "connected";
      case "connecting":
        return "connecting";
      case "disconnected":
        return "disconnected";
      case "failed":
        return "failed";
      case "closed":
        return "closed";
      default:
        return "new";
    }
  }

  // Backdoor for MeshNetwork access
  getPool(): PeerConnectionPool {
    return this.pool;
  }
}
