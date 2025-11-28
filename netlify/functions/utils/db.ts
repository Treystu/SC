import { MongoClient, Db } from 'mongodb';

let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
    if (cachedDb) {
        return cachedDb;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    const client = new MongoClient(uri);
    await client.connect();

    // Select database from URI or default to 'sovereign_db'
    const dbName = new URL(uri).pathname.substring(1) || 'sovereign_db';
    cachedDb = client.db(dbName);

    return cachedDb;
}
