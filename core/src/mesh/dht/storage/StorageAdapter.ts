/**
 * DHT Storage Adapter Interface
 * Defines the contract for persisting DHT data
 */
export interface StorageAdapter {
  /**
   * Store a value by key
   */
  store(key: string, value: Uint8Array): Promise<void>;

  /**
   * Retrieve a value by key
   */
  get(key: string): Promise<Uint8Array | null>;

  /**
   * Delete a value by key
   */
  delete(key: string): Promise<void>;

  /**
   * Get all keys (optional, for debugging/maintenance)
   */
  keys?(): Promise<string[]>;

  /**
   * Check presence of a key
   */
  has?(key: string): Promise<boolean> | boolean;

  /**
   * Clear all storage
   */
  clear(): Promise<void>;
}
