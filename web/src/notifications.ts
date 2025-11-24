export class WebNotificationManager {
  private permission: NotificationPermission = 'default';

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support desktop notifications');
      return false;
    }

    this.permission = await Notification.requestPermission();
    return this.permission === 'granted';
  }

  async showMessageNotification(senderName: string, messageText: string, conversationId: string) {
    if (this.permission !== 'granted') {
      return;
    }

    // Don't show notification if window is focused
    if (document.hasFocus()) {
      return;
    }

    const notification = new Notification(`New message from ${senderName}`, {
      body: messageText.substring(0, 100),
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: conversationId,
      requireInteraction: false
    });

    notification.onclick = () => {
      window.focus();
      // Navigate to conversation
      window.location.hash = `#/chat/${conversationId}`;
      notification.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }

  async showConnectionNotification(peerName: string, connected: boolean) {
    if (this.permission !== 'granted') {
      return;
    }

    new Notification(
      connected ? 'Peer Connected' : 'Peer Disconnected',
      {
        body: peerName,
        icon: '/icon-192.png',
        tag: 'connection-status'
      }
    );
  }

  async showFileTransferNotification(fileName: string, senderName: string) {
    if (this.permission !== 'granted') {
      return;
    }

    new Notification(`File from ${senderName}`, {
      body: fileName,
      icon: '/icon-192.png',
      tag: 'file-transfer'
    });
  }
}

// Singleton instance
export const notificationManager = new WebNotificationManager();
