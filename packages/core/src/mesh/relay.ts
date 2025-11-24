import { Message, MessageType, MessagePriority } from '../types';
import { RoutingTable } from './routing';
import { DeduplicationCache } from './deduplication';

/**
 * Task 13: Implement message TTL decrement and expiration
 */
export function decrementTTL(message: Message): boolean {
  if (message.header.ttl <= 0) {
    return false; // Message expired
  }
  message.header.ttl--;
  return message.header.ttl > 0;
}

/**
 * Task 15: Implement flood routing (forward to all peers except sender)
 * Task 16: Create message relay logic
 */
export class MessageRouter {
  constructor(
    private routingTable: RoutingTable,
    private deduplicationCache: DeduplicationCache
  ) {}

  /**
   * Determines if message should be relayed
   */
  shouldRelay(message: Message): boolean {
    // Check if already seen
    if (this.deduplicationCache.hasSeen(message)) {
      return false;
    }

    // Check TTL
    if (message.header.ttl <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Gets peers to relay message to (flood routing excluding sender)
   */
  getRelayPeers(message: Message, excludePeerId?: Uint8Array): Uint8Array[] {
    const allPeers = this.routingTable.getAllPeers();
    const excludeIdStr = excludePeerId ? this.bufferToHex(excludePeerId) : null;

    return allPeers
      .filter(peer => {
        const peerIdStr = this.bufferToHex(peer.id);
        // Don't relay back to sender
        if (excludeIdStr && peerIdStr === excludeIdStr) {
          return false;
        }
        // Don't relay back to original sender
        if (peerIdStr === this.bufferToHex(message.header.senderId)) {
          return false;
        }
        return true;
      })
      .map(peer => peer.id);
  }

  /**
   * Marks message as seen
   */
  markSeen(message: Message): void {
    this.deduplicationCache.markSeen(message);
  }

  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

/**
 * Task 21: Implement message priority queue (control > voice > text > file)
 */
export class PriorityQueue {
  private queues: Map<MessagePriority, Message[]> = new Map([
    [MessagePriority.CONTROL, []],
    [MessagePriority.VOICE, []],
    [MessagePriority.TEXT, []],
    [MessagePriority.FILE, []],
  ]);

  /**
   * Adds message to appropriate priority queue
   */
  enqueue(message: Message): void {
    const priority = this.getMessagePriority(message.header.type);
    const queue = this.queues.get(priority)!;
    queue.push(message);
  }

  /**
   * Dequeues highest priority message
   */
  dequeue(): Message | null {
    // Check queues in priority order
    for (const priority of [
      MessagePriority.CONTROL,
      MessagePriority.VOICE,
      MessagePriority.TEXT,
      MessagePriority.FILE,
    ]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  /**
   * Gets total number of queued messages
   */
  size(): number {
    return Array.from(this.queues.values()).reduce((sum, q) => sum + q.length, 0);
  }

  /**
   * Checks if queue is empty
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Clears all queues
   */
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  /**
   * Maps message type to priority
   */
  private getMessagePriority(type: MessageType): MessagePriority {
    switch (type) {
      case MessageType.CONTROL:
      case MessageType.HEARTBEAT:
      case MessageType.ACK:
        return MessagePriority.CONTROL;
      case MessageType.VOICE:
        return MessagePriority.VOICE;
      case MessageType.TEXT:
        return MessagePriority.TEXT;
      case MessageType.FILE:
        return MessagePriority.FILE;
      default:
        return MessagePriority.TEXT;
    }
  }
}

/**
 * Task 22: Create bandwidth-aware message scheduling
 */
export class BandwidthScheduler {
  private bytesPerSecond: number;
  private windowStart: number = Date.now();
  private bytesInWindow: number = 0;
  private readonly windowSize: number = 1000; // 1 second window

  constructor(maxBytesPerSecond: number = 1024 * 1024) {
    this.bytesPerSecond = maxBytesPerSecond;
  }

  /**
   * Checks if we can send a message of given size
   */
  canSend(messageSize: number): boolean {
    this.updateWindow();
    return this.bytesInWindow + messageSize <= this.bytesPerSecond;
  }

  /**
   * Records that bytes were sent
   */
  recordSent(bytes: number): void {
    this.updateWindow();
    this.bytesInWindow += bytes;
  }

  /**
   * Gets available bandwidth in current window
   */
  getAvailableBandwidth(): number {
    this.updateWindow();
    return Math.max(0, this.bytesPerSecond - this.bytesInWindow);
  }

  /**
   * Updates the bandwidth window
   */
  private updateWindow(): void {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    if (elapsed >= this.windowSize) {
      // Reset window
      this.windowStart = now;
      this.bytesInWindow = 0;
    }
  }

  /**
   * Sets maximum bytes per second
   */
  setMaxBytesPerSecond(bytes: number): void {
    this.bytesPerSecond = bytes;
  }
}
