/**
 * Restore Manager
 *
 * Handles restoring user data from backups including:
 * - Decryption of encrypted backups
 * - Validation of backup integrity
 * - Merging with existing data
 * - Conflict resolution
 */

import type { StorageAdapter } from "../storage/memory";
import type { BackupData, BackupMetadata } from "./backup";

export interface RestoreOptions {
  overwriteExisting?: boolean;
  mergeStrategy?: "overwrite" | "skip" | "newer";
  decryptionKey?: Uint8Array;
  validateIntegrity?: boolean;
}

export interface RestoreResult {
  success: boolean;
  itemsRestored: number;
  itemsSkipped: number;
  errors: string[];
  metadata: BackupMetadata;
}

export interface ConflictResolution {
  key: string;
  existingValue: string;
  backupValue: string;
  resolution: "keep_existing" | "use_backup" | "merge";
}

/**
 * Manages restoration of user data from backups
 */
export class RestoreManager {
  private storage: StorageAdapter;
  private options: RestoreOptions;

  constructor(storage: StorageAdapter, options: RestoreOptions = {}) {
    this.storage = storage;
    this.options = {
      overwriteExisting: true,
      mergeStrategy: "overwrite",
      validateIntegrity: true,
      ...options,
    };
  }

  /**
   * Restore data from a backup
   */
  async restoreBackup(backup: BackupData): Promise<RestoreResult> {
    const errors: string[] = [];
    let itemsRestored = 0;
    let itemsSkipped = 0;

    // Validate backup integrity if enabled
    if (this.options.validateIntegrity) {
      const isValid = await this.validateBackup(backup);
      if (!isValid) {
        return {
          success: false,
          itemsRestored: 0,
          itemsSkipped: 0,
          errors: ["Backup integrity validation failed"],
          metadata: backup.metadata,
        };
      }
    }

    // Decrypt if necessary
    let data = backup.data;
    if (backup.encrypted) {
      if (!this.options.decryptionKey) {
        return {
          success: false,
          itemsRestored: 0,
          itemsSkipped: 0,
          errors: ["Backup is encrypted but no decryption key provided"],
          metadata: backup.metadata,
        };
      }
      try {
        data = await this.decryptData(backup.data, this.options.decryptionKey);
      } catch (error) {
        return {
          success: false,
          itemsRestored: 0,
          itemsSkipped: 0,
          errors: [`Decryption failed: ${error}`],
          metadata: backup.metadata,
        };
      }
    }

    // Restore each item
    for (const [key, value] of Object.entries(data)) {
      try {
        const shouldRestore = await this.shouldRestoreItem(key, value);

        if (shouldRestore) {
          await this.storage.set(key, value);
          itemsRestored++;
        } else {
          itemsSkipped++;
        }
      } catch (error) {
        errors.push(`Failed to restore ${key}: ${error}`);
      }
    }

    return {
      success: errors.length === 0,
      itemsRestored,
      itemsSkipped,
      errors,
      metadata: backup.metadata,
    };
  }

  /**
   * Import backup from a string (from file)
   */
  async importBackup(backupString: string): Promise<RestoreResult> {
    try {
      const backup = JSON.parse(backupString) as BackupData;
      return this.restoreBackup(backup);
    } catch (error) {
      return {
        success: false,
        itemsRestored: 0,
        itemsSkipped: 0,
        errors: [`Invalid backup format: ${error}`],
        metadata: {
          version: "unknown",
          createdAt: 0,
          dataHash: "",
        },
      };
    }
  }

  /**
   * Import backup from bytes
   */
  async importBackupBytes(bytes: Uint8Array): Promise<RestoreResult> {
    const backupString = new TextDecoder().decode(bytes);
    return this.importBackup(backupString);
  }

  /**
   * Preview what would be restored without actually restoring
   */
  async previewRestore(backup: BackupData): Promise<{
    willRestore: string[];
    willSkip: string[];
    conflicts: ConflictResolution[];
  }> {
    const willRestore: string[] = [];
    const willSkip: string[] = [];
    const conflicts: ConflictResolution[] = [];

    let data = backup.data;
    if (backup.encrypted && this.options.decryptionKey) {
      data = await this.decryptData(backup.data, this.options.decryptionKey);
    }

    for (const [key, value] of Object.entries(data)) {
      const existingValue = await this.storage.get(key);

      if (existingValue === undefined) {
        willRestore.push(key);
      } else if (existingValue === value) {
        willSkip.push(key);
      } else {
        conflicts.push({
          key,
          existingValue,
          backupValue: value,
          resolution: this.options.overwriteExisting
            ? "use_backup"
            : "keep_existing",
        });

        if (this.options.overwriteExisting) {
          willRestore.push(key);
        } else {
          willSkip.push(key);
        }
      }
    }

    return { willRestore, willSkip, conflicts };
  }

  /**
   * Validate backup integrity
   */
  async validateBackup(backup: BackupData): Promise<boolean> {
    if (!backup.metadata || !backup.data) {
      return false;
    }

    // Check version compatibility
    const [major] = backup.metadata.version.split(".");
    if (parseInt(major) > 1) {
      // Future version - may not be compatible
      return false;
    }

    // Verify data hash if not encrypted
    if (!backup.encrypted && backup.metadata.dataHash) {
      const dataString = JSON.stringify(backup.data);
      const computedHash = await this.hashData(dataString);
      return computedHash === backup.metadata.dataHash;
    }

    return true;
  }

  /**
   * Determine if an item should be restored based on options
   */
  private async shouldRestoreItem(
    key: string,
    value: string,
  ): Promise<boolean> {
    const existingValue = await this.storage.get(key);

    // No existing value - always restore
    if (existingValue === undefined) {
      return true;
    }

    // Same value - skip
    if (existingValue === value) {
      return false;
    }

    // Apply merge strategy
    switch (this.options.mergeStrategy) {
      case "overwrite":
        return true;
      case "skip":
        return false;
      case "newer":
        // For 'newer', we'd need timestamps - default to overwrite
        return this.options.overwriteExisting ?? true;
      default:
        return this.options.overwriteExisting ?? true;
    }
  }

  /**
   * Decrypt backup data
   */
  private async decryptData(
    encryptedData: Record<string, string>,
    key: Uint8Array,
  ): Promise<Record<string, string>> {
    const encrypted = encryptedData.encrypted;
    if (!encrypted) {
      throw new Error("No encrypted data found");
    }

    const decrypted = await this.aesDecrypt(encrypted, key);
    return JSON.parse(decrypted);
  }

  /**
   * AES-GCM Decryption
   */
  private async aesDecrypt(data: string, key: Uint8Array): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error("Crypto API not available");
    }

    const decoded = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

    // Extract IV (first 12 bytes)
    if (decoded.length < 12) {
      throw new Error("Invalid encrypted data (too short)");
    }
    const iv = decoded.slice(0, 12);
    const encryptedContent = decoded.slice(12);

    // Hash key to ensure 32 bytes (256-bit AES)
    const keyHash = await crypto.subtle.digest(
      "SHA-256",
      key as unknown as BufferSource,
    );
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyHash,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      cryptoKey,
      encryptedContent,
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * Hash data for integrity verification
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    if (typeof crypto !== "undefined" && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Fallback: simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Utility to migrate data between backup versions
 */
export class BackupMigrator {
  /**
   * Migrate backup data from an older version to the current version
   */
  static migrate(backup: BackupData, targetVersion: string): BackupData {
    const [sourceMajor, sourceMinor] = backup.metadata.version
      .split(".")
      .map(Number);
    const [targetMajor, targetMinor] = targetVersion.split(".").map(Number);

    // No migration needed if same version
    if (sourceMajor === targetMajor && sourceMinor === targetMinor) {
      return backup;
    }

    let migratedData = { ...backup.data };

    // Apply migrations based on version
    if (sourceMajor === 0) {
      // Migrate from v0.x to v1.x
      migratedData = this.migrateV0ToV1(migratedData);
    }

    return {
      metadata: {
        ...backup.metadata,
        version: targetVersion,
      },
      data: migratedData,
      encrypted: backup.encrypted,
    };
  }

  /**
   * Migrate v0.x data format to v1.x
   */
  private static migrateV0ToV1(
    data: Record<string, string>,
  ): Record<string, string> {
    const migrated: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      // Rename old keys to new format
      let newKey = key;

      // Example migrations
      if (key.startsWith("msg_")) {
        newKey = key.replace("msg_", "message_");
      }
      if (key.startsWith("cfg_")) {
        newKey = key.replace("cfg_", "config_");
      }

      migrated[newKey] = value;
    }

    return migrated;
  }
}
