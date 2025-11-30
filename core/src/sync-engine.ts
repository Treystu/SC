import { MeshNetwork } from "./mesh/network.js";
import { Message, MessageType } from "./protocol/message.js";

// Synchronization engine for offline-first data sync across devices
export interface SyncItem {
  id: string;
  type: "message" | "contact" | "setting" | "file";
  timestamp: number;
  data: any;
  deviceId: string;
  version: number;
}

export interface SyncConflict {
  localItem: SyncItem;
  remoteItem: SyncItem;
  resolution: "local" | "remote" | "merge" | "manual";
}

export class SyncEngine {
  private pendingSync: Map<string, SyncItem> = new Map();
  private lastSyncTimestamp: number = 0;
  private syncInProgress: boolean = false;
  private syncResponses: Map<string, (items: SyncItem[]) => void> = new Map();

  constructor(
    private deviceId: string,
    private network: MeshNetwork,
    private onConflict: (
      conflict: SyncConflict,
    ) => Promise<"local" | "remote" | "merge">,
  ) {
    this.setupNetworkHandlers();
  }

  private setupNetworkHandlers() {
    this.network.onMessage((message: Message) => {
      try {
        if (message.header.type !== MessageType.TEXT) return;

        const payload = new TextDecoder().decode(message.payload);
        const data = JSON.parse(payload);

        if (data.type === "SYNC_REQUEST") {
          this.handleSyncRequest(message.header.senderId, data);
        } else if (data.type === "SYNC_RESPONSE") {
          this.handleSyncResponse(data);
        }
      } catch (error) {
        // Ignore non-JSON or unrelated messages
      }
    });
  }

  private async handleSyncRequest(senderPublicKey: Uint8Array, data: any) {
    const senderId = Array.from(senderPublicKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const since = data.since || 0;

    // Get local changes since 'since'
    // In a real implementation, we would query the database
    const changes = Array.from(this.pendingSync.values()).filter(
      (item) => item.timestamp > since,
    );

    // Send response
    await this.network.sendMessage(
      senderId,
      JSON.stringify({
        type: "SYNC_RESPONSE",
        requestId: data.requestId,
        changes,
      }),
    );
  }

  private handleSyncResponse(data: any) {
    const resolver = this.syncResponses.get(data.requestId);
    if (resolver) {
      resolver(data.changes || []);
      this.syncResponses.delete(data.requestId);
    }
  }

  // Add item to sync queue
  async queueForSync(
    item: Omit<SyncItem, "deviceId" | "version">,
  ): Promise<void> {
    const syncItem: SyncItem = {
      ...item,
      deviceId: this.deviceId,
      version: Date.now(),
    };

    this.pendingSync.set(item.id, syncItem);

    // Persist to IndexedDB
    await this.persistSyncQueue();
  }

  // Sync with remote peers
  async sync(
    peerIds: string[],
  ): Promise<{ synced: number; conflicts: number }> {
    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }

    this.syncInProgress = true;
    let synced = 0;
    let conflicts = 0;

    try {
      // Get changes since last sync
      const localChanges = Array.from(this.pendingSync.values());

      for (const peerId of peerIds) {
        // Request remote changes
        const remoteChanges = await this.fetchRemoteChanges(
          peerId,
          this.lastSyncTimestamp,
        );

        // Detect conflicts
        const conflictMap = this.detectConflicts(localChanges, remoteChanges);

        // Resolve conflicts
        for (const [_id, conflict] of conflictMap) {
          const resolution = await this.onConflict(conflict);
          await this.applyResolution(conflict, resolution);
          conflicts++;
        }

        // Apply non-conflicting remote changes
        const nonConflicting = remoteChanges.filter(
          (r) => !conflictMap.has(r.id),
        );
        for (const change of nonConflicting) {
          await this.applyRemoteChange(change);
          synced++;
        }

        // Send local changes to peer
        await this.sendChangesToPeer(peerId, localChanges);
      }

      // Clear synced items
      this.pendingSync.clear();
      this.lastSyncTimestamp = Date.now();
      await this.persistSyncQueue();

      return { synced, conflicts };
    } finally {
      this.syncInProgress = false;
    }
  }

  // Detect conflicts between local and remote changes
  private detectConflicts(
    local: SyncItem[],
    remote: SyncItem[],
  ): Map<string, SyncConflict> {
    const conflicts = new Map<string, SyncConflict>();
    const remoteMap = new Map(remote.map((r) => [r.id, r]));

    for (const localItem of local) {
      const remoteItem = remoteMap.get(localItem.id);
      if (remoteItem && remoteItem.version !== localItem.version) {
        // Conflict detected - same item modified on both sides
        conflicts.set(localItem.id, {
          localItem,
          remoteItem,
          resolution: "manual",
        });
      }
    }

    return conflicts;
  }

  // Apply conflict resolution
  private async applyResolution(
    conflict: SyncConflict,
    resolution: "local" | "remote" | "merge",
  ): Promise<void> {
    if (resolution === "local") {
      // Keep local version
      return;
    } else if (resolution === "remote") {
      // Apply remote version
      await this.applyRemoteChange(conflict.remoteItem);
      this.pendingSync.delete(conflict.localItem.id);
    } else if (resolution === "merge") {
      // Merge both versions (simple strategy: newer timestamp wins for each field)
      const merged = this.mergeItems(conflict.localItem, conflict.remoteItem);
      await this.applyRemoteChange(merged);
      this.pendingSync.set(merged.id, merged);
    }
  }

  // Simple merge strategy
  private mergeItems(local: SyncItem, remote: SyncItem): SyncItem {
    return {
      id: local.id,
      type: local.type,
      timestamp: Math.max(local.timestamp, remote.timestamp),
      data: { ...remote.data, ...local.data },
      deviceId: this.deviceId,
      version: Date.now(),
    };
  }

  // Fetch changes from remote peer
  private async fetchRemoteChanges(
    peerId: string,
    since: number,
  ): Promise<SyncItem[]> {
    const requestId = Math.random().toString(36).substring(7);

    return new Promise((resolve, _reject) => {
      const timeout = setTimeout(() => {
        this.syncResponses.delete(requestId);
        resolve([]); // Return empty on timeout to avoid blocking
      }, 5000);

      this.syncResponses.set(requestId, (items) => {
        clearTimeout(timeout);
        resolve(items);
      });

      this.network
        .sendMessage(
          peerId,
          JSON.stringify({
            type: "SYNC_REQUEST",
            requestId,
            since,
          }),
        )
        .catch((err) => {
          clearTimeout(timeout);
          this.syncResponses.delete(requestId);
          console.error("Failed to send sync request:", err);
          resolve([]);
        });
    });
  }

  // Send changes to peer
  private async sendChangesToPeer(
    peerId: string,
    changes: SyncItem[],
  ): Promise<void> {
    if (changes.length === 0) return;

    // In a real implementation, we might want to batch these or use a different message type
    // For now, we reuse the SYNC_RESPONSE format or just send a direct update
    // But since this is "pushing" changes, we can just send them as a SYNC_PUSH or similar

    await this.network.sendMessage(
      peerId,
      JSON.stringify({
        type: "SYNC_PUSH",
        changes,
      }),
    );
  }

  // Apply remote change locally
  private async applyRemoteChange(item: SyncItem): Promise<void> {
    // Apply to local database based on item type
    switch (item.type) {
      case "message":
        // Save message to local DB
        break;
      case "contact":
        // Save contact to local DB
        break;
      case "setting":
        // Apply setting
        break;
      case "file":
        // Save file metadata
        break;
    }
  }

  // Persist sync queue to IndexedDB
  private async persistSyncQueue(): Promise<void> {
    // Save pending items to IndexedDB
  }

  // Get sync status
  getSyncStatus(): {
    pending: number;
    lastSync: Date | null;
    inProgress: boolean;
  } {
    return {
      pending: this.pendingSync.size,
      lastSync: this.lastSyncTimestamp
        ? new Date(this.lastSyncTimestamp)
        : null,
      inProgress: this.syncInProgress,
    };
  }
}
