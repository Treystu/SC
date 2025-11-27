import { CURRENT_SCHEMA_VERSION, validateAndMigrate } from './schema-validator';
/**
 * IndexedDB Persistence for Web Application
 * Stores messages, contacts, conversations, groups, and V1 persistence data
 */

export interface StoredMessage {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  senderId: string;
  recipientId: string;
  type: 'text' | 'file' | 'voice';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'queued' | 'failed';
  metadata?: any;
}

export interface StoredContact {
  id: string;
  publicKey: string;
  displayName: string;
  lastSeen: number;
  createdAt: number;
  fingerprint: string;
  verified: boolean;
  blocked: boolean;
  endpoints: Array<{
    type: string;
    address?: string;
  }>;
}

export interface StoredConversation {
  id: string;
  contactId: string;
  lastMessageId?: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  createdAt: number;
}

export interface StoredGroup {
  id: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    isAdmin: boolean;
  }>;
  createdBy: string;
  createdAt: number;
  lastMessageTimestamp: number;
}

/**
 * Identity - User's cryptographic identity (V1 persistence)
 */
export interface Identity {
  id: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  fingerprint: string;
  createdAt: number;
  label?: string;
  isPrimary: boolean;
}

/**
 * PersistedPeer - Extended peer info with reputation (V1 persistence)
 */
export interface PersistedPeer {
  id: string;
  publicKey: string;
  transportType: 'webrtc' | 'ble' | 'wifi';
  lastSeen: number;
  connectedAt: number;
  connectionQuality: number;
  bytesSent: number;
  bytesReceived: number;
  reputation: number;
  isBlacklisted: boolean;
  blacklistedUntil?: number;
  metadata?: Record<string, any>;
}

/**
 * Route - Mesh routing table entry (V1 persistence)
 */
export interface Route {
  destinationId: string;
  nextHopId: string;
  cost: number;
  lastUpdated: number;
  ttl: number;
  metrics?: {
    latency: number;
    successRate: number;
  };
}

/**
 * SessionKey - Encrypted session key for Perfect Forward Secrecy (V1 persistence)
 */
export interface SessionKey {
  peerId: string;
  key: Uint8Array;
  nonce: Uint8Array;
  createdAt: number;
  messageCount: number;
  expiresAt: number;
}

/**
 * IndexedDB Database Manager
 */
export class DatabaseManager {
  private dbName = 'sovereign-communications';
  private version = CURRENT_SCHEMA_VERSION;
  private db: IDBDatabase | null = null;

  /**
   * Initialize database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = async (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        await validateAndMigrate(db, oldVersion);
      };
    });
  }

  // ===== MESSAGE OPERATIONS =====

  /**
   * Save a message
   */
  async saveMessage(message: StoredMessage): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.put(message);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string, limit: number = 50, offset: number = 0): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('conversationId'); // Assuming 'conversationId' is the correct index name
      const request = index.getAll(conversationId);

      request.onsuccess = () => {
        const messages = request.result.sort((a, b) => a.timestamp - b.timestamp);
        resolve(messages.slice(Math.max(0, messages.length - limit - offset), messages.length - offset));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all queued messages
   */
  async getQueuedMessages(): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.getAll();

      request.onsuccess = () => {
        const messages = request.result.filter(m => m.status === 'queued');
        resolve(messages.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.delete(messageId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update message status
   */
  async updateMessageStatus(messageId: string, status: StoredMessage['status']): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const getRequest = store.get(messageId);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          message.status = status;
          store.put(message);
          resolve();
        } else {
          reject(new Error('Message not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // ===== CONTACT OPERATIONS =====

  /**
   * Save a contact
   */
  async saveContact(contact: StoredContact): Promise<void> {
    if (!this.db) await this.init();

    // Validate public key before saving
    try {
      const publicKeyBytes = new Uint8Array(atob(contact.publicKey).split('').map(c => c.charCodeAt(0)));
      if (publicKeyBytes.length !== 32) {
        throw new Error('Invalid public key length. Must be 32 bytes for Ed25519.');
      }
    } catch (e) {
      return Promise.reject(new Error(`Invalid base64 public key: ${(e as Error).message}`));
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readwrite');
      const store = transaction.objectStore('contacts');
      const request = store.put(contact);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<StoredContact[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readonly');
      const store = transaction.objectStore('contacts');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId: string): Promise<StoredContact | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readonly');
      const store = transaction.objectStore('contacts');
      const request = store.get(contactId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['contacts'], 'readwrite');
      const store = transaction.objectStore('contacts');
      const request = store.delete(contactId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== CONVERSATION OPERATIONS =====

  /**
   * Save a conversation
   */
  async saveConversation(conversation: StoredConversation): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readwrite');
      const store = transaction.objectStore('conversations');
      const request = store.put(conversation);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all conversations
   */
  async getConversations(): Promise<StoredConversation[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readonly');
      const store = transaction.objectStore('conversations');
      const request = store.getAll();

      request.onsuccess = () => {
        const conversations = request.result as StoredConversation[];
        // Sort by last message timestamp
        const sorted = conversations.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<StoredConversation | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readonly');
      const store = transaction.objectStore('conversations');
      const request = store.get(conversationId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update conversation unread count
   */
  async updateUnreadCount(conversationId: string, count: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['conversations'], 'readwrite');
      const store = transaction.objectStore('conversations');
      const getRequest = store.get(conversationId);

      getRequest.onsuccess = () => {
        const conversation = getRequest.result;
        if (conversation) {
          conversation.unreadCount = count;
          store.put(conversation);
          resolve();
        } else {
          reject(new Error('Conversation not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // ===== GROUP OPERATIONS =====

  /**
   * Save a group
   */
  async saveGroup(group: StoredGroup): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['groups'], 'readwrite');
      const store = transaction.objectStore('groups');
      const request = store.put(group);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all groups
   */
  async getGroups(): Promise<StoredGroup[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['groups'], 'readonly');
      const store = transaction.objectStore('groups');
      const request = store.getAll();

      request.onsuccess = () => {
        const groups = request.result as StoredGroup[];
        // Sort by last message timestamp
        const sorted = groups.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId: string): Promise<StoredGroup | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['groups'], 'readonly');
      const store = transaction.objectStore('groups');
      const request = store.get(groupId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ===== IDENTITY OPERATIONS (V1 Persistence) =====

  /**
   * Save an identity
   */
  async saveIdentity(identity: Identity): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readwrite');
      const store = transaction.objectStore('identities');
      const request = store.put(identity);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get an identity by ID
   */
  async getIdentity(id: string): Promise<Identity | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readonly');
      const store = transaction.objectStore('identities');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get the primary identity
   */
  async getPrimaryIdentity(): Promise<Identity | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readonly');
      const store = transaction.objectStore('identities');
      const request = store.getAll();

      request.onsuccess = () => {
        const identities = request.result as Identity[];
        const primary = identities.find(id => id.isPrimary);
        resolve(primary || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all identities
   */
  async getAllIdentities(): Promise<Identity[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readonly');
      const store = transaction.objectStore('identities');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete an identity
   */
  async deleteIdentity(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['identities'], 'readwrite');
      const store = transaction.objectStore('identities');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== PEER PERSISTENCE OPERATIONS (V1 Persistence) =====

  /**
   * Save a peer
   */
  async savePeer(peer: PersistedPeer): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readwrite');
      const store = transaction.objectStore('persistedPeers');
      const request = store.put(peer);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a peer by ID
   */
  async getPeer(id: string): Promise<PersistedPeer | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readonly');
      const store = transaction.objectStore('persistedPeers');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all peers
   */
  async getAllPeers(): Promise<PersistedPeer[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readonly');
      const store = transaction.objectStore('persistedPeers');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get active peers (seen in last 5 minutes)
   */
  async getActivePeers(): Promise<PersistedPeer[]> {
    if (!this.db) await this.init();

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readonly');
      const store = transaction.objectStore('persistedPeers');
      const request = store.getAll();

      request.onsuccess = () => {
        const allPeers = request.result as PersistedPeer[];
        const activePeers = allPeers.filter(peer =>
          peer.lastSeen >= fiveMinutesAgo && !peer.isBlacklisted
        );
        resolve(activePeers);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update peer reputation
   */
  async updatePeerReputation(id: string, reputation: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readwrite');
      const store = transaction.objectStore('persistedPeers');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const peer = getRequest.result;
        if (peer) {
          peer.reputation = Math.max(0, Math.min(100, reputation));
          store.put(peer);
          resolve();
        } else {
          reject(new Error('Peer not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Blacklist a peer
   */
  async blacklistPeer(id: string, durationMs: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readwrite');
      const store = transaction.objectStore('persistedPeers');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const peer = getRequest.result;
        if (peer) {
          peer.isBlacklisted = true;
          peer.blacklistedUntil = Date.now() + durationMs;
          store.put(peer);
          resolve();
        } else {
          reject(new Error('Peer not found'));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Delete a peer
   */
  async deletePeer(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['persistedPeers'], 'readwrite');
      const store = transaction.objectStore('persistedPeers');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== ROUTING TABLE PERSISTENCE (V1 Persistence) =====

  /**
   * Save a route
   */
  async saveRoute(route: Route): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['routes'], 'readwrite');
      const store = transaction.objectStore('routes');
      const request = store.put(route);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a route by destination ID
   */
  async getRoute(destinationId: string): Promise<Route | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['routes'], 'readonly');
      const store = transaction.objectStore('routes');
      const request = store.get(destinationId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all routes
   */
  async getAllRoutes(): Promise<Route[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['routes'], 'readonly');
      const store = transaction.objectStore('routes');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete expired routes
   */
  async deleteExpiredRoutes(): Promise<void> {
    if (!this.db) await this.init();

    const now = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['routes'], 'readwrite');
      const store = transaction.objectStore('routes');
      const request = store.getAll();

      request.onsuccess = () => {
        const routes = request.result as Route[];
        const deletePromises = routes
          .filter(route => route.lastUpdated + route.ttl * 1000 < now)
          .map(route => {
            return new Promise<void>((res, rej) => {
              const delRequest = store.delete(route.destinationId);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => rej(delRequest.error);
            });
          });

        Promise.all(deletePromises).then(() => resolve()).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all routes
   */
  async clearRoutes(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['routes'], 'readwrite');
      const store = transaction.objectStore('routes');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== SESSION KEY PERSISTENCE (V1 Persistence) =====

  /**
   * Save a session key
   */
  async saveSessionKey(sessionKey: SessionKey): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessionKeys'], 'readwrite');
      const store = transaction.objectStore('sessionKeys');
      const request = store.put(sessionKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a session key by peer ID
   */
  async getSessionKey(peerId: string): Promise<SessionKey | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessionKeys'], 'readonly');
      const store = transaction.objectStore('sessionKeys');
      const request = store.get(peerId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a session key
   */
  async deleteSessionKey(peerId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessionKeys'], 'readwrite');
      const store = transaction.objectStore('sessionKeys');
      const request = store.delete(peerId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete expired session keys
   */
  async deleteExpiredSessionKeys(): Promise<void> {
    if (!this.db) await this.init();

    const now = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessionKeys'], 'readwrite');
      const store = transaction.objectStore('sessionKeys');
      const request = store.getAll();

      request.onsuccess = () => {
        const keys = request.result as SessionKey[];
        const deletePromises = keys
          .filter(key => key.expiresAt < now)
          .map(key => {
            return new Promise<void>((res, rej) => {
              const delRequest = store.delete(key.peerId);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => rej(delRequest.error);
            });
          });

        Promise.all(deletePromises).then(() => resolve()).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ===== DATA SOVEREIGNTY OPERATIONS =====

  /**
   * Export all user data (sovereignty feature)
   * Returns a complete snapshot of all local data
   */
  async exportAllData(): Promise<{
    version: string;
    exportedAt: number;
    identities: Identity[];
    contacts: StoredContact[];
    conversations: StoredConversation[];
    messages: StoredMessage[];
    peers: PersistedPeer[];
    routes: Route[];
    sessionKeys: SessionKey[];
  }> {
    if (!this.db) await this.init();

    const [identities, contacts, conversations, messages, peers, routes, sessionKeys] = await Promise.all([
      this.getAllIdentities(),
      this.getContacts(),
      this.getConversations(),
      this.getAllMessages(),
      this.getAllPeers(),
      this.getAllRoutes(),
      this.getAllSessionKeys()
    ]);

    return {
      version: '1.0',
      exportedAt: Date.now(),
      identities,
      contacts,
      conversations,
      messages,
      peers,
      routes,
      sessionKeys
    };
  }

  /**
   * Get all messages (helper for export)
   */
  private async getAllMessages(): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all session keys (helper for export)
   */
  private async getAllSessionKeys(): Promise<SessionKey[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessionKeys'], 'readonly');
      const store = transaction.objectStore('sessionKeys');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Import data (sovereignty feature)
   * Merges or overwrites existing data based on strategy
   */
  async importData(
    data: {
      version: string;
      exportedAt: number;
      identities?: Identity[];
      contacts?: StoredContact[];
      conversations?: StoredConversation[];
      messages?: StoredMessage[];
      peers?: PersistedPeer[];
      routes?: Route[];
      sessionKeys?: SessionKey[];
    },
    options: {
      mergeStrategy: 'overwrite' | 'merge' | 'skip-existing';
    } = { mergeStrategy: 'merge' }
  ): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    if (!this.db) await this.init();

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    try {
      // Validate version
      if (data.version !== '1.0') {
        errors.push(`Unsupported export version: ${data.version}`);
        return { imported, skipped, errors };
      }

      // Import identities
      if (data.identities) {
        for (const identity of data.identities) {
          try {
            const existing = await this.getIdentity(identity.id);
            if (existing && options.mergeStrategy === 'skip-existing') {
              skipped++;
            } else {
              await this.saveIdentity(identity);
              imported++;
            }
          } catch (error) {
            errors.push(`Failed to import identity ${identity.id}: ${error}`);
          }
        }
      }

      // Import contacts
      if (data.contacts) {
        for (const contact of data.contacts) {
          try {
            const existing = await this.getContact(contact.id);
            if (existing && options.mergeStrategy === 'skip-existing') {
              skipped++;
            } else {
              await this.saveContact(contact);
              imported++;
            }
          } catch (error) {
            errors.push(`Failed to import contact ${contact.id}: ${error}`);
          }
        }
      }

      // Import conversations
      if (data.conversations) {
        for (const conversation of data.conversations) {
          try {
            const existing = await this.getConversation(conversation.id);
            if (existing && options.mergeStrategy === 'skip-existing') {
              skipped++;
            } else {
              await this.saveConversation(conversation);
              imported++;
            }
          } catch (error) {
            errors.push(`Failed to import conversation ${conversation.id}: ${error}`);
          }
        }
      }

      // Import messages
      if (data.messages) {
        for (const message of data.messages) {
          try {
            await this.saveMessage(message);
            imported++;
          } catch (error) {
            errors.push(`Failed to import message ${message.id}: ${error}`);
          }
        }
      }

      // Import peers
      if (data.peers) {
        for (const peer of data.peers) {
          try {
            const existing = await this.getPeer(peer.id);
            if (existing && options.mergeStrategy === 'skip-existing') {
              skipped++;
            } else {
              await this.savePeer(peer);
              imported++;
            }
          } catch (error) {
            errors.push(`Failed to import peer ${peer.id}: ${error}`);
          }
        }
      }

      // Import routes
      if (data.routes) {
        for (const route of data.routes) {
          try {
            await this.saveRoute(route);
            imported++;
          } catch (error) {
            errors.push(`Failed to import route ${route.destinationId}: ${error}`);
          }
        }
      }

      // Import session keys
      if (data.sessionKeys) {
        for (const sessionKey of data.sessionKeys) {
          try {
            await this.saveSessionKey(sessionKey);
            imported++;
          } catch (error) {
            errors.push(`Failed to import session key ${sessionKey.peerId}: ${error}`);
          }
        }
      }
    } catch (error) {
      errors.push(`Import failed: ${error}`);
    }

    return { imported, skipped, errors };
  }

  /**
   * Securely delete all user data (sovereignty feature)
   * Requires confirmation token to prevent accidental deletion
   */
  async deleteAllData(confirmationToken: string): Promise<void> {
    if (confirmationToken !== 'DELETE ALL MY DATA') {
      throw new Error('Invalid confirmation token. Data not deleted.');
    }

    await this.clearAll();
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    const stores = [
      'messages',
      'contacts',
      'conversations',
      'identities',
      'persistedPeers',
      'routes',
      'sessionKeys'
    ];
    const promises = stores.map(storeName => {
      return new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Close database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let dbInstance: DatabaseManager | null = null;

export function getDatabase(): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager();
  }
  return dbInstance;
}
