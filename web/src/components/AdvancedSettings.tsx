import React, { useState, useEffect } from 'react';

interface PrivacySettings {
  readReceipts: boolean;
  typingIndicators: boolean;
  lastSeen: boolean;
  profilePhoto: boolean;
  autoDownloadMedia: boolean;
  messagePreview: boolean;
}

interface SecuritySettings {
  screenLock: boolean;
  fingerprintAuth: boolean;
  sessionTimeout: number;
  requireAuthForBackup: boolean;
}

export const AdvancedSettings: React.FC = () => {
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    readReceipts: true,
    typingIndicators: true,
    lastSeen: true,
    profilePhoto: true,
    autoDownloadMedia: true,
    messagePreview: true,
  });

  const [security, setSecurity] = useState<SecuritySettings>({
    screenLock: false,
    fingerprintAuth: false,
    sessionTimeout: 30,
    requireAuthForBackup: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedPrivacy = localStorage.getItem('privacy_settings');
    const savedSecurity = localStorage.getItem('security_settings');
    
    if (savedPrivacy) setPrivacy(JSON.parse(savedPrivacy));
    if (savedSecurity) setSecurity(JSON.parse(savedSecurity));
  };

  const saveSettings = () => {
    localStorage.setItem('privacy_settings', JSON.stringify(privacy));
    localStorage.setItem('security_settings', JSON.stringify(security));
  };

  const updatePrivacy = (key: keyof PrivacySettings, value: boolean) => {
    const updated = { ...privacy, [key]: value };
    setPrivacy(updated);
    localStorage.setItem('privacy_settings', JSON.stringify(updated));
  };

  const updateSecurity = (key: keyof SecuritySettings, value: boolean | number) => {
    const updated = { ...security, [key]: value };
    setSecurity(updated);
    localStorage.setItem('security_settings', JSON.stringify(updated));
  };

  return (
    <div className="advanced-settings">
      <h2>Advanced Settings</h2>
      
      <section className="settings-section">
        <h3>Privacy Controls</h3>
        
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={privacy.readReceipts}
              onChange={(e) => updatePrivacy('readReceipts', e.target.checked)}
            />
            Send Read Receipts
          </label>
          <p className="setting-description">
            Let others know when you've read their messages
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={privacy.typingIndicators}
              onChange={(e) => updatePrivacy('typingIndicators', e.target.checked)}
            />
            Show Typing Indicators
          </label>
          <p className="setting-description">
            Let others see when you're typing
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={privacy.lastSeen}
              onChange={(e) => updatePrivacy('lastSeen', e.target.checked)}
            />
            Show Last Seen
          </label>
          <p className="setting-description">
            Display when you were last active
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={privacy.profilePhoto}
              onChange={(e) => updatePrivacy('profilePhoto', e.target.checked)}
            />
            Show Profile Photo
          </label>
          <p className="setting-description">
            Make your profile photo visible to contacts
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={privacy.autoDownloadMedia}
              onChange={(e) => updatePrivacy('autoDownloadMedia', e.target.checked)}
            />
            Auto-Download Media
          </label>
          <p className="setting-description">
            Automatically download images and files
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={privacy.messagePreview}
              onChange={(e) => updatePrivacy('messagePreview', e.target.checked)}
            />
            Message Preview in Notifications
          </label>
          <p className="setting-description">
            Show message content in notification previews
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h3>Security Settings</h3>
        
        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={security.screenLock}
              onChange={(e) => updateSecurity('screenLock', e.target.checked)}
            />
            Enable Screen Lock
          </label>
          <p className="setting-description">
            Require authentication to access the app
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={security.fingerprintAuth}
              onChange={(e) => updateSecurity('fingerprintAuth', e.target.checked)}
            />
            Fingerprint Authentication
          </label>
          <p className="setting-description">
            Use biometric authentication when available
          </p>
        </div>

        <div className="setting-item">
          <label>
            Session Timeout (minutes)
            <input
              type="number"
              min="5"
              max="120"
              value={security.sessionTimeout}
              onChange={(e) => updateSecurity('sessionTimeout', parseInt(e.target.value))}
            />
          </label>
          <p className="setting-description">
            Automatically lock after inactivity
          </p>
        </div>

        <div className="setting-item">
          <label>
            <input
              type="checkbox"
              checked={security.requireAuthForBackup}
              onChange={(e) => updateSecurity('requireAuthForBackup', e.target.checked)}
            />
            Require Authentication for Backup
          </label>
          <p className="setting-description">
            Additional security for backup operations
          </p>
        </div>
      </section>

      <div className="settings-actions">
        <button onClick={saveSettings} className="save-button">
          Save All Settings
        </button>
      </div>

      <style>{`
        .advanced-settings {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .settings-section {
          margin-bottom: 30px;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
        }

        .settings-section h3 {
          margin-top: 0;
          margin-bottom: 20px;
          color: #333;
        }

        .setting-item {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #ddd;
        }

        .setting-item:last-child {
          border-bottom: none;
        }

        .setting-item label {
          display: flex;
          align-items: center;
          font-weight: 500;
          cursor: pointer;
        }

        .setting-item input[type="checkbox"] {
          margin-right: 10px;
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .setting-item input[type="number"] {
          margin-left: 10px;
          padding: 5px 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          width: 80px;
        }

        .setting-description {
          margin: 5px 0 0 28px;
          font-size: 14px;
          color: #666;
        }

        .settings-actions {
          margin-top: 30px;
          text-align: center;
        }

        .save-button {
          padding: 12px 30px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .save-button:hover {
          background: #0056b3;
        }
      `}</style>
    </div>
  );
};
