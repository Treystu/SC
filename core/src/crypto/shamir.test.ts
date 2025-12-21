import { split, combine } from "./shamir";

describe("Shamir Secret Sharing", () => {
  it("should split and combine a secret correctly", () => {
    const secret = new Uint8Array([10, 20, 30, 40, 50]);
    const n = 5;
    const k = 3;

    const shares = split(secret, n, k);
    expect(shares.length).toBe(n);

    // Recover with all shares
    const recovered = combine(shares);
    expect(recovered).toEqual(secret);
  });

  it("should recover with exactly k shares", () => {
    const secret = new TextEncoder().encode("Hello World");
    const n = 5;
    const k = 3;
    const shares = split(secret, n, k);

    // Select 3 random shares
    const selectedShares = [shares[0], shares[2], shares[4]];
    const recovered = combine(selectedShares);
    expect(recovered).toEqual(secret);
  });

  it("should fail to recover with k-1 shares (produce garbage)", () => {
    const secret = new Uint8Array([1, 2, 3, 4, 5]);
    const n = 5;
    const k = 3;
    const shares = split(secret, n, k);

    // Select 2 shares (k-1)
    const selectedShares = [shares[0], shares[1]];
    const recovered = combine(selectedShares);

    // Should NOT match secret
    expect(recovered).not.toEqual(secret);
  });

  it("should handle k=1 (simple sharing)", () => {
    const secret = new Uint8Array([100]);
    const shares = split(secret, 3, 1);

    // Any single share should have the secret (y = c0 + 0) -> actually y = c0 is degree 0
    // Wait, degree for k=1 is k-1 = 0. So P(x) = c0.
    // So every share's y should be c0 (the secret).
    expect(shares[0].y).toEqual(secret);
    expect(shares[1].y).toEqual(secret);

    const recovered = combine([shares[0]]);
    expect(recovered).toEqual(secret);
  });

  it("should handle k=n", () => {
    const secret = new Uint8Array([255, 0, 128]);
    const n = 4;
    const shares = split(secret, n, n);

    const recovered = combine(shares);
    expect(recovered).toEqual(secret);
  });
});
