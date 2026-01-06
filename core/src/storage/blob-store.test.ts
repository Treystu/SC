import { BlobStore, IndexedDBBlobAdapter } from "./blob-store";

describe("BlobStore", () => {
  let blobStore: BlobStore;

  beforeEach(() => {
    blobStore = new BlobStore();
  });

  it("should store a blob and return its hash", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const hash = await blobStore.put(data);

    // sha256 of [1,2,3,4]
    // 9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64);
    expect(await blobStore.has(hash)).toBe(true);
  });

  it("should retrieve a stored blob", async () => {
    const data = new Uint8Array([5, 6, 7, 8]);
    const hash = await blobStore.put(data);

    const retrieved = await blobStore.get(hash);
    expect(retrieved).toEqual(data);
  });

  it("should return null for non-existent blob", async () => {
    const retrieved = await blobStore.get("non-existent");
    expect(retrieved).toBeUndefined();
  });

  it("should return false for has() if blob does not exist", async () => {
    expect(await blobStore.has("non-existent")).toBe(false);
  });

  describe("with persistence adapter", () => {
    let blobStore: BlobStore;
    let mockAdapter: jest.Mocked<IndexedDBBlobAdapter>;

    beforeEach(async () => {
      mockAdapter = {
        dbName: 'testDb',
        storeName: 'testStore',
        db: null,
        version: 1,
        init: jest.fn().mockResolvedValue(undefined),
        put: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        has: jest.fn().mockResolvedValue(false),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
        getAll: jest.fn().mockResolvedValue(new Map()),
        getSize: jest.fn().mockResolvedValue(0),
        ensureInit: jest.fn().mockResolvedValue(undefined)
      } as any;
      
      blobStore = new BlobStore(mockAdapter);
    });

    it("should store data using persistence adapter", async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      
      const hash = await blobStore.put(data);
      
      expect(mockAdapter.put).toHaveBeenCalledWith(hash, data);
      expect(hash).toBe("9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a");
    });

    it("should retrieve from persistence when not in memory", async () => {
      const data = new Uint8Array([5, 6, 7, 8]);
      const hash = "05060708";
      
      // Mock persistence hit
      mockAdapter.get.mockResolvedValue(data);
      
      const result = await blobStore.get(hash);
      
      expect(mockAdapter.get).toHaveBeenCalledWith(hash);
      expect(result).toEqual(data);
    });

    it("should check persistence for data existence", async () => {
      const hash = "testhash";
      
      // Mock persistence hit
      mockAdapter.has.mockResolvedValue(true);
      
      const exists = await blobStore.has(hash);
      
      expect(mockAdapter.has).toHaveBeenCalledWith(hash);
      expect(exists).toBe(true);
    });
  });
});
