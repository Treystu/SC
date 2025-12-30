import { useState, useEffect, useCallback, useRef } from 'react';
import { getDatabase, StoredConversation } from '../storage/database';

// Timeout for database operations
const DB_OPERATION_TIMEOUT = 5000;

export function useConversations() {
    const [conversations, setConversations] = useState<StoredConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const listenersRef = useRef<Set<(convs: StoredConversation[]) => void>>(new Set());

    const loadConversations = useCallback(async () => {
        try {
            const db = getDatabase();
            // Add timeout to prevent hanging
            const storedConversations = await Promise.race([
                db.getConversations(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getConversations timed out')), DB_OPERATION_TIMEOUT)
                )
            ]);
            setConversations(storedConversations as StoredConversation[]);
            // Notify all listeners
            listenersRef.current.forEach(listener => listener(storedConversations as StoredConversation[]));
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Event-driven updates using IDB onsuccess events
    useEffect(() => {
        let mounted = true;
        let pollInterval: NodeJS.Timeout | null = null;

        const initDB = async () => {
            try {
                const database = getDatabase();
                // Add timeout for init
                await Promise.race([
                    (database as any).init(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('DB init timed out')), DB_OPERATION_TIMEOUT)
                    )
                ]);
                
                if (!mounted) return;

                // Set up IDB change detection
                // Listen for storage events (limited in some browsers)
                window.addEventListener('storage', (e) => {
                    if (e.key === 'sc_conversations_updated') {
                        loadConversations();
                    }
                });
                
                // Initial load
                loadConversations();
            } catch (error) {
                console.error('Failed to initialize DB for conversations:', error);
                if (!mounted) return;
                // Fallback to polling if IDB fails
                pollInterval = setInterval(loadConversations, 10000);
                // Also try one more time immediately in case DB recovered
                setTimeout(() => {
                    if (mounted) loadConversations();
                }, 2000);
            }
        };

        initDB();

        return () => {
            mounted = false;
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [loadConversations]);

    // Subscribe to conversation updates
    const subscribe = useCallback((listener: (convs: StoredConversation[]) => void) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
    }, []);

    return {
        conversations,
        loading,
        refreshConversations: loadConversations,
        subscribe,
    };
}

// Helper function to notify conversations updated (call this when conversations change)
export function notifyConversationsUpdated() {
    localStorage.setItem('sc_conversations_updated', Date.now().toString());
    // Also notify in-memory listeners if available
    setTimeout(() => {
        localStorage.removeItem('sc_conversations_updated');
    }, 100);
}
