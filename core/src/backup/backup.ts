/**
 * Backup Manager
 *
 * Handles creating encrypted backups of user data including:
 * - Identity keys
 * - Contacts
 * - Message history
 * - Settings
 *
 * Backups are encrypted using the user's identity key.
 */

import { StorageAdapter } from "../storage/memory.js";

export interface BackupMetadata {
  version: string;
  createdAt: number;
  deviceId?: string;
  appVersion?: string;
  dataHash: string;
}

export interface BackupData {
  metadata: BackupMetadata;
  data: Record<string, string>;
  encrypted: boolean;
}

export interface BackupOptions {
  includeMessages?: boolean;
  includeContacts?: boolean;
  includeSettings?: boolean;
  encryptionKey?: Uint8Array;
}

const BACKUP_VERSION = "1.0.0";

/**
 * Manages backup creation for user data
 */
export class BackupManager {
  private storage: StorageAdapter;
  private options: BackupOptions;

  constructor(storage: StorageAdapter, options: BackupOptions = {}) {
    this.storage = storage;
    this.options = {
      includeMessages: true,
      includeContacts: true,
      includeSettings: true,
      ...options,
    };
  }

  /**
   * Create a backup of all data
   */
  async createBackup(): Promise<BackupData> {
    const entries = await this.storage.entries();
    const data: Record<string, string> = {};

    for (const [key, value] of entries) {
      // Filter based on options
      if (this.shouldIncludeKey(key)) {
        data[key] = value;
      }
    }

    const dataString = JSON.stringify(data);
    const dataHash = await this.hashData(dataString);

    const metadata: BackupMetadata = {
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      dataHash,
    };

    const backup: BackupData = {
      metadata,
      data,
      encrypted: false,
    };

    // Encrypt if key provided
    if (this.options.encryptionKey) {
      return this.encryptBackup(backup);
    }

    return backup;
  }

  /**
   * Create an incremental backup (only changed data since last backup)
   */
  async createIncrementalBackup(_lastBackupTime: number): Promise<BackupData> {
    const entries = await this.storage.entries();
    const data: Record<string, string> = {};

    for (const [key, value] of entries) {
      if (this.shouldIncludeKey(key)) {
        // For incremental, we'd need timestamp tracking
        // For now, include all data
        data[key] = value;
      }
    }

    const dataString = JSON.stringify(data);
    const dataHash = await this.hashData(dataString);

    const metadata: BackupMetadata = {
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      dataHash,
    };

    return {
      metadata,
      data,
      encrypted: false,
    };
  }

  /**
   * Export backup as a string (for file saving)
   */
  async exportBackup(): Promise<string> {
    const backup = await this.createBackup();
    return JSON.stringify(backup);
  }

  /**
   * Export backup as bytes (for binary storage)
   */
  async exportBackupBytes(): Promise<Uint8Array> {
    const backupString = await this.exportBackup();
    return new TextEncoder().encode(backupString);
  }

  /**
   * Determine if a key should be included in backup
   */
  private shouldIncludeKey(key: string): boolean {
    // Always include identity keys
    if (key.startsWith("identity_") || key.startsWith("key_")) {
      return true;
    }

    // Messages
    if (key.startsWith("message_") || key.startsWith("conversation_")) {
      return this.options.includeMessages ?? true;
    }

    // Contacts
    if (key.startsWith("contact_") || key.startsWith("peer_")) {
      return this.options.includeContacts ?? true;
    }

    // Settings
    if (key.startsWith("setting_") || key.startsWith("config_")) {
      return this.options.includeSettings ?? true;
    }

    // Include everything else by default
    return true;
  }

  /**
   * Hash data for integrity verification
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Use SubtleCrypto if available
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Fallback: simple hash for environments without crypto
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Encrypt backup data
   */
  private async encryptBackup(backup: BackupData): Promise<BackupData> {
    if (!this.options.encryptionKey) {
      return backup;
    }

    // Use AES-GCM encryption
    const dataString = JSON.stringify(backup.data);
    const encrypted = await this.aesEncrypt(
      dataString,
      this.options.encryptionKey,
    );

    return {
      metadata: backup.metadata,
      data: { encrypted: encrypted },
      encrypted: true,
    };
  }

  /**
   * AES-GCM Encryption
   */
  private async aesEncrypt(data: string, key: Uint8Array): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error("Crypto API not available");
    }

    // Hash key to ensure 32 bytes (256-bit AES)
    const keyHash = await crypto.subtle.digest("SHA-256", key);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyHash,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encryptedContent = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      cryptoKey,
      encodedData,
    );

    // Combine IV + Encrypted Data
    const result = new Uint8Array(iv.length + encryptedContent.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedContent), iv.length);

    // Convert to Base64
    return btoa(String.fromCharCode(...result));
  }
}

/**
 * Backup scheduler for automatic backups
 */
export class BackupScheduler {
  private backupManager: BackupManager;
  private intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private onBackup?: (backup: BackupData) => Promise<void>;

  constructor(
    backupManager: BackupManager,
    intervalMs: number = 24 * 60 * 60 * 1000, // Default: daily
    onBackup?: (backup: BackupData) => Promise<void>,
  ) {
    this.backupManager = backupManager;
    this.intervalMs = intervalMs;
    this.onBackup = onBackup;
  }

  /**
   * Start automatic backups
   */
  start(): void {
    this.stop(); // Clear any existing timer
    this.timer = setInterval(async () => {
      const backup = await this.backupManager.createBackup();
      if (this.onBackup) {
        await this.onBackup(backup);
      }
    }, this.intervalMs);
  }

  /**
   * Stop automatic backups
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Trigger an immediate backup
   */
  async triggerBackup(): Promise<BackupData> {
    const backup = await this.backupManager.createBackup();
    if (this.onBackup) {
      await this.onBackup(backup);
    }
    return backup;
  }
}
