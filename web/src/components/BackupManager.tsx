import React, { useState } from "react";
import { useBackup } from "../hooks/useBackup";

export const BackupManager: React.FC = () => {
  const [password, setPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includeContacts, setIncludeContacts] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [encrypt, setEncrypt] = useState(true);

  const {
    createBackup,
    restoreBackup,
    isProcessing,
    status,
    error,
    clearStatus,
  } = useBackup();

  const handleCreateBackup = async () => {
    await createBackup({
      includeMessages,
      includeContacts,
      includeSettings,
      encrypt,
      password: encrypt ? password : undefined,
    });
  };

  const handleRestoreBackup = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = await restoreBackup(file, restorePassword);

    if (result && result.success) {
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }

    // Clear input
    event.target.value = "";
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

        <button
          onClick={handleCreateBackup}
          disabled={isProcessing || (encrypt && !password)}
        >
          {isProcessing ? "Creating..." : "Create Backup"}
        </button>
      </div>

      {/* Restore Backup Section */}
      <div className="section">
        <h3>Restore Backup</h3>

        <div className="password-field">
          <input
            type="password"
            placeholder="Backup password (if encrypted)"
            value={restorePassword}
            onChange={(e) => setRestorePassword(e.target.value)}
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
      {(status || error) && (
        <div className={`status ${error ? "error" : "success"}`}>
          {error || status}
          {error && (
            <button className="close-status" onClick={clearStatus}>
              ×
            </button>
          )}
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
          display: flex;
          justify-content: space-between;
          align-items: center;
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
        
        .close-status {
          background: none;
          border: none;
          color: inherit;
          width: auto;
          padding: 0 5px;
          font-size: 20px;
        }
        .close-status:hover {
          background: none;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
};
