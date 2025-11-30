import { useState, useCallback } from "react";
import { getDatabase } from "../storage/database";
import {
  encryptData,
  decryptData,
  EncryptedBackup,
} from "../utils/backupCrypto";

export interface BackupOptions {
  includeMessages: boolean;
  includeContacts: boolean;
  includeSettings: boolean;
  encrypt: boolean;
  password?: string;
}

export interface RestoreResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

export function useBackup() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const createBackup = useCallback(async (options: BackupOptions) => {
    setIsProcessing(true);
    setStatus("Creating backup...");
    setError(null);

    try {
      const db = getDatabase();
      const data = await db.exportAllData({
        includeMessages: options.includeMessages,
        includeContacts: options.includeContacts,
        includeSettings: options.includeSettings,
      });

      let outputData: any = data;

      if (options.encrypt) {
        if (!options.password) {
          throw new Error("Password is required for encrypted backup");
        }
        outputData = await encryptData(JSON.stringify(data), options.password);
      }

      const backupJson = JSON.stringify(outputData, null, 2);

      // Trigger download
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `sovereign-backup-${timestamp}.json`;
      const blob = new Blob([backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStatus("Backup created successfully!");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setStatus("Backup failed");
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const restoreBackup = useCallback(
    async (file: File, password?: string): Promise<RestoreResult | null> => {
      setIsProcessing(true);
      setStatus("Reading backup file...");
      setError(null);

      try {
        const text = await file.text();
        let backupData: any = JSON.parse(text);

        if (backupData.isEncrypted) {
          if (!password) {
            throw new Error(
              "This backup is encrypted. Please provide a password.",
            );
          }
          setStatus("Decrypting backup...");
          const decryptedJson = await decryptData(
            backupData as EncryptedBackup,
            password,
          );
          backupData = JSON.parse(decryptedJson);
        }

        setStatus("Restoring data...");
        const db = getDatabase();
        const result = await db.importData(backupData);

        if (result.errors.length > 0) {
          setStatus(`Restored with ${result.errors.length} errors.`);
        } else {
          setStatus("Restore completed successfully!");
        }

        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setStatus("Restore failed");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return {
    createBackup,
    restoreBackup,
    isProcessing,
    status,
    error,
    clearStatus: () => {
      setStatus("");
      setError(null);
    },
  };
}
