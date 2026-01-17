/**
 * DHTSignaling - DHT-based WebRTC signaling without central servers
 *
 * Enables true P2P connection establishment by:
 * 1. Publishing signaling endpoints to the DHT
 * 2. Polling DHT for incoming signaling messages
 * 3. Exchanging SDP offers/answers and ICE candidates
 *
 * Key: hash(peerId + "signaling")
 * Value: SignalingEndpoint with offers/answers
 */

import type { DHT } from "../mesh/dht.js";

/**
 * Signaling message types
 */
export enum SignalingType {
  ENDPOINT = 'endpoint',      // Signaling endpoint announcement
  OFFER = 'offer',            // SDP offer
  ANSWER = 'answer',          // SDP answer
  ICE_CANDIDATE = 'ice',      // ICE candidate
}

/**
 * A signaling message exchanged via DHT
 */
export interface SignalingMessage {
  type: SignalingType;
  fromPeerId: string;
  toPeerId: string;
  payload: string;            // SDP or ICE candidate JSON
  timestamp: number;
  signature: Uint8Array;      // Ed25519 signature for authentication
  nonce: string;              // Unique nonce for replay prevention
}

/**
 * A peer's signaling endpoint published to DHT
 */
export interface SignalingEndpoint {
  peerId: string;
  publicKey: Uint8Array;      // Ed25519 public key for verification
  capabilities: string[];     // Supported features
  lastSeen: number;
  messages: SignalingMessage[]; // Pending messages for this peer
}

/**
 * Connection request with SDP offer
 */
export interface ConnectionRequest {
  fromPeerId: string;
  offer: RTCSessionDescriptionInit;
  iceCandidates: RTCIceCandidateInit[];
  timestamp: number;
}

/**
 * Connection response with SDP answer
 */
export interface ConnectionResponse {
  fromPeerId: string;
  answer: RTCSessionDescriptionInit;
  iceCandidates: RTCIceCandidateInit[];
  timestamp: number;
}

/**
 * Configuration for DHT signaling
 */
export interface DHTSignalingConfig {
  /** How long signaling messages remain valid (default: 5 minutes) */
  messageTimeout: number;

  /** How often to poll for incoming messages (default: 5 seconds) */
  pollInterval: number;

  /** Maximum number of pending messages per peer (default: 10) */
  maxPendingMessages: number;

  /** How often to republish our endpoint (default: 2 minutes) */
  republishInterval: number;
}

/**
 * Default signaling configuration
 */
export const DEFAULT_SIGNALING_CONFIG: DHTSignalingConfig = {
  messageTimeout: 5 * 60 * 1000,    // 5 minutes
  pollInterval: 5_000,               // 5 seconds
  maxPendingMessages: 10,
  republishInterval: 2 * 60 * 1000, // 2 minutes
};

/**
 * DHT-based signaling for WebRTC connection establishment
 */
export class DHTSignaling {
  private dht: DHT | null = null;
  private localPeerId: string;
  private localPublicKey: Uint8Array;
  private signFunc: (data: Uint8Array) => Promise<Uint8Array>;
  private verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>;
  private config: DHTSignalingConfig;

  private pollTimer?: ReturnType<typeof setInterval>;
  private republishTimer?: ReturnType<typeof setInterval>;
  private messageCallbacks: ((msg: SignalingMessage) => void)[] = [];
  private seenNonces: Set<string> = new Set();

  constructor(
    localPeerId: string,
    localPublicKey: Uint8Array,
    signFunc: (data: Uint8Array) => Promise<Uint8Array>,
    verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>,
    config: Partial<DHTSignalingConfig> = {}
  ) {
    this.localPeerId = localPeerId;
    this.localPublicKey = localPublicKey;
    this.signFunc = signFunc;
    this.verifyFunc = verifyFunc;
    this.config = { ...DEFAULT_SIGNALING_CONFIG, ...config };
  }

  /**
   * Set the DHT instance to use for signaling
   */
  setDHT(dht: DHT): void {
    this.dht = dht;
  }

  /**
   * Start the signaling service
   */
  async start(): Promise<void> {
    if (!this.dht) {
      throw new Error('DHT not set. Call setDHT() first.');
    }

    // Publish our endpoint
    await this.publishEndpoint();

    // Start polling for messages
    this.startPolling();

    // Start republishing endpoint
    this.startRepublishing();

    console.log(`[DHTSignaling] Started for peer ${this.localPeerId}`);
  }

  /**
   * Stop the signaling service
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.republishTimer) {
      clearInterval(this.republishTimer);
      this.republishTimer = undefined;
    }

    console.log(`[DHTSignaling] Stopped`);
  }

  /**
   * Register callback for incoming signaling messages
   */
  onSignalingMessage(callback: (msg: SignalingMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Publish our signaling endpoint to DHT
   */
  async publishEndpoint(): Promise<void> {
    if (!this.dht) throw new Error('DHT not set');

    const endpoint: SignalingEndpoint = {
      peerId: this.localPeerId,
      publicKey: this.localPublicKey,
      capabilities: ['webrtc', 'datachannel'],
      lastSeen: Date.now(),
      messages: [],
    };

    const key = this.getEndpointKeyString(this.localPeerId);
    const value = new TextEncoder().encode(JSON.stringify(endpoint));

    await this.dht.store(key, value);
    console.log(`[DHTSignaling] Published endpoint for ${this.localPeerId}`);
  }

  /**
   * Find a peer's signaling endpoint
   */
  async findPeer(peerId: string): Promise<SignalingEndpoint | null> {
    if (!this.dht) throw new Error('DHT not set');

    const key = this.getEndpointKeyString(peerId);
    const value = await this.dht.findValue(key);

    if (!value) return null;

    try {
      const endpoint = JSON.parse(new TextDecoder().decode(value)) as SignalingEndpoint;
      return endpoint;
    } catch (err) {
      console.error(`[DHTSignaling] Failed to parse endpoint for ${peerId}:`, err);
      return null;
    }
  }

  /**
   * Send a WebRTC offer to a peer
   */
  async sendOffer(toPeerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const message = await this.createSignalingMessage(
      SignalingType.OFFER,
      toPeerId,
      JSON.stringify(offer)
    );

    await this.publishMessage(toPeerId, message);
    console.log(`[DHTSignaling] Sent offer to ${toPeerId}`);
  }

  /**
   * Send a WebRTC answer to a peer
   */
  async sendAnswer(toPeerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const message = await this.createSignalingMessage(
      SignalingType.ANSWER,
      toPeerId,
      JSON.stringify(answer)
    );

    await this.publishMessage(toPeerId, message);
    console.log(`[DHTSignaling] Sent answer to ${toPeerId}`);
  }

  /**
   * Send an ICE candidate to a peer
   */
  async sendIceCandidate(toPeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const message = await this.createSignalingMessage(
      SignalingType.ICE_CANDIDATE,
      toPeerId,
      JSON.stringify(candidate)
    );

    await this.publishMessage(toPeerId, message);
  }

  /**
   * Poll for incoming signaling messages
   */
  async pollForMessages(): Promise<SignalingMessage[]> {
    if (!this.dht) return [];

    const endpoint = await this.findPeer(this.localPeerId);
    if (!endpoint) return [];

    const validMessages: SignalingMessage[] = [];
    const now = Date.now();

    for (const msg of endpoint.messages) {
      // Skip if expired
      if (now - msg.timestamp > this.config.messageTimeout) continue;

      // Skip if already seen (replay prevention)
      if (this.seenNonces.has(msg.nonce)) continue;

      // Skip if not for us
      if (msg.toPeerId !== this.localPeerId) continue;

      // Verify signature
      const isValid = await this.verifyMessage(msg);
      if (!isValid) {
        console.warn(`[DHTSignaling] Invalid signature from ${msg.fromPeerId}`);
        continue;
      }

      // Mark as seen
      this.seenNonces.add(msg.nonce);
      validMessages.push(msg);
    }

    // Prune old nonces
    if (this.seenNonces.size > 10000) {
      this.seenNonces.clear();
    }

    return validMessages;
  }

  /**
   * Wait for an answer to our offer
   */
  async waitForAnswer(fromPeerId: string, timeout: number): Promise<RTCSessionDescriptionInit | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const messages = await this.pollForMessages();

      for (const msg of messages) {
        if (msg.type === SignalingType.ANSWER && msg.fromPeerId === fromPeerId) {
          try {
            return JSON.parse(msg.payload) as RTCSessionDescriptionInit;
          } catch (err) {
            console.error('[DHTSignaling] Failed to parse answer:', err);
          }
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
    }

    return null;
  }

  /**
   * Get pending ICE candidates from a peer
   */
  async getIceCandidates(fromPeerId: string): Promise<RTCIceCandidateInit[]> {
    const messages = await this.pollForMessages();
    const candidates: RTCIceCandidateInit[] = [];

    for (const msg of messages) {
      if (msg.type === SignalingType.ICE_CANDIDATE && msg.fromPeerId === fromPeerId) {
        try {
          candidates.push(JSON.parse(msg.payload) as RTCIceCandidateInit);
        } catch (err) {
          console.error('[DHTSignaling] Failed to parse ICE candidate:', err);
        }
      }
    }

    return candidates;
  }

  // ============== Private Methods ==============

  private getEndpointKeyString(peerId: string): string {
    return `signaling:${peerId}`;
  }

  private getMessagesKeyString(peerId: string): string {
    return `signaling:messages:${peerId}`;
  }

  private async createSignalingMessage(
    type: SignalingType,
    toPeerId: string,
    payload: string
  ): Promise<SignalingMessage> {
    const nonce = this.generateNonce();
    const timestamp = Date.now();

    const message: SignalingMessage = {
      type,
      fromPeerId: this.localPeerId,
      toPeerId,
      payload,
      timestamp,
      signature: new Uint8Array(0), // Will be filled
      nonce,
    };

    // Sign the message
    const dataToSign = this.getSigningData(message);
    message.signature = await this.signFunc(dataToSign);

    return message;
  }

  private async publishMessage(toPeerId: string, message: SignalingMessage): Promise<void> {
    if (!this.dht) throw new Error('DHT not set');

    // Get existing endpoint or create new
    let endpoint = await this.findPeer(toPeerId);

    if (!endpoint) {
      // Peer not found - try to publish to their expected key anyway
      endpoint = {
        peerId: toPeerId,
        publicKey: new Uint8Array(0),
        capabilities: [],
        lastSeen: 0,
        messages: [],
      };
    }

    // Add message to pending
    endpoint.messages.push(message);

    // Trim old messages
    const now = Date.now();
    endpoint.messages = endpoint.messages
      .filter(m => now - m.timestamp < this.config.messageTimeout)
      .slice(-this.config.maxPendingMessages);

    // Publish updated endpoint
    const key = this.getMessagesKeyString(toPeerId);
    const value = new TextEncoder().encode(JSON.stringify(endpoint));

    await this.dht.store(key, value);
  }

  private async verifyMessage(msg: SignalingMessage): Promise<boolean> {
    // Find sender's public key
    const senderEndpoint = await this.findPeer(msg.fromPeerId);
    if (!senderEndpoint || senderEndpoint.publicKey.length === 0) {
      // Can't verify without public key
      return false;
    }

    const dataToSign = this.getSigningData(msg);
    return await this.verifyFunc(dataToSign, msg.signature, senderEndpoint.publicKey);
  }

  private getSigningData(msg: SignalingMessage): Uint8Array {
    const str = `${msg.type}:${msg.fromPeerId}:${msg.toPeerId}:${msg.payload}:${msg.timestamp}:${msg.nonce}`;
    return new TextEncoder().encode(str);
  }

  private generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      try {
        const messages = await this.pollForMessages();
        for (const msg of messages) {
          for (const callback of this.messageCallbacks) {
            try {
              callback(msg);
            } catch (err) {
              console.error('[DHTSignaling] Callback error:', err);
            }
          }
        }
      } catch (err) {
        console.error('[DHTSignaling] Poll error:', err);
      }
    }, this.config.pollInterval);
  }

  private startRepublishing(): void {
    this.republishTimer = setInterval(async () => {
      try {
        await this.publishEndpoint();
      } catch (err) {
        console.error('[DHTSignaling] Republish error:', err);
      }
    }, this.config.republishInterval);
  }
}

/**
 * Create a DHT signaling instance
 */
export function createDHTSignaling(
  localPeerId: string,
  localPublicKey: Uint8Array,
  signFunc: (data: Uint8Array) => Promise<Uint8Array>,
  verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>,
  config?: Partial<DHTSignalingConfig>
): DHTSignaling {
  return new DHTSignaling(localPeerId, localPublicKey, signFunc, verifyFunc, config);
}
