/**
 * Secure key storage abstraction for different platforms
 */

export interface KeyStorage {
  /**
   * Store a key securely
   */
  storeKey(keyId: string, key: Uint8Array): Promise<void>;

  /**
   * Retrieve a key
   */
  getKey(keyId: string): Promise<Uint8Array | null>;

  /**
   * Delete a key
   */
  deleteKey(keyId: string): Promise<void>;

  /**
   * Check if a key exists
   */
  hasKey(keyId: string): Promise<boolean>;

  /**
   * List all key IDs
   */
  listKeys(): Promise<string[]>;
}

/**
 * Web implementation using IndexedDB
 */
export class WebKeyStorage implements KeyStorage {
  private dbName = 'sc-keystore';
  private storeName = 'keys';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async storeKey(keyId: string, key: Uint8Array): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(key, keyId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getKey(keyId: string): Promise<Uint8Array | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(keyId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteKey(keyId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(keyId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async hasKey(keyId: string): Promise<boolean> {
    const key = await this.getKey(keyId);
    return key !== null;
  }

  async listKeys(): Promise<string[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * In-memory implementation for Node.js/testing
 */
export class MemoryKeyStorage implements KeyStorage {
  private keys: Map<string, Uint8Array> = new Map();

  async storeKey(keyId: string, key: Uint8Array): Promise<void> {
    this.keys.set(keyId, new Uint8Array(key));
  }

  async getKey(keyId: string): Promise<Uint8Array | null> {
    const key = this.keys.get(keyId);
    return key ? new Uint8Array(key) : null;
  }

  async deleteKey(keyId: string): Promise<void> {
    this.keys.delete(keyId);
  }

  async hasKey(keyId: string): Promise<boolean> {
    return this.keys.has(keyId);
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.keys.keys());
  }

  clear(): void {
    this.keys.clear();
  }
}
