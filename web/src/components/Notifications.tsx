import React, { useState, useEffect } from 'react';

interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  mobile: boolean;
  doNotDisturb: boolean;
  dndStart: string;
  dndEnd: string;
  perConversation: Map<string, boolean>;
}

export const Notifications: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    sound: true,
    desktop: true,
    mobile: true,
    doNotDisturb: false,
    dndStart: '22:00',
    dndEnd: '07:00',
    perConversation: new Map()
  });

  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
    }
  };

  const showNotification = (title: string, body: string, conversationId: string) => {
    if (!settings.enabled || permission !== 'granted') return;
    
    if (settings.doNotDisturb && isInDNDPeriod()) return;
    
    if (settings.perConversation.get(conversationId) === false) return;

    const notification = new Notification(title, {
      body,
      icon: '/icon.png',
      badge: '/badge.png',
      tag: conversationId,
      requireInteraction: false,
      silent: !settings.sound
    });

    notification.onclick = () => {
      window.focus();
      window.location.hash = `#/conversation/${conversationId}`;
      notification.close();
    };
  };

  const isInDNDPeriod = (): boolean => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return currentTime >= settings.dndStart && currentTime < settings.dndEnd;
  };

  return (
    <div className="notifications-settings">
      <h2>Notification Settings</h2>
      
      {permission === 'default' && (
        <button onClick={requestPermission}>
          Enable Notifications
        </button>
      )}

      {permission === 'denied' && (
        <p className="warning">
          Notifications are blocked. Please enable them in your browser settings.
        </p>
      )}

      {permission === 'granted' && (
        <>
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({...settings, enabled: e.target.checked})}
            />
            Enable notifications
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => setSettings({...settings, sound: e.target.checked})}
            />
            Play sound
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.doNotDisturb}
              onChange={(e) => setSettings({...settings, doNotDisturb: e.target.checked})}
            />
            Do Not Disturb
          </label>

          {settings.doNotDisturb && (
            <div className="dnd-schedule">
              <label>
                From:
                <input
                  type="time"
                  value={settings.dndStart}
                  onChange={(e) => setSettings({...settings, dndStart: e.target.value})}
                />
              </label>
              <label>
                To:
                <input
                  type="time"
                  value={settings.dndEnd}
                  onChange={(e) => setSettings({...settings, dndEnd: e.target.value})}
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const useNotifications = () => {
  const showNotification = (title: string, body: string, conversationId: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icon.png',
        tag: conversationId,
        silent: false
      });
    }
  };

  return { showNotification };
};
