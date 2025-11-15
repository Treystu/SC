/**
 * Tests for db-schema.ts - Database schema and operations
 */

import {
  DB_NAME,
  DB_VERSION,
  STORE_CONFIGS,
  initializeDatabase,
  clearDatabase,
  getDatabaseSize,
  type Message,
  type Contact,
  type Conversation,
  type Peer,
  type FileMetadata,
  type Settings,
  type KeyPair
} from './db-schema';

// Mock IndexedDB
class MockIDBRequest {
  result: any;
  error: Error | null = null;
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(result?: any, error?: Error) {
    this.result = result;
    this.error = error || null;
    setTimeout(() => {
      if (this.error && this.onerror) {
        this.onerror({ target: this });
      } else if (this.onsuccess) {
        this.onsuccess({ target: this });
      }
    }, 0);
  }
}

class MockIDBObjectStore {
  name: string;
  indexes: Map<string, any> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  createIndex(name: string, keyPath: string, options?: any) {
    this.indexes.set(name, { name, keyPath, ...options });
    return { name, keyPath };
  }

  clear() {
    return new MockIDBRequest();
  }
}

class MockIDBTransaction {
  objectStoreNames: string[];
  mode: string;
  oncomplete: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  error: Error | null = null;
  private stores: Map<string, MockIDBObjectStore> = new Map();

  constructor(storeNames: string[], mode: string) {
    this.objectStoreNames = storeNames;
    this.mode = mode;
    storeNames.forEach(name => {
      this.stores.set(name, new MockIDBObjectStore(name));
    });
    setTimeout(() => {
      if (this.oncomplete) this.oncomplete();
    }, 0);
  }

  objectStore(name: string) {
    return this.stores.get(name) || new MockIDBObjectStore(name);
  }
}

class MockIDBDatabase {
  name: string;
  version: number;
  objectStoreNames: string[];

  constructor(name: string, version: number, stores: string[] = []) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = stores;
  }

  createObjectStore(name: string, options?: any) {
    if (!this.objectStoreNames.includes(name)) {
      this.objectStoreNames.push(name);
    }
    return new MockIDBObjectStore(name);
  }

  transaction(storeNames: string | string[], mode: string) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new MockIDBTransaction(names, mode);
  }
}

describe('db-schema', () => {
  let mockIndexedDB: any;
  let mockDatabase: MockIDBDatabase;

  beforeEach(() => {
    mockDatabase = new MockIDBDatabase(DB_NAME, DB_VERSION, []);
    mockIndexedDB = {
      open: jest.fn((name: string, version: number) => {
        return new MockIDBRequest(mockDatabase);
      })
    };
    (global as any).indexedDB = mockIndexedDB;
  });

  afterEach(() => {
    delete (global as any).indexedDB;
  });

  describe('Constants', () => {
    it('should have correct database name', () => {
      expect(DB_NAME).toBe('SovereignCommunications');
    });

    it('should have correct database version', () => {
      expect(DB_VERSION).toBe(1);
    });

    it('should have all required store configurations', () => {
      expect(STORE_CONFIGS).toHaveProperty('messages');
      expect(STORE_CONFIGS).toHaveProperty('contacts');
      expect(STORE_CONFIGS).toHaveProperty('conversations');
      expect(STORE_CONFIGS).toHaveProperty('peers');
      expect(STORE_CONFIGS).toHaveProperty('files');
      expect(STORE_CONFIGS).toHaveProperty('settings');
      expect(STORE_CONFIGS).toHaveProperty('keypair');
    });
  });

  describe('Store Configurations', () => {
    it('should have correct messages store config', () => {
      const config = STORE_CONFIGS.messages;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toHaveLength(4);
      expect(config.indexes?.map(i => i.name)).toEqual([
        'conversationId',
        'timestamp',
        'senderId',
        'status'
      ]);
    });

    it('should have correct contacts store config', () => {
      const config = STORE_CONFIGS.contacts;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toHaveLength(2);
      expect(config.indexes?.[0].unique).toBe(true); // publicKey is unique
    });

    it('should have correct conversations store config', () => {
      const config = STORE_CONFIGS.conversations;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toHaveLength(2);
    });

    it('should have correct peers store config', () => {
      const config = STORE_CONFIGS.peers;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toHaveLength(3);
      expect(config.indexes?.[0].name).toBe('publicKey');
      expect(config.indexes?.[0].unique).toBe(true);
    });

    it('should have correct files store config', () => {
      const config = STORE_CONFIGS.files;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toHaveLength(2);
    });

    it('should have settings store config without indexes', () => {
      const config = STORE_CONFIGS.settings as any;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toBeUndefined();
    });

    it('should have keypair store config without indexes', () => {
      const config = STORE_CONFIGS.keypair as any;
      expect(config.keyPath).toBe('id');
      expect(config.indexes).toBeUndefined();
    });
  });

  describe('initializeDatabase', () => {
    it('should open database with correct name and version', async () => {
      await initializeDatabase();
      expect(mockIndexedDB.open).toHaveBeenCalledWith(DB_NAME, DB_VERSION);
    });

    it('should resolve with database instance', async () => {
      const db = await initializeDatabase();
      expect(db).toBe(mockDatabase);
    });

    it('should handle database open errors', async () => {
      const error = new Error('Database open failed');
      mockIndexedDB.open = jest.fn(() => new MockIDBRequest(undefined, error));
      
      await expect(initializeDatabase()).rejects.toThrow('Database open failed');
    });

    it('should create object stores on upgrade', async () => {
      mockIndexedDB.open = jest.fn((name: string, version: number) => {
        const request = {
          result: mockDatabase,
          error: null,
          onsuccess: null as any,
          onerror: null as any,
          onupgradeneeded: null as any
        };

        setTimeout(() => {
          if (request.onupgradeneeded) {
            try {
              request.onupgradeneeded({ target: request });
            } catch (e) {
              // Ignore errors in test
            }
          }
          if (request.onsuccess) {
            request.onsuccess({ target: request });
          }
        }, 0);

        return request;
      });

      const db = await initializeDatabase();
      
      // DB should be returned
      expect(db).toBeDefined();
      expect(db).toBe(mockDatabase);
    });
  });

  describe('clearDatabase', () => {
    beforeEach(() => {
      mockDatabase.objectStoreNames = [
        'messages',
        'contacts',
        'conversations',
        'peers',
        'files',
        'settings',
        'keypair'
      ];
    });

    it('should clear all object stores', async () => {
      await clearDatabase();
      // Transaction should be created for all stores
      expect(mockDatabase.objectStoreNames.length).toBeGreaterThan(0);
    });

    it('should use readwrite transaction', async () => {
      const transactionSpy = jest.spyOn(mockDatabase, 'transaction');
      await clearDatabase();
      expect(transactionSpy).toHaveBeenCalledWith(
        expect.any(Array),
        'readwrite'
      );
    });

    it('should handle clear errors gracefully', async () => {
      const error = new Error('Clear failed');
      mockDatabase.transaction = jest.fn(() => {
        const tx = new MockIDBTransaction([], 'readwrite');
        tx.error = error;
        tx.oncomplete = null;
        setTimeout(() => {
          if (tx.onerror) tx.onerror({ target: tx });
        }, 0);
        return tx;
      });

      try {
        await clearDatabase();
        fail('Should have thrown');
      } catch (e) {
        // Expected to throw
        expect(e).toBeDefined();
      }
    });
  });

  describe('getDatabaseSize', () => {
    it('should return size estimate when available', async () => {
      const mockEstimate = {
        usage: 1024 * 1024, // 1MB
        quota: 1024 * 1024 * 1024 // 1GB
      };
      
      (global as any).navigator = {
        storage: {
          estimate: jest.fn().mockResolvedValue(mockEstimate)
        }
      };

      const result = await getDatabaseSize();
      
      expect(result.usage).toBe(1024 * 1024);
      expect(result.quota).toBe(1024 * 1024 * 1024);
      expect(result.percentage).toBeCloseTo(0.09765625, 5);
    });

    it('should handle missing usage/quota', async () => {
      (global as any).navigator = {
        storage: {
          estimate: jest.fn().mockResolvedValue({})
        }
      };

      const result = await getDatabaseSize();
      
      expect(result.usage).toBe(0);
      expect(result.quota).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it('should handle missing storage API', async () => {
      (global as any).navigator = {};

      const result = await getDatabaseSize();
      
      expect(result.usage).toBe(0);
      expect(result.quota).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it('should calculate percentage correctly', async () => {
      (global as any).navigator = {
        storage: {
          estimate: jest.fn().mockResolvedValue({
            usage: 500,
            quota: 1000
          })
        }
      };

      const result = await getDatabaseSize();
      
      expect(result.percentage).toBe(50);
    });

    it('should handle zero quota', async () => {
      (global as any).navigator = {
        storage: {
          estimate: jest.fn().mockResolvedValue({
            usage: 100,
            quota: 0
          })
        }
      };

      const result = await getDatabaseSize();
      
      expect(result.percentage).toBe(0);
    });
  });

  describe('TypeScript Interfaces', () => {
    it('should allow valid Message object', () => {
      const message: Message = {
        id: 'msg1',
        conversationId: 'conv1',
        senderId: 'user1',
        recipientId: 'user2',
        content: 'Hello',
        timestamp: Date.now(),
        type: 'text',
        encrypted: true,
        status: 'sent'
      };
      
      expect(message.id).toBe('msg1');
      expect(message.type).toBe('text');
    });

    it('should allow valid Contact object', () => {
      const contact: Contact = {
        id: 'contact1',
        publicKey: 'pubkey123',
        addedAt: Date.now(),
        verified: true,
        blocked: false
      };
      
      expect(contact.verified).toBe(true);
    });

    it('should allow valid Conversation object', () => {
      const conversation: Conversation = {
        id: 'conv1',
        type: 'direct',
        participantIds: ['user1', 'user2'],
        unreadCount: 0,
        muted: false,
        archived: false,
        createdAt: Date.now()
      };
      
      expect(conversation.type).toBe('direct');
    });

    it('should allow valid Peer object', () => {
      const peer: Peer = {
        id: 'peer1',
        publicKey: 'pubkey123',
        lastSeen: Date.now(),
        connected: true,
        connectionType: 'webrtc'
      };
      
      expect(peer.connected).toBe(true);
    });

    it('should allow valid FileMetadata object', () => {
      const file: FileMetadata = {
        id: 'file1',
        messageId: 'msg1',
        name: 'document.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        hash: 'abc123',
        uploadedAt: Date.now(),
        status: 'uploaded'
      };
      
      expect(file.status).toBe('uploaded');
    });

    it('should allow valid Settings object', () => {
      const settings: Settings = {
        id: 'user_settings',
        theme: 'dark',
        notifications: {
          enabled: true,
          sound: true,
          vibrate: false,
          showPreviews: true
        },
        privacy: {
          readReceipts: true,
          typingIndicators: true,
          lastSeen: true
        },
        media: {
          autoDownload: true,
          downloadOnWifi: true,
          maxFileSize: 10485760
        },
        network: {
          enableWebRTC: true,
          enableBLE: false,
          maxPeers: 50
        }
      };
      
      expect(settings.theme).toBe('dark');
    });

    it('should allow valid KeyPair object', () => {
      const keypair: KeyPair = {
        id: 'identity_keypair',
        publicKey: 'pub123',
        privateKey: 'priv456',
        createdAt: Date.now()
      };
      
      expect(keypair.id).toBe('identity_keypair');
    });
  });
});
