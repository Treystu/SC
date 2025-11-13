export class IndexedDBHandler {
  private dbName: string;
  private version: number;
  private db: IDBDatabase | null = null;

  constructor(dbName: string, version: number = 1) {
    this.dbName = dbName;
    this.version = version;
  }

  async open(stores: { name: string; keyPath?: string; autoIncrement?: boolean; indexes?: { name: string; keyPath: string; unique?: boolean }[] }[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        stores.forEach(storeConfig => {
          if (!db.objectStoreNames.contains(storeConfig.name)) {
            const objectStore = db.createObjectStore(storeConfig.name, {
              keyPath: storeConfig.keyPath,
              autoIncrement: storeConfig.autoIncrement,
            });

            storeConfig.indexes?.forEach(index => {
              objectStore.createIndex(index.name, index.keyPath, { unique: index.unique });
            });
          }
        });
      };
    });
  }

  async add<T>(storeName: string, data: T): Promise<IDBValidKey> {
    return this.performTransaction(storeName, 'readwrite', (store) => store.add(data));
  }

  async put<T>(storeName: string, data: T): Promise<IDBValidKey> {
    return this.performTransaction(storeName, 'readwrite', (store) => store.put(data));
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return this.performTransaction(storeName, 'readonly', (store) => store.get(key));
  }

  async getAll<T>(storeName: string, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
    return this.performTransaction(storeName, 'readonly', (store) => store.getAll(query));
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    return this.performTransaction(storeName, 'readwrite', (store) => store.delete(key));
  }

  async clear(storeName: string): Promise<void> {
    return this.performTransaction(storeName, 'readwrite', (store) => store.clear());
  }

  async count(storeName: string, query?: IDBValidKey | IDBKeyRange): Promise<number> {
    return this.performTransaction(storeName, 'readonly', (store) => store.count(query));
  }

  async queryByIndex<T>(
    storeName: string,
    indexName: string,
    query: IDBValidKey | IDBKeyRange
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not opened'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(query);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async bulkAdd<T>(storeName: string, items: T[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not opened'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      items.forEach(item => store.add(item));
    });
  }

  private performTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not opened'));
        return;
      }

      const transaction = this.db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
