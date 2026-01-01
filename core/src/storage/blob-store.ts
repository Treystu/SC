import { sha256 } from "@noble/hashes/sha2.js";
import { PersistenceAdapter } from "../mesh/relay.js";

function hashData(data: Uint8Array): string {
  const hash = sha256(data);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * BlobStore - In-Memory Blob Storage for V1
 *
 * IMPORTANT LIMITATIONS:
 * - Storage is MEMORY-ONLY (blobs are lost on page refresh/app restart)
 * - Recommended maximum file size: 10MB per blob
 * - Total storage limit: 100MB (configurable via maxTotalSize)
 * - For production deployments, consider:
 *   - Implementing disk-based storage (IndexedDB for web, FileSystem for mobile)
 *   - Adding blob expiration/garbage collection
 *   - Using external blob storage (CDN, S3, IPFS)
 *
 * V2 TODO: Implement persistent blob storage adapter
 */
export class BlobStore {
  private persistence?: PersistenceAdapter;
  private memoryStore: Map<string, Uint8Array> = new Map();

  // Size limits for memory safety
  private readonly MAX_BLOB_SIZE = 10 * 1024 * 1024; // 10MB per blob
  private readonly MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB total
  private currentTotalSize = 0;

  constructor(persistence?: PersistenceAdapter) {
    this.persistence = persistence;
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

    // Store in memory
    this.memoryStore.set(hash, data);

    // V1: Memory-only storage
    // V2 TODO: Implement persistent storage adapter (IndexedDB, FileSystem, etc.)
    // if (this.persistence) { ... }

    return hash;
  }

  /**
   * Retrieve data by hash
   */
  async get(hash: string): Promise<Uint8Array | undefined> {
    return this.memoryStore.get(hash);
  }

  /**
   * Check if we have the blob
   */
  async has(hash: string): Promise<boolean> {
    return this.memoryStore.has(hash);
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
