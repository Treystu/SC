// Stub database module for core library
// The actual database implementation is in web/src/storage/database.ts
// This stub is used for testing the offline queue in isolation

export interface Database {
  offlineQueue: {
    toArray(): Promise<any[]>;
    add(item: any): Promise<void>;
    where(field: string): any; // Mocking Dexie-like syntax
    delete(id: string): Promise<void>;
    update(id: string, changes: any): Promise<void>;
    count(): Promise<number>;
    clear(): Promise<void>;
  };
}

let mockDatabase: Database | null = null;

export function getDatabase(): Database {
  if (!mockDatabase) {
    throw new Error(
      "Database not initialized. This stub should be mocked in tests.",
    );
  }
  return mockDatabase;
}

export function setMockDatabase(db: Database): void {
  mockDatabase = db;
}
