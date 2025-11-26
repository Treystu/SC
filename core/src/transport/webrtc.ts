/**
 * WebRTC Transport Layer for Peer-to-Peer Communication
 */

export interface PeerConnectionConfig {
  peerId: string;
  iceServers?: RTCIceServer[];
}

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface DataChannelConfig {
  label: string;
  ordered: boolean;
  maxRetransmits?: number;
}

/**
 * WebRTC Peer Connection Manager
 * Handles peer-to-peer connections using WebRTC data channels
 */
export class WebRTCPeer {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private onMessageCallback?: (data: Uint8Array) => void;
  private onStateChangeCallback?: (state: ConnectionState) => void;
  private onSignalCallback?: (signal: any) => void;
  private peerId: string;

  constructor(config: PeerConnectionConfig) {
    this.peerId = config.peerId;
    this.initializePeerConnection(config.iceServers);
  }

  /**
   * Initialize RTCPeerConnection with configuration
   */
  private initializePeerConnection(iceServers?: RTCIceServer[]): void {
    const configuration: RTCConfiguration = {
      iceServers: iceServers || [
        // Optional STUN servers (for NAT traversal if available)
        // Prefer direct connections through mesh relay
        { urls: 'stun:stun.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState as ConnectionState;
      this.onStateChangeCallback?.(state);

      // Automatic reconnection on failure
      if (state === 'failed') {
        this.handleConnectionFailure();
      }
    };

    // ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // ICE candidates will be sent via mesh signaling
        this.handleIceCandidate(event.candidate);
      }
    };

    // Data channel receiving
    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  /**
   * Create a data channel with specific configuration
   */
  createDataChannel(config: DataChannelConfig): RTCDataChannel {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const channelConfig: RTCDataChannelInit = {
      ordered: config.ordered,
      maxRetransmits: config.maxRetransmits,
    };

    const channel = this.peerConnection.createDataChannel(config.label, channelConfig);
    this.setupDataChannel(channel);

    return channel;
  }

  /**
   * Set up data channel event handlers
   */
  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannels.set(channel.label, channel);

    channel.onopen = () => {
      console.log(`Data channel ${channel.label} opened`);
    };

    channel.onclose = () => {
      console.log(`Data channel ${channel.label} closed`);
      this.dataChannels.delete(channel.label);
    };

    channel.onerror = (error) => {
      console.error(`Data channel ${channel.label} error:`, error);
    };

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.onMessageCallback?.(new Uint8Array(event.data));
      } else if (typeof event.data === 'string') {
        // Convert string to Uint8Array
        const encoder = new TextEncoder();
        this.onMessageCallback?.(encoder.encode(event.data));
      }
    };
  }

  /**
   * Create and send SDP offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create and send SDP answer
   */
  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Set remote SDP answer
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(answer);
  }

  /**
   * Add ICE candidate received from remote peer
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.addIceCandidate(candidate);
  }

  /**
   * Handle ICE candidate (to be sent via mesh signaling)
   */
  private handleIceCandidate(candidate: RTCIceCandidate): void {
    if (this.onSignalCallback) {
      this.onSignalCallback({ type: 'candidate', candidate: candidate.toJSON() });
    } else {
      console.log('ICE candidate generated but no signal handler:', candidate.toJSON());
    }
  }

  /**
   * Handle connection failure - attempt reconnection
   */
  private async handleConnectionFailure(): Promise<void> {
    console.log('Connection failed, attempting reconnection...');

    // Close existing connection
    this.close();

    // Reinitialize and attempt to reconnect
    // This would trigger new offer/answer exchange via mesh
    this.initializePeerConnection();
  }

  /**
   * Send message through data channel
   */
  send(data: Uint8Array, channelLabel: string = 'reliable'): void {
    const channel = this.dataChannels.get(channelLabel);

    if (!channel || channel.readyState !== 'open') {
      throw new Error(`Data channel ${channelLabel} not ready`);
    }

    // TypeScript type assertion for WebRTC send
    channel.send(data as any);
  }

  /**
   * Register callback for incoming messages
   */
  onMessage(callback: (data: Uint8Array) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * Register callback for connection state changes
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Register callback for signaling messages (ICE candidates, etc.)
   */
  onSignal(callback: (signal: any) => void): void {
    this.onSignalCallback = callback;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return (this.peerConnection?.connectionState || 'new') as ConnectionState;
  }

  /**
   * Get peer ID
   */
  getPeerId(): string {
    return this.peerId;
  }

  /**
   * Get connection statistics
   */
  async getStats(): Promise<RTCStatsReport | null> {
    if (!this.peerConnection) {
      return null;
    }
    return this.peerConnection.getStats();
  }

  /**
   * Gracefully close connection
   */
  close(): void {
    // Close all data channels
    this.dataChannels.forEach(channel => channel.close());
    this.dataChannels.clear();

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

/**
 * WebRTC Peer Connection Pool
 * Manages multiple peer connections
 */
export class PeerConnectionPool {
  private peers: Map<string, WebRTCPeer> = new Map();
  private onMessageCallback?: (peerId: string, data: Uint8Array) => void;
  private onSignalCallback?: (peerId: string, signal: any) => void;

  /**
   * Create or get peer connection
   */
  getOrCreatePeer(peerId: string, config?: PeerConnectionConfig): WebRTCPeer {
    let peer = this.peers.get(peerId);

    if (!peer) {
      peer = new WebRTCPeer(config || { peerId });

      // Set up message handler
      peer.onMessage((data) => {
        this.onMessageCallback?.(peerId, data);
      });

      // Set up state change handler
      peer.onStateChange((state) => {
        if (state === 'closed' || state === 'failed') {
          this.peers.delete(peerId);
        }
      });

      // Set up signal handler
      peer.onSignal((signal) => {
        this.onSignalCallback?.(peerId, signal);
      });

      this.peers.set(peerId, peer);
    }

    return peer;
  }

  /**
   * Get existing peer connection
   */
  getPeer(peerId: string): WebRTCPeer | undefined {
    return this.peers.get(peerId);
  }

  /**
   * Remove peer connection
   */
  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
    }
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, peer]) => peer.getState() === 'connected')
      .map(([peerId]) => peerId);
  }

  /**
   * Broadcast message to all connected peers
   */
  broadcast(data: Uint8Array, excludePeerId?: string): void {
    this.peers.forEach((peer, peerId) => {
      if (peerId !== excludePeerId && peer.getState() === 'connected') {
        try {
          peer.send(data);
        } catch (error) {
          console.error(`Failed to send to peer ${peerId}:`, error);
        }
      }
    });
  }

  /**
   * Register callback for incoming messages from any peer
   */
  onMessage(callback: (peerId: string, data: Uint8Array) => void): void {
    this.onMessageCallback = callback;
  }

  /**
   * Register callback for signaling messages from any peer
   */
  onSignal(callback: (peerId: string, signal: any) => void): void {
    this.onSignalCallback = callback;
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.peers.forEach(peer => peer.close());
    this.peers.clear();
  }

  /**
   * Get connection statistics
   */
  async getStats() {
    const peerStats = await Promise.all(
      Array.from(this.peers.entries()).map(async ([peerId, peer]) => {
        const stats = await peer.getStats();
        return {
          peerId,
          state: peer.getState(),
          stats,
        };
      })
    );

    return {
      totalPeers: this.peers.size,
      connectedPeers: this.getConnectedPeers().length,
      peers: peerStats,
    };
  }
}
