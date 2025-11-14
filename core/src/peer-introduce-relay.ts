/**
 * Peer introduction relay system
 * Allows peers to introduce other peers they know about,
 * enabling discovery without direct connection
 */

export interface PeerIntroduction {
  introducedPeerId: string;
  introducedBy: string;
  timestamp: number;
  connectionInfo: {
    addresses: string[]; // IP:port combinations
    publicKey: Uint8Array;
    capabilities: string[];
    lastSeen: number;
  };
  trustScore: number; // 0-100, based on introducer's reputation
  ttl: number;
}

export interface IntroductionRequest {
  requestId: string;
  requestedBy: string;
  criteria?: {
    capabilities?: string[];
    maxDistance?: number;
    minTrustScore?: number;
  };
  timestamp: number;
}

export class PeerIntroduceRelay {
  private knownPeers: Map<string, PeerIntroduction> = new Map();
  private pendingRequests: Map<string, IntroductionRequest> = new Map();
  private introductionCache: Map<string, Set<string>> = new Map(); // peerId -> introducers
  private listeners: Map<string, Set<Function>> = new Map();
  private maxIntroductions: number = 50;
  private introductionTTL: number = 3600000; // 1 hour

  constructor() {
    this.startCleanup();
  }

  /**
   * Introduce a peer to another peer
   */
  introducePeer(
    introducedPeerId: string,
    introducedBy: string,
    connectionInfo: PeerIntroduction['connectionInfo'],
    trustScore: number = 50
  ): void {
    // Validate trust score
    if (trustScore < 0 || trustScore > 100) {
      throw new Error('Trust score must be between 0 and 100');
    }

    const introduction: PeerIntroduction = {
      introducedPeerId,
      introducedBy,
      timestamp: Date.now(),
      connectionInfo,
      trustScore,
      ttl: this.introductionTTL
    };

    // Store introduction
    this.knownPeers.set(introducedPeerId, introduction);

    // Track introducer
    if (!this.introductionCache.has(introducedPeerId)) {
      this.introductionCache.set(introducedPeerId, new Set());
    }
    this.introductionCache.get(introducedPeerId)!.add(introducedBy);

    // Enforce max introductions limit
    if (this.knownPeers.size > this.maxIntroductions) {
      this.evictOldestIntroduction();
    }

    // Emit event
    this.emit('peer-introduced', introduction);

    // Check if this introduction fulfills any pending requests
    this.checkPendingRequests(introduction);
  }

  /**
   * Request introduction to peers matching criteria
   */
  requestIntroductions(request: Omit<IntroductionRequest, 'requestId' | 'timestamp'>): string {
    const requestId = this.generateRequestId();
    
    const fullRequest: IntroductionRequest = {
      ...request,
      requestId,
      timestamp: Date.now()
    };

    this.pendingRequests.set(requestId, fullRequest);

    // Broadcast request
    this.emit('introduction-requested', fullRequest);

    // Auto-expire request after 30 seconds
    setTimeout(() => {
      this.pendingRequests.delete(requestId);
    }, 30000);

    return requestId;
  }

  /**
   * Get introduction for a specific peer
   */
  getIntroduction(peerId: string): PeerIntroduction | undefined {
    return this.knownPeers.get(peerId);
  }

  /**
   * Get all introductions
   */
  getAllIntroductions(): PeerIntroduction[] {
    return Array.from(this.knownPeers.values());
  }

  /**
   * Get introductions by criteria
   */
  getIntroductionsByCriteria(criteria: IntroductionRequest['criteria']): PeerIntroduction[] {
    const introductions = this.getAllIntroductions();

    return introductions.filter(intro => {
      // Filter by capabilities
      if (criteria?.capabilities) {
        const hasCapabilities = criteria.capabilities.every(cap =>
          intro.connectionInfo.capabilities.includes(cap)
        );
        if (!hasCapabilities) return false;
      }

      // Filter by trust score
      if (criteria?.minTrustScore !== undefined) {
        if (intro.trustScore < criteria.minTrustScore) return false;
      }

      return true;
    });
  }

  /**
   * Get introducers for a peer
   */
  getIntroducers(peerId: string): string[] {
    const introducers = this.introductionCache.get(peerId);
    return introducers ? Array.from(introducers) : [];
  }

  /**
   * Update trust score for an introduction
   */
  updateTrustScore(peerId: string, newScore: number): boolean {
    const introduction = this.knownPeers.get(peerId);
    if (!introduction) {
      return false;
    }

    // Clamp score
    introduction.trustScore = Math.max(0, Math.min(100, newScore));
    this.knownPeers.set(peerId, introduction);

    this.emit('trust-score-updated', { peerId, score: introduction.trustScore });
    return true;
  }

  /**
   * Increment trust score (successful interaction)
   */
  incrementTrust(peerId: string, amount: number = 5): void {
    const introduction = this.knownPeers.get(peerId);
    if (introduction) {
      this.updateTrustScore(peerId, introduction.trustScore + amount);
    }
  }

  /**
   * Decrement trust score (failed interaction)
   */
  decrementTrust(peerId: string, amount: number = 10): void {
    const introduction = this.knownPeers.get(peerId);
    if (introduction) {
      this.updateTrustScore(peerId, introduction.trustScore - amount);
    }
  }

  /**
   * Remove an introduction
   */
  removeIntroduction(peerId: string): boolean {
    const removed = this.knownPeers.delete(peerId);
    
    if (removed) {
      this.introductionCache.delete(peerId);
      this.emit('introduction-removed', { peerId });
    }
    
    return removed;
  }

  /**
   * Check if introduction exists
   */
  hasIntroduction(peerId: string): boolean {
    return this.knownPeers.has(peerId);
  }

  /**
   * Get introduction count
   */
  getIntroductionCount(): number {
    return this.knownPeers.size;
  }

  /**
   * Evict oldest introduction
   */
  private evictOldestIntroduction(): void {
    let oldestPeerId: string | null = null;
    let oldestTimestamp = Infinity;

    this.knownPeers.forEach((intro, peerId) => {
      if (intro.timestamp < oldestTimestamp) {
        oldestTimestamp = intro.timestamp;
        oldestPeerId = peerId;
      }
    });

    if (oldestPeerId) {
      this.removeIntroduction(oldestPeerId);
    }
  }

  /**
   * Check pending requests against new introduction
   */
  private checkPendingRequests(introduction: PeerIntroduction): void {
    this.pendingRequests.forEach((request, requestId) => {
      const matches = this.introductionMatchesCriteria(introduction, request.criteria);
      
      if (matches) {
        this.emit('introduction-fulfilled', {
          requestId,
          introduction,
          requestedBy: request.requestedBy
        });
      }
    });
  }

  /**
   * Check if introduction matches criteria
   */
  private introductionMatchesCriteria(
    introduction: PeerIntroduction,
    criteria?: IntroductionRequest['criteria']
  ): boolean {
    if (!criteria) return true;

    // Check capabilities
    if (criteria.capabilities) {
      const hasCapabilities = criteria.capabilities.every(cap =>
        introduction.connectionInfo.capabilities.includes(cap)
      );
      if (!hasCapabilities) return false;
    }

    // Check trust score
    if (criteria.minTrustScore !== undefined) {
      if (introduction.trustScore < criteria.minTrustScore) return false;
    }

    return true;
  }

  /**
   * Start periodic cleanup of expired introductions
   */
  private startCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredIntroductions();
    }, 60000); // Every minute
  }

  /**
   * Remove expired introductions
   */
  private cleanupExpiredIntroductions(): void {
    const now = Date.now();
    const expired: string[] = [];

    this.knownPeers.forEach((intro, peerId) => {
      if (now - intro.timestamp > intro.ttl) {
        expired.push(peerId);
      }
    });

    expired.forEach(peerId => {
      this.removeIntroduction(peerId);
    });

    if (expired.length > 0) {
      this.emit('introductions-expired', { count: expired.length });
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Event listener registration
   */
  on(event: string, callback: (...args: any[]) => any): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Event listener removal
   */
  off(event: string, callback: (...args: any[]) => any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Get relay statistics
   */
  getStats() {
    const introductions = this.getAllIntroductions();
    const trustScores = introductions.map(i => i.trustScore);
    
    return {
      totalIntroductions: introductions.length,
      pendingRequests: this.pendingRequests.size,
      averageTrustScore: trustScores.length > 0
        ? trustScores.reduce((a, b) => a + b, 0) / trustScores.length
        : 0,
      uniqueIntroducers: new Set(introductions.map(i => i.introducedBy)).size
    };
  }

  /**
   * Clear all introductions
   */
  clear(): void {
    this.knownPeers.clear();
    this.introductionCache.clear();
    this.pendingRequests.clear();
    this.emit('cleared');
  }
}

/**
 * Singleton instance
 */
export const peerIntroduceRelay = new PeerIntroduceRelay();
