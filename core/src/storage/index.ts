/**
 * Storage Module
 *
 * Provides storage adapters for Sovereign Communications app.
 */

// Legacy storage adapters
export {
  MemoryStorageAdapter,
  TypedMemoryStorage,
  type StorageAdapter,
} from './memory.js';

// Apocalypse-resilient message storage
export * from "./MessageStore.js";
export * from "./MemoryMessageStore.js";
export * from "./IndexedDBMessageStore.js";
export * from "./QuotaManager.js";
