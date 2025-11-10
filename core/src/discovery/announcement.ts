/**
 * Peer Announcement Broadcast
 * Task 55: Implement peer announcement broadcast through mesh
 * 
 * Allows peers to announce their presence and capabilities to the mesh network
 */

import type { MeshNetwork } from '../mesh/network.js';

export interface PeerAnnouncement {
  peerId: string;
  publicKey: Uint8Array;
  endpoints: string[];  // IP:port or other connection info
  capabilities: PeerCapabilities;
  timestamp: number;
  ttl: number;
}

export interface PeerCapabilities {
  supportsWebRTC: boolean;
  supportsBLE: boolean;
  supportsFileTransfer: boolean;
  supportsVoice: boolean;
  supportsVideo: boolean;
  maxFileSize?: number;
  protocolVersion: string;
}

export class PeerAnnouncementManager {
  private network: MeshNetwork;
  private announcements: Map<string, PeerAnnouncement> = new Map();
  private broadcastInterval: number = 60000;  // Announce every 60 seconds
  private intervalHandle: any = null;

  constructor(network: MeshNetwork) {
    this.network = network;
  }

  /**
   * Create announcement for local peer
   */
  createAnnouncement(
    peerId: string,
    publicKey: Uint8Array,
    endpoints: string[],
    capabilities: PeerCapabilities
  ): PeerAnnouncement {
    return {
      peerId,
      publicKey,
      endpoints,
      capabilities,
      timestamp: Date.now(),
      ttl: 3,  // Allow 3 hops through mesh
    };
  }

  /**
   * Broadcast announcement to mesh network
   */
  async broadcastAnnouncement(announcement: PeerAnnouncement): Promise<void> {
    // Encode announcement as message
    const message = this.encodeAnnouncement(announcement);
    
    // Broadcast to all connected peers
    await this.network.broadcast(message);
    
    // Store our own announcement
    this.announcements.set(announcement.peerId, announcement);
  }

  /**
   * Handle received announcement from peer
   */
  handleAnnouncement(announcement: PeerAnnouncement): void {
    const existing = this.announcements.get(announcement.peerId);
    
    // Update if newer
    if (!existing || announcement.timestamp > existing.timestamp) {
      this.announcements.set(announcement.peerId, announcement);
      
      // Relay to other peers if TTL allows
      if (announcement.ttl > 0) {
        const relayed: PeerAnnouncement = {
          ...announcement,
          ttl: announcement.ttl - 1,
        };
        
        this.broadcastAnnouncement(relayed).catch(err => {
          console.error('Failed to relay announcement:', err);
        });
      }
    }
  }

  /**
   * Get announcement for a specific peer
   */
  getAnnouncement(peerId: string): PeerAnnouncement | null {
    return this.announcements.get(peerId) || null;
  }

  /**
   * Get all known peer announcements
   */
  getAllAnnouncements(): PeerAnnouncement[] {
    return Array.from(this.announcements.values());
  }

  /**
   * Find peers with specific capabilities
   */
  findPeersWithCapability(
    capability: keyof PeerCapabilities
  ): PeerAnnouncement[] {
    return this.getAllAnnouncements().filter(
      announcement => announcement.capabilities[capability] === true
    );
  }

  /**
   * Start periodic announcements
   */
  startPeriodicAnnouncements(
    peerId: string,
    publicKey: Uint8Array,
    endpoints: string[],
    capabilities: PeerCapabilities
  ): void {
    if (this.intervalHandle) {
      this.stopPeriodicAnnouncements();
    }

    const announce = () => {
      const announcement = this.createAnnouncement(
        peerId,
        publicKey,
        endpoints,
        capabilities
      );
      this.broadcastAnnouncement(announcement);
    };

    // Announce immediately
    announce();

    // Then periodically
    this.intervalHandle = setInterval(announce, this.broadcastInterval);
  }

  /**
   * Stop periodic announcements
   */
  stopPeriodicAnnouncements(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Clean up old announcements
   */
  cleanupOldAnnouncements(maxAge: number = 180000): void {
    const now = Date.now();
    
    for (const [peerId, announcement] of this.announcements.entries()) {
      if (now - announcement.timestamp > maxAge) {
        this.announcements.delete(peerId);
      }
    }
  }

  /**
   * Encode announcement as binary message
   */
  private encodeAnnouncement(announcement: PeerAnnouncement): Uint8Array {
    // Simple JSON encoding for now (would use binary protocol in production)
    const json = JSON.stringify({
      ...announcement,
      publicKey: Array.from(announcement.publicKey),
    });
    
    return new TextEncoder().encode(json);
  }

  /**
   * Decode announcement from binary message
   */
  decodeAnnouncement(data: Uint8Array): PeerAnnouncement | null {
    try {
      const json = new TextDecoder().decode(data);
      const parsed = JSON.parse(json);
      
      return {
        ...parsed,
        publicKey: new Uint8Array(parsed.publicKey),
      };
    } catch (err) {
      console.error('Failed to decode announcement:', err);
      return null;
    }
  }
}
