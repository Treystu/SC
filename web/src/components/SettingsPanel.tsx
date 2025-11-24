import { useState, useEffect } from 'react';
import { useMeshNetwork } from '../hooks/useMeshNetwork';
import { getDatabase } from '../storage/database';

export function SettingsPanel() {
  const { status } = useMeshNetwork();
  const [displayName, setDisplayName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, percentage: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
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

  const handleExportAllData = async () => {
    setIsExporting(true);
    try {
      const db = getDatabase();
      const data = await db.exportAllData();
      
      // Convert to JSON and create download
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `sovereign-communications-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('Data exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const db = getDatabase();
        
        const result = await db.importData(data, { mergeStrategy: 'merge' });
        
        if (result.errors.length > 0) {
          alert(`Import completed with errors:\nImported: ${result.imported}\nSkipped: ${result.skipped}\nErrors: ${result.errors.length}\n\nFirst error: ${result.errors[0]}`);
        } else {
          alert(`Import successful!\nImported: ${result.imported} items\nSkipped: ${result.skipped} items`);
        }
        
        // Refresh storage info
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          const usage = estimate.usage || 0;
          const quota = estimate.quota || 0;
          const percentage = quota > 0 ? (usage / quota) * 100 : 0;
          setStorageInfo({ usage, quota, percentage });
        }
      } catch (error) {
        console.error('Import failed:', error);
        alert(`Failed to import data: ${error}`);
      } finally {
        setIsImporting(false);
      }
    };
    
    reader.onerror = () => {
      alert('Failed to read file');
      setIsImporting(false);
    };
    
    reader.readAsText(file);
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirmation !== 'DELETE ALL MY DATA') {
      alert('Please type the exact phrase to confirm deletion');
      return;
    }

    try {
      const db = getDatabase();
      await db.deleteAllData(deleteConfirmation);
      
      alert('All local data has been permanently deleted.');
      setShowDeleteDialog(false);
      setDeleteConfirmation('');
      
      // Refresh storage info
      setStorageInfo({ usage: 0, quota: storageInfo.quota, percentage: 0 });
      
      // Optionally reload the page
      if (window.confirm('Data deleted. Reload the page?')) {
        window.location.reload();
      }
    } catch (error) {
      alert(`Failed to delete data: ${error}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
        <h3>Data Sovereignty</h3>
        <p className="sovereignty-notice">
          Your data is stored <strong>locally on this device only</strong>. No servers, no tracking, complete control.
        </p>
        
        <div className="storage-info">
          <div className="info-item">
            <label>Storage Used</label>
            <div>{formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}</div>
            <div className="storage-bar">
              <div 
                className="storage-bar-fill" 
                style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="button-group">
          <button 
            onClick={handleExportAllData} 
            className="secondary-btn"
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export All Data'}
          </button>
          <label className="file-input-label">
            {isImporting ? 'Importing...' : 'Import Data'}
            <input
              type="file"
              accept=".json"
              onChange={handleImportData}
              style={{ display: 'none' }}
              disabled={isImporting}
            />
          </label>
        </div>
        
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
