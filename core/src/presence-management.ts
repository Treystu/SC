/**
 * Presence Management
 * Tracks and manages user presence status across the mesh network
 */

export type PresenceStatus = 'online' | 'away' | 'offline' | 'busy' | 'invisible';

export interface PresenceInfo {
  userId: string;
  status: PresenceStatus;
  lastActivity: number;
  customMessage?: string;
  device?: string;
}

export class PresenceManager {
  private presenceMap = new Map<string, PresenceInfo>();
  private localStatus: PresenceStatus = 'online';
  private localUserId: string;
  private activityTimeout = 300000; // 5 minutes
  private awayTimeout = 600000; // 10 minutes
  private lastActivityTime = Date.now();
  private statusBroadcastInterval: NodeJS.Timeout | null = null;

  constructor(userId: string) {
    this.localUserId = userId;
    this.setupActivityTracking();
  }

  /**
   * Setup activity tracking
   */
  private setupActivityTracking() {
    // Track user activity
    if (typeof window !== 'undefined') {
      ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(event => {
        window.addEventListener(event, () => this.recordActivity(), { passive: true });
      });
    }

    // Check for away status periodically
    setInterval(() => {
      this.updateLocalStatus();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Record user activity
   */
  private recordActivity() {
    this.lastActivityTime = Date.now();
    
    // If was away, update to online
    if (this.localStatus === 'away') {
      this.setLocalStatus('online');
    }
  }

  /**
   * Update local status based on activity
   */
  private updateLocalStatus() {
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    
    // Don't auto-update if manually set to busy or invisible
    if (this.localStatus === 'busy' || this.localStatus === 'invisible') {
      return;
    }

    if (timeSinceActivity > this.awayTimeout && this.localStatus !== 'away') {
      this.setLocalStatus('away');
    } else if (timeSinceActivity < this.awayTimeout && this.localStatus === 'away') {
      this.setLocalStatus('online');
    }
  }

  /**
   * Set local presence status
   */
  setLocalStatus(status: PresenceStatus, customMessage?: string) {
    this.localStatus = status;
    
    const presenceInfo: PresenceInfo = {
      userId: this.localUserId,
      status,
      lastActivity: Date.now(),
      customMessage,
      device: this.getDeviceType()
    };

    this.presenceMap.set(this.localUserId, presenceInfo);
  }

  /**
   * Get local presence status
   */
  getLocalStatus(): PresenceInfo {
    return this.presenceMap.get(this.localUserId) || {
      userId: this.localUserId,
      status: this.localStatus,
      lastActivity: this.lastActivityTime
    };
  }

  /**
   * Update remote user presence
   */
  updatePresence(presence: PresenceInfo) {
    this.presenceMap.set(presence.userId, {
      ...presence,
      lastActivity: Date.now()
    });
  }

  /**
   * Get user presence
   */
  getPresence(userId: string): PresenceInfo | undefined {
    return this.presenceMap.get(userId);
  }

  /**
   * Get all presences
   */
  getAllPresences(): PresenceInfo[] {
    return Array.from(this.presenceMap.values());
  }

  /**
   * Get online users
   */
  getOnlineUsers(): PresenceInfo[] {
    return this.getAllPresences().filter(p => 
      p.status === 'online' || p.status === 'away' || p.status === 'busy'
    );
  }

  /**
   * Start broadcasting presence
   */
  startBroadcasting(broadcastFn: (presence: PresenceInfo) => void, intervalMs = 60000) {
    this.stopBroadcasting();
    
    // Broadcast immediately
    broadcastFn(this.getLocalStatus());
    
    // Then broadcast periodically
    this.statusBroadcastInterval = setInterval(() => {
      broadcastFn(this.getLocalStatus());
    }, intervalMs);
  }

  /**
   * Stop broadcasting presence
   */
  stopBroadcasting() {
    if (this.statusBroadcastInterval) {
      clearInterval(this.statusBroadcastInterval);
      this.statusBroadcastInterval = null;
    }
  }

  /**
   * Cleanup stale presences
   */
  cleanupStalePresences(maxAgeMs = 300000) {
    const now = Date.now();
    const staleUsers: string[] = [];

    this.presenceMap.forEach((presence, userId) => {
      if (userId !== this.localUserId && 
          now - presence.lastActivity > maxAgeMs) {
        staleUsers.push(userId);
      }
    });

    staleUsers.forEach(userId => {
      const presence = this.presenceMap.get(userId);
      if (presence) {
        this.presenceMap.set(userId, {
          ...presence,
          status: 'offline'
        });
      }
    });
  }

  /**
   * Get device type
   */
  private getDeviceType(): string {
    if (typeof window === 'undefined') return 'unknown';
    
    const ua = window.navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Get presence statistics
   */
  getStats(): {
    total: number;
    online: number;
    away: number;
    busy: number;
    offline: number;
    invisible: number;
  } {
    const presences = this.getAllPresences();
    
    return {
      total: presences.length,
      online: presences.filter(p => p.status === 'online').length,
      away: presences.filter(p => p.status === 'away').length,
      busy: presences.filter(p => p.status === 'busy').length,
      offline: presences.filter(p => p.status === 'offline').length,
      invisible: presences.filter(p => p.status === 'invisible').length
    };
  }
}
