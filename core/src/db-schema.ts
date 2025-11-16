/**
 * Database Schema - IndexedDB schema definitions
 * Task 183: Database schema and migration system
 */

export const DB_NAME = 'SovereignCommunications';
export const DB_VERSION = 2; // Incremented for V1 persistence stores

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

/**
 * Identity - User's cryptographic identity
 * For sovereignty: can have multiple identities, one is primary
 */
export interface Identity {
  id: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array; // Will be encrypted at rest
  fingerprint: string; // SHA-256 hash of public key
  createdAt: number;
  label?: string; // Human-readable label
  isPrimary: boolean; // Only one can be primary
}

/**
 * PersistedPeer - Extended peer info for persistence
 * Includes reputation and mesh routing metadata
 */
export interface PersistedPeer {
  id: string;
  publicKey: string;
  transportType: 'webrtc' | 'ble' | 'wifi';
  lastSeen: number;
  connectedAt: number;
  connectionQuality: number; // 0-100
  bytesSent: number;
  bytesReceived: number;
  reputation: number; // 0-100, affects routing decisions
  isBlacklisted: boolean;
  blacklistedUntil?: number; // Unix timestamp
  metadata?: Record<string, any>;
}

/**
 * Route - Mesh routing table entry
 * Used to warm-start routing on app reload
 */
export interface Route {
  destinationId: string; // Peer ID we're routing to
  nextHopId: string; // Next peer in the path
  cost: number; // Routing cost (lower is better)
  lastUpdated: number; // Unix timestamp
  ttl: number; // Seconds until route expires
  metrics?: {
    latency: number; // Average latency in ms
    successRate: number; // 0-1, message delivery success rate
  };
}

/**
 * SessionKey - Encrypted session key for a peer
 * Enables Perfect Forward Secrecy - rotates regularly
 */
export interface SessionKey {
  peerId: string;
  key: Uint8Array; // Encrypted with master key
  nonce: Uint8Array; // For XChaCha20-Poly1305
  createdAt: number;
  messageCount: number; // Number of messages sent with this key
  expiresAt: number; // Unix timestamp when key should rotate
}

export const STORE_CONFIGS = {
  messages: {
    keyPath: 'id',
    indexes: [
      { name: 'conversationId', keyPath: 'conversationId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'senderId', keyPath: 'senderId', unique: false },
      { name: 'status', keyPath: 'status', unique: false }
    ]
  },
  contacts: {
    keyPath: 'id',
    indexes: [
      { name: 'publicKey', keyPath: 'publicKey', unique: true },
      { name: 'addedAt', keyPath: 'addedAt', unique: false }
    ]
  },
  conversations: {
    keyPath: 'id',
    indexes: [
      { name: 'lastMessageTime', keyPath: 'lastMessageTime', unique: false },
      { name: 'type', keyPath: 'type', unique: false }
    ]
  },
  peers: {
    keyPath: 'id',
    indexes: [
      { name: 'publicKey', keyPath: 'publicKey', unique: true },
      { name: 'lastSeen', keyPath: 'lastSeen', unique: false },
      { name: 'connected', keyPath: 'connected', unique: false }
    ]
  },
  files: {
    keyPath: 'id',
    indexes: [
      { name: 'messageId', keyPath: 'messageId', unique: false },
      { name: 'hash', keyPath: 'hash', unique: false }
    ]
  },
  settings: {
    keyPath: 'id'
  },
  keypair: {
    keyPath: 'id'
  },
  // New stores for V1 persistence
  identities: {
    keyPath: 'id',
    indexes: [
      { name: 'fingerprint', keyPath: 'fingerprint', unique: true },
      { name: 'isPrimary', keyPath: 'isPrimary', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false }
    ]
  },
  persistedPeers: {
    keyPath: 'id',
    indexes: [
      { name: 'publicKey', keyPath: 'publicKey', unique: true },
      { name: 'lastSeen', keyPath: 'lastSeen', unique: false },
      { name: 'isBlacklisted', keyPath: 'isBlacklisted', unique: false },
      { name: 'transportType', keyPath: 'transportType', unique: false },
      { name: 'reputation', keyPath: 'reputation', unique: false }
    ]
  },
  routes: {
    keyPath: 'destinationId',
    indexes: [
      { name: 'nextHopId', keyPath: 'nextHopId', unique: false },
      { name: 'lastUpdated', keyPath: 'lastUpdated', unique: false },
      { name: 'cost', keyPath: 'cost', unique: false }
    ]
  },
  sessionKeys: {
    keyPath: 'peerId',
    indexes: [
      { name: 'expiresAt', keyPath: 'expiresAt', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false }
    ]
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
