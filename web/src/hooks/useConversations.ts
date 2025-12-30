import { useState, useEffect, useCallback, useRef } from 'react';
import { getDatabase, StoredConversation } from '../storage/database';

// Timeout for database operations
const DB_OPERATION_TIMEOUT = 5000;

// Global event emitter for conversation updates (cross-tab and component communication)
const conversationUpdateListeners = new Set<(convs: StoredConversation[]) => void>();

export function useConversations() {
    const [conversations, setConversations] = useState<StoredConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const listenersRef = useRef<Set<(convs: StoredConversation[]) => void>>(new Set());
    const mountedRef = useRef(true);

    const loadConversations = useCallback(async () => {
        if (!mountedRef.current) return;
        
        try {
            const db = getDatabase();
            // Add timeout to prevent hanging
            const storedConversations = await Promise.race([
                db.getConversations(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('getConversations timed out')), DB_OPERATION_TIMEOUT)
                )
            ]);
            
            if (!mountedRef.current) return;
            
            setConversations(storedConversations as StoredConversation[]);
            // Notify all listeners (both local and global)
            const allListeners = new Set([...listenersRef.current, ...conversationUpdateListeners]);
            allListeners.forEach(listener => {
                try {
                    listener(storedConversations as StoredConversation[]);
                } catch (error) {
                    console.error('Error in conversation listener:', error);
                }
            });
        } catch (error) {
            if (mountedRef.current) {
                console.error('Failed to load conversations:', error);
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    // Event-driven updates using IDB onsuccess events
    useEffect(() => {
        let mounted = true;
        let pollInterval: NodeJS.Timeout | null = null;
        mountedRef.current = true;

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

                // Set up IDB change detection via storage events
                const handleStorageEvent = (e: StorageEvent) => {
                    if (e.key === 'sc_conversations_updated') {
                        loadConversations();
                    }
                };
                
                // Also use custom event for same-tab updates
                const handleCustomEvent = () => {
                    loadConversations();
                };

                window.addEventListener('storage', handleStorageEvent);
                window.addEventListener('sc_conversations_updated', handleCustomEvent);
                
                // Initial load
                loadConversations();
            } catch (error) {
                console.error('Failed to initialize DB for conversations:', error);
                if (!mounted) return;
                // Fallback to polling if IDB fails
                pollInterval = setInterval(loadConversations, 5000);
                // Also try one more time immediately in case DB recovered
                setTimeout(() => {
                    if (mounted) loadConversations();
                }, 2000);
            }
        };

        initDB();

        return () => {
            mounted = false;
            mountedRef.current = false;
            if (pollInterval) clearInterval(pollInterval);
            window.removeEventListener('sc_conversations_updated', loadConversations);
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
    // Notify same-tab listeners immediately
    const db = getDatabase();
    db.getConversations().then((convs) => {
        conversationUpdateListeners.forEach(listener => {
            try {
                listener(convs);
            } catch (error) {
                console.error('Error in global conversation listener:', error);
            }
        });
    }).catch(console.error);
    
    // Set storage event for cross-tab communication
    localStorage.setItem('sc_conversations_updated', Date.now().toString());
    setTimeout(() => {
        localStorage.removeItem('sc_conversations_updated');
    }, 100);
}

// Global subscription for components to receive updates
export function subscribeToConversations(listener: (convs: StoredConversation[]) => void): () => void {
    conversationUpdateListeners.add(listener);
    return () => conversationUpdateListeners.delete(listener);
}
