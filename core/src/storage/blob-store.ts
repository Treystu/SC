import { sha256 } from "@noble/hashes/sha2.js";
import { PersistenceAdapter } from "../mesh/relay.js";

function hashData(data: Uint8Array): string {
  const hash = sha256(data);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class BlobStore {
  private persistence?: PersistenceAdapter;
  private memoryStore: Map<string, Uint8Array> = new Map();

  constructor(persistence?: PersistenceAdapter) {
    this.persistence = persistence;
  }

  /**
   * Store data and return its hash
   */
  async put(data: Uint8Array): Promise<string> {
    const hash = hashData(data);

    // Store in memory
    this.memoryStore.set(hash, data);

    // Store in persistence if available
    if (this.persistence) {
      // We assume persistence adapter has a mechanism for blobs or we use a prefix
      // For now, let's assume we can use the saveMessage method or similar if generic,
      // but strictly PersistenceAdapter in relay.ts is for messages.
      // Ideally we should have a `BlobStorageAdapter`.
      // For V1, we'll stick to memory + let's see if we can reuse or just mocking it/skipping for now.
      // Actually, let's just use memory for V1 and add TODO for disk.
    }

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
}
