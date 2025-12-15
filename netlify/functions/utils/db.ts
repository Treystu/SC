import { getStore } from "@netlify/blobs";
import { randomBytes } from "crypto";

// In-memory store (Fallback of last resort)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryStore: Record<string, any[]> = {
  peers: [],
  signals: [],
  messages: [],
};

function generateId(): string {
  return randomBytes(12).toString("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Document = Record<string, any>;

// Netlify Blobs Collection
class BlobsCollection {
  private name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any; // Type is complicated, using any for flexibility

  constructor(name: string) {
    this.name = name;
    // We use a store named after the collection
    this.store = getStore({ name, consistency: "strong" });
  }

  // Generate a key based on collection type for optimized listing
  private getKey(doc: Document): string {
    if (doc._id) return doc._id;

    // Custom key strategies for efficient prefix-based lookup
    if (this.name === "signals" && doc.to) {
      // Key: to/timestamp-random
      return `${doc.to}/${Date.now()}-${generateId()}`;
    }
    if (this.name === "messages" && doc.timestamp) {
      // Key: timestamp-random
      const ts = new Date(doc.timestamp).toISOString();
      return `${ts}-${generateId()}`;
    }

    return generateId();
  }

  async updateOne(filter: Document, update: Document, options?: Document) {
    let key = filter._id;
    let item: Document | null = null;

    // specialized lookup for single ID
    if (key) {
      try {
        item = await this.store.get(key, { type: "json" });
      } catch (e) {
        /* ignore 404 */
      }
    } else {
      // Warning: Full scan for non-ID updateOne is slow
      // But room.ts only uses updateOne with _id (for peers)
      const all = await this.find(filter).toArray();
      if (all.length > 0 && all[0]) {
        item = all[0] as Document;
        key = item._id; // Found key
      }
    }

    if (item) {
      this.applyUpdate(item as Document, update);
      await this.store.set(key as string, JSON.stringify(item));
    } else if (options?.upsert) {
      // If we didn't find it, use the filter _id or generate one
      key = filter._id || generateId();
      item = { ...filter, _id: key };
      this.applyUpdate(item, update);
      await this.store.set(key, JSON.stringify(item));
    }

    return {
      modifiedCount: item ? 1 : 0,
      upsertedCount: !item && options?.upsert ? 1 : 0,
    };
  }

  async insertOne(doc: Document) {
    const key = this.getKey(doc);
    const newDoc = { ...doc, _id: key };

    // For peers, we might technically override if ID matches, but insertOne implies new
    // logic in room.ts uses insertOne for signals/messages
    // signals uses generateKey -> likely unique

    await this.store.set(key, JSON.stringify(newDoc));
    return { insertedId: key };
  }

  find(filter: Document) {
    // Optimization for common queries
    let prefix = undefined;

    // Signals query: { to: peerId, ... } -> use prefix "peerId/"
    if (this.name === "signals" && filter.to && typeof filter.to === "string") {
      prefix = `${filter.to}/`;
    }

    // We can't easily optimize timestamp ranges with just list() unless we assume precise keys
    // Detailed filtering happens in memory after list()

    return {
      project: (projection: Document) =>
        this.cursor(filter, projection, undefined, undefined, prefix),
      sort: (sortOpts: Document) =>
        this.cursor(filter, undefined, sortOpts, undefined, prefix),
      limit: (limit: number) =>
        this.cursor(filter, undefined, undefined, limit, prefix),
      toArray: async () => {
        return (
          await this.cursor(filter, undefined, undefined, undefined, prefix)
        ).toArray();
      },
    };
  }

  // Custom cursor-like chain
  private async cursor(
    filter: Document,
    projection?: Document,
    sortOpts?: Document,
    limit?: number,
    prefix?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // Simplified return for chaining

    // 1. List keys (with prefix if applicable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listOpts: any = { prefix };
    const { blobs } = await this.store.list(listOpts);

    // 2. Filter keys based on metadata if possible?
    // room.ts filters peers by lastSeen > 5 mins ago.
    // blobs have 'lastModified'. We can use that as a proxy for lastSeen!
    // This saves reading the body of stale peers.
    let candidateBlobs = blobs;

    if (this.name === "peers" && filter.lastSeen && filter.lastSeen.$gt) {
      const threshold = new Date(filter.lastSeen.$gt).getTime();
      candidateBlobs = blobs.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b: any) => new Date(b.lastModified).getTime() > threshold,
      );
    }

    // 3. Fetch bodies (parallel)
    // Limit parallelism if too many?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchPromises = candidateBlobs.map((b: any) =>
      this.store.get(b.key, { type: "json" }),
    );
    const docs = (await Promise.all(fetchPromises)).filter((d) => d !== null);

    // 4. In-memory filter
    const result = docs.filter((item) => this.matches(item, filter));

    // 5. Sort
    if (sortOpts) {
      result.sort((a, b) => {
        for (const key in sortOpts) {
          if (a[key] < b[key]) return sortOpts[key] === 1 ? -1 : 1;
          if (a[key] > b[key]) return sortOpts[key] === 1 ? 1 : -1;
        }
        return 0;
      });
    }

    // 6. Limit
    if (limit) {
      // result = result.slice(0, limit); // Handled in toArray
    }

    // 7. Project
    let finalResult = result;
    if (projection) {
      finalResult = result.map((item) => {
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
    }

    // apply limit here
    if (limit) {
      finalResult = finalResult.slice(0, limit);
    }

    // Return object with toArray for final call (or chainable if needed, but simple here)
    return {
      toArray: async () => finalResult,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: (p: any) => this.cursor(filter, p, sortOpts, limit, prefix), // crude chaining
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sort: (s: any) => this.cursor(filter, projection, s, limit, prefix),
      limit: (l: number) =>
        this.cursor(filter, projection, sortOpts, l, prefix),
    };
  }

  async updateMany(filter: Document, update: Document) {
    // Fetch all matching
    const cursor = await this.cursor(filter); // cursor returns object with toArray
    const items = await cursor.toArray();

    // Apply update and save
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promises = items.map(async (item: any) => {
      this.applyUpdate(item, update);
      await this.store.set(item._id, JSON.stringify(item));
    });

    await Promise.all(promises);
    return { modifiedCount: items.length };
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

// Keep MockCollection for in-memory fallback
class MockCollection {
  private name: string;

  constructor(name: string) {
    this.name = name;
    if (!memoryStore[name]) {
      memoryStore[name] = [];
    }
  }

  async updateOne(filter: Document, update: Document, options?: Document) {
    const collection = memoryStore[this.name];
    let item = collection.find((i) => this.matches(i, filter));

    if (item) {
      this.applyUpdate(item, update);
    } else if (options?.upsert) {
      const id = filter._id || generateId();
      item = { ...filter, _id: id };
      this.applyUpdate(item, update);
      collection.push(item);
    }
    return {
      modifiedCount: item ? 1 : 0,
      upsertedCount: !item && options?.upsert ? 1 : 0,
    };
  }

  async insertOne(doc: Document) {
    const collection = memoryStore[this.name];
    const newDoc = { _id: generateId(), ...doc };
    collection.push(newDoc);
    return { insertedId: newDoc._id };
  }

  find(filter: Document) {
    const collection = memoryStore[this.name];
    let result = collection.filter((i) => this.matches(i, filter));

    return {
      project: (projection: Document) => {
        result = result.map((item) => {
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
        return this.cursor(result);
      },
      sort: (sortOpts: Document) => {
        result.sort((a, b) => {
          for (const key in sortOpts) {
            if (a[key] < b[key]) return sortOpts[key] === 1 ? -1 : 1;
            if (a[key] > b[key]) return sortOpts[key] === 1 ? 1 : -1;
          }
          return 0;
        });
        return this.cursor(result);
      },
      limit: (limit: number) => {
        result = result.slice(0, limit);
        return this.cursor(result);
      },
      toArray: async () => result,
    };
  }

  async updateMany(filter: Document, update: Document) {
    const collection = memoryStore[this.name];
    const items = collection.filter((i) => this.matches(i, filter));
    items.forEach((item) => this.applyUpdate(item, update));
    return { modifiedCount: items.length };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cursor(result: any[]) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      project: (projection: any) => this.find({}).project(projection),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sort: (sortOpts: any) => {
        result.sort((a, b) => {
          for (const key in sortOpts) {
            if (a[key] < b[key]) return sortOpts[key] === 1 ? -1 : 1;
            if (a[key] > b[key]) return sortOpts[key] === 1 ? 1 : -1;
          }
          return 0;
        });
        return this.cursor(result);
      },
      limit: (limit: number) => {
        result = result.slice(0, limit);
        return this.cursor(result);
      },
      toArray: async () => result,
    };
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

// Abstract DB Adapter Interface
interface IDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection(name: string): any;
}

class BlobDbAdapter implements IDb {
  collection(name: string) {
    return new BlobsCollection(name);
  }
}

class MockDbAdapter implements IDb {
  collection(name: string) {
    return new MockCollection(name);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: IDb | any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function connectToDatabase(): Promise<IDb | any> {
  if (dbInstance) return dbInstance;

  console.log("DB: Initializing connection...");

  // 1. Try Netlify Blobs (Preferred Serverless Native)
  // Check if running on Netlify or have credentials
  if (
    process.env.NETLIFY_BLOBS_CONTEXT ||
    (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN)
  ) {
    try {
      console.log("DB: Connecting to Netlify Blobs...");
      // Verify connection by creating a store reference (lazy)
      getStore({
        name: "test_connection",
        consistency: "strong",
      });
      console.log("DB: Netlify Blobs store initialized");

      // Optional: await store.get('ping'); // Check connectivity?
      dbInstance = new BlobDbAdapter();
      return dbInstance;
    } catch (e) {
      console.error("DB: Failed to initialize Netlify Blobs:", e);
    }
  } else {
    console.log("DB: No Netlify Blobs credentials found.");
  }

  // 2. Try MongoDB
  if (process.env.MONGODB_URI) {
    try {
      console.log("DB: Connecting to MongoDB...");
      // @ts-expect-error - mongodb is optional
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      dbInstance = client.db(process.env.MONGODB_DB_NAME || "sc-messenger");
      console.log("DB: Connected to MongoDB");
      return dbInstance;
    } catch (error) {
      console.error(
        "DB: Failed to connect to MongoDB, falling back to in-memory:",
        error,
      );
    }
  } else {
    console.log("DB: No MONGODB_URI found.");
  }

  // 3. Fallback to in-memory (Broken state for mesh, but works for local dev/testing)
  if (!dbInstance) {
    console.warn(
      "DB WARNING: Using in-memory database. Peers will NOT see each other across function instances.",
    );
    dbInstance = new MockDbAdapter();
  }

  return dbInstance;
}
