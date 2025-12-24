import { MessageRelay, MemoryPersistenceAdapter } from '../../core/src/mesh/relay';
import { RoutingTable } from '../../core/src/mesh/routing';
import { Message, MessageType } from '../../core/src/protocol/message';

/**
 * Mock offline queue for testing without Dexie DB
 */
class MockOfflineQueue {
  private queue: Map<string, Message[]> = new Map();

  async enqueue(recipientId: string, message: Message): Promise<void> {
    const messages = this.queue.get(recipientId) || [];
    messages.push(message);
    this.queue.set(recipientId, messages);
  }

  async dequeue(recipientId: string): Promise<Message | undefined> {
    const messages = this.queue.get(recipientId) || [];
    return messages.shift();
  }

  async size(): Promise<number> {
    let total = 0;
    for (const messages of this.queue.values()) {
      total += messages.length;
    }
    return total;
  }

  async getMessagesFor(recipientId: string): Promise<Message[]> {
    return this.queue.get(recipientId) || [];
  }

  async clear(): Promise<void> {
    this.queue.clear();
  }
}

class MockNetwork {
  peers: Map<string, { relay: MessageRelay, queue: MockOfflineQueue, online: boolean }> = new Map();
  deliveredMessages: Map<string, Message[]> = new Map();

  register(peerId: string, relay: MessageRelay, queue: MockOfflineQueue) {
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
  it('should queue message when peer is offline and deliver when online', async () => {
    const network = new MockNetwork();
    
    const senderRelay = new MessageRelay('sender', new RoutingTable('sender'));
    const senderQueue = new MockOfflineQueue();
    network.register('sender', senderRelay, senderQueue);

    const receiverRelay = new MessageRelay('receiver', new RoutingTable('receiver'));
    const receiverQueue = new MockOfflineQueue();
    network.register('receiver', receiverRelay, receiverQueue);
    
    network.setOnlineStatus('receiver', false);

    const message: Message = {
      header: {
        version: 1,
        type: MessageType.TEXT,
        ttl: 1,
        timestamp: Date.now(),
        senderId: new Uint8Array(32),
        signature: new Uint8Array(64),
      },
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