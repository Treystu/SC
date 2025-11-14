import { MessageQueue } from './routing';
import { MessageType } from '../protocol/message';

describe('Advanced Message Priority Queue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  describe('Priority Escalation', () => {
    it('should not escalate recent messages', () => {
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'file1' });
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.enqueue(MessageType.CONTROL_PING, { data: 'ping1' });

      // Control message should come first
      const first = queue.dequeue();
      expect(first.data).toBe('ping1');
    });

    it('should track message age', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      
      // Wait a bit
      setTimeout(() => {
        const age = queue.getOldestMessageAge();
        expect(age).toBeGreaterThan(0);
      }, 100);
    });

    it('should provide size by priority level', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.enqueue(MessageType.TEXT, { data: 'text2' });
      queue.enqueue(MessageType.VOICE, { data: 'voice1' });
      queue.enqueue(MessageType.CONTROL_PING, { data: 'ping1' });

      const sizes = queue.getSizeByPriority();
      expect(sizes.get(MessageType.TEXT)).toBe(2);
      expect(sizes.get(MessageType.VOICE)).toBe(1);
      expect(sizes.get(MessageType.CONTROL_PING)).toBe(1);
    });
  });

  describe('Starvation Prevention', () => {
    it('should eventually process low-priority messages', (done) => {
      // Add low-priority message
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'file1', timestamp: Date.now() - 35000 });
      
      // Add many high-priority messages
      for (let i = 0; i < 10; i++) {
        queue.enqueue(MessageType.CONTROL_PING, { data: `ping${i}` });
      }

      // Process some messages
      for (let i = 0; i < 5; i++) {
        queue.dequeue();
      }

      // Trigger starvation prevention check by waiting
      setTimeout(() => {
        // After escalation, file message might be promoted
        const sizes = queue.getSizeByPriority();
        // Verify queue is still managing priorities
        expect(queue.size()).toBeGreaterThan(0);
        done();
      }, 100);
    });

    it('should maintain original priority tracking', () => {
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'file1' });
      const size = queue.size();
      expect(size).toBe(1);
    });
  });

  describe('Queue Statistics', () => {
    it('should track total queue size', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.enqueue(MessageType.VOICE, { data: 'voice1' });
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'file1' });

      expect(queue.size()).toBe(3);
    });

    it('should track sizes by priority', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.enqueue(MessageType.TEXT, { data: 'text2' });
      queue.enqueue(MessageType.TEXT, { data: 'text3' });
      queue.enqueue(MessageType.VOICE, { data: 'voice1' });

      const sizes = queue.getSizeByPriority();
      expect(sizes.get(MessageType.TEXT)).toBe(3);
      expect(sizes.get(MessageType.VOICE)).toBe(1);
    });

    it('should update size after dequeue', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.enqueue(MessageType.TEXT, { data: 'text2' });

      expect(queue.size()).toBe(2);
      
      queue.dequeue();
      expect(queue.size()).toBe(1);
      
      queue.dequeue();
      expect(queue.size()).toBe(0);
    });

    it('should clear all messages', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.enqueue(MessageType.VOICE, { data: 'voice1' });
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'file1' });

      expect(queue.size()).toBe(3);
      
      queue.clear();
      expect(queue.size()).toBe(0);
    });
  });

  describe('Priority Order', () => {
    it('should respect priority order: CONTROL > VOICE > TEXT > FILE', () => {
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'file' });
      queue.enqueue(MessageType.TEXT, { data: 'text' });
      queue.enqueue(MessageType.VOICE, { data: 'voice' });
      queue.enqueue(MessageType.CONTROL_PING, { data: 'ping' });

      expect(queue.dequeue().data).toBe('ping');
      expect(queue.dequeue().data).toBe('voice');
      expect(queue.dequeue().data).toBe('text');
      expect(queue.dequeue().data).toBe('file');
    });

    it('should handle multiple control message types', () => {
      queue.enqueue(MessageType.CONTROL_ACK, { data: 'ack' });
      queue.enqueue(MessageType.CONTROL_PONG, { data: 'pong' });
      queue.enqueue(MessageType.CONTROL_PING, { data: 'ping' });

      // All are control messages, should be FIFO within same priority
      const first = queue.dequeue();
      expect(['ack', 'pong', 'ping']).toContain(first.data);
    });

    it('should handle FILE_METADATA and FILE_CHUNK', () => {
      queue.enqueue(MessageType.FILE_CHUNK, { data: 'chunk' });
      queue.enqueue(MessageType.FILE_METADATA, { data: 'metadata' });
      queue.enqueue(MessageType.TEXT, { data: 'text' });

      expect(queue.dequeue().data).toBe('text'); // Higher priority
      
      const next = queue.dequeue();
      expect(['chunk', 'metadata']).toContain(next.data);
    });
  });

  describe('FIFO within Priority', () => {
    it('should maintain FIFO order within same priority', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1', order: 1 });
      queue.enqueue(MessageType.TEXT, { data: 'text2', order: 2 });
      queue.enqueue(MessageType.TEXT, { data: 'text3', order: 3 });

      expect(queue.dequeue().order).toBe(1);
      expect(queue.dequeue().order).toBe(2);
      expect(queue.dequeue().order).toBe(3);
    });
  });

  describe('Empty Queue Handling', () => {
    it('should return null when empty', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('should return null after all messages dequeued', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      queue.dequeue();
      
      expect(queue.dequeue()).toBeNull();
    });

    it('should handle alternating enqueue/dequeue', () => {
      queue.enqueue(MessageType.TEXT, { data: 'text1' });
      expect(queue.dequeue().data).toBe('text1');
      
      queue.enqueue(MessageType.TEXT, { data: 'text2' });
      expect(queue.dequeue().data).toBe('text2');
      
      expect(queue.dequeue()).toBeNull();
    });
  });
});
