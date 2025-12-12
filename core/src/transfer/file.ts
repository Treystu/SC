/**
 * File Transfer Implementation (Tasks 184-192)
 * 
 * Handles file transfer over mesh network with:
 * - Chunked transmission
 * - Resume capability
 * - Progress tracking
 * - Multiple simultaneous transfers
 */

import { MessageType as _MessageType } from '../protocol/message.js';
import { sha256 as computeSHA256 } from '@noble/hashes/sha2.js';

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
    const fileData = file instanceof File
      ? new Uint8Array(await file.arrayBuffer())
      : new Uint8Array(file);
    const fileSize = fileData.byteLength;
    const chunkSize = FileTransferManager.DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    const checksum = await sha256(fileData);
    
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
    this.internalUpdateTransferProgress(chunk.fileId);
  }
  
  // Task 188: Update transfer progress internally
  private internalUpdateTransferProgress(fileId: string): void {
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
    this.processQueue();
  }
  
  // Task 190: Transfer queue management
  queueTransfer(fileId: string): void {
    const activeCount = this.getActiveTransferCount();
    if (activeCount >= FileTransferManager.MAX_CONCURRENT_TRANSFERS) {
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
    let activeCount = this.getActiveTransferCount();
    while (
      activeCount < FileTransferManager.MAX_CONCURRENT_TRANSFERS &&
      this.transferQueue.length > 0
    ) {
      const fileId = this.transferQueue.shift();
      if (fileId) {
        const state = this.activeTransfers.get(fileId);
        if (state) {
          state.status = 'active';
          activeCount++;
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
    
    this.processQueue();
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

  private getActiveTransferCount(): number {
    let count = 0;
    for (const state of this.activeTransfers.values()) {
      if (state.status === 'active') {
        count++;
      }
    }
    return count;
  }

  // Assemble file from chunks
  assembleFile(chunks: FileChunk[], metadata: FileMetadata): Uint8Array {
    const fileData = new Uint8Array(metadata.fileSize);
    let offset = 0;
    
    // Sort chunks by index
    const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    // Check all chunks are present
    for (let i = 0; i < metadata.totalChunks; i++) {
      if (!sortedChunks[i] || sortedChunks[i].chunkIndex !== i) {
        throw new Error(`Missing chunk ${i}`);
      }
    }
    
    for (const chunk of sortedChunks) {
      fileData.set(chunk.data, offset);
      offset += chunk.data.length;
    }
    
    return fileData;
  }

  // Verify file checksum
  async verifyFileChecksum(fileData: Uint8Array, expectedChecksum: Uint8Array): Promise<boolean> {
    const computedChecksum = sha256(fileData);
    return this.arraysEqual(computedChecksum, expectedChecksum);
  }

  // Initialize transfer
  initializeTransfer(metadata: FileMetadata): TransferState {
    const state: TransferState = {
      fileId: metadata.fileId,
      metadata,
      progress: 0,
      bytesTransferred: 0,
      status: 'pending'
    };
    
    this.activeTransfers.set(metadata.fileId, state);
    this.queueTransfer(metadata.fileId);
    
    return state;
  }

  // Update transfer progress (public version)
  updateTransferProgress(fileId: string, progress: number, bytesTransferred: number): void {
    const state = this.activeTransfers.get(fileId);
    if (state) {
      state.progress = progress;
      state.bytesTransferred = bytesTransferred;
      state.status = progress >= 100 ? 'completed' : 'active';
      if (state.status === 'completed') {
        this.processQueue();
      }
    }
  }

  // Complete transfer
  completeTransfer(fileId: string): void {
    const state = this.activeTransfers.get(fileId);
    if (state) {
      state.status = 'completed';
      state.progress = 100;
      this.processQueue();
    }
  }

  // Pause transfer
  pauseTransfer(fileId: string): void {
    const state = this.activeTransfers.get(fileId);
    if (state) {
      state.status = 'paused';
    }
  }

  // Resume transfer
  resumeTransfer(fileId: string): void {
    const state = this.activeTransfers.get(fileId);
    if (state) {
      if (this.getActiveTransferCount() >= FileTransferManager.MAX_CONCURRENT_TRANSFERS) {
        state.status = 'pending';
        if (!this.transferQueue.includes(fileId)) {
          this.transferQueue.push(fileId);
        }
      } else {
        state.status = 'active';
      }
    }
  }

  // Initialize receive
  initializeReceive(metadata: FileMetadata): void {
    this.initializePartialFile(metadata);
  }

  // Mark chunk as received
  markChunkReceived(fileId: string, chunkIndex: number): void {
    const partial = this.partialFiles.get(fileId);
    if (partial) {
      partial.receivedChunks.add(chunkIndex);
      partial.lastActivityTime = Date.now();
    }
  }

  // Check transfer timeouts
  checkTransferTimeouts(): void {
    this.cleanupStaleTransfers();
  }
}

/**
 * Event names for file transfer
 */
export enum FileTransferEvents {
  CHUNK_RECEIVED = 'chunk_received',
  FILE_REASSEMBLED = 'file_reassembled',
  PROGRESS = 'progress',
  ERROR = 'error',
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
}

/**
 * Simple file transfer class with EventEmitter pattern
 * Used for peer-to-peer file transfers
 */
export class FileTransfer {
  private static readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private sendFn: (chunk: Uint8Array, index: number, total: number) => void;

  constructor(sendFn: (chunk: Uint8Array, index: number, total: number) => void) {
    this.sendFn = sendFn;
  }

  /**
   * Register event listener
   */
  on(event: FileTransferEvents | string, callback: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return this;
  }

  /**
   * Remove event listener
   */
  off(event: FileTransferEvents | string, callback: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
    return this;
  }

  /**
   * Emit event
   */
  emit(event: FileTransferEvents | string, ...args: unknown[]): boolean {
    const listeners = this.listeners.get(event);
    if (listeners && listeners.size > 0) {
      listeners.forEach(callback => callback(...args));
      return true;
    }
    return false;
  }

  /**
   * Send a file by chunking and emitting through the send function
   */
  sendFile(file: Uint8Array, chunkSize: number = FileTransfer.DEFAULT_CHUNK_SIZE): void {
    const totalChunks = Math.ceil(file.length / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.length);
      const chunk = file.slice(start, end);
      
      this.sendFn(chunk, i, totalChunks);
      this.emit(FileTransferEvents.PROGRESS, i + 1, totalChunks);
    }
    
    this.emit(FileTransferEvents.COMPLETE);
  }

  /**
   * Receive and reassemble chunks
   */
  private receivedChunks: Map<number, Uint8Array> = new Map();
  private expectedTotal: number = 0;

  receiveChunk(chunk: Uint8Array, index: number, total: number): void {
    this.expectedTotal = total;
    this.receivedChunks.set(index, chunk);
    
    this.emit(FileTransferEvents.CHUNK_RECEIVED, chunk, index, total);
    
    if (this.receivedChunks.size === total) {
      const file = this.reassembleFile();
      this.emit(FileTransferEvents.FILE_REASSEMBLED, file);
    }
  }

  /**
   * Reassemble chunks into complete file
   */
  private reassembleFile(): Uint8Array {
    const chunks = [...this.receivedChunks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, chunk]) => chunk);
    
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const file = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const chunk of chunks) {
      file.set(chunk, offset);
      offset += chunk.length;
    }
    
    this.receivedChunks.clear();
    return file;
  }
}
