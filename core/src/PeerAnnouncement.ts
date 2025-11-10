export interface AnnouncementMessage {
  type: 'PEER_ANNOUNCEMENT';
  peerId: string;
  publicKey: Uint8Array;
  endpoints: string[];
  capabilities: string[];
  timestamp: number;
  ttl: number;
}

export class PeerAnnouncement {
  private announcementInterval = 60000; // 1 minute
  private announceTimer: NodeJS.Timeout | null = null;
  private receivedAnnouncements = new Map<string, number>();

  startBroadcasting(
    localPeerId: string,
    publicKey: Uint8Array,
    endpoints: string[],
    capabilities: string[]
  ): void {
    const broadcast = () => {
      const announcement: AnnouncementMessage = {
        type: 'PEER_ANNOUNCEMENT',
        peerId: localPeerId,
        publicKey,
        endpoints,
        capabilities,
        timestamp: Date.now(),
        ttl: 5 // Forward up to 5 hops
      };

      this.broadcastToMesh(announcement);
    };

    // Initial broadcast
    broadcast();

    // Periodic broadcasts
    this.announceTimer = setInterval(broadcast, this.announcementInterval);
  }

  stopBroadcasting(): void {
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }
  }

  async handleAnnouncement(announcement: AnnouncementMessage): Promise<void> {
    const { peerId, timestamp, ttl } = announcement;

    // Check if we've seen this announcement recently
    const lastSeen = this.receivedAnnouncements.get(peerId);
    if (lastSeen && timestamp <= lastSeen) {
      return; // Ignore duplicate/old announcements
    }

    this.receivedAnnouncements.set(peerId, timestamp);

    // Process the announcement
    console.log(`Received peer announcement from: ${peerId}`);
    console.log(`Endpoints: ${announcement.endpoints.join(', ')}`);
    console.log(`Capabilities: ${announcement.capabilities.join(', ')}`);

    // Forward the announcement if TTL > 0
    if (ttl > 0) {
      const forwardedAnnouncement: AnnouncementMessage = {
        ...announcement,
        ttl: ttl - 1
      };
      
      this.forwardAnnouncement(forwardedAnnouncement);
    }

    // Attempt to connect if peer is not already connected
    await this.attemptConnection(announcement);
  }

  private broadcastToMesh(announcement: AnnouncementMessage): void {
    // Would send to all connected peers via mesh network
    console.log('Broadcasting announcement:', announcement);
  }

  private forwardAnnouncement(announcement: AnnouncementMessage): void {
    // Forward to all peers except the one we received it from
    console.log('Forwarding announcement:', announcement);
  }

  private async attemptConnection(announcement: AnnouncementMessage): Promise<void> {
    // Would attempt WebRTC connection using announced endpoints
    console.log(`Attempting connection to ${announcement.peerId}`);
  }

  cleanup(): void {
    this.stopBroadcasting();
    this.receivedAnnouncements.clear();
  }
}
