import { randomBytes } from 'crypto';

// In-memory store
const memoryStore: Record<string, any[]> = {
    peers: [],
    signals: [],
    messages: []
};

// Helper to generate IDs similar to MongoDB ObjectId (24 hex chars)
function generateId(): string {
    return randomBytes(12).toString('hex');
}

// Mock Collection
class MockCollection {
    private name: string;

    constructor(name: string) {
        this.name = name;
        if (!memoryStore[name]) {
            memoryStore[name] = [];
        }
    }

    async updateOne(filter: any, update: any, options?: any) {
        const collection = memoryStore[this.name];
        let item = collection.find(i => this.matches(i, filter));

        if (item) {
            this.applyUpdate(item, update);
        } else if (options?.upsert) {
            // If filter has _id, use it, otherwise generate new one
            const id = filter._id || generateId();
            item = { ...filter, _id: id };
            this.applyUpdate(item, update);
            collection.push(item);
        }
        return { modifiedCount: item ? 1 : 0, upsertedCount: (!item && options?.upsert) ? 1 : 0 };
    }

    async insertOne(doc: any) {
        const collection = memoryStore[this.name];
        const newDoc = { _id: generateId(), ...doc };
        collection.push(newDoc);
        return { insertedId: newDoc._id };
    }

    find(filter: any) {
        const collection = memoryStore[this.name];
        let result = collection.filter(i => this.matches(i, filter));

        return {
            project: (projection: any) => {
                // Simple projection implementation
                result = result.map(item => {
                    const projected: any = {};
                    for (const key in projection) {
                        if (projection[key] === 1) {
                            projected[key] = item[key];
                        }
                    }
                    // Always include _id unless explicitly excluded (not implemented here for simplicity)
                    if (projection._id !== 0) {
                        projected._id = item._id;
                    }
                    return projected;
                });
                return this.cursor(result);
            },
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
            toArray: async () => result
        };
    }

    async updateMany(filter: any, update: any) {
        const collection = memoryStore[this.name];
        const items = collection.filter(i => this.matches(i, filter));
        items.forEach(item => this.applyUpdate(item, update));
        return { modifiedCount: items.length };
    }

    private cursor(result: any[]) {
        return {
            project: (projection: any) => this.find({}).project(projection), // Chaining mock
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
            toArray: async () => result
        };
    }

    private matches(item: any, filter: any): boolean {
        for (const key in filter) {
            const value = filter[key];
            if (typeof value === 'object' && value !== null) {
                // Handle operators like $gt, $ne, $in
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

    private applyUpdate(item: any, update: any) {
        if (update.$set) {
            Object.assign(item, update.$set);
        }
    }
}

// Mock Db
class MockDb {
    collection(name: string) {
        return new MockCollection(name);
    }
}

const mockDb = new MockDb();

export async function connectToDatabase(): Promise<any> {
    console.log('Using in-memory database');
    return mockDb;
}