/**
 * Secure deletion and memory wiping utilities
 * 
 * Provides best-effort secure deletion and memory wiping across platforms.
 * 
 * IMPORTANT LIMITATIONS:
 * - Managed languages (JavaScript, Kotlin, Swift) don't guarantee memory wiping
 * - SSDs use wear leveling which may prevent true data erasure
 * - File systems may keep journal copies
 * - Compiler optimizations may eliminate wiping operations
 * - These are BEST-EFFORT implementations for defense-in-depth
 * 
 * Primary defense should always be encryption at rest (Keychain, Keystore, etc.)
 */

/**
 * Wipe a Uint8Array by overwriting with zeros
 * 
 * Note: JavaScript garbage collector controls memory. This is best-effort.
 * The GC may create copies of the data that we cannot wipe.
 * 
 * @param buffer - Buffer to wipe
 */
export function wipeMemory(buffer: Uint8Array): void {
  if (!buffer || buffer.length === 0) {
    return;
  }
  
  // Overwrite with zeros
  buffer.fill(0);
  
  // Try to trigger GC (not guaranteed, only works with --expose-gc flag)
  if (typeof global !== 'undefined' && (global as any).gc) {
    try {
      (global as any).gc();
    } catch (e) {
      // GC not available, continue
    }
  }
}

/**
 * Wipe multiple buffers
 * 
 * @param buffers - Array of buffers to wipe
 */
export function wipeMemoryMultiple(...buffers: Uint8Array[]): void {
  for (const buffer of buffers) {
    wipeMemory(buffer);
  }
}

/**
 * Create a function that automatically wipes memory when done
 * 
 * @param fn - Function that receives sensitive data
 * @returns Wrapped function that wipes data after execution
 * 
 * @example
 * const secureSign = withMemoryWipe((privateKey: Uint8Array, message: Uint8Array) => {
 *   return signMessage(message, privateKey);
 * });
 * 
 * const signature = secureSign(privateKey, message);
 * // privateKey is automatically wiped after function returns
 */
export function withMemoryWipe<T extends Uint8Array[], R>(
  fn: (...args: T) => R
): (...args: T) => R {
  return (...args: T): R => {
    try {
      return fn(...args);
    } finally {
      wipeMemoryMultiple(...args);
    }
  };
}

/**
 * Secure deletion interface for different storage types
 */
export interface SecureDeletionOptions {
  /**
   * Number of overwrite passes (default: 2)
   * More passes = more secure but slower
   */
  passes?: number;
  
  /**
   * Whether to verify deletion (default: false)
   */
  verify?: boolean;
}

/**
 * Securely delete data from IndexedDB (Web platform)
 * 
 * LIMITATION: IndexedDB may not guarantee physical overwrite due to:
 * - Browser caching
 * - Storage layer abstractions
 * - Virtual memory systems
 * 
 * This provides defense-in-depth but is not foolproof.
 * 
 * @param store - IndexedDB object store
 * @param key - Key to delete
 * @param options - Deletion options
 */
export async function secureDeleteIndexedDB(
  store: IDBObjectStore,
  key: IDBValidKey,
  options: SecureDeletionOptions = {}
): Promise<void> {
  const { passes = 2 } = options;
  
  // Get the current value to determine size
  const getRequest = store.get(key);
  
  return new Promise((resolve, reject) => {
    getRequest.onsuccess = async () => {
      const originalValue = getRequest.result;
      
      if (!originalValue) {
        // Key doesn't exist, nothing to delete
        resolve();
        return;
      }
      
      try {
        // Determine size for overwrite
        let size = 1024; // Default size
        if (originalValue instanceof Blob) {
          size = originalValue.size;
        } else if (originalValue instanceof ArrayBuffer) {
          size = originalValue.byteLength;
        } else if (typeof originalValue === 'string') {
          size = originalValue.length * 2; // UTF-16
        }
        
        // Overwrite passes
        for (let i = 0; i < passes; i++) {
          const overwrites: Promise<void>[] = [];
          
          // Pass 1: Random data
          const randomData = crypto.getRandomValues(new Uint8Array(size));
          overwrites.push(
            new Promise<void>((res, rej) => {
              const putRequest = store.put(randomData, key);
              putRequest.onsuccess = () => res();
              putRequest.onerror = () => rej(putRequest.error);
            })
          );
          
          await Promise.all(overwrites);
          
          // Pass 2: Zeros
          const zeros = new Uint8Array(size);
          await new Promise<void>((res, rej) => {
            const putRequest = store.put(zeros, key);
            putRequest.onsuccess = () => res();
            putRequest.onerror = () => rej(putRequest.error);
          });
        }
        
        // Final deletion
        const deleteRequest = store.delete(key);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      } catch (error) {
        reject(error);
      }
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Helper to create a blob URL and ensure cleanup
 * 
 * @param data - Data to create blob from
 * @param mimeType - MIME type
 * @returns Blob URL and cleanup function
 */
export function createSecureBlobURL(
  data: Uint8Array,
  mimeType: string
): { url: string; cleanup: () => void } {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  return {
    url,
    cleanup: () => {
      URL.revokeObjectURL(url);
      // Wipe the source data
      wipeMemory(data);
    }
  };
}

/**
 * Secure string wiping (best-effort)
 * 
 * Note: Strings in JavaScript are immutable, so we can't actually wipe them.
 * This function returns a new string filled with zeros of the same length
 * to help with garbage collection, but the original string data may persist.
 * 
 * @param str - String to wipe
 * @returns Zero-filled string (for replacement)
 */
export function wipeString(str: string): string {
  if (!str) return '';
  return '\0'.repeat(str.length);
}

/**
 * Timing-safe comparison with automatic memory wiping
 * 
 * Compares two buffers in constant time and wipes them afterwards.
 * Useful for comparing secrets that should not persist in memory.
 * 
 * @param a - First buffer
 * @param b - Second buffer
 * @param wipeAfter - Whether to wipe buffers after comparison (default: true)
 * @returns true if buffers are equal
 */
export function timingSafeCompareAndWipe(
  a: Uint8Array,
  b: Uint8Array,
  wipeAfter: boolean = true
): boolean {
  if (a.length !== b.length) {
    if (wipeAfter) {
      wipeMemoryMultiple(a, b);
    }
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  const isEqual = result === 0;
  
  if (wipeAfter) {
    wipeMemoryMultiple(a, b);
  }
  
  return isEqual;
}

/**
 * Generate random data and ensure proper cleanup
 * 
 * @param size - Size of random data in bytes
 * @param fn - Function to use the random data
 * @returns Result of the function
 */
export function withRandomData<R>(
  size: number,
  fn: (data: Uint8Array) => R
): R {
  const data = crypto.getRandomValues(new Uint8Array(size));
  try {
    return fn(data);
  } finally {
    wipeMemory(data);
  }
}

/**
 * Security best practices reminder for developers
 */
export const SECURE_DELETION_NOTES = {
  limitations: [
    'SSD wear leveling may prevent true data erasure',
    'File system journaling may keep copies',
    'Virtual memory (swap) may contain copies',
    'Compiler optimizations may eliminate wiping code',
    'Garbage collectors in managed languages may create copies',
  ],
  bestPractices: [
    'Use encryption at rest as primary defense',
    'Use hardware-backed secure storage (Keystore, Keychain)',
    'Minimize sensitive data lifetime in memory',
    'Use secure deletion as defense-in-depth, not primary security',
    'Document limitations in security documentation',
  ],
  platforms: {
    web: 'IndexedDB wiping is best-effort. Browser controls actual storage.',
    android: 'Use Android Keystore. File wiping limited by filesystem.',
    ios: 'Use iOS Keychain. File wiping limited by filesystem.',
  }
};
