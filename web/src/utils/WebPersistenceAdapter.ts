import { PersistenceAdapter, StoredMessage } from '@sc/core';
import { getDatabase } from '../storage/database';

export class WebPersistenceAdapter implements PersistenceAdapter {
    private db = getDatabase();

    async saveMessage(id: string, message: StoredMessage): Promise<void> {
        // Map core StoredMessage to DB StoredMessage
        // We use a special status 'queued' for messages in transit

        // Note: The core StoredMessage has 'message' property which is the protocol Message
        // We need to decode the payload if it's text
        let content = '';
        try {
            const payload = new TextDecoder().decode(message.message.payload);
            const data = JSON.parse(payload);
            content = data.text || '';
        } catch (e) {
            content = '[Encrypted or Binary Data]';
        }

        await this.db.saveMessage({
            id: id,
            conversationId: message.destinationPeerId,
            content: content,
            timestamp: message.message.header.timestamp,
            senderId: 'me', // If we are relaying, this might be wrong, but for Sneakernet we are sender
            recipientId: message.destinationPeerId,
            type: 'text', // Simplified
            status: 'queued',
            metadata: {
                attempts: message.attempts,
                lastAttempt: message.lastAttempt,
                expiresAt: message.expiresAt,
                rawMessage: message.message // Store raw message for reconstruction if needed
            }
        });
    }

    async getMessage(id: string): Promise<StoredMessage | null> {
        // This is tricky because we need to reconstruct the core StoredMessage
        // For now, return null as we rely on the hook's retry logic which uses getQueuedMessages
        // and sends via network.sendMessage (which creates a NEW message).

        // If we want true relay persistence, we need to store the raw message bytes.
        return null;
    }

    async removeMessage(id: string): Promise<void> {
        // We don't want to delete the message from history, just update status?
        // Or if it's a relay message, we delete it.
        // For now, no-op or we could delete if we had a separate store.
    }

    async getAllMessages(): Promise<Map<string, StoredMessage>> {
        // Return empty map to disable the core relay's automatic retry loop
        // We are driving retry from the React hook for now.
        return new Map();
    }

    async pruneExpired(now: number): Promise<void> {
        // No-op
    }

    async size(): Promise<number> {
        const queued = await this.db.getQueuedMessages();
        return queued.length;
    }
}
