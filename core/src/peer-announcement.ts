// Peer announcement broadcast through mesh network

export interface PeerAnnouncement {
  peerId: string;
  publicKey: string;
  displayName?: string;
  capabilities: string[];
  timestamp: number;
  ttl: number;
}

export class PeerAnnouncementBroadcast {
  private knownPeers: Map<string, PeerAnnouncement> = new Map();
  private readonly announcementInterval = 60000; // 1 minute
  private readonly maxTTL = 10;
  
  createAnnouncement(
    peerId: string,
    publicKey: string,
    displayName?: string,
    capabilities: string[] = []
  ): PeerAnnouncement {
    return {
      peerId,
      publicKey,
      displayName,
      capabilities,
      timestamp: Date.now(),
      ttl: this.maxTTL
    };
  }
  
  shouldBroadcast(announcement: PeerAnnouncement): boolean {
    const existing = this.knownPeers.get(announcement.peerId);
    
    // Always broadcast if unknown
    if (!existing) return true;
    
    // Don't broadcast if TTL expired
    if (announcement.ttl <= 0) return false;
    
    // Broadcast if announcement is newer
    return announcement.timestamp > existing.timestamp;
  }
  
  processAnnouncement(announcement: PeerAnnouncement): boolean {
    // Decrement TTL
    announcement.ttl--;
    
    if (this.shouldBroadcast(announcement)) {
      this.knownPeers.set(announcement.peerId, announcement);
      return true; // Should relay
    }
    
    return false; // Don't relay
  }
  
  getPeerAnnouncement(peerId: string): PeerAnnouncement | null {
    return this.knownPeers.get(peerId) || null;
  }
  
  getAllKnownPeers(): PeerAnnouncement[] {
    return Array.from(this.knownPeers.values())
      .filter(a => a.ttl > 0)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  cleanupExpired(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    for (const [peerId, announcement] of this.knownPeers.entries()) {
      if (now - announcement.timestamp > maxAge || announcement.ttl <= 0) {
        this.knownPeers.delete(peerId);
      }
    }
  }
  
  findPeersByCapability(capability: string): PeerAnnouncement[] {
    return this.getAllKnownPeers()
      .filter(a => a.capabilities.includes(capability));
  }
  
  startPeriodicCleanup(interval: number = 60000): () => void {
    const timer = setInterval(() => {
      this.cleanupExpired();
    }, interval);
    
    return () => clearInterval(timer);
  }
}
