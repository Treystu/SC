export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline'
}

export interface PresenceInfo {
  userId: string;
  status: PresenceStatus;
  lastSeen: number;
  customMessage?: string;
}

export class PresenceManager {
  private presenceMap = new Map<string, PresenceInfo>();
  private currentStatus: PresenceStatus = PresenceStatus.ONLINE;
  private lastActivity: number = Date.now();
  private awayTimeout = 5 * 60 * 1000; // 5 minutes
  private activityCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startActivityMonitoring();
  }

  setStatus(status: PresenceStatus, customMessage?: string): void {
    this.currentStatus = status;
    this.broadcastPresence(customMessage);
  }

  updateActivity(): void {
    this.lastActivity = Date.now();
    
    // Auto-return from away
    if (this.currentStatus === PresenceStatus.AWAY) {
      this.setStatus(PresenceStatus.ONLINE);
    }
  }

  private startActivityMonitoring(): void {
    this.activityCheckInterval = setInterval(() => {
      const inactiveDuration = Date.now() - this.lastActivity;
      
      if (
        inactiveDuration > this.awayTimeout &&
        this.currentStatus === PresenceStatus.ONLINE
      ) {
        this.setStatus(PresenceStatus.AWAY, 'Away due to inactivity');
      }
    }, 60000); // Check every minute
  }

  private broadcastPresence(customMessage?: string): void {
    const presence: PresenceInfo = {
      userId: 'self',
      status: this.currentStatus,
      lastSeen: Date.now(),
      customMessage
    };

    // Broadcast to all peers
    console.log('Broadcasting presence:', presence);
  }

  updatePeerPresence(userId: string, status: PresenceStatus, customMessage?: string): void {
    this.presenceMap.set(userId, {
      userId,
      status,
      lastSeen: Date.now(),
      customMessage
    });
  }

  getPeerPresence(userId: string): PresenceInfo | undefined {
    return this.presenceMap.get(userId);
  }

  getAllPresences(): Map<string, PresenceInfo> {
    return new Map(this.presenceMap);
  }

  cleanup(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }
  }
}
