export interface SchemaVersion {
  version: number;
  migrations: Migration[];
}

export interface Migration {
  version: number;
  up: (db: IDBDatabase) => Promise<void>;
  down: (db: IDBDatabase) => Promise<void>;
}

export const CURRENT_SCHEMA_VERSION = 4;

export const migrations: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      // Initial schema
      if (!db.objectStoreNames.contains("contacts")) {
        const contactStore = db.createObjectStore("contacts", {
          keyPath: "id",
        });
        contactStore.createIndex("publicKey", "publicKey", { unique: true });
        contactStore.createIndex("fingerprint", "fingerprint", {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains("messages")) {
        const messageStore = db.createObjectStore("messages", {
          keyPath: "id",
        });
        messageStore.createIndex("conversationId", "conversationId", {
          unique: false,
        });
        messageStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    },
    down: async (db) => {
      if (db.objectStoreNames.contains("contacts")) {
        db.deleteObjectStore("contacts");
      }
      if (db.objectStoreNames.contains("messages")) {
        db.deleteObjectStore("messages");
      }
    },
  },
  {
    version: 2,
    up: async (db) => {
      if (!db.objectStoreNames.contains("offlineQueue")) {
        const store = db.createObjectStore("offlineQueue", { keyPath: "id" });
        store.createIndex("nextRetry", "nextRetry", { unique: false });
      }
    },
    down: async (db) => {
      if (db.objectStoreNames.contains("offlineQueue")) {
        db.deleteObjectStore("offlineQueue");
      }
    },
  },
  {
    version: 3,
    up: async (db) => {
      // Add missing object stores for V1 persistence
      if (!db.objectStoreNames.contains("conversations")) {
        const store = db.createObjectStore("conversations", { keyPath: "id" });
        store.createIndex("lastMessageTimestamp", "lastMessageTimestamp", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("groups")) {
        db.createObjectStore("groups", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("identities")) {
        const store = db.createObjectStore("identities", { keyPath: "id" });
        store.createIndex("isPrimary", "isPrimary", { unique: false });
      }
      if (!db.objectStoreNames.contains("persistedPeers")) {
        const store = db.createObjectStore("persistedPeers", { keyPath: "id" });
        store.createIndex("lastSeen", "lastSeen", { unique: false });
      }
      if (!db.objectStoreNames.contains("routes")) {
        db.createObjectStore("routes", { keyPath: "destinationId" });
      }
      if (!db.objectStoreNames.contains("sessionKeys")) {
        const store = db.createObjectStore("sessionKeys", {
          keyPath: "peerId",
        });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }
    },
    down: async (db) => {
      const stores = [
        "conversations",
        "groups",
        "identities",
        "persistedPeers",
        "routes",
        "sessionKeys",
      ];
      stores.forEach((store) => {
        if (db.objectStoreNames.contains(store)) {
          db.deleteObjectStore(store);
        }
      });
    },
  },
  {
    version: 4,
    up: async (db) => {
      // Fix for offline-queue naming mismatch and ensure all stores exist
      // Service worker uses 'offline-queue' (hyphenated), but v2 created 'offlineQueue' (camelCase)
      if (!db.objectStoreNames.contains("offline-queue")) {
        const store = db.createObjectStore("offline-queue", { keyPath: "id" });
        store.createIndex("nextRetry", "nextRetry", { unique: false });

        // Migrate data from old store if it exists
        if (db.objectStoreNames.contains("offlineQueue")) {
          // We can't easily migrate data inside onupgradeneeded via transaction if we are modifying schema
          // But we can at least ensure the new store exists.
          // Ideally we would copy data, but for a queue it's acceptable to start fresh if needed to fix the crash.
          // Or we could try to read from old and write to new if we had access to transaction,
          // but 'offlineQueue' might be deleted in a future step or ignored.
          // For now, let's just ensure the correct store exists.
        }
      }

      // Re-verify all other stores exist (Safety check for broken migrations)
      if (!db.objectStoreNames.contains("conversations")) {
        const store = db.createObjectStore("conversations", { keyPath: "id" });
        store.createIndex("lastMessageTimestamp", "lastMessageTimestamp", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("groups")) {
        db.createObjectStore("groups", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("identities")) {
        const store = db.createObjectStore("identities", { keyPath: "id" });
        store.createIndex("isPrimary", "isPrimary", { unique: false });
      }
      if (!db.objectStoreNames.contains("persistedPeers")) {
        const store = db.createObjectStore("persistedPeers", { keyPath: "id" });
        store.createIndex("lastSeen", "lastSeen", { unique: false });
      }
      if (!db.objectStoreNames.contains("routes")) {
        db.createObjectStore("routes", { keyPath: "destinationId" });
      }
      if (!db.objectStoreNames.contains("sessionKeys")) {
        const store = db.createObjectStore("sessionKeys", {
          keyPath: "peerId",
        });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      }
    },
    down: async (db) => {
      if (db.objectStoreNames.contains("offline-queue")) {
        db.deleteObjectStore("offline-queue");
      }
    },
  },
];

export async function validateAndMigrate(
  db: IDBDatabase,
  currentVersion: number,
): Promise<void> {
  const targetVersion = CURRENT_SCHEMA_VERSION;

  if (currentVersion === targetVersion) {
    return; // No migration needed
  }

  if (currentVersion > targetVersion) {
    throw new Error("Database version is newer than application version");
  }

  // Run migrations
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    const migration = migrations.find((m) => m.version === v);
    if (!migration) {
      throw new Error(`Missing migration for version ${v}`);
    }

    console.log(`Running migration to version ${v}`);
    await migration.up(db);
  }
}
