import { FileTransfer, FileTransferEvents } from '../../core/src/transfer/file';
import { EventEmitter } from 'events';

class MockPeer extends EventEmitter {
  id: string;
  transfer: FileTransfer;
  receivedChunks: Map<number, Uint8Array> = new Map();
  totalChunks: number = 0;

  constructor(id: string) {
    super();
    this.id = id;
    this.transfer = new FileTransfer(this.send.bind(this));
    this.transfer.on(FileTransferEvents.CHUNK_RECEIVED, this.onChunkReceived.bind(this));
  }

  send(chunk: Uint8Array, index: number, total: number) {
    this.emit('send', chunk, index, total);
  }

  onChunkReceived(chunk: Uint8Array, index: number, total: number) {
    this.receivedChunks.set(index, chunk);
    this.totalChunks = total;
    if (this.receivedChunks.size === this.totalChunks) {
      this.transfer.emit(FileTransferEvents.FILE_REASSEMBLED, this.reassemble());
    }
  }

  reassemble(): Uint8Array {
    const chunks = [...this.receivedChunks.entries()].sort(([a], [b]) => a - b).map(([, chunk]) => chunk);
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const file = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      file.set(chunk, offset);
      offset += chunk.length;
    }
    return file;
  }
}

describe('File Transfer Integration Test', () => {
  it('should transfer a file between two mock peers', async () => {
    const sender = new MockPeer('sender');
    const receiver = new MockPeer('receiver');

    sender.on('send', (chunk, index, total) => {
      receiver.transfer.emit(FileTransferEvents.CHUNK_RECEIVED, chunk, index, total);
    });

    const file = new Uint8Array(1024 * 1024).fill(1); // 1MB file
    const transferPromise = new Promise<Uint8Array>((resolve) => {
      receiver.transfer.on(FileTransferEvents.FILE_REASSEMBLED, resolve);
    });

    sender.transfer.sendFile(file);

    const receivedFile = await transferPromise;

    expect(receivedFile).toEqual(file);
  });
});