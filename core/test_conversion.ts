import { ed25519, x25519 } from "@noble/curves/ed25519.js";

console.log("Testing 100 iterations with full verification...");
let failures = 0;

for (let i = 0; i < 100; i++) {
  try {
    const priv = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(priv);

    // 1. Noble conversion (pub -> u)
    const mont = ed25519.utils.toMontgomery(pub);

    // 2. Noble private key conversion (priv -> scalar)
    const xPriv = ed25519.utils.toMontgomerySecret(priv);

    // 3. X25519 public key derivation (scalar -> u)
    const xPubFromPriv = x25519.getPublicKey(xPriv);

    // Check consistency: toMontgomery(pub) == getPublicKey(toMontgomerySecret(priv))
    if (
      Buffer.from(mont).toString("hex") !==
      Buffer.from(xPubFromPriv).toString("hex")
    ) {
      console.error("ITERATION", i, "CONSISTENCY FAILURE");
      console.error("mont        :", Buffer.from(mont).toString("hex"));
      console.error("xPubFromPriv:", Buffer.from(xPubFromPriv).toString("hex"));
      failures++;
    }

    // 4. Manual conversion verification
    const P = (1n << 255n) - 19n;
    const yBytes = new Uint8Array(pub);
    yBytes[31] &= 0x7f;
    let y = 0n;
    for (let j = 0; j < 32; j++) {
      y |= BigInt(yBytes[j]) << (BigInt(j) * 8n);
    }
    const one = 1n;
    const num = (one + y) % P;
    const den = (one - y + P) % P;

    const modPow = (base: bigint, exp: bigint, mod: bigint) => {
      let res = 1n;
      base %= mod;
      while (exp > 0n) {
        if (exp % 2n === 1n) res = (res * base) % mod;
        base = (base * base) % mod;
        exp /= 2n;
      }
      return res;
    };

    const denInv = modPow(den, P - 2n, P);
    const u = (num * denInv) % P;
    const uBytes = new Uint8Array(32);
    for (let j = 0; j < 32; j++) {
      uBytes[j] = Number((u >> (BigInt(j) * 8n)) & 0xffn);
    }

    if (
      Buffer.from(mont).toString("hex") !== Buffer.from(uBytes).toString("hex")
    ) {
      console.error("ITERATION", i, "MANUAL MISMATCH");
      console.error("Noble :", Buffer.from(mont).toString("hex"));
      console.error("Manual:", Buffer.from(uBytes).toString("hex"));
      failures++;
    }
  } catch (e) {
    console.error("Iteration", i, "FAILED:", e);
    failures++;
  }
}
console.log(`Completed with ${failures} failures.`);
