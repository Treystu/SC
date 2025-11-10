import pako from 'pako';

export interface CompressedData {
  compressed: boolean;
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  algorithm?: 'gzip';
}

export class MessageCompressor {
  private compressionThreshold = 1024; // 1KB - only compress if larger

  compress(data: Uint8Array): CompressedData {
    // Don't compress small messages
    if (data.length < this.compressionThreshold) {
      return {
        compressed: false,
        data,
        originalSize: data.length,
        compressedSize: data.length
      };
    }

    try {
      const compressed = pako.gzip(data);

      // Only use compression if it actually reduces size
      if (compressed.length < data.length * 0.9) {
        return {
          compressed: true,
          data: compressed,
          originalSize: data.length,
          compressedSize: compressed.length,
          algorithm: 'gzip'
        };
      }
    } catch (error) {
      console.error('Compression failed:', error);
    }

    // Fallback to uncompressed
    return {
      compressed: false,
      data,
      originalSize: data.length,
      compressedSize: data.length
    };
  }

  decompress(compressedData: CompressedData): Uint8Array {
    if (!compressedData.compressed) {
      return compressedData.data;
    }

    try {
      return pako.ungzip(compressedData.data);
    } catch (error) {
      console.error('Decompression failed:', error);
      throw new Error('Failed to decompress data');
    }
  }

  getCompressionRatio(compressedData: CompressedData): number {
    if (!compressedData.compressed) {
      return 1.0;
    }
    return compressedData.compressedSize / compressedData.originalSize;
  }
}
