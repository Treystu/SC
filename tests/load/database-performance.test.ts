/**
 * Database Performance Load Test
 * Tests database operations using mock storage adapter
 */

describe('Database Performance Load Test', () => {
  // Mock MemoryPersistenceAdapter for Node.js environment
  class MockStorageAdapter {
    private data: Map<string, Map<string, unknown>> = new Map();
    private operationCount: number = 0;

    constructor() {
      this.data.set('messages', new Map());
      this.data.set('conversations', new Map());
    }

    async get(store: string, key: string): Promise<unknown | null> {
      this.operationCount++;
      return this.data.get(store)?.get(key) ?? null;
    }

    async set(store: string, key: string, value: unknown): Promise<void> {
      this.operationCount++;
      this.data.get(store)?.set(key, value);
    }

    async delete(store: string, key: string): Promise<boolean> {
      this.operationCount++;
      return this.data.get(store)?.delete(key) ?? false;
    }

    async clear(store: string): Promise<void> {
      this.operationCount++;
      this.data.get(store)?.clear();
    }

    async getAll(store: string): Promise<unknown[]> {
      this.operationCount++;
      return Array.from(this.data.get(store)?.values() ?? []);
    }

    async count(store: string): Promise<number> {
      this.operationCount++;
      return this.data.get(store)?.size ?? 0;
    }

    getOperationCount(): number {
      return this.operationCount;
    }

    resetOperationCount(): void {
      this.operationCount = 0;
    }
  }

  // Helper to generate test messages
  function generateTestMessages(count: number, baseContent: string): Array<{ id: string; content: string; timestamp: number; senderId: string }> {
    const messages = [];
    for (let i = 0; i < count; i++) {
      messages.push({
        id: `msg-${Date.now()}-${i}`,
        content: `${baseContent} - Message ${i}`,
        timestamp: Date.now() + i,
        senderId: 'test-peer-id-' + (i % 5),
      });
    }
    return messages;
  }

  it('should handle 1,000 message insertions efficiently', async () => {
    const storage = new MockStorageAdapter();
    const messages = generateTestMessages(1000, 'Performance test message');
    
    const startTime = performance.now();
    
    // Batch insert messages
    for (const message of messages) {
      await storage.set('messages', message.id, message);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`1,000 messages inserted in ${duration.toFixed(2)}ms`);
    console.log(`Total operations: ${storage.getOperationCount()}`);
    
    // Should complete in under 2 seconds
    expect(duration).toBeLessThan(2000);
    expect(storage.getOperationCount()).toBe(1000);
  });

  it('should handle 10,000 message insertions efficiently', async () => {
    const storage = new MockStorageAdapter();
    const messages = generateTestMessages(10000, 'Large scale test message');
    
    const startTime = performance.now();
    
    for (const message of messages) {
      await storage.set('messages', message.id, message);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`10,000 messages inserted in ${duration.toFixed(2)}ms`);
    
    // Should complete in under 10 seconds
    expect(duration).toBeLessThan(10000);
  });

  it('should efficiently query messages by sender', async () => {
    const storage = new MockStorageAdapter();
    const testSenderId = 'test-peer-id-2';
    
    // First, add some messages with known sender
    const messages = generateTestMessages(100, 'Query test');
    for (const message of messages) {
      await storage.set('messages', message.id, message);
    }
    
    const startTime = performance.now();
    
    // Query by sender ID
    const allMessages = await storage.getAll('messages');
    const filteredMessages = allMessages.filter((m: unknown) => {
      const msg = m as { senderId: string };
      return msg.senderId === testSenderId;
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Queried ${filteredMessages.length} messages in ${duration.toFixed(2)}ms`);
    
    expect(filteredMessages.length).toBe(20); // 100 messages / 5 senders = 20 each
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });

  it('should handle concurrent read/write operations', async () => {
    const storage = new MockStorageAdapter();
    
    // Create multiple operations concurrently
    const writePromises1 = [];
    const writePromises2 = [];
    
    for (let i = 0; i < 100; i++) {
      writePromises1.push(storage.set('messages', `concurrent-1-${i}`, {
        id: `concurrent-1-${i}`,
        content: `Concurrent write 1 - ${i}`,
        timestamp: Date.now(),
        senderId: 'sender-1',
      }));
      writePromises2.push(storage.set('messages', `concurrent-2-${i}`, {
        id: `concurrent-2-${i}`,
        content: `Concurrent write 2 - ${i}`,
        timestamp: Date.now(),
        senderId: 'sender-2',
      }));
    }
    
    // Read concurrently
    const readPromise = storage.count('messages');
    
    await Promise.all([...writePromises1, ...writePromises2, readPromise]);
    
    const count = await storage.count('messages');
    expect(count).toBeGreaterThanOrEqual(200);
  });

  it('should efficiently delete large amounts of data', async () => {
    const storage = new MockStorageAdapter();
    
    // First, add data
    const messages = generateTestMessages(5000, 'Delete test');
    for (const message of messages) {
      await storage.set('messages', message.id, message);
    }
    
    const startTime = performance.now();
    
    // Now delete all data
    await storage.clear('messages');
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Deleted 5,000 messages in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(1000);
    
    // Verify deletion
    const count = await storage.count('messages');
    expect(count).toBe(0);
  });

  it('should measure write throughput', async () => {
    const storage = new MockStorageAdapter();
    const MESSAGE_COUNT = 5000;
    
    const messages = generateTestMessages(MESSAGE_COUNT, 'Throughput test');
    
    const startTime = performance.now();
    
    for (const message of messages) {
      await storage.set('messages', message.id, message);
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const throughput = MESSAGE_COUNT / (duration / 1000);
    
    console.log(`Write throughput: ${throughput.toFixed(2)} messages/second`);
    
    // Should achieve at least 1000 messages/second
    expect(throughput).toBeGreaterThan(1000);
  });

  it('should measure read throughput', async () => {
    const storage = new MockStorageAdapter();
    const MESSAGE_COUNT = 5000;
    
    // Add data first
    const messages = generateTestMessages(MESSAGE_COUNT, 'Read throughput test');
    for (const message of messages) {
      await storage.set('messages', message.id, message);
    }
    
    const startTime = performance.now();
    
    // Read all data
    const allMessages = await storage.getAll('messages');
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const throughput = MESSAGE_COUNT / (duration / 1000);
    
    console.log(`Read throughput: ${throughput.toFixed(2)} messages/second`);
    
    // Should achieve at least 2000 messages/second for reads
    expect(throughput).toBeGreaterThan(2000);
    expect(allMessages.length).toBe(MESSAGE_COUNT);
  });
});
