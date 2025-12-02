/**
 * File chunking and reassembly utilities
 * Handles large file transfer by breaking files into chunks and reassembling them
 */

import { sha256 } from '@noble/hashes/sha2.js';

export interface FileChunkPayload {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  data: Uint8Array;
  checksum: string;
}

export interface FileChunkMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  fileChecksum: string;
  timestamp: number;
}

export interface ReassemblyState {
  metadata: FileChunkMetadata;
  receivedChunks: Map<number, Uint8Array>;
  lastActivityTime: number;
}

/**
 * Default chunk size for file transfers (16KB)
 */
export const DEFAULT_CHUNK_SIZE = 16 * 1024;

/**
 * Maximum allowed chunk size (64KB)
 */
export const MAX_CHUNK_SIZE = 64 * 1024;

/**
 * Calculate checksum for data
 */
function calculateChecksum(data: Uint8Array): string {
  const hash = sha256(data);
  return Array.from(hash)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a unique file ID
 */
function generateFileId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generator function to chunk a file into smaller pieces
 * @param file - File or Uint8Array to chunk
 * @param chunkSize - Size of each chunk (default: 16KB)
 * @yields FileChunkPayload for each chunk
 */
export async function* chunkFile(
  file: File | Uint8Array,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): AsyncGenerator<FileChunkPayload, FileChunkMetadata, void> {
  if (chunkSize > MAX_CHUNK_SIZE) {
    throw new Error(`Chunk size ${chunkSize} exceeds maximum ${MAX_CHUNK_SIZE}`);
  }

  const fileId = generateFileId();
  let fileData: Uint8Array;
  let fileName: string;
  let mimeType: string;
  
  if (file instanceof Uint8Array) {
    fileData = file;
    fileName = 'unnamed';
    mimeType = 'application/octet-stream';
  } else {
    const arrayBuffer = await file.arrayBuffer();
    fileData = new Uint8Array(arrayBuffer);
    fileName = file.name;
    mimeType = file.type || 'application/octet-stream';
  }

  const fileSize = fileData.length;
  const totalChunks = Math.ceil(fileSize / chunkSize);
  const fileChecksum = calculateChecksum(fileData);

  // Yield chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const data = fileData.slice(start, end);
    const checksum = calculateChecksum(data);

    yield {
      fileId,
      chunkIndex: i,
      totalChunks,
      data,
      checksum
    };
  }

  // Return metadata
  return {
    fileId,
    fileName,
    fileSize,
    mimeType,
    totalChunks,
    chunkSize,
    fileChecksum,
    timestamp: Date.now()
  };
}

/**
 * Simple function to split file into chunks (non-generator)
 */
export async function splitFile(
  file: File | Uint8Array,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<{ chunks: FileChunkPayload[]; metadata: FileChunkMetadata }> {
  const chunks: FileChunkPayload[] = [];
  let metadata: FileChunkMetadata | undefined;

  const generator = chunkFile(file, chunkSize);
  
  while (true) {
    const result = await generator.next();
    if (result.done) {
      metadata = result.value;
      break;
    }
    chunks.push(result.value);
  }

  if (!metadata) {
    throw new Error('Failed to generate file metadata');
  }

  return { chunks, metadata };
}

/**
 * File reassembler that collects chunks and reassembles the complete file
 */
export class FileReassembler {
  private files: Map<string, ReassemblyState> = new Map();
  private readonly timeout: number;
  private completionCallbacks: Map<string, (data: Uint8Array, metadata: FileChunkMetadata) => void> = new Map();

  /**
   * @param timeout - Timeout for incomplete transfers in milliseconds (default: 5 minutes)
   */
  constructor(timeout: number = 5 * 60 * 1000) {
    this.timeout = timeout;
  }

  /**
   * Register a callback for when a file is complete
   */
  onComplete(fileId: string, callback: (data: Uint8Array, metadata: FileChunkMetadata) => void): void {
    this.completionCallbacks.set(fileId, callback);
  }

  /**
   * Initialize reassembly for a file
   */
  initFile(metadata: FileChunkMetadata): void {
    this.files.set(metadata.fileId, {
      metadata,
      receivedChunks: new Map(),
      lastActivityTime: Date.now()
    });
  }

  /**
   * Add a chunk to the reassembly buffer
   * @returns true if chunk was valid and added, false otherwise
   */
  addChunk(chunk: FileChunkPayload): boolean {
    const state = this.files.get(chunk.fileId);
    
    if (!state) {
      // Auto-initialize if we receive chunks before metadata
      // This can happen in out-of-order delivery
      return false;
    }

    // Validate chunk checksum
    const actualChecksum = calculateChecksum(chunk.data);
    if (actualChecksum !== chunk.checksum) {
      console.warn(`Chunk ${chunk.chunkIndex} checksum mismatch for file ${chunk.fileId}`);
      return false;
    }

    // Validate chunk index
    if (chunk.chunkIndex < 0 || chunk.chunkIndex >= state.metadata.totalChunks) {
      console.warn(`Invalid chunk index ${chunk.chunkIndex} for file ${chunk.fileId}`);
      return false;
    }

    // Store chunk
    state.receivedChunks.set(chunk.chunkIndex, chunk.data);
    state.lastActivityTime = Date.now();

    // Check if complete
    if (this.isComplete(chunk.fileId)) {
      this.triggerCompletion(chunk.fileId);
    }

    return true;
  }

  /**
   * Check if all chunks have been received
   */
  isComplete(fileId: string): boolean {
    const state = this.files.get(fileId);
    if (!state) return false;
    
    return state.receivedChunks.size === state.metadata.totalChunks;
  }

  /**
   * Get progress of file reassembly (0-100)
   */
  getProgress(fileId: string): number {
    const state = this.files.get(fileId);
    if (!state) return 0;
    
    return (state.receivedChunks.size / state.metadata.totalChunks) * 100;
  }

  /**
   * Get list of missing chunk indices
   */
  getMissingChunks(fileId: string): number[] {
    const state = this.files.get(fileId);
    if (!state) return [];

    const missing: number[] = [];
    for (let i = 0; i < state.metadata.totalChunks; i++) {
      if (!state.receivedChunks.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Reassemble file from chunks
   * @throws Error if file is incomplete or checksum fails
   */
  reassemble(fileId: string): Uint8Array {
    const state = this.files.get(fileId);
    if (!state) {
      throw new Error(`Unknown file: ${fileId}`);
    }

    if (!this.isComplete(fileId)) {
      const missing = this.getMissingChunks(fileId);
      throw new Error(`File incomplete, missing chunks: ${missing.join(', ')}`);
    }

    // Assemble chunks in order
    const fileData = new Uint8Array(state.metadata.fileSize);
    let offset = 0;

    for (let i = 0; i < state.metadata.totalChunks; i++) {
      const chunk = state.receivedChunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk ${i} during reassembly`);
      }
      fileData.set(chunk, offset);
      offset += chunk.length;
    }

    // Verify complete file checksum
    const actualChecksum = calculateChecksum(fileData);
    if (actualChecksum !== state.metadata.fileChecksum) {
      throw new Error(`File checksum mismatch: expected ${state.metadata.fileChecksum}, got ${actualChecksum}`);
    }

    return fileData;
  }

  /**
   * Get file metadata
   */
  getMetadata(fileId: string): FileChunkMetadata | undefined {
    return this.files.get(fileId)?.metadata;
  }

  /**
   * Trigger completion callback and cleanup
   */
  private triggerCompletion(fileId: string): void {
    const callback = this.completionCallbacks.get(fileId);
    if (callback) {
      try {
        const data = this.reassemble(fileId);
        const metadata = this.files.get(fileId)!.metadata;
        callback(data, metadata);
      } catch (error) {
        console.error(`Failed to complete file ${fileId}:`, error);
      }
    }
  }

  /**
   * Cancel a transfer and clean up resources
   */
  cancel(fileId: string): void {
    this.files.delete(fileId);
    this.completionCallbacks.delete(fileId);
  }

  /**
   * Clean up stale transfers
   * @returns Number of transfers cleaned up
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [fileId, state] of this.files.entries()) {
      if (now - state.lastActivityTime > this.timeout) {
        this.files.delete(fileId);
        this.completionCallbacks.delete(fileId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get list of active file IDs
   */
  getActiveFiles(): string[] {
    return Array.from(this.files.keys());
  }

  /**
   * Get reassembly state for a file
   */
  getState(fileId: string): ReassemblyState | undefined {
    return this.files.get(fileId);
  }
}
