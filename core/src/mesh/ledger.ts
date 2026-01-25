/**
 * The Eternal Ledger - Persistent Known Nodes Registry
 *
 * This component maintains a terse history of known mesh nodes that survives
 * identity resets. It is used for:
 * - Routing retries
 * - Security checks (IP spoofing detection)
 * - 'Watering hole' delivery scenarios
 * - Bootstrapping new identities into the existing mesh
 *
 * CRITICAL: This data persists across identity changes and is NOT tied to
 * the identity-scoped database.
 */

import { NodeProfile } from "../relay/NodeProfiler.js";

export interface KnownNode {
  nodeId: string; // 16-char uppercase hex peer ID
  lastKnownIP?: string; // Last known IP address (for watering hole)
  lastSeenTimestamp: number; // When we last saw this node
  publicKey?: string; // Base64 or hex-encoded public key
  firstSeenTimestamp: number; // When we first discovered this node
  gatewayId?: string; // ID of the gateway/relay we reached them through
  connectionCount: number; // How many times we've connected
  lastConnectionSuccess: boolean; // Was the last connection attempt successful
  profile?: NodeProfile; // Dynamic reliability profile (Phase 2)
  natType?: string; // NAT type (Phase 2/5)
}

export interface LedgerStats {
  totalNodes: number;
  activeNodes: number; // Seen in last 24 hours
  staleNodes: number; // Not seen in 7+ days
  oldestNode: number; // Timestamp of oldest node
  newestNode: number; // Timestamp of newest node
}

export interface LedgerPersistenceAdapter {
  saveNode(nodeId: string, node: KnownNode): Promise<void>;
  getNode(nodeId: string): Promise<KnownNode | null>;
  removeNode(nodeId: string): Promise<void>;
  getAllNodes(): Promise<Map<string, KnownNode>>;
  getNodesByGateway(gatewayId: string): Promise<KnownNode[]>;
  pruneOldNodes(maxAge: number): Promise<number>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * Default In-Memory Ledger Persistence (for Node.js/tests)
 */
export class MemoryLedgerAdapter implements LedgerPersistenceAdapter {
  private storage: Map<string, KnownNode> = new Map();

  async saveNode(nodeId: string, node: KnownNode): Promise<void> {
    this.storage.set(nodeId.toUpperCase(), node);
  }

  async getNode(nodeId: string): Promise<KnownNode | null> {
    return this.storage.get(nodeId.toUpperCase()) || null;
  }

  async removeNode(nodeId: string): Promise<void> {
    this.storage.delete(nodeId.toUpperCase());
  }

  async getAllNodes(): Promise<Map<string, KnownNode>> {
    return new Map(this.storage);
  }

  async getNodesByGateway(gatewayId: string): Promise<KnownNode[]> {
    const nodes: KnownNode[] = [];
    for (const node of this.storage.values()) {
      if (node.gatewayId === gatewayId) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  async pruneOldNodes(maxAge: number): Promise<number> {
    const cutoff = Date.now() - maxAge;
    let pruned = 0;
    for (const [id, node] of this.storage.entries()) {
      if (node.lastSeenTimestamp < cutoff) {
        this.storage.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  async size(): Promise<number> {
    return this.storage.size;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

/**
 * IndexedDB Ledger Persistence (for browser)
 * Uses a separate database from identity-scoped storage
 */
export class IndexedDBLedgerAdapter implements LedgerPersistenceAdapter {
  private static readonly DB_NAME = "sc-eternal-ledger";
  private static readonly STORE_NAME = "knownNodes";
  private static readonly VERSION = 1;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(
        IndexedDBLedgerAdapter.DB_NAME,
        IndexedDBLedgerAdapter.VERSION,
      );

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error || new Error("Failed to open ledger database"));
      };

      request.onsuccess = () => {
        this.db = request.result;

        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(IndexedDBLedgerAdapter.STORE_NAME)) {
          const store = db.createObjectStore(
            IndexedDBLedgerAdapter.STORE_NAME,
            { keyPath: "nodeId" },
          );
          store.createIndex("lastSeenTimestamp", "lastSeenTimestamp");
          store.createIndex("gatewayId", "gatewayId");
          store.createIndex("firstSeenTimestamp", "firstSeenTimestamp");
        }
      };
    });

    return this.initPromise;
  }

  async saveNode(nodeId: string, node: KnownNode): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);

      // Ensure nodeId is normalized
      const normalizedNode = { ...node, nodeId: nodeId.toUpperCase() };
      const request = store.put(normalizedNode);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getNode(nodeId: string): Promise<KnownNode | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readonly",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);
      const request = store.get(nodeId.toUpperCase());

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async removeNode(nodeId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);
      const request = store.delete(nodeId.toUpperCase());

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllNodes(): Promise<Map<string, KnownNode>> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readonly",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const nodes = new Map<string, KnownNode>();
        for (const node of request.result) {
          nodes.set(node.nodeId, node);
        }
        resolve(nodes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getNodesByGateway(gatewayId: string): Promise<KnownNode[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readonly",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);
      const index = store.index("gatewayId");
      const request = index.getAll(gatewayId);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async pruneOldNodes(maxAge: number): Promise<number> {
    if (!this.db) await this.init();

    const cutoff = Date.now() - maxAge;
    const allNodes = await this.getAllNodes();
    let pruned = 0;

    for (const [nodeId, node] of allNodes) {
      if (node.lastSeenTimestamp < cutoff) {
        await this.removeNode(nodeId);
        pruned++;
      }
    }

    return pruned;
  }

  async size(): Promise<number> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readonly",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [IndexedDBLedgerAdapter.STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(IndexedDBLedgerAdapter.STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initPromise = null;
  }
}

/**
 * The Eternal Ledger
 *
 * Main class for managing known mesh nodes that persist across identity changes.
 */
export class EternalLedger {
  private persistence: LedgerPersistenceAdapter;
  private static readonly MAX_NODES = 10000; // Prevent unbounded growth
  private static readonly MAX_NODE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
  private static readonly ACTIVE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
  private pruneInterval?: NodeJS.Timeout;

  constructor(persistence?: LedgerPersistenceAdapter) {
    // Use IndexedDB in browser, memory in Node.js
    if (!persistence && typeof indexedDB !== "undefined") {
      this.persistence = new IndexedDBLedgerAdapter();
    } else {
      this.persistence = persistence || new MemoryLedgerAdapter();
    }
  }

  /**
   * Record a node sighting (connection or discovery)
   */
  async recordNodeSighting(
    nodeId: string,
    options: {
      publicKey?: string;
      ipAddress?: string;
      gatewayId?: string;
      connectionSuccessful?: boolean;
      profile?: NodeProfile;
      natType?: string;
    } = {},
  ): Promise<void> {
    const normalizedId = nodeId.replace(/\s/g, "").toUpperCase();
    const now = Date.now();

    // Get existing node or create new one
    let node = await this.persistence.getNode(normalizedId);

    if (node) {
      // Update existing node
      node.lastSeenTimestamp = now;
      node.connectionCount++;

      if (options.publicKey) {
        node.publicKey = options.publicKey;
      }
      if (options.ipAddress) {
        node.lastKnownIP = options.ipAddress;
      }
      if (options.gatewayId) {
        node.gatewayId = options.gatewayId;
      }
      if (options.connectionSuccessful !== undefined) {
        node.lastConnectionSuccess = options.connectionSuccessful;
      }
      if (options.profile) {
        node.profile = options.profile;
      }
      if (options.natType) {
        node.natType = options.natType;
      }
    } else {
      // Create new node entry
      node = {
        nodeId: normalizedId,
        lastKnownIP: options.ipAddress,
        lastSeenTimestamp: now,
        publicKey: options.publicKey,
        firstSeenTimestamp: now,
        gatewayId: options.gatewayId,
        connectionCount: 1,
        lastConnectionSuccess: options.connectionSuccessful ?? false,
        profile: options.profile,
        natType: options.natType,
      };
    }

    // Enforce size limit
    const currentSize = await this.persistence.size();
    if (currentSize >= EternalLedger.MAX_NODES) {
      await this.pruneOldestNodes(100); // Remove oldest 100 nodes
    }

    await this.persistence.saveNode(normalizedId, node as KnownNode);

    console.log(
      `[EternalLedger] Recorded node sighting: ${normalizedId.substring(0, 8)}... (total: ${currentSize + 1})`,
    );
  }

  /**
   * Get a known node by ID
   */
  async getNode(nodeId: string): Promise<KnownNode | null> {
    return this.persistence.getNode(nodeId.replace(/\s/g, "").toUpperCase());
  }

  /**
   * Get all known nodes
   */
  async getAllNodes(): Promise<Map<string, KnownNode>> {
    return this.persistence.getAllNodes();
  }

  /**
   * Get nodes that were seen through a specific gateway
   * Used for 'watering hole' delivery - if target went through same gateway
   */
  async getNodesByGateway(gatewayId: string): Promise<KnownNode[]> {
    return this.persistence.getNodesByGateway(gatewayId);
  }

  /**
   * Get recently active nodes (for Light Ping bootstrap)
   */
  async getRecentlyActiveNodes(
    maxAge: number = EternalLedger.ACTIVE_THRESHOLD,
  ): Promise<KnownNode[]> {
    const cutoff = Date.now() - maxAge;
    const allNodes = await this.persistence.getAllNodes();
    const activeNodes: KnownNode[] = [];

    for (const node of allNodes.values()) {
      if (node.lastSeenTimestamp >= cutoff) {
        activeNodes.push(node);
      }
    }

    // Sort by last seen (most recent first)
    activeNodes.sort((a, b) => b.lastSeenTimestamp - a.lastSeenTimestamp);

    return activeNodes;
  }

  /**
   * Get nodes sorted by connection success rate
   * Useful for prioritizing reliable peers
   */
  async getReliableNodes(limit: number = 50): Promise<KnownNode[]> {
    const allNodes = await this.persistence.getAllNodes();
    const nodes = Array.from(allNodes.values());

    // Sort by successful connections and recency
    nodes.sort((a, b) => {
      // Prioritize nodes with successful recent connections
      const aScore =
        (a.lastConnectionSuccess ? 1 : 0) * a.connectionCount +
        a.lastSeenTimestamp / 1000000000; // Add recency bonus
      const bScore =
        (b.lastConnectionSuccess ? 1 : 0) * b.connectionCount +
        b.lastSeenTimestamp / 1000000000;
      return bScore - aScore;
    });

    return nodes.slice(0, limit);
  }

  /**
   * Check if a node is known (for security validation)
   */
  async isKnownNode(nodeId: string): Promise<boolean> {
    const node = await this.persistence.getNode(nodeId);
    return node !== null;
  }

  /**
   * Validate node identity (check public key matches)
   * Returns true if the node is new or the public key matches
   * Returns false if there's a mismatch (potential spoofing)
   */
  async validateNodeIdentity(
    nodeId: string,
    publicKey: string,
  ): Promise<boolean> {
    const node = await this.persistence.getNode(nodeId);

    if (!node) {
      return true; // New node, valid
    }

    if (!node.publicKey) {
      return true; // No stored key, valid
    }

    // Compare public keys
    return node.publicKey === publicKey;
  }

  /**
   * Get ledger statistics
   */
  async getStats(): Promise<LedgerStats> {
    const allNodes = await this.persistence.getAllNodes();
    const now = Date.now();

    let activeNodes = 0;
    let staleNodes = 0;
    let oldestNode = now;
    let newestNode = 0;

    for (const node of allNodes.values()) {
      const age = now - node.lastSeenTimestamp;

      if (age < EternalLedger.ACTIVE_THRESHOLD) {
        activeNodes++;
      }

      if (age > EternalLedger.STALE_THRESHOLD) {
        staleNodes++;
      }

      if (node.firstSeenTimestamp < oldestNode) {
        oldestNode = node.firstSeenTimestamp;
      }

      if (node.lastSeenTimestamp > newestNode) {
        newestNode = node.lastSeenTimestamp;
      }
    }

    return {
      totalNodes: allNodes.size,
      activeNodes,
      staleNodes,
      oldestNode: oldestNode === now ? 0 : oldestNode,
      newestNode,
    };
  }

  /**
   * Prune nodes older than MAX_NODE_AGE
   */
  async pruneExpiredNodes(): Promise<number> {
    return this.persistence.pruneOldNodes(EternalLedger.MAX_NODE_AGE);
  }

  /**
   * Prune oldest nodes when approaching size limit
   */
  private async pruneOldestNodes(count: number): Promise<void> {
    const allNodes = await this.persistence.getAllNodes();
    const sortedNodes = Array.from(allNodes.entries()).sort(
      (a, b) => a[1].lastSeenTimestamp - b[1].lastSeenTimestamp,
    );

    for (let i = 0; i < Math.min(count, sortedNodes.length); i++) {
      await this.persistence.removeNode(sortedNodes[i][0]);
    }

    console.log(`[EternalLedger] Pruned ${count} oldest nodes`);
  }

  /**
   * Start automatic pruning
   */
  startAutoPrune(intervalMs: number = 60 * 60 * 1000): void {
    // Default: 1 hour
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
    }

    this.pruneInterval = setInterval(async () => {
      const pruned = await this.pruneExpiredNodes();
      if (pruned > 0) {
        console.log(`[EternalLedger] Auto-pruned ${pruned} expired nodes`);
      }
    }, intervalMs);

    // Allow Node.js to exit
    if (this.pruneInterval && typeof this.pruneInterval.unref === "function") {
      this.pruneInterval.unref();
    }
  }

  /**
   * Stop automatic pruning
   */
  stopAutoPrune(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = undefined;
    }
  }

  /**
   * Clear all data (USE WITH CAUTION - this is permanent)
   * Note: This is NOT called on identity reset - the ledger persists!
   */
  async clearAll(): Promise<void> {
    await this.persistence.clear();
    console.log("[EternalLedger] All data cleared");
  }
}
