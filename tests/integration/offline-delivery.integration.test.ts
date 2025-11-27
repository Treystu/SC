import { MessageRelay, MemoryPersistenceAdapter } from '../../core/src/mesh/relay';
import { RoutingTable, Peer, PeerState } from '../../core/src/mesh/routing';
import { Message, MessageType } from '../../core/src/protocol/message';
import { OfflineQueue } from '../../core/src/offline-queue';
import { Database, openDb } from '../../core/src/storage/database';

class MockNetwork {
  peers: Map<string, { relay: MessageRelay, queue: OfflineQueue, online: boolean }> = new Map();
  deliveredMessages: Map<string, Message[]> = new Map();

  register(peerId: string, relay: MessageRelay, queue: OfflineQueue) {
    this.peers.set(peerId, { relay, queue, online: true });
    this.deliveredMessages.set(peerId, []);
  }

  setOnlineStatus(peerId: string, isOnline: boolean) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.online = isOnline;
    }
  }

  async sendMessage(from: string, to: string, message: Message) {
    const dest = this.peers.get(to);
    if (dest && dest.online) {
      this.deliveredMessages.get(to)?.push(message);
    } else {
      const sender = this.peers.get(from);
      await sender?.queue.enqueue(to, message);
    }
  }
}

describe('Offline Message Delivery Integration Test', () => {
  let db: Database;
  beforeEach(async () => {
    db = await openDb('test-db', 1, {
      upgrade(db) {
        db.createObjectStore('offline-queue');
      },
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('should queue message when peer is offline and deliver when online', async () => {
    const network = new MockNetwork();
    
    const senderRelay = new MessageRelay('sender', new RoutingTable('sender'));
    const senderQueue = new OfflineQueue(db);
    network.register('sender', senderRelay, senderQueue);

    const receiverRelay = new MessageRelay('receiver', new RoutingTable('receiver'));
    const receiverQueue = new OfflineQueue(db);
    network.register('receiver', receiverRelay, receiverQueue);
    
    network.setOnlineStatus('receiver', false);

    const message: Message = {
      header: { type: MessageType.TEXT, ttl: 1, timestamp: Date.now(), senderId: new Uint8Array(), signature: new Uint8Array() },
      payload: new TextEncoder().encode('hello'),
    };

    await network.sendMessage('sender', 'receiver', message);

    expect(network.deliveredMessages.get('receiver')?.length).toBe(0);
    expect(await senderQueue.size()).toBe(1);

    network.setOnlineStatus('receiver', true);

    const queuedMessage = await senderQueue.dequeue('receiver');
    if (queuedMessage) {
      await network.sendMessage('sender', 'receiver', queuedMessage);
    }

    expect(network.deliveredMessages.get('receiver')?.length).toBe(1);
    expect(await senderQueue.size()).toBe(0);
  });
});