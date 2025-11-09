/**
 * IndexedDB Persistence for Web Application
 * Stores messages, contacts, and conversations
 */

export interface StoredMessage {
  id: string;
  conversationId: string;
  content: string;
  timestamp: number;
  senderId: string;
  recipientId: string;
  type: 'text' | 'file' | 'voice';
  status: 'pending' | 'sent' | 'delivered' | 'read';
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

/**
 * IndexedDB Database Manager
 */
export class DatabaseManager {
  private dbName = 'sovereign-communications';
  private version = 1;
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

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('conversationId', 'conversationId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
          messageStore.createIndex('status', 'status', { unique: false });
        }

        // Contacts store
        if (!db.objectStoreNames.contains('contacts')) {
          const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactStore.createIndex('publicKey', 'publicKey', { unique: true });
          contactStore.createIndex('displayName', 'displayName', { unique: false });
        }

        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
          conversationStore.createIndex('contactId', 'contactId', { unique: true });
          conversationStore.createIndex('lastMessageTimestamp', 'lastMessageTimestamp', { unique: false });
        }
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
  async getMessages(conversationId: string, limit = 100): Promise<StoredMessage[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('conversationId');
      const request = index.getAll(conversationId);

      request.onsuccess = () => {
        const messages = request.result as StoredMessage[];
        // Sort by timestamp and limit
        const sorted = messages.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
        resolve(sorted);
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

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    const stores = ['messages', 'contacts', 'conversations'];
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
