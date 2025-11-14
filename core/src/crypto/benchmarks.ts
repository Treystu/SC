/**
 * Performance benchmarks for cryptographic operations
 * 
 * Measures throughput and latency for:
 * - Key generation
 * - Signing and verification
 * - Encryption and decryption
 * - Key derivation
 */

import {
  generateIdentity,
  signMessage,
  verifySignature,
  encryptMessage,
  decryptMessage,
  generateSessionKey,
  performKeyExchange,
  generateEphemeralKeyPair,
  deriveSessionKey,
  rotateSessionKey,
  batchVerifySignatures,
} from './primitives';

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  opsPerSecond: number;
}

/**
 * Run a benchmark for a given operation
 */
function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 1000
): BenchmarkResult {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  
  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;
  const opsPerSecond = (1000 / avgTime) * 1;
  
  return {
    operation: name,
    iterations,
    totalTime,
    avgTime,
    opsPerSecond,
  };
}

/**
 * Format benchmark result for display
 */
function formatResult(result: BenchmarkResult): string {
  return [
    `${result.operation}:`,
    `  Iterations: ${result.iterations}`,
    `  Total time: ${result.totalTime.toFixed(2)}ms`,
    `  Avg time: ${result.avgTime.toFixed(4)}ms`,
    `  Ops/sec: ${result.opsPerSecond.toFixed(0)}`,
  ].join('\n');
}

/**
 * Run all cryptographic benchmarks
 */
export function runCryptoBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  
  console.log('=== Cryptographic Performance Benchmarks ===\n');
  
  // Key Generation
  console.log('1. Key Generation...');
  results.push(
    benchmark('Ed25519 Key Generation', () => {
      generateIdentity();
    }, 100)
  );
  
  results.push(
    benchmark('X25519 Ephemeral Key Generation', () => {
      generateEphemeralKeyPair();
    }, 100)
  );
  
  results.push(
    benchmark('Session Key Generation', () => {
      generateSessionKey();
    }, 1000)
  );
  
  // Signing
  console.log('2. Message Signing...');
  const identity = generateIdentity();
  const message = new TextEncoder().encode('Benchmark message for signing performance test');
  
  results.push(
    benchmark('Ed25519 Sign (64 bytes)', () => {
      signMessage(message, identity.privateKey);
    }, 1000)
  );
  
  const signature = signMessage(message, identity.privateKey);
  results.push(
    benchmark('Ed25519 Verify (64 bytes)', () => {
      verifySignature(message, signature, identity.publicKey);
    }, 1000)
  );
  
  // Batch verification
  const items = Array.from({ length: 10 }, () => ({
    message: new TextEncoder().encode(`Message ${Math.random()}`),
    signature: new Uint8Array(64),
    publicKey: identity.publicKey,
  }));
  items.forEach(item => {
    item.signature = signMessage(item.message, identity.privateKey);
  });
  
  results.push(
    benchmark('Ed25519 Batch Verify (10 signatures)', () => {
      batchVerifySignatures(items);
    }, 100)
  );
  
  // Encryption
  console.log('3. Encryption/Decryption...');
  const sessionKey = generateSessionKey();
  
  const smallPlaintext = new Uint8Array(100);
  results.push(
    benchmark('XChaCha20-Poly1305 Encrypt (100 bytes)', () => {
      encryptMessage(smallPlaintext, sessionKey.key, sessionKey.nonce);
    }, 1000)
  );
  
  const smallCiphertext = encryptMessage(smallPlaintext, sessionKey.key, sessionKey.nonce);
  results.push(
    benchmark('XChaCha20-Poly1305 Decrypt (100 bytes)', () => {
      decryptMessage(smallCiphertext, sessionKey.key, sessionKey.nonce);
    }, 1000)
  );
  
  const mediumPlaintext = new Uint8Array(1024); // 1 KB
  results.push(
    benchmark('XChaCha20-Poly1305 Encrypt (1 KB)', () => {
      encryptMessage(mediumPlaintext, sessionKey.key, sessionKey.nonce);
    }, 1000)
  );
  
  const mediumCiphertext = encryptMessage(mediumPlaintext, sessionKey.key, sessionKey.nonce);
  results.push(
    benchmark('XChaCha20-Poly1305 Decrypt (1 KB)', () => {
      decryptMessage(mediumCiphertext, sessionKey.key, sessionKey.nonce);
    }, 1000)
  );
  
  const largePlaintext = new Uint8Array(64 * 1024); // 64 KB
  results.push(
    benchmark('XChaCha20-Poly1305 Encrypt (64 KB)', () => {
      encryptMessage(largePlaintext, sessionKey.key, sessionKey.nonce);
    }, 100)
  );
  
  const largeCiphertext = encryptMessage(largePlaintext, sessionKey.key, sessionKey.nonce);
  results.push(
    benchmark('XChaCha20-Poly1305 Decrypt (64 KB)', () => {
      decryptMessage(largeCiphertext, sessionKey.key, sessionKey.nonce);
    }, 100)
  );
  
  // Key Exchange
  console.log('4. Key Exchange...');
  const alice = generateEphemeralKeyPair();
  const bob = generateEphemeralKeyPair();
  
  results.push(
    benchmark('X25519 ECDH Key Exchange', () => {
      performKeyExchange(alice.privateKey, bob.publicKey);
    }, 1000)
  );
  
  // Key Derivation
  console.log('5. Key Derivation...');
  const sharedSecret = performKeyExchange(alice.privateKey, bob.publicKey);
  const salt = new Uint8Array(32);
  
  results.push(
    benchmark('HKDF Key Derivation', () => {
      deriveSessionKey(sharedSecret, salt);
    }, 1000)
  );
  
  // Key Rotation
  console.log('6. Session Key Rotation...');
  results.push(
    benchmark('Session Key Rotation', () => {
      const key = generateSessionKey();
      rotateSessionKey(key);
    }, 1000)
  );
  
  // Print all results
  console.log('\n=== Results ===\n');
  results.forEach(result => {
    console.log(formatResult(result));
    console.log('');
  });
  
  // Summary
  console.log('=== Summary ===');
  console.log(`Total benchmarks: ${results.length}`);
  console.log(`Total operations: ${results.reduce((sum, r) => sum + r.iterations, 0)}`);
  console.log(`Total time: ${results.reduce((sum, r) => sum + r.totalTime, 0).toFixed(2)}ms`);
  
  return results;
}

// Run if executed directly
if (require.main === module) {
  runCryptoBenchmarks();
}
