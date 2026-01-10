import { sha256 } from "@noble/hashes/sha2.js";

export interface BlobPersistenceAdapter {
  put(hash: string, data: Uint8Array): Promise<void>;
  get(hash: string): Promise<Uint8Array | null>;
  has(hash: string): Promise<boolean>;
  delete(hash: string): Promise<void>;
  clear(): Promise<void>;
  getAll(): Promise<Map<string, Uint8Array>>;
  getSize(): Promise<number>;
}

function hashData(data: Uint8Array): string {
  const hash = sha256(data);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * BlobStore - Persistent Blob Storage with IndexedDB
 *
 * FEATURES:
 * - Persistent storage via IndexedDB (web) or FileSystem (mobile)
 * - Memory cache for fast access
 * - Automatic size tracking and quota management
 * - Recommended maximum file size: 10MB per blob
 * - Total storage limit: 100MB (configurable via maxTotalSize)
 * 
 * SNEAKERNET RELAY SUPPORT:
 * - Messages and attachments persist across app restarts
 * - Critical for offline mesh relay nodes that store-and-forward
 * - Data survives phone reboots, enabling reliable sneakernet proxying
 *
 * For future enhancements, consider:
 *   - Adding blob expiration/garbage collection
 *   - Using external blob storage (CDN, S3, IPFS) for large files
 */
export class BlobStore {
  private persistence?: BlobPersistenceAdapter;
  private memoryStore: Map<string, Uint8Array> = new Map();

  // Size limits for memory safety
  private readonly MAX_BLOB_SIZE = 10 * 1024 * 1024; // 10MB per blob
  private readonly MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB total
  private currentTotalSize = 0;
  private initialized = false;

  constructor(persistence?: BlobPersistenceAdapter) {
    this.persistence = persistence;
  }

  /**
   * Initialize persistent storage and load size metrics
   * Must be called before using the store
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    if (this.persistence) {
      // Load all blobs from persistent storage into memory cache
      const allBlobs = await this.persistence.getAll();
      this.memoryStore = allBlobs;
      
      // Calculate current total size from persistent storage
      this.currentTotalSize = 0;
      for (const blob of allBlobs.values()) {
        this.currentTotalSize += blob.length;
      }
    }
    
    this.initialized = true;
  }

  /**
   * Store data and return its hash
   * @throws Error if blob exceeds size limits
   */
  async put(data: Uint8Array): Promise<string> {
    const blobSize = data.length;

    // Validate blob size
    if (blobSize > this.MAX_BLOB_SIZE) {
      throw new Error(
        `Blob size (${(blobSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${this.MAX_BLOB_SIZE / 1024 / 1024}MB). ` +
        `Consider compressing the file or using external storage for large files.`
      );
    }

    // Check total storage limit
    if (this.currentTotalSize + blobSize > this.MAX_TOTAL_SIZE) {
      throw new Error(
        `Total storage limit exceeded. Current: ${(this.currentTotalSize / 1024 / 1024).toFixed(2)}MB, ` +
        `Attempting to add: ${(blobSize / 1024 / 1024).toFixed(2)}MB, ` +
        `Max: ${this.MAX_TOTAL_SIZE / 1024 / 1024}MB. ` +
        `Consider clearing old blobs or implementing persistent storage.`
      );
    }

    const hash = hashData(data);

    // Check if blob already exists (avoid double-counting size)
    const existingBlob = this.memoryStore.get(hash);
    if (existingBlob) {
      // Blob already exists with same content, no size change needed
      return hash;
    }

    // Add to total size since this is a new blob
    this.currentTotalSize += blobSize;

    // Store in memory first (for fast access)
    this.memoryStore.set(hash, data);

    // Store persistently if adapter is available
    if (this.persistence) {
      try {
        await this.persistence.put(hash, data);
      } catch (error) {
        // If persistent storage fails, remove from memory store to maintain consistency
        this.memoryStore.delete(hash);
        this.currentTotalSize -= blobSize;
        throw new Error(`Failed to persist blob: ${error}`);
      }
    }

    return hash;
  }

  /**
   * Retrieve data by hash
   */
  async get(hash: string): Promise<Uint8Array | undefined> {
    const data = this.memoryStore.get(hash);
    
    if (data) {
      return data;
    }

    if (this.persistence) {
      const persistedData = await this.persistence.get(hash);
      if (persistedData) {
        this.memoryStore.set(hash, persistedData);
        return persistedData;
      }
    }

    return undefined;
  }

  /**
   * Check if we have the blob
   */
  async has(hash: string): Promise<boolean> {
    if (this.memoryStore.has(hash)) {
      return true;
    }

    if (this.persistence) {
      return await this.persistence.has(hash);
    }

    return false;
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    blobCount: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    remainingBytes: number;
    remainingMB: number;
    utilizationPercent: number;
  } {
    return {
      blobCount: this.memoryStore.size,
      totalSizeBytes: this.currentTotalSize,
      totalSizeMB: Number((this.currentTotalSize / 1024 / 1024).toFixed(2)),
      remainingBytes: this.MAX_TOTAL_SIZE - this.currentTotalSize,
      remainingMB: Number(((this.MAX_TOTAL_SIZE - this.currentTotalSize) / 1024 / 1024).toFixed(2)),
      utilizationPercent: Number(((this.currentTotalSize / this.MAX_TOTAL_SIZE) * 100).toFixed(2)),
    };
  }

  /**
   * Clear all blobs (useful for testing or cleanup)
   */
  clear(): void {
    this.memoryStore.clear();
    this.currentTotalSize = 0;
  }
}

/**
 * IndexedDB implementation of BlobPersistenceAdapter for web browsers
 */
export class IndexedDBBlobAdapter implements BlobPersistenceAdapter {
  private dbName = 'BlobStorage';
  private storeName = 'blobs';
  private db: IDBDatabase | null = null;
  private version = 1;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
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

  private async ensureInit(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  async put(hash: string, data: Uint8Array): Promise<void> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data, hash);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async get(hash: string): Promise<Uint8Array | null> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(hash);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? new Uint8Array(result) : null);
      };
    });
  }

  async has(hash: string): Promise<boolean> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count(hash);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result > 0);
    });
  }

  async delete(hash: string): Promise<void> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(hash);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

async getAll(): Promise<Map<string, Uint8Array>> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const map = new Map<string, Uint8Array>();
      
      const request = store.openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const key = String(cursor.key);
          const data = new Uint8Array(cursor.value);
          map.set(key, data);
          cursor.continue();
        } else {
          resolve(map);
        }
      };
});
   }

  async getSize(): Promise<number> {
    await this.ensureInit();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}
