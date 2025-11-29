/**
 * Mesh Directory (The "Phone Book")
 * Stores signaling information for peers in the mesh.
 * This is replicated/gossiped across nodes.
 */

export interface PeerEntry {
    id: string; // Peer ID
    publicKey?: string; // Base64 encoded public key
    signalingRoutes: string[]; // List of signaling URLs (e.g., "wss://relay.example.com")
    lastSeen: number;
    agent?: string; // User agent / version
}

export class Directory {
    private peers: Map<string, PeerEntry> = new Map();
    private listeners: ((entry: PeerEntry) => void)[] = [];

    constructor(initialEntries: PeerEntry[] = []) {
        initialEntries.forEach(e => this.addPeer(e));
    }

    /**
     * Add or update a peer entry
     */
    addPeer(entry: PeerEntry): boolean {
        const existing = this.peers.get(entry.id);

        // If we already have this peer and the new entry is older, ignore
        if (existing && existing.lastSeen > entry.lastSeen) {
            return false;
        }

        // Merge routes if existing
        let routes = entry.signalingRoutes || [];
        if (existing) {
            const existingRoutes = new Set(existing.signalingRoutes);
            routes.forEach(r => existingRoutes.add(r));
            routes = Array.from(existingRoutes);
        }

        const newEntry: PeerEntry = {
            ...entry,
            signalingRoutes: routes,
            lastSeen: Math.max(entry.lastSeen, existing?.lastSeen || 0)
        };

        this.peers.set(entry.id, newEntry);
        this.notifyListeners(newEntry);
        return true;
    }

    /**
     * Get a peer entry
     */
    getPeer(id: string): PeerEntry | undefined {
        return this.peers.get(id);
    }

    /**
     * Get all entries
     */
    getAll(): PeerEntry[] {
        return Array.from(this.peers.values());
    }

    /**
     * Merge another directory or list of entries
     */
    merge(entries: PeerEntry[]): void {
        entries.forEach(e => this.addPeer(e));
    }

    /**
     * Remove old entries
     */
    prune(maxAgeMs: number): void {
        const now = Date.now();
        for (const [id, entry] of this.peers.entries()) {
            if (now - entry.lastSeen > maxAgeMs) {
                this.peers.delete(id);
            }
        }
    }

    /**
     * Subscribe to updates
     */
    onUpdate(callback: (entry: PeerEntry) => void): void {
        this.listeners.push(callback);
    }

    private notifyListeners(entry: PeerEntry): void {
        this.listeners.forEach(l => l(entry));
    }

    /**
     * Export for serialization
     */
    toJSON(): PeerEntry[] {
        return this.getAll();
    }
}
