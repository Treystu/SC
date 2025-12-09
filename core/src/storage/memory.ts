/**
 * Memory Storage Adapter
 * 
 * In-memory implementation of a key-value storage adapter.
 * Useful for testing and temporary storage scenarios.
 */

export interface StorageAdapter {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  values(): Promise<string[]>;
  entries(): Promise<[string, string][]>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

/**
 * In-memory storage adapter implementation
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async values(): Promise<string[]> {
    return Array.from(this.store.values());
  }

  async entries(): Promise<[string, string][]> {
    return Array.from(this.store.entries());
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async size(): Promise<number> {
    return this.store.size;
  }

  /**
   * Get all data as a plain object (useful for serialization)
   */
  async toObject(): Promise<Record<string, string>> {
    const obj: Record<string, string> = {};
    for (const [key, value] of this.store.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Load data from a plain object
   */
  async fromObject(data: Record<string, string>): Promise<void> {
    this.store.clear();
    for (const [key, value] of Object.entries(data)) {
      this.store.set(key, value);
    }
  }
}

/**
 * Typed memory storage adapter with JSON serialization
 */
export class TypedMemoryStorage<T> {
  private adapter: MemoryStorageAdapter;

  constructor(adapter?: MemoryStorageAdapter) {
    this.adapter = adapter || new MemoryStorageAdapter();
  }

  async get(key: string): Promise<T | undefined> {
    const value = await this.adapter.get(key);
    if (value === undefined) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await this.adapter.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.adapter.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.adapter.has(key);
  }

  async keys(): Promise<string[]> {
    return this.adapter.keys();
  }

  async clear(): Promise<void> {
    return this.adapter.clear();
  }

  async size(): Promise<number> {
    return this.adapter.size();
  }

  getAdapter(): MemoryStorageAdapter {
    return this.adapter;
  }
}
