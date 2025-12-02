/**
 * IndexedDB-backed message deduplication adapter
 * Provides persistent seen message cache that survives app restart
 */

export interface MeshSeenAdapter {
  /**
   * Check if a message has been seen
   */
  hasSeen(messageHash: string): Promise<boolean>;

  /**
   * Mark a message as seen
   */
  markSeen(messageHash: string, timestamp?: number): Promise<void>;

  /**
   * Clear expired entries from the cache
   */
  cleanup(maxAgeMs: number): Promise<number>;

  /**
   * Get the number of entries in the cache
   */
  size(): Promise<number>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;
}

interface SeenEntry {
  hash: string;
  timestamp: number;
}

/**
 * In-memory implementation of MeshSeenAdapter for testing/fallback
 */
export class MemorySeenAdapter implements MeshSeenAdapter {
  private seen: Map<string, number> = new Map();

  async hasSeen(messageHash: string): Promise<boolean> {
    return this.seen.has(messageHash);
  }

  async markSeen(messageHash: string, timestamp?: number): Promise<void> {
    this.seen.set(messageHash, timestamp ?? Date.now());
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [hash, ts] of this.seen.entries()) {
      if (now - ts > maxAgeMs) {
        this.seen.delete(hash);
        removed++;
      }
    }
    return removed;
  }

  async size(): Promise<number> {
    return this.seen.size;
  }

  async clear(): Promise<void> {
    this.seen.clear();
  }
}

/**
 * IndexedDB-backed implementation of MeshSeenAdapter
 * Persists seen message cache across app restarts
 */
export class IndexedDbSeenAdapter implements MeshSeenAdapter {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly storeName = 'seen_messages';
  private readonly version = 1;
  private initPromise: Promise<void> | null = null;

  constructor(dbName: string = 'sc-mesh-dedup') {
    this.dbName = dbName;
  }

  /**
   * Initialize the database
   */
  private async init(): Promise<void> {
    if (this.db) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'hash' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async hasSeen(messageHash: string): Promise<boolean> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(messageHash);

      request.onsuccess = () => {
        resolve(request.result !== undefined);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async markSeen(messageHash: string, timestamp?: number): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const entry: SeenEntry = {
        hash: messageHash,
        timestamp: timestamp ?? Date.now()
      };

      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const cutoff = Date.now() - maxAgeMs;
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      
      let deleted = 0;
      const cursorRequest = index.openCursor(range);

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        resolve(deleted);
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  async size(): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async clear(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

/**
 * Create a seen adapter based on environment
 * Returns IndexedDbSeenAdapter if available, otherwise MemorySeenAdapter
 */
export function createSeenAdapter(dbName?: string): MeshSeenAdapter {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDbSeenAdapter(dbName);
  }
  return new MemorySeenAdapter();
}
