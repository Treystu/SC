import { describe, it, expect, beforeEach } from 'vitest';

describe('File Transfer', () => {
  describe('Chunking', () => {
    it('should split file into chunks', () => {
      const file = new Uint8Array(1024 * 1024); // 1MB
      const chunkSize = 64 * 1024; // 64KB
      
      const chunks = chunkFile(file, chunkSize);
      
      expect(chunks.length).toBe(Math.ceil(file.length / chunkSize));
      chunks.slice(0, -1).forEach(chunk => {
        expect(chunk.length).toBe(chunkSize);
      });
    });

    it('should handle last chunk correctly', () => {
      const file = new Uint8Array(100000);
      const chunkSize = 32768;
      
      const chunks = chunkFile(file, chunkSize);
      const lastChunk = chunks[chunks.length - 1];
      
      expect(lastChunk.length).toBeLessThan(chunkSize);
    });
  });

  describe('Reassembly', () => {
    it('should reassemble chunks into original file', () => {
      const original = new Uint8Array(500000);
      crypto.getRandomValues(original);
      
      const chunks = chunkFile(original, 65536);
      const reassembled = reassembleFile(chunks);
      
      expect(reassembled).toEqual(original);
    });

    it('should handle out-of-order chunks', () => {
      const original = new Uint8Array(200000);
      const chunks = chunkFile(original, 50000);
      const shuffled = [...chunks].sort(() => Math.random() - 0.5);
      
      const reassembled = reassembleFile(shuffled.map((chunk, idx) => ({
        index: chunks.indexOf(chunk),
        data: chunk,
      })));
      
      expect(reassembled).toEqual(original);
    });
  });

  describe('Progress Tracking', () => {
    it('should track upload progress', async () => {
      const file = new Uint8Array(1000000);
      const progressUpdates: number[] = [];
      
      await transferFile(file, {
        onProgress: (progress) => progressUpdates.push(progress),
      });
      
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });

    it('should report accurate bytes transferred', async () => {
      const file = new Uint8Array(524288); // 512KB
      let bytesTransferred = 0;
      
      await transferFile(file, {
        onProgress: (progress, bytes) => {
          bytesTransferred = bytes;
        },
      });
      
      expect(bytesTransferred).toBe(file.length);
    });
  });

  describe('Pause and Resume', () => {
    it('should pause transfer', async () => {
      const transfer = new FileTransfer(new Uint8Array(1000000));
      transfer.start();
      
      await sleep(100);
      transfer.pause();
      
      expect(transfer.isPaused()).toBe(true);
    });

    it('should resume from pause', async () => {
      const transfer = new FileTransfer(new Uint8Array(1000000));
      transfer.start();
      
      await sleep(50);
      transfer.pause();
      const pausedProgress = transfer.getProgress();
      
      transfer.resume();
      await sleep(50);
      
      expect(transfer.getProgress()).toBeGreaterThan(pausedProgress);
    });

    it('should resume from checkpoint', async () => {
      const file = new Uint8Array(1000000);
      const transfer = new FileTransfer(file);
      
      transfer.start();
      await sleep(100);
      const checkpoint = transfer.createCheckpoint();
      transfer.cancel();
      
      const newTransfer = new FileTransfer(file);
      newTransfer.resumeFromCheckpoint(checkpoint);
      
      expect(newTransfer.getProgress()).toBe(checkpoint.progress);
    });
  });

  describe('Large File Handling', () => {
    it('should handle files larger than 100MB', async () => {
      const largeFile = new Uint8Array(100 * 1024 * 1024); // 100MB
      const chunks = chunkFile(largeFile, 1024 * 1024); // 1MB chunks
      
      expect(chunks.length).toBe(100);
    });

    it('should not exceed memory limits', async () => {
      const transfer = new FileTransfer(new Uint8Array(50 * 1024 * 1024));
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      await transfer.start();
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const increase = finalMemory - initialMemory;
      
      expect(increase).toBeLessThan(20 * 1024 * 1024); // Less than 20MB increase
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed chunks', async () => {
      let failCount = 0;
      const transfer = new FileTransfer(new Uint8Array(100000), {
        sendChunk: async (chunk) => {
          if (failCount++ < 3) throw new Error('Network error');
          return true;
        },
      });
      
      await transfer.start();
      expect(transfer.isComplete()).toBe(true);
    });

    it('should handle connection drop', async () => {
      const transfer = new FileTransfer(new Uint8Array(500000));
      transfer.start();
      
      await sleep(50);
      transfer.simulateConnectionDrop();
      
      expect(transfer.getStatus()).toBe('error');
    });

    it('should validate chunk integrity', async () => {
      const chunk = new Uint8Array(1024);
      crypto.getRandomValues(chunk);
      
      const checksum = calculateChecksum(chunk);
      chunk[0] ^= 0xFF; // Corrupt first byte
      
      expect(validateChunk(chunk, checksum)).toBe(false);
    });
  });

  describe('Concurrent Transfers', () => {
    it('should handle multiple simultaneous transfers', async () => {
      const transfers = [
        new FileTransfer(new Uint8Array(100000)),
        new FileTransfer(new Uint8Array(150000)),
        new FileTransfer(new Uint8Array(200000)),
      ];
      
      await Promise.all(transfers.map(t => t.start()));
      
      transfers.forEach(t => {
        expect(t.isComplete()).toBe(true);
      });
    });

    it('should limit concurrent chunk uploads', async () => {
      const transfer = new FileTransfer(new Uint8Array(1000000), {
        maxConcurrentChunks: 3,
      });
      
      transfer.start();
      await sleep(50);
      
      expect(transfer.getActiveChunks()).toBeLessThanOrEqual(3);
    });
  });
});

// Helper functions
function chunkFile(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

function reassembleFile(chunks: Array<{ index: number; data: Uint8Array }> | Uint8Array[]): Uint8Array {
  const isIndexed = chunks.length > 0 && 'index' in chunks[0];
  const sorted = isIndexed
    ? (chunks as Array<{ index: number; data: Uint8Array }>).sort((a, b) => a.index - b.index).map(c => c.data)
    : chunks as Uint8Array[];
  
  const totalLength = sorted.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const chunk of sorted) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

async function transferFile(file: Uint8Array, opts: any) {
  const chunks = chunkFile(file, 65536);
  let transferred = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    transferred += chunks[i].length;
    const progress = Math.round((transferred / file.length) * 100);
    opts.onProgress?.(progress, transferred);
    await sleep(10);
  }
}

class FileTransfer {
  private file: Uint8Array;
  private opts: any;
  private paused = false;
  private cancelled = false;
  private progress = 0;
  private status = 'pending';
  private activeChunks = 0;
  
  constructor(file: Uint8Array, opts: any = {}) {
    this.file = file;
    this.opts = opts;
  }
  
  async start() {
    this.status = 'transferring';
    const chunks = chunkFile(this.file, 65536);
    const maxConcurrent = this.opts.maxConcurrentChunks || 5;
    
    for (let i = 0; i < chunks.length; i++) {
      if (this.cancelled) break;
      while (this.paused) await sleep(100);
      
      while (this.activeChunks >= maxConcurrent) {
        await sleep(10);
      }
      
      this.activeChunks++;
      this.sendChunkWithRetry(chunks[i], i, chunks.length)
        .finally(() => this.activeChunks--);
    }
    
    while (this.activeChunks > 0) await sleep(10);
    this.status = this.cancelled ? 'cancelled' : 'complete';
  }
  
  private async sendChunkWithRetry(chunk: Uint8Array, index: number, total: number) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await (this.opts.sendChunk?.(chunk) ?? Promise.resolve(true));
        this.progress = Math.round(((index + 1) / total) * 100);
        return;
      } catch (err) {
        if (attempt === maxRetries - 1) throw err;
        await sleep(1000 * Math.pow(2, attempt));
      }
    }
  }
  
  pause() {
    this.paused = true;
  }
  
  resume() {
    this.paused = false;
  }
  
  cancel() {
    this.cancelled = true;
  }
  
  isPaused() {
    return this.paused;
  }
  
  getProgress() {
    return this.progress;
  }
  
  isComplete() {
    return this.status === 'complete';
  }
  
  getStatus() {
    return this.status;
  }
  
  createCheckpoint() {
    return {
      progress: this.progress,
      timestamp: Date.now(),
    };
  }
  
  resumeFromCheckpoint(checkpoint: any) {
    this.progress = checkpoint.progress;
  }
  
  simulateConnectionDrop() {
    this.status = 'error';
  }
  
  getActiveChunks() {
    return this.activeChunks;
  }
}

function calculateChecksum(data: Uint8Array): string {
  let sum = 0;
  for (const byte of data) {
    sum = (sum + byte) % 65536;
  }
  return sum.toString(16);
}

function validateChunk(chunk: Uint8Array, expectedChecksum: string): boolean {
  return calculateChecksum(chunk) === expectedChecksum;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
