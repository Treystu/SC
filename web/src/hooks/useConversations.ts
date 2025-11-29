import { useState, useEffect, useCallback } from 'react';
import { getDatabase, StoredConversation } from '../storage/database';

export function useConversations() {
    const [conversations, setConversations] = useState<StoredConversation[]>([]);
    const [loading, setLoading] = useState(true);

    const loadConversations = useCallback(async () => {
        try {
            const db = getDatabase();
            const storedConversations = await db.getConversations();
            setConversations(storedConversations);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConversations();

        // Set up an interval to refresh conversations (e.g. for unread counts)
        // In a real app, this should be event-driven
        const interval = setInterval(loadConversations, 5000);
        return () => clearInterval(interval);
    }, [loadConversations]);

    return { conversations, loading, refreshConversations: loadConversations };
}
