import { MessageRelay, MemoryPersistenceAdapter } from '../../core/src/mesh/relay';
import { RoutingTable } from '../../core/src/mesh/routing';
import { Message, MessageType } from '../../core/src/protocol/message';

describe('Relay Persistence Integration Test', () => {
  it('should persist stored messages across relay restarts', async () => {
    const persistence = new MemoryPersistenceAdapter();
    const routingTable = new RoutingTable('local-peer');
    let relay = new MessageRelay('local-peer', routingTable, {}, persistence);

    const message: Message = {
      header: {
        type: MessageType.TEXT,
        ttl: 1,
        timestamp: Date.now(),
        senderId: new Uint8Array(),
        signature: new Uint8Array(),
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