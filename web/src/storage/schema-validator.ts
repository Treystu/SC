export interface SchemaVersion {
  version: number;
  migrations: Migration[];
}

export interface Migration {
  version: number;
  up: (db: IDBDatabase) => Promise<void>;
  down: (db: IDBDatabase) => Promise<void>;
}

export const CURRENT_SCHEMA_VERSION = 2;

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      // Initial schema
      if (!db.objectStoreNames.contains('contacts')) {
        const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
        contactStore.createIndex('publicKey', 'publicKey', { unique: true });
        contactStore.createIndex('fingerprint', 'fingerprint', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('messages')) {
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('conversationId', 'conversationId', { unique: false });
        messageStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    },
    down: async (db) => {
      if (db.objectStoreNames.contains('contacts')) {
        db.deleteObjectStore('contacts');
      }
      if (db.objectStoreNames.contains('messages')) {
        db.deleteObjectStore('messages');
      }
    }
  },
  {
    version: 2,
    up: async (db) => {
      if (!db.objectStoreNames.contains('offlineQueue')) {
        const store = db.createObjectStore('offlineQueue', { keyPath: 'id' });
        store.createIndex('nextRetry', 'nextRetry', { unique: false });
      }
    },
    down: async (db) => {
      if (db.objectStoreNames.contains('offlineQueue')) {
        db.deleteObjectStore('offlineQueue');
      }
    }
  }
];

export async function validateAndMigrate(db: IDBDatabase, currentVersion: number): Promise<void> {
  const targetVersion = CURRENT_SCHEMA_VERSION;
  
  if (currentVersion === targetVersion) {
    return; // No migration needed
  }
  
  if (currentVersion > targetVersion) {
    throw new Error('Database version is newer than application version');
  }
  
  // Run migrations
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    const migration = migrations.find(m => m.version === v);
    if (!migration) {
      throw new Error(`Missing migration for version ${v}`);
    }
    
    console.log(`Running migration to version ${v}`);
    await migration.up(db);
  }
}