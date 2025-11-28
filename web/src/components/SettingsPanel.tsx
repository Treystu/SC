import { useState, useEffect } from 'react';
import { useMeshNetwork } from '../hooks/useMeshNetwork';
import { getDatabase } from '../storage/database';
import { BackupManager } from './BackupManager';
import { ProfileManager, UserProfile } from '../managers/ProfileManager';

export function SettingsPanel() {
  const { status } = useMeshNetwork();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, percentage: 0 });
  const [networkSettings, setNetworkSettings] = useState({
    webrtc: true,
    mdns: true,
    autoconnect: true,
  });
  const [appearanceSettings, setAppearanceSettings] = useState({
    theme: 'dark',
  });

  useEffect(() => {
    // Load settings from local storage
    const storedNetwork = localStorage.getItem('networkSettings');
    if (storedNetwork) {
      setNetworkSettings(JSON.parse(storedNetwork));
    }
    const storedAppearance = localStorage.getItem('appearanceSettings');
    if (storedAppearance) {
      setAppearanceSettings(JSON.parse(storedAppearance));
    }


    const profileManager = new ProfileManager();
    profileManager.getProfile().then(p => {
      setProfile(p);
      setDisplayName(p.displayName);
    });

    // Get storage usage
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percentage = quota > 0 ? (usage / quota) * 100 : 0;
        setStorageInfo({ usage, quota, percentage });
      });
    }
  }, []);

  const handleSaveProfile = async () => {
    const profileManager = new ProfileManager();
    try {
      await profileManager.updateProfile({ displayName });
      alert('Profile updated successfully!');
    } catch (error) {
      alert(`Failed to update profile: ${error}`);
    }
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirmation !== 'DELETE ALL MY DATA') {
      alert('Please type the exact phrase to confirm deletion');
      return;
    }

    try {
      const db = getDatabase();
      await db.deleteAllData(deleteConfirmation);

      // Clear all browser storage
      localStorage.clear();
      sessionStorage.clear();

      alert('All local data has been permanently deleted. The application will now reload.');
      setShowDeleteDialog(false);
      setDeleteConfirmation('');

      // Force reload to clear memory state
      window.location.reload();
    } catch (error) {
      alert(`Failed to delete data: ${error}`);
    }
  };

  const handleNetworkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setNetworkSettings(prev => {
      const newSettings = { ...prev, [name]: checked };
      localStorage.setItem('networkSettings', JSON.stringify(newSettings));
      return newSettings;
    });
  };

  const handleAppearanceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAppearanceSettings(prev => {
      const newSettings = { ...prev, [name]: value };
      localStorage.setItem('appearanceSettings', JSON.stringify(newSettings));
      return newSettings;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appearanceSettings.theme);
  }, [appearanceSettings.theme]);

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
          <button onClick={handleSaveProfile}>Save</button>
        </div>

        <div className="identity-info">
          <div className="info-item">
            <label>Peer ID</label>
            <div className="mono-text">{status.localPeerId || 'Not connected'}</div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <BackupManager />

        <div className="danger-zone">
          <h4>⚠️ Danger Zone</h4>
          <p>Delete all local data permanently. This action cannot be undone.</p>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="danger-btn"
          >
            Delete All Local Data
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Network</h3>
        <div className="setting-item">
          <label>
            <input type="checkbox" name="webrtc" checked={networkSettings.webrtc} onChange={handleNetworkChange} />
            Enable WebRTC Connections
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input type="checkbox" name="mdns" checked={networkSettings.mdns} onChange={handleNetworkChange} />
            Enable mDNS Discovery
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input type="checkbox" name="autoconnect" checked={networkSettings.autoconnect} onChange={handleNetworkChange} />
            Auto-connect to Discovered Peers
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="setting-item">
          <label>Theme</label>
          <select name="theme" value={appearanceSettings.theme} onChange={handleAppearanceChange}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto</option>
          </select>
        </div>
      </section>

      {showDeleteDialog && (
        <div className="dialog-overlay" onClick={() => setShowDeleteDialog(false)}>
          <div className="dialog delete-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Delete All Data</h3>
            <p>
              This will <strong>permanently delete</strong> all your local data including:
            </p>
            <ul>
              <li>Your identity and private keys</li>
              <li>All contacts and conversations</li>
              <li>All messages and files</li>
              <li>Network settings and preferences</li>
            </ul>
            <p className="warning-text">
              <strong>This action cannot be undone!</strong> Make sure you've exported your data first.
            </p>
            <div className="form-group">
              <label>Type "DELETE ALL MY DATA" to confirm:</label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE ALL MY DATA"
                autoFocus
              />
            </div>
            <div className="dialog-actions">
              <button onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmation('');
              }} className="cancel-btn">
                Cancel
              </button>
              <button
                onClick={handleDeleteAllData}
                className="danger-btn"
                disabled={deleteConfirmation !== 'DELETE ALL MY DATA'}
              >
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
