import { useState } from 'react';
import { useMeshNetwork } from '../hooks/useMeshNetwork';

export function SettingsPanel() {
  const { status } = useMeshNetwork();
  const [displayName, setDisplayName] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [showBackupDialog, setShowBackupDialog] = useState(false);

  const handleExportIdentity = () => {
    if (!backupPassword) {
      alert('Please enter a password for encryption');
      return;
    }

    // Export identity with encryption - placeholder implementation
    alert('Identity export functionality coming soon');

    setShowBackupDialog(false);
    setBackupPassword('');
  };

  const handleImportIdentity = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        JSON.parse(e.target?.result as string);
        // TODO: Decrypt and restore identity
        alert('Identity import functionality coming soon');
      } catch (error) {
        alert('Failed to import identity');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Identity</h3>
        <div className="form-group">
          <label>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your display name"
          />
        </div>

        <div className="identity-info">
          <div className="info-item">
            <label>Peer ID</label>
            <div className="mono-text">{status.localPeerId || 'Not connected'}</div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3>Backup & Restore</h3>
        <div className="button-group">
          <button onClick={() => setShowBackupDialog(true)} className="secondary-btn">
            Export Identity
          </button>
          <label className="file-input-label">
            Import Identity
            <input
              type="file"
              accept=".json"
              onChange={handleImportIdentity}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Network</h3>
        <div className="setting-item">
          <label>
            <input type="checkbox" defaultChecked />
            Enable WebRTC Connections
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input type="checkbox" defaultChecked />
            Enable mDNS Discovery
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input type="checkbox" defaultChecked />
            Auto-connect to Discovered Peers
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="setting-item">
          <label>Theme</label>
          <select defaultValue="dark">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto</option>
          </select>
        </div>
      </section>

      {showBackupDialog && (
        <div className="dialog-overlay" onClick={() => setShowBackupDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Export Identity</h3>
            <p>Enter a password to encrypt your identity backup</p>
            <div className="form-group">
              <label>Encryption Password</label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Enter a strong password"
                autoFocus
              />
            </div>
            <div className="dialog-actions">
              <button onClick={() => setShowBackupDialog(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={handleExportIdentity} className="primary-btn">
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
