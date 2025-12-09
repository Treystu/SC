import { PersistenceAdapter, StoredMessage } from "@sc/core";
import { getDatabase } from "../storage/database";

/**
 * Web implementation of PersistenceAdapter for @sc/core
 * Uses IndexedDB for persistent storage of queued messages
 *
 * This adapter enables true "sneakernet" capability by persisting
 * messages that cannot be delivered immediately.
 * 
 * Payload Storage Strategy:
 * - Raw message stored in metadata as complete Message object
 * - Content field stores human-readable preview for UI
 * - Sender ID extracted from message.header.senderId (Ed25519 public key)
 * - Only QUEUED messages are deleted on successful delivery
 * - Conversation history messages (SENT/DELIVERED) are preserved
 */
export class WebPersistenceAdapter implements PersistenceAdapter {
  private db = getDatabase();
  
  // Constants for unification
  private static readonly DEFAULT_MESSAGE_EXPIRATION_MS = 86400000; // 24 hours

  async saveMessage(id: string, message: StoredMessage): Promise<void> {
    // Extract sender ID from message header (Ed25519 public key as Uint8Array)
    const senderIdBase64 = this.uint8ArrayToBase64(message.message.header.senderId);
    
    // Create human-readable preview for UI
    let preview = "";
    try {
      const payload = new TextDecoder().decode(message.message.payload);
      const data = JSON.parse(payload);
      preview = (data.text || data.content || "").substring(0, 50);
      if (preview.length === 50) preview += "...";
    } catch (e) {
      preview = `[Binary Data: ${message.message.payload.length} bytes]`;
    }

    await this.db.saveMessage({
      id: id,
      conversationId: message.destinationPeerId,
      content: preview, // Human-readable preview only
      timestamp: message.message.header.timestamp,
      senderId: senderIdBase64,
      recipientId: message.destinationPeerId,
      type: "text",
      status: "queued",
      metadata: {
        attempts: message.attempts,
        lastAttempt: message.lastAttempt,
        expiresAt: message.expiresAt,
        rawMessage: message.message, // Complete message for reconstruction
        payloadSize: message.message.payload.length,
      },
    });

    console.log(`[WebPersistenceAdapter] Saved message ${id} to queue`);
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    try {
      const dbMessage = await this.db.getMessageById(id);
      if (!dbMessage || dbMessage.status !== "queued") {
        return null;
      }

      // Reconstruct StoredMessage from DB
      const metadata = dbMessage.metadata as any;
      if (!metadata?.rawMessage) {
        return null;
      }

      return {
        message: metadata.rawMessage,
        destinationPeerId: dbMessage.recipientId,
        attempts: metadata.attempts || 0,
        lastAttempt: metadata.lastAttempt || Date.now(),
        expiresAt: metadata.expiresAt || Date.now() + WebPersistenceAdapter.DEFAULT_MESSAGE_EXPIRATION_MS,
      };
    } catch (error) {
      console.error(`[WebPersistenceAdapter] Failed to get message ${id}:`, error);
      return null;
    }
  }

  async removeMessage(id: string): Promise<void> {
    try {
      // Delete from queue - this is for queued/relay messages only
      // Conversation history messages are stored separately and never deleted via this method
      await this.db.deleteMessage(id);
      console.log(`[WebPersistenceAdapter] Deleted queued/relay message ${id}`);
    } catch (error) {
      console.error(`[WebPersistenceAdapter] Failed to remove message ${id}:`, error);
    }
  }

  async getAllMessages(): Promise<Map<string, StoredMessage>> {
    try {
      const queuedMessages = await this.db.getQueuedMessages();
      const messagesMap = new Map<string, StoredMessage>();

      for (const dbMessage of queuedMessages) {
        const metadata = dbMessage.metadata as any;
        if (!metadata?.rawMessage) {
          continue;
        }

        messagesMap.set(dbMessage.id, {
          message: metadata.rawMessage,
          destinationPeerId: dbMessage.recipientId,
          attempts: metadata.attempts || 0,
          lastAttempt: metadata.lastAttempt || Date.now(),
          expiresAt: metadata.expiresAt || Date.now() + WebPersistenceAdapter.DEFAULT_MESSAGE_EXPIRATION_MS,
        });
      }

      console.log(`[WebPersistenceAdapter] Loaded ${messagesMap.size} queued messages`);
      return messagesMap;
    } catch (error) {
      console.error("[WebPersistenceAdapter] Failed to get all messages:", error);
      return new Map();
    }
  }

  async pruneExpired(now: number): Promise<void> {
    try {
      const queuedMessages = await this.db.getQueuedMessages();
      let prunedCount = 0;

      for (const message of queuedMessages) {
        const metadata = message.metadata as any;
        const expiresAt = metadata?.expiresAt || 0;

        if (expiresAt < now) {
          await this.db.deleteMessage(message.id);
          prunedCount++;
        }
      }

      if (prunedCount > 0) {
        console.log(`[WebPersistenceAdapter] Pruned ${prunedCount} expired messages`);
      }
    } catch (error) {
      console.error("[WebPersistenceAdapter] Failed to prune expired messages:", error);
    }
  }

  async size(): Promise<number> {
    try {
      const queued = await this.db.getQueuedMessages();
      return queued.length;
    } catch (error) {
      console.error("[WebPersistenceAdapter] Failed to get size:", error);
      return 0;
    }
  }
  
  /**
   * Convert Uint8Array to Base64 string (unified encoding)
   */
  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    const binaryString = Array.from(uint8Array)
      .map(byte => String.fromCharCode(byte))
      .join('');
    return btoa(binaryString);
  }
  
  /**
   * Convert Base64 string to Uint8Array (unified decoding)
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}
