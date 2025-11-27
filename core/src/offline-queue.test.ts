import { OfflineQueue, QueuedMessage } from './offline-queue';

// Mock the database module
jest.mock('./database', () => ({
  getDatabase: jest.fn()
}));

describe('OfflineQueue', () => {
  let offlineQueue: OfflineQueue;
  let mockDb: any;
  let mockOfflineQueueStore: any;

  beforeEach(() => {
    mockOfflineQueueStore = {
      toArray: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
      below: jest.fn().mockReturnThis(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      clear: jest.fn()
    };

    mockDb = {
      offlineQueue: mockOfflineQueueStore
    };

    // @ts-ignore
    require('./database').getDatabase.mockResolvedValue(mockDb);

    offlineQueue = new OfflineQueue();
  });

  describe('enqueue', () => {
    it('should add message to queue', async () => {
      mockOfflineQueueStore.toArray.mockResolvedValue([]);
      
      const message = {
        recipientId: 'recipient1',
        content: 'Hello',
        timestamp: Date.now()
      };

      await offlineQueue.enqueue(message);

      expect(mockOfflineQueueStore.add).toHaveBeenCalledWith(expect.objectContaining({
        recipientId: 'recipient1',
        content: 'Hello',
        retries: 0
      }));
    });

    it('should reject if queue is full', async () => {
      mockOfflineQueueStore.toArray.mockResolvedValue(new Array(1000).fill({}));

      const message = {
        recipientId: 'recipient1',
        content: 'Hello',
        timestamp: Date.now()
      };

      await expect(offlineQueue.enqueue(message)).rejects.toThrow('Offline queue is full');
    });
  });

  describe('processQueue', () => {
    it('should process pending messages', async () => {
      const pendingMessages = [
        { id: '1', content: 'msg1', retries: 0, maxRetries: 5 },
        { id: '2', content: 'msg2', retries: 0, maxRetries: 5 }
      ];

      mockOfflineQueueStore.toArray.mockResolvedValue(pendingMessages);
      const sendFn = jest.fn().mockResolvedValue(true);

      await offlineQueue.processQueue(sendFn);

      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(mockOfflineQueueStore.delete).toHaveBeenCalledTimes(2);
    });

    it('should retry failed messages', async () => {
      const pendingMessages = [
        { id: '1', content: 'msg1', retries: 0, maxRetries: 5 }
      ];

      mockOfflineQueueStore.toArray.mockResolvedValue(pendingMessages);
      const sendFn = jest.fn().mockResolvedValue(false);

      await offlineQueue.processQueue(sendFn);

      expect(mockOfflineQueueStore.delete).not.toHaveBeenCalled();
      expect(mockOfflineQueueStore.update).toHaveBeenCalledWith('1', expect.objectContaining({
        retries: 1
      }));
    });

    it('should drop messages after max retries', async () => {
      const pendingMessages = [
        { id: '1', content: 'msg1', retries: 5, maxRetries: 5 }
      ];

      mockOfflineQueueStore.toArray.mockResolvedValue(pendingMessages);
      const sendFn = jest.fn().mockResolvedValue(false);

      await offlineQueue.processQueue(sendFn);

      expect(mockOfflineQueueStore.delete).toHaveBeenCalledWith('1');
    });
  });

  describe('getQueueSize', () => {
    it('should return queue size', async () => {
      mockOfflineQueueStore.count.mockResolvedValue(5);
      const size = await offlineQueue.getQueueSize();
      expect(size).toBe(5);
    });
  });

  describe('clearQueue', () => {
    it('should clear queue', async () => {
      await offlineQueue.clearQueue();
      expect(mockOfflineQueueStore.clear).toHaveBeenCalled();
    });
  });
});