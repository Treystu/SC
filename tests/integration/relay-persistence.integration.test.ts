import { MessageRelay, MemoryPersistenceAdapter } from '../../core/src/mesh/relay';
import { RoutingTable } from '../../core/src/mesh/routing';
import type { Message } from '../../core/src/protocol/message';
import { MessageType } from '../../core/src/protocol/message';

describe('Relay Persistence Integration Test', () => {
  it('should persist stored messages across relay restarts', async () => {
    const persistence = new MemoryPersistenceAdapter();
    const routingTable = new RoutingTable('local-peer', { maxCacheSize: 1000 });
    let relay = new MessageRelay('local-peer', routingTable, {}, persistence);

    const message: Message = {
      header: {
        version: 1,
        type: MessageType.TEXT,
        ttl: 1,
        timestamp: Date.now(),
        senderId: new Uint8Array(32),
        signature: new Uint8Array(64),
      },
      payload: new TextEncoder().encode('test message'),
    };

    // Store a message
    await relay.storeMessage(message, 'remote-peer');
    expect(await persistence.size()).toBe(1);

    // Simulate a restart with a new persistence adapter
    let newRelay = new MessageRelay('local-peer', routingTable, {}, new MemoryPersistenceAdapter());
    expect(await newRelay.getStoredMessagesStats()).toHaveProperty('total', 0);

    // Simulate a restart with the original persistence adapter
    let persistedRelay = new MessageRelay('local-peer', routingTable, {}, persistence);
    expect(await persistedRelay.getStoredMessagesStats()).toHaveProperty('total', 1);
  });
});