/**
 * Performance benchmarks for crypto operations
 */
import { performance } from 'perf_hooks';
import {
  generateIdentity,
  signMessage,
  verifySignature,
  deriveSharedSecret,
  encryptMessage,
  decryptMessage,
} from '../../core/src/crypto/primitives';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  opsPerSecond: number;
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < 10; i++) {
    await fn();
  }

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const end = performance.now();

  const totalTime = end - start;
  const avgTime = totalTime / iterations;
  const opsPerSecond = 1000 / avgTime;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    opsPerSecond,
  };
}

async function runBenchmarks() {
  console.log('Running crypto performance benchmarks...\n');

  const results: BenchmarkResult[] = [];

  // Identity generation
  results.push(
    await benchmark('Identity Generation', async () => {
      await generateIdentity();
    }, 50)
  );

  // Message signing
  const identity = await generateIdentity();
  const testData = new Uint8Array(1000).fill(42);
  
  results.push(
    await benchmark('Message Signing (1KB)', async () => {
      await signMessage(testData, identity.privateKey);
    }, 100)
  );

  // Signature verification
  const signature = await signMessage(testData, identity.privateKey);
  results.push(
    await benchmark('Signature Verification (1KB)', async () => {
      await verifySignature(testData, signature, identity.publicKey);
    }, 100)
  );

  // Key exchange
  const alice = await generateIdentity();
  const bob = await generateIdentity();
  results.push(
    await benchmark('Key Exchange (ECDH)', async () => {
      await deriveSharedSecret(bob.publicKey, alice.privateKey);
    }, 100)
  );

  // Encryption
  const sharedSecret = await deriveSharedSecret(bob.publicKey, alice.privateKey);
  results.push(
    await benchmark('Encryption (1KB)', async () => {
      await encryptMessage(testData, sharedSecret);
    }, 100)
  );

  // Decryption
  const encrypted = await encryptMessage(testData, sharedSecret);
  results.push(
    await benchmark('Decryption (1KB)', async () => {
      await decryptMessage(encrypted, sharedSecret);
    }, 100)
  );

  // Larger message sizes
  const largeData = new Uint8Array(100000).fill(42); // 100KB
  results.push(
    await benchmark('Encryption (100KB)', async () => {
      await encryptMessage(largeData, sharedSecret);
    }, 20)
  );

  const largeEncrypted = await encryptMessage(largeData, sharedSecret);
  results.push(
    await benchmark('Decryption (100KB)', async () => {
      await decryptMessage(largeEncrypted, sharedSecret);
    }, 20)
  );

  // Print results
  console.log('Benchmark Results:');
  console.log('==================\n');
  
  results.forEach((result) => {
    console.log(`${result.name}:`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Total Time: ${result.totalTime.toFixed(2)}ms`);
    console.log(`  Avg Time: ${result.avgTime.toFixed(2)}ms`);
    console.log(`  Ops/Second: ${result.opsPerSecond.toFixed(2)}`);
    console.log('');
  });

  // Performance assertions
  const assertions = [
    { name: 'Identity Generation', maxTime: 10 },
    { name: 'Message Signing (1KB)', maxTime: 5 },
    { name: 'Signature Verification (1KB)', maxTime: 10 },
    { name: 'Key Exchange (ECDH)', maxTime: 5 },
    { name: 'Encryption (1KB)', maxTime: 1 },
    { name: 'Decryption (1KB)', maxTime: 1 },
    { name: 'Encryption (100KB)', maxTime: 50 },
    { name: 'Decryption (100KB)', maxTime: 50 },
  ];

  let allPassed = true;
  console.log('Performance Assertions:');
  console.log('======================\n');

  assertions.forEach((assertion) => {
    const result = results.find((r) => r.name === assertion.name);
    if (result) {
      const passed = result.avgTime <= assertion.maxTime;
      const status = passed ? '✓' : '✗';
      console.log(
        `${status} ${assertion.name}: ${result.avgTime.toFixed(2)}ms ` +
        `(max: ${assertion.maxTime}ms)`
      );
      if (!passed) allPassed = false;
    }
  });

  console.log('');
  console.log(allPassed ? '✓ All performance tests passed' : '✗ Some performance tests failed');
  
  return allPassed;
}

// Run benchmarks
if (require.main === module) {
  runBenchmarks()
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}

export { runBenchmarks, benchmark };
