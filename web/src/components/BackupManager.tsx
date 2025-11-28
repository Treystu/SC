import React, { useState } from 'react';
import { getDatabase } from '../storage/database';

export const BackupManager: React.FC = () => {
  const [password, setPassword] = useState('');
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includeContacts, setIncludeContacts] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);


  // Crypto helpers
  const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as any,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };

  const encryptData = async (data: string, password: string): Promise<{ ciphertext: string; salt: string; iv: string }> => {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(data)
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv))
    };
  };

  const decryptData = async (encryptedData: { ciphertext: string; salt: string; iv: string }, password: string): Promise<string> => {
    const salt = new Uint8Array(atob(encryptedData.salt).split('').map(c => c.charCodeAt(0)));
    const iv = new Uint8Array(atob(encryptedData.iv).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(encryptedData.ciphertext).split('').map(c => c.charCodeAt(0)));
    const key = await deriveKey(password, salt);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  };

  const handleCreateBackup = async () => {
    setIsProcessing(true);
    setStatus('Creating backup...');

    try {
      const db = getDatabase();
      const data = await db.exportAllData();
      let outputData: any = data;

      if (encrypt && password) {
        const jsonString = JSON.stringify(data);
        const encrypted = await encryptData(jsonString, password);
        outputData = {
          isEncrypted: true,
          version: '1.0',
          ...encrypted
        };
      } else if (encrypt && !password) {
        throw new Error('Password is required for encrypted backup');
      }

      const backupJson = JSON.stringify(outputData, null, 2);

      // Download backup file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `sovereign-backup-${timestamp}.json`;

      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStatus('Backup created successfully!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error creating backup: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatus('Restoring backup...');

    try {
      const backupText = await file.text();
      let backupData = JSON.parse(backupText);

      if (backupData.isEncrypted) {
        if (!password) {
          throw new Error('This backup is encrypted. Please enter the password.');
        }
        try {
          const decryptedJson = await decryptData(backupData, password);
          backupData = JSON.parse(decryptedJson);
        } catch (e) {
          throw new Error('Incorrect password or corrupted backup file.');
        }
      }

      const db = getDatabase();
      const result = await db.importData(backupData);

      if (result.errors.length > 0) {
        setStatus(`Backup restored with ${result.errors.length} errors. Imported: ${result.imported}, Skipped: ${result.skipped}`);
        console.error('Import errors:', result.errors);
      } else {
        setStatus(`Backup restored successfully! Imported: ${result.imported}, Skipped: ${result.skipped}. Please reload the app.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error restoring backup: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      // Clear the file input
      event.target.value = '';
    }
  };



  return (
    <div className="backup-restore">
      <h2>Backup & Restore</h2>

      {/* Create Backup Section */}
      <div className="section">
        <h3>Create Backup</h3>

        <div className="options">
          <label>
            <input
              type="checkbox"
              checked={includeMessages}
              onChange={(e) => setIncludeMessages(e.target.checked)}
              disabled={isProcessing}
            />
            Include Messages
          </label>

          <label>
            <input
              type="checkbox"
              checked={includeContacts}
              onChange={(e) => setIncludeContacts(e.target.checked)}
              disabled={isProcessing}
            />
            Include Contacts
          </label>

          <label>
            <input
              type="checkbox"
              checked={includeSettings}
              onChange={(e) => setIncludeSettings(e.target.checked)}
              disabled={isProcessing}
            />
            Include Settings
          </label>

          <label>
            <input
              type="checkbox"
              checked={encrypt}
              onChange={(e) => setEncrypt(e.target.checked)}
              disabled={isProcessing}
            />
            Encrypt Backup
          </label>
        </div>

        {encrypt && (
          <div className="password-field">
            <input
              type="password"
              placeholder="Backup password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isProcessing}
            />
            <small>Choose a strong password to encrypt your backup</small>
          </div>
        )}

        <button onClick={handleCreateBackup} disabled={isProcessing}>
          {isProcessing ? 'Creating...' : 'Create Backup'}
        </button>
      </div>

      {/* Restore Backup Section */}
      <div className="section">
        <h3>Restore Backup</h3>

        <div className="password-field">
          <input
            type="password"
            placeholder="Backup password (if encrypted)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isProcessing}
          />
        </div>

        <div className="file-input">
          <input
            type="file"
            accept=".json"
            onChange={handleRestoreBackup}
            disabled={isProcessing}
          />
        </div>

        <div className="warning">
          ⚠️ Warning: Restoring a backup will replace all current data
        </div>
      </div>



      {/* Status Message */}
      {status && (
        <div className={`status ${status.includes('Error') ? 'error' : 'success'}`}>
          {status}
        </div>
      )}

      <style>{`
        .backup-restore {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }

        .section {
          background: #2a2a2a;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .danger-zone {
          border: 1px solid #ff4444;
          background: #2a0000;
        }

        h2 {
          margin-bottom: 20px;
          color: #00ff88;
        }

        h3 {
          margin-bottom: 15px;
          color: #fff;
        }

        .options {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 15px;
        }

        .options label {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #ccc;
          cursor: pointer;
        }

        .options input[type="checkbox"] {
          cursor: pointer;
        }

        .password-field {
          margin-bottom: 15px;
        }

        .password-field input {
          width: 100%;
          padding: 10px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #1a1a1a;
          color: #fff;
          font-size: 14px;
        }

        .password-field small {
          display: block;
          margin-top: 5px;
          color: #888;
          font-size: 12px;
        }

        .file-input {
          margin-bottom: 15px;
        }

        .file-input input {
          width: 100%;
          padding: 10px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #1a1a1a;
          color: #fff;
        }

        button {
          width: 100%;
          padding: 12px;
          background: #00ff88;
          color: #000;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        button:hover:not(:disabled) {
          background: #00cc6a;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .danger-button {
          background: #ff4444;
          color: white;
        }

        .danger-button:hover {
          background: #cc0000;
        }

        .warning {
          padding: 10px;
          background: #ff6b001a;
          border: 1px solid #ff6b00;
          border-radius: 4px;
          color: #ff6b00;
          font-size: 14px;
          margin-top: 10px;
        }

        .status {
          padding: 15px;
          border-radius: 4px;
          margin-top: 20px;
          font-size: 14px;
        }

        .status.success {
          background: #00ff881a;
          border: 1px solid #00ff88;
          color: #00ff88;
        }

        .status.error {
          background: #ff00001a;
          border: 1px solid #ff0000;
          color: #ff0000;
        }
      `}</style>
    </div>
  );
};
