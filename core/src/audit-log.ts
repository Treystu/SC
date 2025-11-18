/**
 * Device-Level Audit Logging for Security Investigation
 * 
 * Since Sovereign Communications is decentralized with no central servers,
 * each device maintains its own security audit log for incident investigation.
 * 
 * Privacy Protection:
 * - NO message contents logged
 * - NO private keys logged
 * - NO personally identifiable information
 * - Only anonymous event metadata
 * - User can export logs voluntarily
 * - Stored locally in IndexedDB (encrypted)
 */

export enum AuditEventType {
  // Cryptographic Events
  KEY_GENERATED = 'key_generated',
  KEY_IMPORTED = 'key_imported',
  KEY_DELETED = 'key_deleted',
  SIGNATURE_VERIFIED = 'signature_verified',
  SIGNATURE_FAILED = 'signature_failed',
  ENCRYPTION_SUCCESS = 'encryption_success',
  ENCRYPTION_ERROR = 'encryption_error',
  DECRYPTION_SUCCESS = 'decryption_success',
  DECRYPTION_ERROR = 'decryption_error',
  
  // Network Events
  PEER_CONNECTED = 'peer_connected',
  PEER_DISCONNECTED = 'peer_disconnected',
  PEER_BLACKLISTED = 'peer_blacklisted',
  PEER_WHITELISTED = 'peer_whitelisted',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_RELAYED = 'message_relayed',
  
  // Security Events
  POW_COMPUTED = 'pow_computed',
  POW_VERIFIED = 'pow_verified',
  POW_FAILED = 'pow_failed',
  CERT_PIN_SUCCESS = 'certificate_pinning_success',
  CERT_PIN_FAILED = 'certificate_pinning_failed',
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILED = 'auth_failed',
  
  // Application Events
  APP_LAUNCHED = 'app_launched',
  APP_BACKGROUNDED = 'app_backgrounded',
  DATABASE_OPENED = 'database_opened',
  DATABASE_MIGRATED = 'database_migrated',
  SETTINGS_CHANGED = 'settings_changed',
  EXPORT_REQUESTED = 'export_requested',
  IMPORT_COMPLETED = 'import_completed',
}

export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface AuditEvent {
  id?: string;
  timestamp: number;
  eventType: AuditEventType;
  peerId?: string; // Anonymous/hashed peer ID
  metadata: Record<string, any>;
  severity: Severity;
  deviceId?: string; // Anonymous device ID
}

export class AuditLog {
  private static readonly DB_NAME = 'sc_audit_log';
  private static readonly STORE_NAME = 'events';
  private static readonly MAX_ENTRIES = 10000;
  private static readonly RETENTION_DAYS = 90;
  private static readonly VERSION = 1;
  
  private static dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize audit log database
   */
  private static async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          
          // Indexes for efficient querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('eventType', 'eventType', { unique: false });
          store.createIndex('severity', 'severity', { unique: false });
          store.createIndex('peerId', 'peerId', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Log a security event
   */
  static async log(event: Omit<AuditEvent, 'id' | 'deviceId'>): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      const fullEvent: AuditEvent = {
        ...event,
        deviceId: await this.getAnonymousDeviceId(),
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.add(fullEvent);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Auto-prune old entries periodically
      if (Math.random() < 0.01) { // 1% chance on each log
        await this.pruneOldEntries();
      }
    } catch (error) {
      // Don't throw - logging failures shouldn't break the app
      console.error('Audit log error:', error);
    }
  }

  /**
   * Get anonymous device ID (stable across sessions, no PII)
   */
  private static async getAnonymousDeviceId(): Promise<string> {
    const storageKey = 'sc_device_id';
    let deviceId = localStorage.getItem(storageKey);
    
    if (!deviceId) {
      // Generate random anonymous ID
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      deviceId = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(storageKey, deviceId);
    }
    
    return deviceId;
  }

  /**
   * Remove entries older than retention period
   */
  private static async pruneOldEntries(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([this.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);
    const index = store.index('timestamp');

    const cutoffTime = Date.now() - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const range = IDBKeyRange.upperBound(cutoffTime);

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export audit logs for incident investigation (user-initiated)
   * 
   * @param startDate Start of date range
   * @param endDate End of date range
   * @returns Sanitized log file as Blob
   */
  static async exportLogs(
    startDate: Date,
    endDate: Date
  ): Promise<Blob> {
    const db = await this.getDB();
    const transaction = db.transaction([this.STORE_NAME], 'readonly');
    const store = transaction.objectStore(this.STORE_NAME);
    const index = store.index('timestamp');

    const range = IDBKeyRange.bound(
      startDate.getTime(),
      endDate.getTime()
    );

    const events = await new Promise<AuditEvent[]>((resolve, reject) => {
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Sanitize events before export (remove any sensitive data)
    const sanitized = events.map(event => ({
      timestamp: new Date(event.timestamp).toISOString(),
      eventType: event.eventType,
      severity: event.severity,
      peerId: event.peerId ? this.hashPeerId(event.peerId) : undefined,
      // Only include safe metadata
      metadata: this.sanitizeMetadata(event.metadata),
    }));

    const json = JSON.stringify({
      exportDate: new Date().toISOString(),
      deviceId: await this.getAnonymousDeviceId(),
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      eventCount: sanitized.length,
      events: sanitized,
    }, null, 2);

    return new Blob([json], { type: 'application/json' });
  }

  /**
   * Hash peer ID for anonymity
   */
  private static hashPeerId(peerId: string): string {
    // Use first 8 chars of hash for brevity
    return peerId.substring(0, 16) + '...';
  }

  /**
   * Sanitize metadata to remove sensitive information
   */
  private static sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    // Only include safe fields
    const safeFields = [
      'reason', 'errorCode', 'duration', 'success',
      'messageCount', 'peerCount', 'difficulty', 'attempts'
    ];
    
    for (const field of safeFields) {
      if (field in metadata) {
        sanitized[field] = metadata[field];
      }
    }
    
    return sanitized;
  }

  /**
   * Get statistics for monitoring dashboard
   */
  static async getStatistics(since: Date): Promise<{
    totalEvents: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    criticalEvents: AuditEvent[];
  }> {
    const db = await this.getDB();
    const transaction = db.transaction([this.STORE_NAME], 'readonly');
    const store = transaction.objectStore(this.STORE_NAME);
    const index = store.index('timestamp');

    const range = IDBKeyRange.lowerBound(since.getTime());

    const events = await new Promise<AuditEvent[]>((resolve, reject) => {
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const criticalEvents: AuditEvent[] = [];

    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      
      if (event.severity === Severity.CRITICAL) {
        criticalEvents.push(event);
      }
    }

    return {
      totalEvents: events.length,
      byType,
      bySeverity,
      criticalEvents,
    };
  }

  /**
   * Clear all audit logs (requires user confirmation)
   */
  static async clearAll(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([this.STORE_NAME], 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Convenience logging functions
export const auditLog = {
  keyGenerated: () => AuditLog.log({
    timestamp: Date.now(),
    eventType: AuditEventType.KEY_GENERATED,
    metadata: {},
    severity: Severity.INFO,
  }),

  signatureVerified: (peerId: string, success: boolean) => AuditLog.log({
    timestamp: Date.now(),
    eventType: success ? AuditEventType.SIGNATURE_VERIFIED : AuditEventType.SIGNATURE_FAILED,
    peerId,
    metadata: { success },
    severity: success ? Severity.INFO : Severity.WARNING,
  }),

  peerBlacklisted: (peerId: string, reason: string) => AuditLog.log({
    timestamp: Date.now(),
    eventType: AuditEventType.PEER_BLACKLISTED,
    peerId,
    metadata: { reason },
    severity: Severity.WARNING,
  }),

  certPinningFailed: (domain: string, reason: string) => AuditLog.log({
    timestamp: Date.now(),
    eventType: AuditEventType.CERT_PIN_FAILED,
    metadata: { domain, reason },
    severity: Severity.CRITICAL,
  }),
};
