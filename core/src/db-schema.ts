/**
 * Database Schema - IndexedDB schema definitions
 * Task 183: Database schema and migration system
 */

export const DB_NAME = 'SovereignCommunications';
export const DB_VERSION = 1;

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'voice' | 'video';
  encrypted: boolean;
  signature?: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyToId?: string;
  reactions?: Array<{ userId: string; emoji: string }>;
}

export interface Contact {
  id: string;
  publicKey: string;
  name?: string;
  avatar?: string;
  lastSeen?: number;
  addedAt: number;
  verified: boolean;
  blocked: boolean;
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  participantIds: string[];
  name?: string;
  avatar?: string;
  lastMessageId?: string;
  lastMessageTime?: number;
  unreadCount: number;
  muted: boolean;
  archived: boolean;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface Peer {
  id: string;
  publicKey: string;
  lastSeen: number;
  connected: boolean;
  connectionType: 'webrtc' | 'ble' | 'wifi';
  signalStrength?: number;
  latency?: number;
  metadata?: Record<string, any>;
}

export interface FileMetadata {
  id: string;
  messageId: string;
  name: string;
  size: number;
  mimeType: string;
  hash: string;
  encryptionKey?: string;
  thumbnail?: string;
  uploadedAt: number;
  status: 'uploading' | 'uploaded' | 'downloading' | 'downloaded' | 'failed';
}

export interface Settings {
  id: 'user_settings';
  theme: 'light' | 'dark' | 'system';
  notifications: {
    enabled: boolean;
    sound: boolean;
    vibrate: boolean;
    showPreviews: boolean;
  };
  privacy: {
    readReceipts: boolean;
    typingIndicators: boolean;
    lastSeen: boolean;
  };
  media: {
    autoDownload: boolean;
    downloadOnWifi: boolean;
    maxFileSize: number;
  };
  network: {
    enableWebRTC: boolean;
    enableBLE: boolean;
    maxPeers: number;
  };
}

export interface KeyPair {
  id: 'identity_keypair';
  publicKey: string;
  privateKey: string;
  createdAt: number;
}

export const STORE_CONFIGS = {
  messages: {
    keyPath: 'id',
    indexes: [
      { name: 'conversationId', keyPath: 'conversationId' },
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'senderId', keyPath: 'senderId' },
      { name: 'status', keyPath: 'status' }
    ]
  },
  contacts: {
    keyPath: 'id',
    indexes: [
      { name: 'publicKey', keyPath: 'publicKey', unique: true },
      { name: 'addedAt', keyPath: 'addedAt' }
    ]
  },
  conversations: {
    keyPath: 'id',
    indexes: [
      { name: 'lastMessageTime', keyPath: 'lastMessageTime' },
      { name: 'type', keyPath: 'type' }
    ]
  },
  peers: {
    keyPath: 'id',
    indexes: [
      { name: 'publicKey', keyPath: 'publicKey', unique: true },
      { name: 'lastSeen', keyPath: 'lastSeen' },
      { name: 'connected', keyPath: 'connected' }
    ]
  },
  files: {
    keyPath: 'id',
    indexes: [
      { name: 'messageId', keyPath: 'messageId' },
      { name: 'hash', keyPath: 'hash' }
    ]
  },
  settings: {
    keyPath: 'id'
  },
  keypair: {
    keyPath: 'id'
  }
};

/**
 * Initialize database with schema
 */
export function initializeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      Object.entries(STORE_CONFIGS).forEach(([storeName, config]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: config.keyPath
          });

          // Create indexes
          if ('indexes' in config && config.indexes) {
            config.indexes.forEach(index => {
              store.createIndex(index.name, index.keyPath, {
                unique: index.unique || false
              });
            });
          }
        }
      });
    };
  });
}

/**
 * Clear all data from database
 */
export async function clearDatabase(): Promise<void> {
  const db = await initializeDatabase();
  const transaction = db.transaction(
    Array.from(db.objectStoreNames),
    'readwrite'
  );

  Array.from(db.objectStoreNames).forEach(storeName => {
    transaction.objectStore(storeName).clear();
  });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get database size estimate
 */
export async function getDatabaseSize(): Promise<{
  usage: number;
  quota: number;
  percentage: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;

    return { usage, quota, percentage };
  }

  return { usage: 0, quota: 0, percentage: 0 };
}
