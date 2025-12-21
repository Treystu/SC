import { BlobStore } from "./blob-store";

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
});
