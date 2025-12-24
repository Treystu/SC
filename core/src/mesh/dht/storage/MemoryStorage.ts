import { StorageAdapter } from "./StorageAdapter.js";

/**
 * In-memory storage adapter
 * Non-persistent, used for testing or fallback
 */
export class MemoryStorage implements StorageAdapter {
  private storeMap: Map<string, Uint8Array> = new Map();

  async store(key: string, value: Uint8Array): Promise<void> {
    this.storeMap.set(key, value);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.storeMap.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.storeMap.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.storeMap.keys());
  }

  async clear(): Promise<void> {
    this.storeMap.clear();
  }

  has(key: string): boolean {
    return this.storeMap.has(key);
  }
}
