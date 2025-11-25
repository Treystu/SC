/**
 * Peer Discovery Mechanisms
 * No central servers - all peer-to-peer discovery
 */

export interface PeerInfo {
  publicKey: Uint8Array;
  peerId: string;
  endpoints: PeerEndpoint[];
  displayName?: string;
  timestamp: number;
}

export interface PeerEndpoint {
  type: 'webrtc' | 'bluetooth' | 'local' | 'manual';
  address?: string; // IP:port for manual/local
  signaling?: string; // Signaling peer ID for WebRTC
  rssi?: number; // Signal strength for BLE
}

/**
 * QR Code Identity Exchange
 * Encode public key + connection info as QR code
 */
export class QRCodeDiscovery {
  /**
   * Generate QR code data for identity
   */
  static generateQRData(peerInfo: PeerInfo): string {
    const data = {
      v: 1, // Version
      pk: Array.from(peerInfo.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      id: peerInfo.peerId,
      name: peerInfo.displayName || '',
      endpoints: peerInfo.endpoints.map(ep => ({
        t: ep.type,
        a: ep.address,
        s: ep.signaling,
      })),
      ts: peerInfo.timestamp,
    };

    // Encode as base64 URL
    const json = JSON.stringify(data);
    if (typeof btoa !== 'undefined') {
      return `sc://${btoa(json)}`;
    }
    // Node.js - use global Buffer
    const buffer = (globalThis as any).Buffer;
    if (buffer) {
      return `sc://${buffer.from(json).toString('base64')}`;
    }
    // Fallback - return JSON (not ideal for QR)
    return `sc://${json}`;
  }

  /**
   * Parse QR code data
   */
  static parseQRData(qrData: string): PeerInfo | null {
    try {
      // Remove sc:// prefix
      const base64Data = qrData.replace('sc://', '');
      
      let json: string;
      if (typeof atob !== 'undefined') {
        json = atob(base64Data);
      } else {
        // Node.js - use global Buffer
        const buffer = (globalThis as any).Buffer;
        if (buffer) {
          json = buffer.from(base64Data, 'base64').toString('utf-8');
        } else {
          // Fallback
          json = base64Data;
        }
      }

      const data = JSON.parse(json);

      // Validate version
      if (data.v !== 1) {
        return null;
      }

      // Parse public key
      const publicKey = new Uint8Array(
        data.pk.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16))
      );

      return {
        publicKey,
        peerId: data.id,
        displayName: data.name || undefined,
        endpoints: data.endpoints.map((ep: any) => ({
          type: ep.t,
          address: ep.a,
          signaling: ep.s,
        })),
        timestamp: data.ts,
      };
    } catch (error) {
      console.error('Failed to parse QR code:', error);
      return null;
    }
  }
}

/**
 * Manual IP:Port Peer Entry
 */
export class ManualDiscovery {
  /**
   * Parse manual peer entry
   * Format: peer_id@ip:port or ip:port
   */
  static parseManualEntry(entry: string): PeerEndpoint | null {
    try {
      // Format: peer_id@ip:port
      const parts = entry.split('@');
      let address: string;
      let _peerId: string | undefined;

      if (parts.length === 2) {
        _peerId = parts[0];
        address = parts[1];
      } else {
        address = entry;
      }

      // Validate IP:port format
      const addressParts = address.split(':');
      if (addressParts.length !== 2) {
        return null;
      }

      const _ip = addressParts[0];
      const port = parseInt(addressParts[1], 10);

      // Basic validation
      if (isNaN(port) || port < 1 || port > 65535) {
        return null;
      }

      return {
        type: 'manual',
        address,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Format peer info for manual entry
   */
  static formatManualEntry(peerId: string, address: string): string {
    return `${peerId}@${address}`;
  }
}

/**
 * Peer Announcement Broadcast
 * Broadcast peer existence through mesh
 */
export class PeerAnnouncement {
  /**
   * Create peer announcement message payload
   */
  static createAnnouncement(peerInfo: PeerInfo): Uint8Array {
    const data = {
      publicKey: Array.from(peerInfo.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      peerId: peerInfo.peerId,
      displayName: peerInfo.displayName,
      endpoints: peerInfo.endpoints,
      timestamp: Date.now(),
    };

    return new TextEncoder().encode(JSON.stringify(data));
  }

  /**
   * Parse peer announcement payload
   */
  static parseAnnouncement(payload: Uint8Array): PeerInfo | null {
    try {
      const json = new TextDecoder().decode(payload);
      const data = JSON.parse(json);

      const publicKey = new Uint8Array(
        data.publicKey.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16))
      );

      return {
        publicKey,
        peerId: data.peerId,
        displayName: data.displayName,
        endpoints: data.endpoints,
        timestamp: data.timestamp,
      };
    } catch (error) {
      return null;
    }
  }
}

/**
 * Peer Introduction Relay
 * A tells B about C's existence
 */
export class PeerIntroduction {
  /**
   * Create peer introduction message
   */
  static createIntroduction(introducedPeer: PeerInfo, introducerPeerId: string): Uint8Array {
    const data = {
      introducerPeerId,
      peer: {
        publicKey: Array.from(introducedPeer.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        peerId: introducedPeer.peerId,
        displayName: introducedPeer.displayName,
        endpoints: introducedPeer.endpoints,
      },
      timestamp: Date.now(),
    };

    return new TextEncoder().encode(JSON.stringify(data));
  }

  /**
   * Parse peer introduction message
   */
  static parseIntroduction(payload: Uint8Array): { introducerPeerId: string; peer: PeerInfo } | null {
    try {
      const json = new TextDecoder().decode(payload);
      const data = JSON.parse(json);

      const publicKey = new Uint8Array(
        data.peer.publicKey.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16))
      );

      return {
        introducerPeerId: data.introducerPeerId,
        peer: {
          publicKey,
          peerId: data.peer.peerId,
          displayName: data.peer.displayName,
          endpoints: data.peer.endpoints,
          timestamp: data.timestamp,
        },
      };
    } catch (error) {
      return null;
    }
  }
}

/**
 * Peer Reachability Verification
 */
export class PeerReachability {
  private reachabilityTests: Map<string, {
    timestamp: number;
    attempts: number;
    lastSuccess: number;
  }> = new Map();

  /**
   * Test if peer is reachable
   */
  async testReachability(peerId: string, onSendPing: (peerId: string) => Promise<boolean>): Promise<boolean> {
    const test = this.reachabilityTests.get(peerId) || {
      timestamp: Date.now(),
      attempts: 0,
      lastSuccess: 0,
    };

    test.attempts++;
    test.timestamp = Date.now();

    try {
      const reachable = await onSendPing(peerId);
      if (reachable) {
        test.lastSuccess = Date.now();
      }
      this.reachabilityTests.set(peerId, test);
      return reachable;
    } catch (error) {
      this.reachabilityTests.set(peerId, test);
      return false;
    }
  }

  /**
   * Get reachability status
   */
  getReachabilityStatus(peerId: string): 'reachable' | 'unreachable' | 'unknown' {
    const test = this.reachabilityTests.get(peerId);
    if (!test) {
      return 'unknown';
    }

    const timeSinceSuccess = Date.now() - test.lastSuccess;
    if (timeSinceSuccess < 60000) { // 1 minute
      return 'reachable';
    } else if (test.attempts > 3) {
      return 'unreachable';
    }

    return 'unknown';
  }

  /**
   * Clear reachability test for peer
   */
  clearReachability(peerId: string): void {
    this.reachabilityTests.delete(peerId);
  }
}
