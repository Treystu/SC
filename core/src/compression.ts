/**
 * Message compression using gzip
 * Compresses large messages to reduce bandwidth usage
 */

import { gunzipSync, gzipSync } from 'fflate';

const COMPRESSION_THRESHOLD = 1024; // Compress messages larger than 1KB

export interface CompressionResult {
  data: Uint8Array;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
}

/**
 * Compress data if it exceeds the threshold
 */
export function compressMessage(data: Uint8Array): CompressionResult {
  const originalSize = data.length;

  // Don't compress small messages
  if (originalSize < COMPRESSION_THRESHOLD) {
    return {
      data,
      compressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }

  try {
    const compressed = gzipSync(data, { level: 6 });
    const compressedSize = compressed.length;

    // Only use compression if it actually reduces size
    if (compressedSize < originalSize * 0.9) {
      return {
        data: compressed,
        compressed: true,
        originalSize,
        compressedSize,
      };
    }
  } catch (error) {
    console.error('Compression failed:', error);
  }

  // Return uncompressed if compression didn't help
  return {
    data,
    compressed: false,
    originalSize,
    compressedSize: originalSize,
  };
}

/**
 * Decompress data if it was compressed
 */
export function decompressMessage(
  data: Uint8Array,
  wasCompressed: boolean
): Uint8Array {
  if (!wasCompressed) {
    return data;
  }

  try {
    return gunzipSync(data);
  } catch (error) {
    console.error('Decompression failed:', error);
    throw new Error('Failed to decompress message');
  }
}

/**
 * Get compression stats
 */
export function getCompressionRatio(result: CompressionResult): number {
  if (!result.compressed) return 1.0;
  return result.compressedSize / result.originalSize;
}
