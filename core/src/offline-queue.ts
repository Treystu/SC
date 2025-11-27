export interface QueuedMessage {
  id: string;
  recipientId: string;
  content: string;
  attachments?: File[];
  timestamp: number;
  retries: number;
  nextRetry: number;
  maxRetries: number;
}

export class OfflineQueue {
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_BACKOFF = 1000; // 1 second
  
  async enqueue(message: Omit<QueuedMessage, 'id' | 'retries' | 'nextRetry' | 'maxRetries'>): Promise<void> {
    const db = await this.getDatabase();
    const queue = await db.offlineQueue.toArray();
    
    if (queue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error('Offline queue is full');
    }
    
    const queuedMessage: QueuedMessage = {
      ...message,
      id: `queued_${Date.now()}_${Math.random()}`,
      retries: 0,
      nextRetry: Date.now(),
      maxRetries: this.MAX_RETRIES
    };
    
    await db.offlineQueue.add(queuedMessage);
  }
  
  async processQueue(sendFn: (msg: QueuedMessage) => Promise<boolean>): Promise<void> {
    const db = await this.getDatabase();
    const pending = await db.offlineQueue
      .where('nextRetry')
      .below(Date.now())
      .toArray();
    
    for (const message of pending) {
      try {
        const success = await sendFn(message);
        
        if (success) {
          // Message sent successfully
          await db.offlineQueue.delete(message.id);
        } else {
          // Failed to send, retry later
          await this.scheduleRetry(message);
        }
      } catch (error) {
        console.error('Error processing queued message:', error);
        await this.scheduleRetry(message);
      }
    }
  }
  
  private async scheduleRetry(message: QueuedMessage): Promise<void> {
    const db = await this.getDatabase();
    
    if (message.retries >= message.maxRetries) {
      // Max retries reached, remove from queue
      await db.offlineQueue.delete(message.id);
      console.warn(`Message ${message.id} exceeded max retries, removing from queue`);
      return;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const backoff = this.INITIAL_BACKOFF * Math.pow(2, message.retries);
    const nextRetry = Date.now() + backoff;
    
    await db.offlineQueue.update(message.id, {
      retries: message.retries + 1,
      nextRetry
    });
  }
  
  async getQueueSize(): Promise<number> {
    const db = await this.getDatabase();
    return await db.offlineQueue.count();
  }
  
  async clearQueue(): Promise<void> {
    const db = await this.getDatabase();
    await db.offlineQueue.clear();
  }
  
  private async getDatabase() {
    // Return IndexedDB instance
    return (await import('./database')).getDatabase();
  }
}

export const offlineQueue = new OfflineQueue();