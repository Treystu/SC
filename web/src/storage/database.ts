import { CURRENT_SCHEMA_VERSION, validateAndMigrate } from "./schema-validator";
import {
  encryptionManager,
  encryptSensitiveFields,
  decryptSensitiveFields,
} from "./encryption";
/**
 * IndexedDB Persistence for Web Application
 * Stores messages, contacts, conversations, groups, and V1 persistence data
 *
 * SECURITY: Implements encryption for sensitive data (addresses V1.0 Audit Gap #2)
 */

export interface StoredMessage {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  senderId: string;
  recipientId: string;
  type: "text" | "file" | "voice";
  status: "pending" | "sent" | "delivered" | "read" | "queued" | "failed";
  metadata?: any;
  reactions?: Array<{ userId: string; emoji: string }>;
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
  metadata?: {
    isRequest?: boolean;
    requestStatus?: 'pending' | 'accepted' | 'ignored' | 'blocked';
    [key: string]: any;
  };
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
  unreadCount?: number;
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
  displayName?: string;
  isPrimary: boolean;
}

/**
 * PersistedPeer - Extended peer info with reputation (V1 persistence)
 */
export interface PersistedPeer {
  id: string;
  publicKey: string;
  transportType: "webrtc" | "ble" | "wifi";
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
  private dbName =
    typeof window !== "undefined" && (window as any).__SC_DB_NAME__
      ? (window as any).__SC_DB_NAME__
      : "sovereign-communications";
  private version = CURRENT_SCHEMA_VERSION;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  async initializeEncryption(passphrase: string): Promise<void> {
    try {
      await encryptionManager.initialize(passphrase);
      console.log("EncryptionManager initialized for database");
    } catch (error) {
      console.error("DatabaseManager: Failed to initialize encryption:", error);
      throw error;
    }
  }

  /**
   * Initialize database with timeout protection
   */
  async init(): Promise<void> {
    if ((window as any).__IS_RESETTING__) {
      // Halt initialization if resetting, to prevent blocking deletion
      return new Promise(() => {});
    }
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    // Track retry attempts for exponential backoff
    let retryCount = 0;
    const maxRetries = 3;

    const attemptInit = async (): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Exponential backoff: 2s, 4s, 8s
        const baseTimeout = Math.min(10000, 2000 * Math.pow(2, retryCount));

        const timeoutId = setTimeout(() => {
          console.warn(
            `DatabaseManager: Initialization attempt ${retryCount + 1} timed out after ${baseTimeout}ms`,
          );
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(
              `DatabaseManager: Retrying initialization (attempt ${retryCount + 1}/${maxRetries + 1})...`,
            );
            // Clean up and retry
            this.db = null;
            this.initPromise = null;
            attemptInit().then(resolve).catch(reject);
          } else {
            console.error("DatabaseManager: Max retries exceeded, giving up");
            this.initPromise = null;
            reject(
              new Error(
                `Database initialization failed after ${maxRetries + 1} attempts`,
              ),
            );
          }
        }, baseTimeout);

        const request = indexedDB.open(this.dbName, this.version);

        request.onblocked = () => {
          console.warn(
            "DatabaseManager: Database upgrade blocked by another connection",
          );
          clearTimeout(timeoutId);
          if (this.db) {
            this.db.close();
            this.db = null;
          }
          // Retry immediately on blocked
          if (retryCount < maxRetries) {
            retryCount++;
            attemptInit().then(resolve).catch(reject);
          } else {
            this.initPromise = null;
            reject(new Error("Database blocked after max retries"));
          }
        };

        request.onerror = () => {
          clearTimeout(timeoutId);
          this.initPromise = null;
          reject(request.error || new Error("Database open failed"));
        };

        request.onsuccess = () => {
          clearTimeout(timeoutId);
          this.db = request.result;
          // Handle connection closing
          this.db.onversionchange = () => {
            this.db?.close();
            this.db = null;
            this.initPromise = null;
          };
          this.db.onclose = () => {
            this.db = null;
            this.initPromise = null;
          };
          resolve();
        };

        request.onupgradeneeded = async (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const oldVersion = event.oldVersion;
          try {
            await validateAndMigrate(db, oldVersion);
          } catch (error) {
            clearTimeout(timeoutId);
            console.error("DatabaseManager: Migration failed:", error);
            request.transaction?.abort();
            this.initPromise = null;
            reject(error);
          }
        };
      });
    };

    this.initPromise = attemptInit();
    return this.initPromise;
  }

  /**
   * Clear all data from the database
   * Used when resetting identity or clearing state
   */
  async clearAllData(): Promise<void> {
    if (!this.db) await this.init();

    const storeNames = Array.from(this.db!.objectStoreNames);
    const transaction = this.db!.transaction(storeNames, "readwrite");

    const promises = storeNames.map((storeName) => {
      return new Promise<void>((resolve, reject) => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
    console.log("DatabaseManager: All data cleared successfully");
  }

  // ===== MESSAGE OPERATIONS =====

  /**
   * Save a message (with encryption for content)
   */
  async saveMessage(message: StoredMessage): Promise<void> {
    if (!this.db) await this.init();

    // Encrypt sensitive fields
    const encryptedMessage = await encryptSensitiveFields(message as any, [
      "content",
      "metadata",
    ]);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["messages"], "readwrite");
      const store = transaction.objectStore("messages");
      const request = store.put(encryptedMessage);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error);
    });
  }

  /**
   * Helper to perform IndexedDB get operations with Promise
   */
  private async performGet<T>(
    storeName: string,
    key: string,
  ): Promise<T | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Helper to perform IndexedDB getAll operations with Promise
   */
  private async performGetAll<T>(
    storeName: string,
    indexName?: string,
    query?: string,
  ): Promise<T[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], "readonly");
      const store = transaction.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const request = query ? target.getAll(query) : target.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a single message by ID (with decryption)
   */
  async getMessage(messageId: string): Promise<StoredMessage | null> {
    const message = await this.performGet<StoredMessage>("messages", messageId);
    if (!message) return null;

    // Decrypt sensitive fields
    return (await decryptSensitiveFields(message as any, [
      "content",
      "metadata",
    ])) as StoredMessage;
  }

  /**
   * Get messages for a conversation (with decryption)
   */
  async getMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<StoredMessage[]> {
    const allMessages = await this.performGetAll<StoredMessage>(
      "messages",
      "conversationId",
      conversationId,
    );

    // Sort and paginate
    const sortedMessages = allMessages.sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const paginatedMessages = sortedMessages.slice(
      Math.max(0, sortedMessages.length - limit - offset),
      sortedMessages.length - offset,
    );

    // Decrypt all messages
    return await Promise.all(
      paginatedMessages.map(
        async (msg) =>
          (await decryptSensitiveFields(msg as any, [
            "content",
            "metadata",
          ])) as StoredMessage,
      ),
    );
  }

  /**
   * Get all queued messages
   */
  async getQueuedMessages(): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["messages"], "readonly");
      const store = transaction.objectStore("messages");
      const request = store.getAll();

      request.onsuccess = () => {
        const messages = request.result.filter((m) => m.status === "queued");
        resolve(messages.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a message by ID
   */
  async getMessageById(messageId: string): Promise<StoredMessage | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["messages"], "readonly");
      const store = transaction.objectStore("messages");
      const request = store.get(messageId);

      request.onsuccess = () => {
        const message = request.result;
        resolve(message || null);
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
      const transaction = this.db!.transaction(["messages"], "readwrite");
      const store = transaction.objectStore("messages");
      const request = store.delete(messageId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update message status
   */
  async updateMessageStatus(
    messageId: string,
    status: StoredMessage["status"],
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["messages"], "readwrite");
      const store = transaction.objectStore("messages");
      const getRequest = store.get(messageId);

      getRequest.onsuccess = () => {
        const message = getRequest.result;
        if (message) {
          message.status = status;
          store.put(message);
          resolve();
        } else {
          reject(new Error("Message not found"));
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
      const publicKeyBytes = new Uint8Array(
        atob(contact.publicKey)
          .split("")
          .map((c) => c.charCodeAt(0)),
      );
      if (publicKeyBytes.length !== 32) {
        throw new Error(
          "Invalid public key length. Must be 32 bytes for Ed25519.",
        );
      }
    } catch (e) {
      return Promise.reject(
        new Error(`Invalid base64 public key: ${(e as Error).message}`),
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["contacts"], "readwrite");
      const store = transaction.objectStore("contacts");
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
      const transaction = this.db!.transaction(["contacts"], "readonly");
      const store = transaction.objectStore("contacts");
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
      const transaction = this.db!.transaction(["contacts"], "readonly");
      const store = transaction.objectStore("contacts");
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
      const transaction = this.db!.transaction(["contacts"], "readwrite");
      const store = transaction.objectStore("contacts");
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
      const transaction = this.db!.transaction(["conversations"], "readwrite");
      const store = transaction.objectStore("conversations");
      const request = store.put(conversation);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteConversation(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ["conversations", "messages"],
        "readwrite",
      );
      
      const convStore = transaction.objectStore("conversations");
      convStore.delete(id);
      
      // Also delete messages for this conversation
      const msgStore = transaction.objectStore("messages");
      const index = msgStore.index("conversationId");
      const request = index.getAllKeys(id);
      
      request.onsuccess = () => {
        const keys = request.result;
        keys.forEach(key => {
          msgStore.delete(key);
        });
      };
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get all conversations
   */
  async getConversations(): Promise<StoredConversation[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readonly");
      const store = transaction.objectStore("conversations");
      const request = store.getAll();

      request.onsuccess = () => {
        const conversations = request.result as StoredConversation[];
        // Sort by last message timestamp
        const sorted = conversations.sort(
          (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp,
        );
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get conversation by ID
   */
  async getConversation(
    conversationId: string,
  ): Promise<StoredConversation | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readonly");
      const store = transaction.objectStore("conversations");
      const request = store.get(conversationId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update conversation unread count
   */
  async updateUnreadCount(
    conversationId: string,
    count: number,
  ): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["conversations"], "readwrite");
      const store = transaction.objectStore("conversations");
      const getRequest = store.get(conversationId);

      getRequest.onsuccess = () => {
        const conversation = getRequest.result;
        if (conversation) {
          conversation.unreadCount = count;
          store.put(conversation);
          resolve();
        } else {
          reject(new Error("Conversation not found"));
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
      const transaction = this.db!.transaction(["groups"], "readwrite");
      const store = transaction.objectStore("groups");
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
      const transaction = this.db!.transaction(["groups"], "readonly");
      const store = transaction.objectStore("groups");
      const request = store.getAll();

      request.onsuccess = () => {
        const groups = request.result as StoredGroup[];
        // Sort by last message timestamp
        const sorted = groups.sort(
          (a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp,
        );
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
      const transaction = this.db!.transaction(["groups"], "readonly");
      const store = transaction.objectStore("groups");
      const request = store.get(groupId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update group unread count
   */
  async updateGroupUnreadCount(groupId: string, count: number): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["groups"], "readwrite");
      const store = transaction.objectStore("groups");
      const getRequest = store.get(groupId);

      getRequest.onsuccess = () => {
        const group = getRequest.result;
        if (group) {
          group.unreadCount = count;
          store.put(group);
          resolve();
        } else {
          reject(new Error("Group not found"));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // ===== IDENTITY OPERATIONS (V1 Persistence) =====

  /**
   * Save an identity
   * CRITICAL FIX: Now encrypts privateKey field
   */
  async saveIdentity(identity: Identity): Promise<void> {
    if (!this.db) await this.init();

    // Encrypt sensitive fields (especially privateKey)
    const encryptedIdentity = await encryptSensitiveFields(identity as any, [
      "privateKey",
    ]);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["identities"], "readwrite");
      const store = transaction.objectStore("identities");
      const request = store.put(encryptedIdentity);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get an identity by ID
   * CRITICAL FIX: Now decrypts privateKey field
   */
  async getIdentity(id: string): Promise<Identity | null> {
    const identity = await this.performGet<Identity>("identities", id);
    if (!identity) return null;

    // Decrypt sensitive fields (especially privateKey)
    let decrypted = identity as any;
    try {
      decrypted = (await decryptSensitiveFields(identity as any, [
        "privateKey",
      ])) as Identity;
    } catch (e) {
      console.warn(
        "Failed to decrypt identity privateKey, attempting best-effort normalization:",
        e,
      );
      decrypted = identity as any;
    }

    // Normalize publicKey/privateKey to Uint8Array if they're stored as base64 strings
    const normalizeKey = (val: any): Uint8Array | undefined => {
      if (!val && val !== 0) return undefined;
      if (val instanceof Uint8Array) return val;
      if (typeof val === "string") {
        try {
          const bytes = atob(val)
            .split("")
            .map((c) => c.charCodeAt(0));
          return new Uint8Array(bytes);
        } catch (e) {
          console.warn("Failed to parse base64 key:", e);
          return undefined;
        }
      }
      return undefined;
    };

    const pub = normalizeKey((decrypted as any).publicKey);
    const priv = normalizeKey((decrypted as any).privateKey);

    return {
      ...decrypted,
      publicKey: pub || (decrypted.publicKey as Uint8Array),
      privateKey: priv || (decrypted.privateKey as Uint8Array),
    } as Identity;
  }

  /**
   * Get the primary identity
   * CRITICAL FIX: Now decrypts privateKey field
   */
  async getPrimaryIdentity(): Promise<Identity | null> {
    const identities = await this.getAllIdentities();
    const primary = identities.find((id) => id.isPrimary) || null;
    if (!primary) return null;

    // Ensure keys normalized (safeguard in case migration left strings)
    const normalizeKey = (val: any): Uint8Array | undefined => {
      if (!val && val !== 0) return undefined;
      if (val instanceof Uint8Array) return val;
      if (typeof val === "string") {
        try {
          const bytes = atob(val)
            .split("")
            .map((c) => c.charCodeAt(0));
          return new Uint8Array(bytes);
        } catch (e) {
          console.warn("Failed to parse base64 key in primary identity:", e);
          return undefined;
        }
      }
      return undefined;
    };

    return {
      ...primary,
      publicKey: normalizeKey((primary as any).publicKey) || primary.publicKey,
      privateKey:
        normalizeKey((primary as any).privateKey) || primary.privateKey,
    } as Identity;
  }

  /**
   * Get all identities
   * CRITICAL FIX: Now decrypts privateKey field for all identities
   */
  async getAllIdentities(): Promise<Identity[]> {
    const identities = await this.performGetAll<Identity>("identities");

    // Decrypt all identities
    return await Promise.all(
      identities.map(
        async (identity) =>
          (await decryptSensitiveFields(identity as any, [
            "privateKey",
          ])) as Identity,
      ),
    );
  }

  /**
   * Delete an identity
   */
  async deleteIdentity(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["identities"], "readwrite");
      const store = transaction.objectStore("identities");
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== SETTINGS OPERATIONS =====

  /**
   * Get a setting by key
   */
  async getSetting<T = any>(key: string): Promise<T | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["settings"], "readonly");
      const store = transaction.objectStore("settings");
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Set a setting
   */
  async setSetting<T = any>(key: string, value: T): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["settings"], "readwrite");
      const store = transaction.objectStore("settings");
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["settings"], "readwrite");
      const store = transaction.objectStore("settings");
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all settings as a key-value object
   */
  private async getAllSettings(): Promise<Record<string, any>> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["settings"], "readonly");
      const store = transaction.objectStore("settings");
      const request = store.getAll();

      request.onsuccess = () => {
        const settings: Record<string, any> = {};
        request.result.forEach((item: { key: string; value: any }) => {
          settings[item.key] = item.value;
        });
        resolve(settings);
      };
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
      const transaction = this.db!.transaction(["persistedPeers"], "readwrite");
      const store = transaction.objectStore("persistedPeers");
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
      const transaction = this.db!.transaction(["persistedPeers"], "readonly");
      const store = transaction.objectStore("persistedPeers");
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
      const transaction = this.db!.transaction(["persistedPeers"], "readonly");
      const store = transaction.objectStore("persistedPeers");
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
      const transaction = this.db!.transaction(["persistedPeers"], "readonly");
      const store = transaction.objectStore("persistedPeers");
      const request = store.getAll();

      request.onsuccess = () => {
        const allPeers = request.result as PersistedPeer[];
        const activePeers = allPeers.filter(
          (peer) => peer.lastSeen >= fiveMinutesAgo && !peer.isBlacklisted,
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
      const transaction = this.db!.transaction(["persistedPeers"], "readwrite");
      const store = transaction.objectStore("persistedPeers");
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const peer = getRequest.result;
        if (peer) {
          peer.reputation = Math.max(0, Math.min(100, reputation));
          store.put(peer);
          resolve();
        } else {
          reject(new Error("Peer not found"));
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
      const transaction = this.db!.transaction(["persistedPeers"], "readwrite");
      const store = transaction.objectStore("persistedPeers");
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const peer = getRequest.result;
        if (peer) {
          peer.isBlacklisted = true;
          peer.blacklistedUntil = Date.now() + durationMs;
          store.put(peer);
          resolve();
        } else {
          reject(new Error("Peer not found"));
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
      const transaction = this.db!.transaction(["persistedPeers"], "readwrite");
      const store = transaction.objectStore("persistedPeers");
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
      const transaction = this.db!.transaction(["routes"], "readwrite");
      const store = transaction.objectStore("routes");
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
      const transaction = this.db!.transaction(["routes"], "readonly");
      const store = transaction.objectStore("routes");
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
      const transaction = this.db!.transaction(["routes"], "readonly");
      const store = transaction.objectStore("routes");
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
      const transaction = this.db!.transaction(["routes"], "readwrite");
      const store = transaction.objectStore("routes");
      const request = store.getAll();

      request.onsuccess = () => {
        const routes = request.result as Route[];
        const deletePromises = routes
          .filter((route) => route.lastUpdated + route.ttl * 1000 < now)
          .map((route) => {
            return new Promise<void>((res, rej) => {
              const delRequest = store.delete(route.destinationId);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => rej(delRequest.error);
            });
          });

        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject);
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
      const transaction = this.db!.transaction(["routes"], "readwrite");
      const store = transaction.objectStore("routes");
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
      const transaction = this.db!.transaction(["sessionKeys"], "readwrite");
      const store = transaction.objectStore("sessionKeys");
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
      const transaction = this.db!.transaction(["sessionKeys"], "readonly");
      const store = transaction.objectStore("sessionKeys");
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
      const transaction = this.db!.transaction(["sessionKeys"], "readwrite");
      const store = transaction.objectStore("sessionKeys");
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
      const transaction = this.db!.transaction(["sessionKeys"], "readwrite");
      const store = transaction.objectStore("sessionKeys");
      const request = store.getAll();

      request.onsuccess = () => {
        const keys = request.result as SessionKey[];
        const deletePromises = keys
          .filter((key) => key.expiresAt < now)
          .map((key) => {
            return new Promise<void>((res, rej) => {
              const delRequest = store.delete(key.peerId);
              delRequest.onsuccess = () => res();
              delRequest.onerror = () => rej(delRequest.error);
            });
          });

        Promise.all(deletePromises)
          .then(() => resolve())
          .catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ===== DATA SOVEREIGNTY OPERATIONS =====

  /**
   * Export all user data (sovereignty feature)
   * Returns a complete snapshot of all local data
   */
  async exportAllData(options?: {
    includeMessages?: boolean;
    includeContacts?: boolean;
    includeSettings?: boolean;
  }): Promise<{
    version: string;
    exportedAt: number;
    identities?: Identity[];
    contacts?: StoredContact[];
    conversations?: StoredConversation[];
    messages?: StoredMessage[];
    peers?: PersistedPeer[];
    routes?: Route[];
    sessionKeys?: SessionKey[];
    settings?: Record<string, any>;
  }> {
    if (!this.db) await this.init();

    const exportOptions = {
      includeMessages: options?.includeMessages ?? true,
      includeContacts: options?.includeContacts ?? true,
      includeSettings: options?.includeSettings ?? true,
    };

    const promises: Promise<any>[] = [
      this.getAllIdentities(), // Always include identities
    ];

    if (exportOptions.includeContacts) {
      promises.push(this.getContacts());
      promises.push(this.getConversations());
    } else {
      promises.push(Promise.resolve([]));
      promises.push(Promise.resolve([]));
    }

    if (exportOptions.includeMessages) {
      promises.push(this.getAllMessages());
    } else {
      promises.push(Promise.resolve([]));
    }

    if (exportOptions.includeSettings) {
      promises.push(this.getAllPeers());
      promises.push(this.getAllRoutes());
      promises.push(this.getAllSessionKeys());
    } else {
      promises.push(Promise.resolve([]));
      promises.push(Promise.resolve([]));
      promises.push(Promise.resolve([]));
    }

    const [
      identities,
      contacts,
      conversations,
      messages,
      peers,
      routes,
      sessionKeys,
    ] = await Promise.all(promises);

    const exportedData: any = {
      version: "1.0",
      exportedAt: Date.now(),
      identities,
    };

    if (exportOptions.includeContacts) {
      exportedData.contacts = contacts;
      exportedData.conversations = conversations;
    }
    if (exportOptions.includeMessages) {
      exportedData.messages = messages;
    }
    if (exportOptions.includeSettings) {
      // Export all settings from IndexedDB (no more localStorage!)
      const settings = await this.getAllSettings();
      if (settings && Object.keys(settings).length > 0) {
        exportedData.settings = settings;
      }
      exportedData.peers = peers;
      exportedData.routes = routes;
      exportedData.sessionKeys = sessionKeys;
    }

    return exportedData;
  }

  /**
   * Get all messages (helper for export)
   */
  private async getAllMessages(): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["messages"], "readonly");
      const store = transaction.objectStore("messages");
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
      const transaction = this.db!.transaction(["sessionKeys"], "readonly");
      const store = transaction.objectStore("sessionKeys");
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
      settings?: Record<string, any>;
    },
    options: {
      mergeStrategy: "overwrite" | "merge" | "skip-existing";
    } = { mergeStrategy: "merge" },
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
      if (data.version !== "1.0") {
        errors.push(`Unsupported export version: ${data.version}`);
        return { imported, skipped, errors };
      }

      // Import identities
      if (data.identities) {
        for (const identity of data.identities) {
          try {
            const existing = await this.getIdentity(identity.id);
            if (existing && options.mergeStrategy === "skip-existing") {
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
            if (existing && options.mergeStrategy === "skip-existing") {
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
            if (existing && options.mergeStrategy === "skip-existing") {
              skipped++;
            } else {
              await this.saveConversation(conversation);
              imported++;
            }
          } catch (error) {
            errors.push(
              `Failed to import conversation ${conversation.id}: ${error}`,
            );
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
            if (existing && options.mergeStrategy === "skip-existing") {
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
            errors.push(
              `Failed to import route ${route.destinationId}: ${error}`,
            );
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
            errors.push(
              `Failed to import session key ${sessionKey.peerId}: ${error}`,
            );
          }
        }
      }

      // Import settings (replaces old userProfile localStorage approach)
      if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
          try {
            const existing = await this.getSetting(key);
            if (
              existing !== null &&
              options.mergeStrategy === "skip-existing"
            ) {
              skipped++;
            } else {
              await this.setSetting(key, value);
              imported++;
            }
          } catch (error) {
            errors.push(`Failed to import setting ${key}: ${error}`);
          }
        }
      }

      // Legacy: Import old userProfile from localStorage-based backups
      if ((data as any).userProfile) {
        try {
          // Convert old userProfile to new settings format
          const profile = (data as any).userProfile;
          if (profile.displayName) {
            await this.setSetting("displayName", profile.displayName);
            // Also update the primary identity with displayName
            const identity = await this.getPrimaryIdentity();
            if (identity) {
              await this.saveIdentity({
                ...identity,
                displayName: profile.displayName,
              });
            }
          }
          if (profile.avatar) {
            await this.setSetting("avatar", profile.avatar);
          }
          imported++;
        } catch (error) {
          errors.push(`Failed to import legacy user profile: ${error}`);
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
    if (confirmationToken !== "DELETE ALL MY DATA") {
      throw new Error("Invalid confirmation token. Data not deleted.");
    }

    await this.clearAll();
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    const stores = [
      "messages",
      "contacts",
      "conversations",
      "identities",
      "persistedPeers",
      "routes",
      "sessionKeys",
    ];
    const promises = stores.map((storeName) => {
      return new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Offline Queue Adapter for Core Library
   */
  get offlineQueue() {
    return {
      toArray: async () => {
        if (!this.db) await this.init();
        return new Promise<any[]>((resolve, reject) => {
          const transaction = this.db!.transaction(
            ["offlineQueue"],
            "readonly",
          );
          const store = transaction.objectStore("offlineQueue");
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      },
      add: async (item: any) => {
        if (!this.db) await this.init();
        return new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction(
            ["offlineQueue"],
            "readwrite",
          );
          const store = transaction.objectStore("offlineQueue");
          const request = store.put(item);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      },
      delete: async (id: string) => {
        if (!this.db) await this.init();
        return new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction(
            ["offlineQueue"],
            "readwrite",
          );
          const store = transaction.objectStore("offlineQueue");
          const request = store.delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      },
      update: async (id: string, changes: any) => {
        if (!this.db) await this.init();
        return new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction(
            ["offlineQueue"],
            "readwrite",
          );
          const store = transaction.objectStore("offlineQueue");
          // First get the item
          const getRequest = store.get(id);
          getRequest.onsuccess = () => {
            const item = getRequest.result;
            if (!item) {
              resolve(); // Item not found, ignore
              return;
            }
            // Apply changes
            const updated = { ...item, ...changes };
            const putRequest = store.put(updated);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
          };
          getRequest.onerror = () => reject(getRequest.error);
        });
      },
      count: async () => {
        if (!this.db) await this.init();
        return new Promise<number>((resolve, reject) => {
          const transaction = this.db!.transaction(
            ["offlineQueue"],
            "readonly",
          );
          const store = transaction.objectStore("offlineQueue");
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      },
      clear: async () => {
        if (!this.db) await this.init();
        return new Promise<void>((resolve, reject) => {
          const transaction = this.db!.transaction(
            ["offlineQueue"],
            "readwrite",
          );
          const store = transaction.objectStore("offlineQueue");
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      },
      where: (field: string) => {
        return {
          below: (value: number) => {
            return {
              toArray: async () => {
                if (!this.db) await this.init();
                return new Promise<any[]>((resolve, reject) => {
                  const transaction = this.db!.transaction(
                    ["offlineQueue"],
                    "readonly",
                  );
                  const store = transaction.objectStore("offlineQueue");
                  const index = store.index(field);
                  // Dexie 'below' is < value (open upper bound). IDBKeyRange.upperBound(value, true) is < value.
                  // Let's assume strict inequality for 'below'.
                  const request = index.getAll(
                    IDBKeyRange.upperBound(value, true),
                  );
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
              },
            };
          },
        };
      },
    };
  }

  /**
   * Close the database connection
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

// Helper for E2E testing to reset database
export async function resetDatabaseForTest() {
  (window as any).__IS_RESETTING__ = true;

  if (navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
  }

  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("sovereign-communications");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn("Database deletion blocked");
      // We resolve anyway to avoid hanging, subsequent reloading might fix it
      resolve();
    };
  });
}

if (typeof window !== "undefined") {
  (window as any).resetDatabase = resetDatabaseForTest;
}
