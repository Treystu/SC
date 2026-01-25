/**
 * In-Memory Database for Signaling Server
 *
 * FULLY SELF-CONTAINED - NO EXTERNAL DEPENDENCIES
 *
 * Architecture:
 * - Serverless functions are stateless - each invocation may be new
 * - This in-memory store works within a single function instance
 * - Clients poll frequently (1-2 seconds) to catch data before TTL
 * - Data has short TTLs to prevent stale accumulation
 * - Client-side IndexedDB provides long-term message persistence
 *
 * This works because:
 * - WebRTC signaling is fast (offer/answer exchange in seconds)
 * - DMs are delivered quickly via polling, then stored client-side
 * - If a function instance restarts, clients retry automatically
 */

import { randomBytes } from "crypto";

// Global in-memory store (persists within a single function instance)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryStore: Record<string, any[]> = {
  peers: [],
  signals: [],
  messages: [],
  dms: [],
};

function generateId(): string {
  return randomBytes(12).toString("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Document = Record<string, any>;

/**
 * Simple in-memory collection that mimics MongoDB-like operations
 */
class MemoryCollection {
  private name: string;

  constructor(name: string) {
    this.name = name;
    if (!memoryStore[name]) {
      memoryStore[name] = [];
    }
  }

  private get collection(): Document[] {
    return memoryStore[this.name];
  }

  async updateOne(filter: Document, update: Document, options?: Document) {
    let item = this.collection.find((i) => this.matches(i, filter));

    if (item) {
      this.applyUpdate(item, update);
    } else if (options?.upsert) {
      const id = filter._id || generateId();
      item = { ...filter, _id: id };
      this.applyUpdate(item, update);
      this.collection.push(item);
    }
    return {
      modifiedCount: item ? 1 : 0,
      upsertedCount: !item && options?.upsert ? 1 : 0,
    };
  }

  async insertOne(doc: Document) {
    const newDoc = { _id: generateId(), ...doc };
    this.collection.push(newDoc);
    return { insertedId: newDoc._id };
  }

  find(filter: Document) {
    const result = this.collection.filter((i) => this.matches(i, filter));
    return new MemoryCursor(result);
  }

  async updateMany(filter: Document, update: Document) {
    const items = this.collection.filter((i) => this.matches(i, filter));
    items.forEach((item) => this.applyUpdate(item, update));
    return { modifiedCount: items.length };
  }

  async deleteMany(filter: Document) {
    const initialLength = this.collection.length;
    const remaining = this.collection.filter((i) => !this.matches(i, filter));
    memoryStore[this.name] = remaining;
    return { deletedCount: initialLength - remaining.length };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private matches(item: any, filter: any): boolean {
    for (const key in filter) {
      const value = filter[key];
      if (typeof value === "object" && value !== null) {
        if (value.$gt) {
          if (!(new Date(item[key]) > new Date(value.$gt))) return false;
        }
        if (value.$ne) {
          if (item[key] === value.$ne) return false;
        }
        if (value.$in) {
          if (!value.$in.includes(item[key])) return false;
        }
      } else {
        if (item[key] !== value) return false;
      }
    }
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyUpdate(item: any, update: any) {
    if (update.$set) {
      Object.assign(item, update.$set);
    }
  }
}

/**
 * Chainable cursor for query results
 */
class MemoryCursor {
  private data: Document[];

  constructor(data: Document[]) {
    this.data = [...data];
  }

  project(projection: Document): MemoryCursor {
    this.data = this.data.map((item) => {
      const projected: Document = {};
      for (const key in projection) {
        if (projection[key] === 1) {
          projected[key] = item[key];
        }
      }
      if (projection._id !== 0) {
        projected._id = item._id;
      }
      return projected;
    });
    return this;
  }

  sort(sortOpts: Document): MemoryCursor {
    this.data.sort((a, b) => {
      for (const key in sortOpts) {
        if (a[key] < b[key]) return sortOpts[key] === 1 ? -1 : 1;
        if (a[key] > b[key]) return sortOpts[key] === 1 ? 1 : -1;
      }
      return 0;
    });
    return this;
  }

  limit(limit: number): MemoryCursor {
    this.data = this.data.slice(0, limit);
    return this;
  }

  async toArray(): Promise<Document[]> {
    return this.data;
  }
}

/**
 * In-Memory Database Adapter
 */
class MemoryDbAdapter {
  collection(name: string) {
    return new MemoryCollection(name);
  }
}

// Singleton instance
let dbInstance: MemoryDbAdapter | null = null;

/**
 * Get the database connection.
 * Uses in-memory storage only - fully self-contained.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function connectToDatabase(): Promise<any> {
  if (dbInstance) return dbInstance;

  console.log("DB: Initializing in-memory database (self-contained)");
  dbInstance = new MemoryDbAdapter();

  return dbInstance;
}

/**
 * Clean up expired data (prevents memory leaks in long-running instances)
 */
export function cleanupExpiredData() {
  const now = Date.now();

  // Remove signals older than 30 seconds
  const signalTTL = 30 * 1000;
  memoryStore.signals = memoryStore.signals.filter(
    (s) => now - new Date(s.timestamp).getTime() < signalTTL,
  );

  // Remove peers not seen in 2 minutes
  const peerTTL = 2 * 60 * 1000;
  memoryStore.peers = memoryStore.peers.filter(
    (p) => now - new Date(p.lastSeen).getTime() < peerTTL,
  );

  // Remove read DMs older than 5 minutes
  const dmTTL = 5 * 60 * 1000;
  memoryStore.dms = memoryStore.dms.filter(
    (d) => !d.read || now - new Date(d.timestamp).getTime() < dmTTL,
  );

  // Remove unread DMs older than 30 minutes (recipient never polled)
  const unreadDmTTL = 30 * 60 * 1000;
  memoryStore.dms = memoryStore.dms.filter(
    (d) => d.read || now - new Date(d.timestamp).getTime() < unreadDmTTL,
  );
}
