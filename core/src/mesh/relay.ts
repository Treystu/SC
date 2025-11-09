/**
 * Message Relay and Flood Routing Implementation
 */

import { Message, MessageType, messageHash, decodeMessage } from '../protocol/message';
import { RoutingTable } from './routing';

export interface RelayStats {
  messagesReceived: number;
  messagesForwarded: number;
  messagesDuplicate: number;
  messagesExpired: number;
  messagesForSelf: number;
}

/**
 * Message Relay Engine
 * Implements flood routing with TTL and deduplication
 */
export class MessageRelay {
  private routingTable: RoutingTable;
  private localPeerId: string;
  private stats: RelayStats = {
    messagesReceived: 0,
    messagesForwarded: 0,
    messagesDuplicate: 0,
    messagesExpired: 0,
    messagesForSelf: 0,
  };
  
  // Callbacks
  private onMessageForSelfCallback?: (message: Message) => void;
  private onForwardMessageCallback?: (message: Message, excludePeerId: string) => void;

  constructor(localPeerId: string, routingTable: RoutingTable) {
    this.localPeerId = localPeerId;
    this.routingTable = routingTable;
  }

  /**
   * Process incoming message and decide whether to forward, deliver, or drop
   */
  async processMessage(messageData: Uint8Array, fromPeerId: string): Promise<void> {
    this.stats.messagesReceived++;

    let message: Message;
    try {
      message = decodeMessage(messageData);
    } catch (error) {
      console.error('Failed to decode message:', error);
      return;
    }

    // Step 1: Check if we've seen this message before (deduplication)
    const hash = messageHash(message);
    if (this.routingTable.hasSeenMessage(hash)) {
      this.stats.messagesDuplicate++;
      return; // Drop duplicate
    }

    // Mark as seen
    this.routingTable.markMessageSeen(hash);

    // Step 2: Check TTL
    if (message.header.ttl === 0) {
      this.stats.messagesExpired++;
      return; // Drop expired message
    }

    // Step 3: Check if message is for us
    const senderIdHex = Array.from(message.header.senderId)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (this.isMessageForSelf(message)) {
      this.stats.messagesForSelf++;
      this.onMessageForSelfCallback?.(message);
      
      // Don't forward messages addressed to us
      return;
    }

    // Step 4: Decrement TTL for forwarding
    const forwardMessage: Message = {
      header: {
        ...message.header,
        ttl: message.header.ttl - 1,
      },
      payload: message.payload,
    };

    // Step 5: Forward to all peers except sender (flood routing)
    if (forwardMessage.header.ttl > 0) {
      this.stats.messagesForwarded++;
      this.onForwardMessageCallback?.(forwardMessage, fromPeerId);
    }
  }

  /**
   * Check if message is addressed to this peer
   */
  private isMessageForSelf(message: Message): boolean {
    // For broadcast messages (PEER_DISCOVERY, etc.), everyone processes them
    if (this.isBroadcastMessage(message.header.type)) {
      return true;
    }

    // For directed messages, check if we're the recipient
    // This would require destination field in payload (to be implemented)
    return false;
  }

  /**
   * Check if message type is broadcast
   */
  private isBroadcastMessage(type: MessageType): boolean {
    return (
      type === MessageType.PEER_DISCOVERY ||
      type === MessageType.PEER_INTRODUCTION ||
      type === MessageType.CONTROL_PING ||
      type === MessageType.CONTROL_PONG
    );
  }

  /**
   * Register callback for messages addressed to this peer
   */
  onMessageForSelf(callback: (message: Message) => void): void {
    this.onMessageForSelfCallback = callback;
  }

  /**
   * Register callback for forwarding messages
   */
  onForwardMessage(callback: (message: Message, excludePeerId: string) => void): void {
    this.onForwardMessageCallback = callback;
  }

  /**
   * Get relay statistics
   */
  getStats(): RelayStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messagesReceived: 0,
      messagesForwarded: 0,
      messagesDuplicate: 0,
      messagesExpired: 0,
      messagesForSelf: 0,
    };
  }
}

/**
 * Message Fragmentation for Large Messages
 */
export interface MessageFragment {
  messageId: string;
  fragmentIndex: number;
  totalFragments: number;
  data: Uint8Array;
}

export const MAX_FRAGMENT_SIZE = 16384; // 16KB per fragment

/**
 * Fragment a large message into smaller chunks
 */
export function fragmentMessage(message: Uint8Array, messageId: string): MessageFragment[] {
  const fragments: MessageFragment[] = [];
  const totalFragments = Math.ceil(message.length / MAX_FRAGMENT_SIZE);

  for (let i = 0; i < totalFragments; i++) {
    const start = i * MAX_FRAGMENT_SIZE;
    const end = Math.min(start + MAX_FRAGMENT_SIZE, message.length);
    const data = message.slice(start, end);

    fragments.push({
      messageId,
      fragmentIndex: i,
      totalFragments,
      data,
    });
  }

  return fragments;
}

/**
 * Message Reassembly Engine
 * Collects fragments and reassembles original messages
 */
export class MessageReassembler {
  private fragments: Map<string, Map<number, Uint8Array>> = new Map();
  private totalFragments: Map<string, number> = new Map();
  private onCompleteCallback?: (messageId: string, message: Uint8Array) => void;

  /**
   * Add a fragment to the reassembly buffer
   */
  addFragment(fragment: MessageFragment): boolean {
    const { messageId, fragmentIndex, totalFragments, data } = fragment;

    // Initialize fragment map for this message if needed
    if (!this.fragments.has(messageId)) {
      this.fragments.set(messageId, new Map());
      this.totalFragments.set(messageId, totalFragments);
    }

    // Add fragment
    const messageFragments = this.fragments.get(messageId)!;
    messageFragments.set(fragmentIndex, data);

    // Check if we have all fragments
    if (messageFragments.size === totalFragments) {
      this.reassembleMessage(messageId);
      return true; // Message complete
    }

    return false; // Still waiting for more fragments
  }

  /**
   * Reassemble complete message from fragments
   */
  private reassembleMessage(messageId: string): void {
    const messageFragments = this.fragments.get(messageId);
    const totalFragments = this.totalFragments.get(messageId);

    if (!messageFragments || !totalFragments) {
      return;
    }

    // Calculate total size
    let totalSize = 0;
    for (let i = 0; i < totalFragments; i++) {
      const fragment = messageFragments.get(i);
      if (!fragment) {
        console.error(`Missing fragment ${i} for message ${messageId}`);
        return;
      }
      totalSize += fragment.length;
    }

    // Reassemble
    const completeMessage = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < totalFragments; i++) {
      const fragment = messageFragments.get(i)!;
      completeMessage.set(fragment, offset);
      offset += fragment.length;
    }

    // Clean up
    this.fragments.delete(messageId);
    this.totalFragments.delete(messageId);

    // Notify completion
    this.onCompleteCallback?.(messageId, completeMessage);
  }

  /**
   * Register callback for completed messages
   */
  onComplete(callback: (messageId: string, message: Uint8Array) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * Clean up old incomplete messages
   */
  cleanup(maxAgeMs: number = 60000): void {
    // This would require tracking fragment timestamps
    // For now, just clear all incomplete messages
    const now = Date.now();
    // Implementation would check timestamps and remove old fragments
  }

  /**
   * Get reassembly statistics
   */
  getStats() {
    return {
      incompleteMessages: this.fragments.size,
      fragmentsWaiting: Array.from(this.fragments.values())
        .reduce((sum, map) => sum + map.size, 0),
    };
  }
}
