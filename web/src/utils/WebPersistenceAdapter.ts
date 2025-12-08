import { PersistenceAdapter, StoredMessage } from "@sc/core";
import { getDatabase } from "../storage/database";

/**
 * Web implementation of PersistenceAdapter for @sc/core
 * Uses IndexedDB for persistent storage of queued messages
 *
 * This adapter enables true "sneakernet" capability by persisting
 * messages that cannot be delivered immediately, allowing them to be
 * exported and imported on another device.
 */
export class WebPersistenceAdapter implements PersistenceAdapter {
  private db = getDatabase();

  async saveMessage(id: string, message: StoredMessage): Promise<void> {
    // Extract content from payload
    let content = "";
    try {
      const payload = new TextDecoder().decode(message.message.payload);
      const data = JSON.parse(payload);
      content = data.text || data.content || "";
    } catch (e) {
      // If not JSON, store as binary indicator
      content = "[Encrypted or Binary Data]";
    }

    await this.db.saveMessage({
      id: id,
      conversationId: message.destinationPeerId,
      content: content,
      timestamp: message.message.header.timestamp,
      senderId: "me",
      recipientId: message.destinationPeerId,
      type: "text",
      status: "queued",
      metadata: {
        attempts: message.attempts,
        lastAttempt: message.lastAttempt,
        expiresAt: message.expiresAt,
        rawMessage: message.message, // Store complete message for reconstruction
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
        expiresAt: metadata.expiresAt || Date.now() + 86400000, // 24 hours
      };
    } catch (error) {
      console.error(`[WebPersistenceAdapter] Failed to get message ${id}:`, error);
      return null;
    }
  }

  async removeMessage(id: string): Promise<void> {
    try {
      // Update status instead of deleting (preserve history)
      const message = await this.db.getMessageById(id);
      if (message) {
        await this.db.saveMessage({
          ...message,
          status: "sent",
        });
        console.log(`[WebPersistenceAdapter] Marked message ${id} as sent`);
      }
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
          expiresAt: metadata.expiresAt || Date.now() + 86400000,
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
}
