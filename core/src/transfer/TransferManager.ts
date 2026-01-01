import { MeshNetwork } from "../mesh/network.js";
import { MessageType } from "../protocol/message.js";
import {
  chunkFile,
  FileReassembler,
  FileChunkMetadata,
  FileChunkPayload,
  DEFAULT_CHUNK_SIZE,
} from "./file-chunker.js";

export class TransferManager {
  private mesh: MeshNetwork;
  private reassembler: FileReassembler;
  private activeTransfers: Map<string, boolean> = new Map(); // fileId -> isSending

  constructor(mesh: MeshNetwork) {
    this.mesh = mesh;
    this.reassembler = new FileReassembler();

    // Hook into reassembler callbacks
  }

  private onFileReceivedCallback?: (
    data: Uint8Array,
    metadata: FileChunkMetadata,
  ) => void;

  onFileReceived(
    callback: (data: Uint8Array, metadata: FileChunkMetadata) => void,
  ) {
    this.onFileReceivedCallback = callback;
  }

  /**
   * Send a file to a peer
   */
  async sendFile(
    peerId: string,
    file: File | Uint8Array,
    metadata?: Partial<FileChunkMetadata>,
  ): Promise<string> {
    const generator = chunkFile(file, DEFAULT_CHUNK_SIZE);

    // Get first chunk to get metadata
    const firstResult = await generator.next();
    if (firstResult.done) {
      throw new Error("Empty file");
    }

    const firstPayload = firstResult.value;
    const fileId = firstPayload.fileId;

    // 1. Send Metadata
    // We need to construct the full metadata from the first chunk's info + what we know
    // Actually, chunkFile doesn't return full metadata until the *end* of the generator if we iterate it all?
    // Wait, chunkFile generator yields payloads. The return value is metadata.
    // We don't get the return value until we consume the whole generator.
    // But we need to send Start Metadata first.
    // The `chunkFile` helper in file-chunker.ts yields chunks. It calculates totalChunks based on size.
    // We can manually calculate metadata or use a helper that gives us metadata upfront.
    // Let's look at `chunkFile` again. It calculates `totalChunks` and `fileId` at the start.
    // But it returns the full metadata at the end.
    // We can reconstruct enough metadata for the generic FILE_METADATA message.

    const fullMetadata: FileChunkMetadata = {
      fileId: firstPayload.fileId,
      fileName: file instanceof File ? file.name : "unnamed.bin",
      fileSize: file instanceof File ? file.size : file.byteLength,
      mimeType: file instanceof File ? file.type : "application/octet-stream",
      totalChunks: firstPayload.totalChunks,
      chunkSize: DEFAULT_CHUNK_SIZE,
      fileChecksum: "", // We might not know this yet if we stream? file-chunker calculates it eagerly for Uint8Array but async for File.
      timestamp: Date.now(),
      ...metadata,
    };

    // If we're streaming chunks, we might not have the full file checksum yet.
    // The current file-chunker implementation reads the whole ArrayBuffer for Files, so it knows the size/checksum.
    // But `chunkFile` yields one by one.

    // For now, let's send what we have.
    const metadataMsg = JSON.stringify(fullMetadata);

    console.log(
      `[TransferManager] Starting transfer of ${fullMetadata.fileName} to ${peerId}`,
    );

    await this.mesh.sendMessage(peerId, metadataMsg, MessageType.FILE_METADATA);

    // 2. Send Chunks
    this.activeTransfers.set(fileId, true);

    try {
      // Send first chunk (already popped)
      await this.sendChunk(peerId, firstPayload);

      // Send rest
      for await (const chunk of generator) {
        if (!this.activeTransfers.get(fileId)) break; // Cancelled
        await this.sendChunk(peerId, chunk);

        // Basic flow control: sleep a tiny bit to not flood?
        // Rely on Transport buffer/backpressure if possible.
        // For now, await ensure simplistic flow control.
      }
    } catch (err) {
      console.error(`[TransferManager] Transfer failed:`, err);
      this.activeTransfers.delete(fileId);
      throw err;
    }

    console.log(`[TransferManager] Transfer complete: ${fileId}`);
    this.activeTransfers.delete(fileId);
    return fileId;
  }

  private async sendChunk(peerId: string, chunk: FileChunkPayload) {
    // We use a custom serialization for chunks to avoid base64 overhead of JSON if possible?
    // But network.ts `sendMessage` expects string for text, or `sendBinaryMessage` for binary.
    // `sendBinaryMessage` takes a Uint8Array payload.
    // We should treat the Chunk Payload as a binary struct or JSON.
    // JSON is easier for prototyping.
    // But `data` in FileChunkPayload is Uint8Array. JSON stringifying it will blow it up.
    // Let's manual serialize: [Header JSON Length 4bytes][Header JSON][Raw Data]
    // Or just use JSON but convert data to Base64 (overhead).
    // Given "Large File Chunking" is the goal, let's try to be efficient.
    // Helper:

    const header = {
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      checksum: chunk.checksum,
    };
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const headerLen = new Uint8Array(4);
    new DataView(headerLen.buffer).setUint32(0, headerBytes.length);

    const payload = new Uint8Array(4 + headerBytes.length + chunk.data.length);
    payload.set(headerLen, 0);
    payload.set(headerBytes, 4);
    payload.set(chunk.data, 4 + headerBytes.length);

    await this.mesh.sendBinaryMessage(peerId, payload, MessageType.FILE_CHUNK);
  }

  /**
   * Handle incoming messages
   */
  handleMessage(messageType: MessageType, payload: Uint8Array) {
    if (messageType === MessageType.FILE_METADATA) {
      try {
        const json = new TextDecoder().decode(payload);
        const metadata = JSON.parse(json) as FileChunkMetadata;
        console.log(
          `[TransferManager] Received metadata for ${metadata.fileName}`,
        );
        this.reassembler.initFile(metadata);

        // Register completion callback for this file
        this.reassembler.onComplete(
          metadata.fileId,
          (data, completeMetadata) => {
            console.log(
              `[TransferManager] File received: ${completeMetadata.fileName} (${completeMetadata.fileSize} bytes)`,
            );
            if (this.onFileReceivedCallback) {
              this.onFileReceivedCallback(data, completeMetadata);
            }
          },
        );
      } catch (e) {
        console.error("Failed to parse FILE_METADATA", e);
      }
    } else if (messageType === MessageType.FILE_CHUNK) {
      try {
        // Deserialize [Len][Header][Data]
        const view = new DataView(
          payload.buffer,
          payload.byteOffset,
          payload.byteLength,
        );
        const headerLen = view.getUint32(0);
        const headerBytes = payload.slice(4, 4 + headerLen);
        const chunkData = payload.slice(4 + headerLen);

        const header = JSON.parse(new TextDecoder().decode(headerBytes));

        const chunk: FileChunkPayload = {
          fileId: header.fileId,
          chunkIndex: header.chunkIndex,
          totalChunks: header.totalChunks,
          checksum: header.checksum,
          data: chunkData,
        };

        this.reassembler.addChunk(chunk);
      } catch (e) {
        console.error("Failed to parse FILE_CHUNK", e);
      }
    }
  }

  cancelTransfer(fileId: string) {
    this.activeTransfers.set(fileId, false);
    this.reassembler.cancel(fileId);
  }
}
