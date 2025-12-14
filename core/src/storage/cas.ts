/**
 * Content Addressable Storage (CAS)
 * Handles storage and retrieval of data by its content hash.
 */

import { sha256 } from "@noble/hashes/sha2.js";

export interface CASChunk {
  hash: string;
  data: Uint8Array;
}

export interface CASConfig {
  chunkSize?: number; // Default 1MB
}

export class CAS {
  private storage: Map<string, Uint8Array> = new Map();
  private chunkSize: number;

  constructor(config: CASConfig = {}) {
    this.chunkSize = config.chunkSize || 1024 * 1024;
  }

  /**
   * Calculate hash of data
   */
  async hash(data: Uint8Array): Promise<string> {
    const hash = sha256(data);
    return Array.from(hash)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Store data and return its hash
   */
  async store(data: Uint8Array): Promise<string> {
    const hash = await this.hash(data);
    this.storage.set(hash, data);
    return hash;
  }

  /**
   * Retrieve data by hash
   */
  async get(hash: string): Promise<Uint8Array | undefined> {
    return this.storage.get(hash);
  }

  /**
   * Check if data exists
   */
  async has(hash: string): Promise<boolean> {
    return this.storage.has(hash);
  }

  /**
   * Split large file into chunks and store them
   * Returns validation root (Merkle root or just list of hashes)
   */
  async storeStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
    const reader = stream.getReader();
    const hashes: string[] = [];

    let buffer = new Uint8Array(0);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Append new data to buffer
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      // Process complete chunks
      while (buffer.length >= this.chunkSize) {
        const chunk = buffer.slice(0, this.chunkSize);
        const hash = await this.store(chunk);
        hashes.push(hash);

        buffer = buffer.slice(this.chunkSize);
      }
    }

    // Store remaining buffer
    if (buffer.length > 0) {
      const hash = await this.store(buffer);
      hashes.push(hash);
    }

    return hashes;
  }
}
