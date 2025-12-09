/**
 * Backup Module
 * 
 * Provides backup and restore functionality for Sovereign Communications app.
 */

export { 
  BackupManager, 
  BackupScheduler,
  type BackupData,
  type BackupMetadata,
  type BackupOptions,
} from './backup.js';

export {
  RestoreManager,
  BackupMigrator,
  type RestoreOptions,
  type RestoreResult,
  type ConflictResolution,
} from './restore.js';
