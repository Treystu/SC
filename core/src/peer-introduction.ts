/**
 * Peer Introduction Relay
 * Implements "introduce peer" functionality where peer A tells B about C's existence
 */

export interface PeerIntroduction {
  introducedPeerId: string;
  introducedPeerPublicKey: Uint8Array;
  introducedPeerAddresses: string[]; // IP:port combinations
  timestamp: number;
  introducerPeerId: string;
  introducerSignature: Uint8Array;
  trustScore: number; // 0-100, based on introducer's reputation
}

export interface PeerReachabilityInfo {
  peerId: string;
  addresses: string[];
  lastSeen: number;
  latency: number;
  isReachable: boolean;
  failureCount: number;
}

export class PeerIntroductionManager {
  private introductions: Map<string, PeerIntroduction[]> = new Map();
  private reachabilityCache: Map<string, PeerReachabilityInfo> = new Map();
  private pendingVerifications: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly MAX_INTRODUCTIONS_PER_PEER = 10;
  private readonly INTRODUCTION_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly REACHABILITY_TIMEOUT = 5000; // 5 seconds
  private readonly VERIFICATION_RETRY_DELAY = 30000; // 30 seconds

  /**
   * Create an introduction for a peer
   */
  async createIntroduction(
    targetPeerId: string,
    introducedPeerId: string,
    introducedPeerInfo: {
      publicKey: Uint8Array;
      addresses: string[];
    },
    signingKey: CryptoKey
  ): Promise<PeerIntroduction> {
    const introduction: PeerIntroduction = {
      introducedPeerId,
      introducedPeerPublicKey: introducedPeerInfo.publicKey,
      introducedPeerAddresses: introducedPeerInfo.addresses,
      timestamp: Date.now(),
      introducerPeerId: targetPeerId,
      introducerSignature: new Uint8Array(), // Will be filled after signing
      trustScore: this.calculateTrustScore(targetPeerId, introducedPeerId),
    };

    // Sign the introduction
    const dataToSign = this.serializeIntroductionForSigning(introduction);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      dataToSign
    );
    introduction.introducerSignature = new Uint8Array(signature);

    return introduction;
  }

  /**
   * Process a received introduction
   */
  async processIntroduction(
    introduction: PeerIntroduction,
    introducerPublicKey: Uint8Array
  ): Promise<boolean> {
    // Verify signature
    const isValid = await this.verifyIntroduction(introduction, introducerPublicKey);
    if (!isValid) {
      console.warn('Invalid introduction signature');
      return false;
    }

    // Check if introduction is fresh
    const age = Date.now() - introduction.timestamp;
    if (age > this.INTRODUCTION_TTL) {
      console.warn('Introduction too old');
      return false;
    }

    // Store introduction
    const existingIntros = this.introductions.get(introduction.introducedPeerId) || [];
    
    // Limit number of introductions per peer
    if (existingIntros.length >= this.MAX_INTRODUCTIONS_PER_PEER) {
      // Remove oldest
      existingIntros.sort((a, b) => a.timestamp - b.timestamp);
      existingIntros.shift();
    }

    existingIntros.push(introduction);
    this.introductions.set(introduction.introducedPeerId, existingIntros);

    // Start async reachability verification
    this.scheduleReachabilityCheck(introduction);

    return true;
  }

  /**
   * Verify reachability of an introduced peer
   */
  private async verifyReachability(
    peerId: string,
    addresses: string[]
  ): Promise<PeerReachabilityInfo> {
    const startTime = Date.now();
    
    for (const address of addresses) {
      try {
        const reachable = await this.pingAddress(address);
        if (reachable) {
          return {
            peerId,
            addresses,
            lastSeen: Date.now(),
            latency: Date.now() - startTime,
            isReachable: true,
            failureCount: 0,
          };
        }
      } catch (error) {
        console.warn(`Failed to reach ${address}:`, error);
      }
    }

    const cached = this.reachabilityCache.get(peerId);
    return {
      peerId,
      addresses,
      lastSeen: cached?.lastSeen || 0,
      latency: -1,
      isReachable: false,
      failureCount: (cached?.failureCount || 0) + 1,
    };
  }

  /**
   * Ping a peer address to check reachability
   */
  private async pingAddress(address: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), this.REACHABILITY_TIMEOUT);
      
      // Simple HTTP ping (in real implementation, use WebRTC data channel or custom protocol)
      fetch(`http://${address}/ping`)
        .then((response) => {
          clearTimeout(timeout);
          resolve(response.ok);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
    });
  }

  /**
   * Schedule a reachability check for an introduced peer
   */
  private scheduleReachabilityCheck(introduction: PeerIntroduction): void {
    const { introducedPeerId, introducedPeerAddresses } = introduction;

    // Clear existing timeout if any
    const existing = this.pendingVerifications.get(introducedPeerId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(async () => {
      const reachability = await this.verifyReachability(
        introducedPeerId,
        introducedPeerAddresses
      );
      
      this.reachabilityCache.set(introducedPeerId, reachability);
      this.pendingVerifications.delete(introducedPeerId);

      // Retry if unreachable and failure count is low
      if (!reachability.isReachable && reachability.failureCount < 3) {
        this.scheduleReachabilityCheck(introduction);
      }
    }, this.VERIFICATION_RETRY_DELAY);

    this.pendingVerifications.set(introducedPeerId, timeout);
  }

  /**
   * Get introductions for a specific peer
   */
  getIntroductions(peerId: string): PeerIntroduction[] {
    return this.introductions.get(peerId) || [];
  }

  /**
   * Get reachability info for a peer
   */
  getReachabilityInfo(peerId: string): PeerReachabilityInfo | undefined {
    return this.reachabilityCache.get(peerId);
  }

  /**
   * Get all reachable peers from introductions
   */
  getReachablePeers(): PeerReachabilityInfo[] {
    return Array.from(this.reachabilityCache.values()).filter(
      (info) => info.isReachable
    );
  }

  /**
   * Calculate trust score based on introducer and introduced peer history
   */
  private calculateTrustScore(introducerPeerId: string, introducedPeerId: string): number {
    // Base trust score
    let score = 50;

    // Check introducer's history
    const introducerIntros = this.introductions.get(introducerPeerId) || [];
    const successfulIntros = introducerIntros.filter((intro) => {
      const reachability = this.reachabilityCache.get(intro.introducedPeerId);
      return reachability?.isReachable;
    });

    // Increase score based on success rate
    if (introducerIntros.length > 0) {
      const successRate = successfulIntros.length / introducerIntros.length;
      score += successRate * 30;
    }

    // Check if introduced peer was already introduced by others
    const existingIntros = this.introductions.get(introducedPeerId) || [];
    score += Math.min(existingIntros.length * 5, 20);

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Verify introduction signature
   */
  private async verifyIntroduction(
    introduction: PeerIntroduction,
    publicKey: Uint8Array
  ): Promise<boolean> {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        publicKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      const dataToVerify = this.serializeIntroductionForSigning(introduction);
      
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        introduction.introducerSignature,
        dataToVerify
      );
    } catch (error) {
      console.error('Introduction verification failed:', error);
      return false;
    }
  }

  /**
   * Serialize introduction data for signing/verification
   */
  private serializeIntroductionForSigning(introduction: PeerIntroduction): Uint8Array {
    const data = {
      introducedPeerId: introduction.introducedPeerId,
      introducedPeerPublicKey: Array.from(introduction.introducedPeerPublicKey),
      introducedPeerAddresses: introduction.introducedPeerAddresses,
      timestamp: introduction.timestamp,
      introducerPeerId: introduction.introducerPeerId,
    };

    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(data));
  }

  /**
   * Clean up old introductions and failed reachability checks
   */
  cleanup(): void {
    const now = Date.now();

    // Remove old introductions
    for (const [peerId, intros] of this.introductions.entries()) {
      const fresh = intros.filter(
        (intro) => now - intro.timestamp < this.INTRODUCTION_TTL
      );
      
      if (fresh.length === 0) {
        this.introductions.delete(peerId);
      } else {
        this.introductions.set(peerId, fresh);
      }
    }

    // Remove unreachable peers with high failure count
    for (const [peerId, info] of this.reachabilityCache.entries()) {
      if (!info.isReachable && info.failureCount >= 5) {
        this.reachabilityCache.delete(peerId);
        this.introductions.delete(peerId);
      }
    }
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    // Clear all pending verifications
    for (const timeout of this.pendingVerifications.values()) {
      clearTimeout(timeout);
    }
    
    this.pendingVerifications.clear();
    this.introductions.clear();
    this.reachabilityCache.clear();
  }
}
