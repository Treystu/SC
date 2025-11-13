/**
 * File Transfer Implementation (Tasks 184-192)
 * 
 * Handles file transfer over mesh network with:
 * - Chunked transmission
 * - Resume capability
 * - Progress tracking
 * - Multiple simultaneous transfers
 */

import { MessageType } from '../protocol/message.js';
import { sha256 as computeSHA256 } from '@noble/hashes/sha256';

// Helper to convert hash output to Uint8Array
const sha256 = (data: Uint8Array): Uint8Array => {
  return computeSHA256(data);
};

// Task 184: Implement file metadata message
export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  checksum: Uint8Array;  // SHA-256 hash of complete file
  timestamp: number;
}

// Task 185: Create chunk request protocol
export interface ChunkRequest {
  fileId: string;
  chunkIndex: number;
  timestamp: number;
}

// Task 186: Implement chunk delivery
export interface FileChunk {
  fileId: string;
  chunkIndex: number;
  data: Uint8Array;
  checksum: Uint8Array;  // SHA-256 hash of chunk
}

// Task 187: Create partial file storage
export interface PartialFile {
  metadata: FileMetadata;
  receivedChunks: Set<number>;
  chunks: Map<number, Uint8Array>;
  startTime: number;
  lastActivityTime: number;
}

// Task 188: Implement resume capability
export interface TransferState {
  fileId: string;
  metadata: FileMetadata;
  progress: number;  // 0-100
  bytesTransferred: number;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export class FileTransferManager {
  private static readonly DEFAULT_CHUNK_SIZE = 16 * 1024; // 16KB (same as message fragmentation)
  private static readonly MAX_CONCURRENT_TRANSFERS = 5;
  private static readonly TRANSFER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  private activeTransfers: Map<string, TransferState> = new Map();
  private partialFiles: Map<string, PartialFile> = new Map();
  private transferQueue: string[] = [];
  
  // Task 184: Create file metadata from file
  async createFileMetadata(
    file: File | Uint8Array,
    fileName: string,
    mimeType: string
  ): Promise<FileMetadata> {
    const fileData = file instanceof File ? await file.arrayBuffer() : file.buffer;
    const fileSize = fileData.byteLength;
    const chunkSize = FileTransferManager.DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    const checksum = await sha256(new Uint8Array(fileData));
    
    return {
      fileId: crypto.randomUUID(),
      fileName,
      fileSize,
      mimeType,
      chunkSize,
      totalChunks,
      checksum,
      timestamp: Date.now()
    };
  }
  
  // Task 186: Split file into chunks
  splitFileIntoChunks(fileData: Uint8Array, metadata: FileMetadata): FileChunk[] {
    const chunks: FileChunk[] = [];
    
    for (let i = 0; i < metadata.totalChunks; i++) {
      const start = i * metadata.chunkSize;
      const end = Math.min(start + metadata.chunkSize, metadata.fileSize);
      const chunkData = fileData.slice(start, end);
      
      chunks.push({
        fileId: metadata.fileId,
        chunkIndex: i,
        data: chunkData,
        checksum: sha256(chunkData)
      });
    }
    
    return chunks;
  }
  
  // Task 187: Store partial file
  initializePartialFile(metadata: FileMetadata): void {
    this.partialFiles.set(metadata.fileId, {
      metadata,
      receivedChunks: new Set(),
      chunks: new Map(),
      startTime: Date.now(),
      lastActivityTime: Date.now()
    });
    
    this.activeTransfers.set(metadata.fileId, {
      fileId: metadata.fileId,
      metadata,
      progress: 0,
      bytesTransferred: 0,
      status: 'pending'
    });
  }
  
  // Task 186: Process received chunk
  async processChunk(chunk: FileChunk): Promise<void> {
    const partial = this.partialFiles.get(chunk.fileId);
    if (!partial) {
      throw new Error(`Unknown file ID: ${chunk.fileId}`);
    }
    
    // Verify chunk checksum
    const computedChecksum = await sha256(chunk.data);
    if (!this.arraysEqual(computedChecksum, chunk.checksum)) {
      throw new Error(`Chunk checksum mismatch for chunk ${chunk.chunkIndex}`);
    }
    
    // Store chunk
    partial.chunks.set(chunk.chunkIndex, chunk.data);
    partial.receivedChunks.add(chunk.chunkIndex);
    partial.lastActivityTime = Date.now();
    
    // Update transfer state
    this.updateTransferProgress(chunk.fileId);
  }
  
  // Task 188: Update transfer progress
  private updateTransferProgress(fileId: string): void {
    const partial = this.partialFiles.get(fileId);
    const state = this.activeTransfers.get(fileId);
    
    if (!partial || !state) return;
    
    const bytesTransferred = partial.receivedChunks.size * partial.metadata.chunkSize;
    const progress = (partial.receivedChunks.size / partial.metadata.totalChunks) * 100;
    
    state.bytesTransferred = Math.min(bytesTransferred, partial.metadata.fileSize);
    state.progress = Math.min(progress, 100);
    state.status = progress >= 100 ? 'completed' : 'active';
  }
  
  // Task 185: Get missing chunks
  getMissingChunks(fileId: string): number[] {
    const partial = this.partialFiles.get(fileId);
    if (!partial) return [];
    
    const missing: number[] = [];
    for (let i = 0; i < partial.metadata.totalChunks; i++) {
      if (!partial.receivedChunks.has(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }
  
  // Task 188: Check if transfer is complete
  isTransferComplete(fileId: string): boolean {
    const partial = this.partialFiles.get(fileId);
    if (!partial) return false;
    
    return partial.receivedChunks.size === partial.metadata.totalChunks;
  }
  
  // Task 188: Reassemble file from chunks
  async reassembleFile(fileId: string): Promise<Uint8Array> {
    const partial = this.partialFiles.get(fileId);
    if (!partial) {
      throw new Error(`Unknown file ID: ${fileId}`);
    }
    
    if (!this.isTransferComplete(fileId)) {
      throw new Error(`Transfer not complete for file ${fileId}`);
    }
    
    // Reassemble chunks in order
    const fileData = new Uint8Array(partial.metadata.fileSize);
    let offset = 0;
    
    for (let i = 0; i < partial.metadata.totalChunks; i++) {
      const chunk = partial.chunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk ${i}`);
      }
      
      fileData.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Verify file checksum
    const computedChecksum = await sha256(fileData);
    if (!this.arraysEqual(computedChecksum, partial.metadata.checksum)) {
      throw new Error(`File checksum mismatch for ${fileId}`);
    }
    
    return fileData;
  }
  
  // Task 189: Cancel transfer
  cancelTransfer(fileId: string): void {
    const state = this.activeTransfers.get(fileId);
    if (state) {
      state.status = 'cancelled';
    }
    
    this.partialFiles.delete(fileId);
    this.transferQueue = this.transferQueue.filter(id => id !== fileId);
  }
  
  // Task 190: Transfer queue management
  queueTransfer(fileId: string): void {
    if (this.activeTransfers.size >= FileTransferManager.MAX_CONCURRENT_TRANSFERS) {
      this.transferQueue.push(fileId);
      const state = this.activeTransfers.get(fileId);
      if (state) {
        state.status = 'pending';
      }
    } else {
      const state = this.activeTransfers.get(fileId);
      if (state) {
        state.status = 'active';
      }
    }
  }
  
  // Task 190: Process transfer queue
  processQueue(): void {
    while (
      this.activeTransfers.size < FileTransferManager.MAX_CONCURRENT_TRANSFERS &&
      this.transferQueue.length > 0
    ) {
      const fileId = this.transferQueue.shift();
      if (fileId) {
        const state = this.activeTransfers.get(fileId);
        if (state) {
          state.status = 'active';
        }
      }
    }
  }
  
  // Task 192: Cleanup stale transfers
  cleanupStaleTransfers(): void {
    const now = Date.now();
    
    for (const [fileId, partial] of this.partialFiles.entries()) {
      if (now - partial.lastActivityTime > FileTransferManager.TRANSFER_TIMEOUT) {
        const state = this.activeTransfers.get(fileId);
        if (state) {
          state.status = 'failed';
          state.error = 'Transfer timeout';
        }
        
        this.partialFiles.delete(fileId);
      }
    }
  }
  
  // Get transfer state
  getTransferState(fileId: string): TransferState | undefined {
    return this.activeTransfers.get(fileId);
  }
  
  // Get all active transfers
  getAllTransfers(): TransferState[] {
    return Array.from(this.activeTransfers.values());
  }
  
  // Helper: Compare arrays
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
