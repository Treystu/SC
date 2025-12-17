/**
 * Kademlia DHT Implementation
 *
 * Core distributed hash table with XOR-based routing,
 * k-bucket organization, and iterative lookup algorithms.
 */

import type {
  NodeId,
  DHTKey,
  DHTValue,
  DHTContact,
  DHTStats,
  KademliaConfig,
  NodeLookupResult,
  ValueLookupResult,
  DHTRPCMessage,
  DHTMessageType,
  FindNodeRequest,
  FindNodeResponse,
  FindValueRequest,
  FindValueResponse,
  FindValueNodesResponse,
  StoreRequest,
  StoreResponse,
  PingRequest,
  PongResponse,
} from "./types.js";
import { DEFAULT_KADEMLIA_CONFIG } from "./types.js";
import { KBucketManager } from "./bucket.js";
import {
  getBucketIndex,
  sortByDistance,
  getClosestContacts,
  nodeIdsEqual,
  nodeIdToHex,
  copyNodeId,
  generateIdInBucket,
  NODE_ID_BITS,
  xorDistance,
  isCloser,
} from "./node-id.js";

/**
 * Pending RPC request tracking
 */
interface PendingRequest {
  resolve: (response: DHTRPCMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  sentAt: number;
}

/**
 * Kademlia DHT Routing Table
 *
 * Provides XOR-based routing, value storage, and lookup operations.
 */
export class KademliaRoutingTable {
  /** Local node ID */
  readonly localNodeId: NodeId;

  /** K-bucket manager */
  private bucketManager: KBucketManager;

  /** Local value storage */
  private valueStore: Map<string, DHTValue> = new Map();

  /** Pending RPC requests */
  private pendingRequests: Map<string, PendingRequest> = new Map();

  /** Message ID counter */
  private messageIdCounter = 0;

  /** Configuration */
  private config: KademliaConfig;

  /** Statistics */
  private stats = {
    totalLookups: 0,
    successfulLookups: 0,
    totalLookupTime: 0,
  };

  /** Callback for sending RPC messages */
  private sendRpc?: (
    contact: DHTContact,
    message: DHTRPCMessage,
  ) => Promise<void>;

  /** Refresh interval handle */
  private refreshIntervalHandle?: ReturnType<typeof setInterval>;

  /** Republish interval handle */
  private republishIntervalHandle?: ReturnType<typeof setInterval>;

  /** Number of currently active findNode lookups */
  private activeLookups = 0;

  constructor(
    localNodeId: NodeId,
    config?: Partial<Omit<KademliaConfig, "localNodeId">>,
  ) {
    this.localNodeId = copyNodeId(localNodeId);
    this.config = {
      ...DEFAULT_KADEMLIA_CONFIG,
      ...config,
      localNodeId: this.localNodeId,
    };

    this.bucketManager = new KBucketManager(localNodeId, {
      k: this.config.k,
      pingTimeout: this.config.pingTimeout,
      alpha: this.config.alpha,
    });
  }

  /**
   * Set the RPC send callback
   */
  setRpcSender(
    sender: (contact: DHTContact, message: DHTRPCMessage) => Promise<void>,
  ): void {
    this.sendRpc = sender;
  }

  /**
   * Start periodic maintenance tasks
   */
  start(): void {
    // Start bucket refresh
    this.refreshIntervalHandle = setInterval(
      () => this.refreshBuckets(),
      this.config.refreshInterval,
    );

    // Start value republishing
    this.republishIntervalHandle = setInterval(
      () => this.republishValues(),
      this.config.republishInterval,
    );
  }

  /**
   * Stop periodic maintenance tasks
   */
  stop(): void {
    if (this.refreshIntervalHandle) {
      clearInterval(this.refreshIntervalHandle);
      this.refreshIntervalHandle = undefined;
    }
    if (this.republishIntervalHandle) {
      clearInterval(this.republishIntervalHandle);
      this.republishIntervalHandle = undefined;
    }

    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("DHT shutting down"));
    }
    this.pendingRequests.clear();
  }

  /**
   * Add or update a contact in the routing table
   */
  addContact(contact: DHTContact): { added: boolean; needsPing?: DHTContact } {
    // Don't add ourselves
    if (nodeIdsEqual(contact.nodeId, this.localNodeId)) {
      return { added: false };
    }

    const bucketIndex = getBucketIndex(this.localNodeId, contact.nodeId);
    if (bucketIndex < 0) {
      return { added: false };
    }

    const bucket = this.bucketManager.getBucket(bucketIndex);
    if (!bucket) {
      return { added: false };
    }

    const result = bucket.addContact(contact);
    return {
      added: result.added || result.updated,
      needsPing: result.needsPing,
    };
  }

  /**
   * Remove a contact from the routing table
   */
  removeContact(nodeId: NodeId): boolean {
    const bucketIndex = getBucketIndex(this.localNodeId, nodeId);
    if (bucketIndex < 0) return false;

    const bucket = this.bucketManager.getBucket(bucketIndex);
    return bucket?.removeContact(nodeId) !== undefined;
  }

  /**
   * Get a contact by node ID
   */
  getContact(nodeId: NodeId): DHTContact | undefined {
    const bucketIndex = getBucketIndex(this.localNodeId, nodeId);
    if (bucketIndex < 0) return undefined;

    const bucket = this.bucketManager.getBucket(bucketIndex);
    return bucket?.getContact(nodeId);
  }

  /**
   * Check if a bucket is empty
   */
  isBucketEmpty(bucketIndex: number): boolean {
    const bucket = this.bucketManager.getBucket(bucketIndex);
    return !bucket || bucket.size === 0;
  }

  /**
   * Get all contacts in the routing table
   */
  getAllContacts(): DHTContact[] {
    return this.bucketManager.getAllContacts();
  }

  /**
   * Get the k closest contacts to a target
   */
  getClosestContacts(targetId: NodeId, count?: number): DHTContact[] {
    const k = count ?? this.config.k;
    const allContacts = this.bucketManager.getAllContacts();
    return getClosestContacts(allContacts, targetId, k);
  }

  /**
   * Find the k closest nodes to a target (iterative lookup)
   * Enforces maxConcurrentLookups from config.
   */
  async findNode(targetId: NodeId): Promise<NodeLookupResult> {
    if (this.activeLookups >= this.config.maxConcurrentLookups) {
      throw new Error("Max concurrent lookups exceeded");
    }
    this.activeLookups++;
    const startTime = Date.now();
    this.stats.totalLookups++;

    try {
      // Start with k closest nodes from local routing table
      let closestNodes = this.getClosestContacts(targetId, this.config.k);
      const queried = new Set<string>();
      let queriesMade = 0;
      let hasMoreToQuery = true;

      // Iterative lookup
      while (hasMoreToQuery) {
        // Find alpha unqueried nodes closest to target
        const toQuery = closestNodes
          .filter((node) => !queried.has(nodeIdToHex(node.nodeId)))
          .slice(0, this.config.alpha);

        if (toQuery.length === 0) {
          hasMoreToQuery = false;
          continue;
        }

        // Query nodes in parallel
        const responses = await Promise.allSettled(
          toQuery.map(async (node) => {
            queried.add(nodeIdToHex(node.nodeId));
            queriesMade++;
            return this.sendFindNode(node, targetId);
          }),
        );

        // Process responses
        let improved = false;
        for (const response of responses) {
          if (response.status === "fulfilled" && response.value) {
            const newNodes = response.value;
            for (const newNode of newNodes) {
              // Add to routing table
              this.addContact(newNode);

              // Check if this improves our closest set
              if (
                !closestNodes.some((n) =>
                  nodeIdsEqual(n.nodeId, newNode.nodeId),
                )
              ) {
                closestNodes.push(newNode);
                improved = true;
              }
            }
          }
        }

        // Re-sort and trim
        closestNodes = sortByDistance(closestNodes, targetId).slice(
          0,
          this.config.k,
        );

        // Stop if we're not making progress
        if (!improved) {
          hasMoreToQuery = false;
        }
      }

      const duration = Date.now() - startTime;
      const found = closestNodes.some((n) => nodeIdsEqual(n.nodeId, targetId));

      if (found) {
        this.stats.successfulLookups++;
      }
      this.stats.totalLookupTime += duration;

      return {
        closestNodes,
        queriesMade,
        duration,
        found,
      };
    } finally {
      this.activeLookups--;
    }
  }

  /**
   * Find a value in the DHT (iterative lookup)
   */
  async findValue(key: DHTKey): Promise<ValueLookupResult> {
    const startTime = Date.now();
    this.stats.totalLookups++;

    // Check local store first
    const keyHex = nodeIdToHex(key);
    const localValue = this.valueStore.get(keyHex);
    if (localValue) {
      this.stats.successfulLookups++;
      return {
        value: localValue,
        queriedNodes: [],
        closestNodes: [],
        duration: Date.now() - startTime,
        found: true,
      };
    }

    // Start with k closest nodes
    let closestNodes = this.getClosestContacts(key, this.config.k);
    const queriedNodes: DHTContact[] = [];
    const queried = new Set<string>();
    let hasMoreToQuery = true;

    // Iterative lookup
    while (hasMoreToQuery) {
      const toQuery = closestNodes
        .filter((node) => !queried.has(nodeIdToHex(node.nodeId)))
        .slice(0, this.config.alpha);

      if (toQuery.length === 0) {
        hasMoreToQuery = false;
        continue;
      }

      const responses = await Promise.allSettled(
        toQuery.map(async (node) => {
          queried.add(nodeIdToHex(node.nodeId));
          queriedNodes.push(node);
          return this.sendFindValue(node, key);
        }),
      );

      let improved = false;
      for (const response of responses) {
        if (response.status === "fulfilled") {
          const result = response.value;
          if (result.value) {
            // Found the value!
            this.stats.successfulLookups++;
            const duration = Date.now() - startTime;
            this.stats.totalLookupTime += duration;

            return {
              value: result.value,
              queriedNodes,
              closestNodes,
              duration,
              found: true,
            };
          } else if (result.nodes) {
            // Got closer nodes
            for (const newNode of result.nodes) {
              this.addContact(newNode);
              if (
                !closestNodes.some((n) =>
                  nodeIdsEqual(n.nodeId, newNode.nodeId),
                )
              ) {
                closestNodes.push(newNode);
                improved = true;
              }
            }
          }
        }
      }

      closestNodes = sortByDistance(closestNodes, key).slice(0, this.config.k);
      if (!improved) {
        hasMoreToQuery = false;
      }
    }

    const duration = Date.now() - startTime;
    this.stats.totalLookupTime += duration;

    return {
      queriedNodes,
      closestNodes,
      duration,
      found: false,
    };
  }

  /**
   * Store a value in the DHT
   */
  async store(key: DHTKey, value: DHTValue): Promise<number> {
    // Find k closest nodes to the key
    const result = await this.findNode(key);

    // Store at each of the closest nodes
    let stored = 0;
    const storePromises = result.closestNodes.map(async (node) => {
      try {
        const success = await this.sendStore(node, key, value);
        if (success) stored++;
      } catch {
        // Ignore failures
      }
    });

    await Promise.allSettled(storePromises);

    // Check if we should store locally (if we're among k closest nodes to the key)
    // Since findNode excludes the local node, we need to check our distance separately
    const localDistance = xorDistance(this.localNodeId, key);
    let shouldStoreLocally = false;

    if (result.closestNodes.length < this.config.k) {
      // Not enough nodes, we should store locally
      shouldStoreLocally = true;
    } else {
      // Check if we're closer than the furthest of the k closest
      const furthestNode = result.closestNodes[result.closestNodes.length - 1];
      const furthestDistance = xorDistance(furthestNode.nodeId, key);
      shouldStoreLocally = isCloser(localDistance, furthestDistance);
    }

    if (shouldStoreLocally) {
      const keyHex = nodeIdToHex(key);
      this.valueStore.set(keyHex, value);
      stored++;
    }

    return stored;
  }

  /**
   * Store a value locally (for incoming STORE requests)
   */
  storeLocal(key: DHTKey, value: DHTValue): void {
    const keyHex = nodeIdToHex(key);
    this.valueStore.set(keyHex, value);
  }

  /**
   * Get a value from local storage
   */
  getLocal(key: DHTKey): DHTValue | undefined {
    const keyHex = nodeIdToHex(key);
    return this.valueStore.get(keyHex);
  }

  /**
   * Handle incoming FIND_NODE request
   */
  handleFindNode(request: FindNodeRequest): FindNodeResponse {
    const closestNodes = this.getClosestContacts(
      request.targetId,
      this.config.k,
    );

    // Update sender's contact info
    this.addContact({
      nodeId: request.senderId,
      peerId: nodeIdToHex(request.senderId),
      lastSeen: Date.now(),
      failureCount: 0,
    });

    return {
      type: "FIND_NODE_RESPONSE" as DHTMessageType.FIND_NODE_RESPONSE,
      senderId: this.localNodeId,
      messageId: request.messageId,
      timestamp: Date.now(),
      nodes: closestNodes,
    };
  }

  /**
   * Handle incoming FIND_VALUE request
   */
  handleFindValue(
    request: FindValueRequest,
  ): FindValueResponse | FindValueNodesResponse {
    // Update sender's contact info
    this.addContact({
      nodeId: request.senderId,
      peerId: nodeIdToHex(request.senderId),
      lastSeen: Date.now(),
      failureCount: 0,
    });

    const keyHex = nodeIdToHex(request.key);
    const value = this.valueStore.get(keyHex);

    if (value) {
      return {
        type: "FIND_VALUE_RESPONSE" as DHTMessageType.FIND_VALUE_RESPONSE,
        senderId: this.localNodeId,
        messageId: request.messageId,
        timestamp: Date.now(),
        value,
      };
    }

    // Value not found, return closest nodes
    const closestNodes = this.getClosestContacts(request.key, this.config.k);
    return {
      type: "FIND_VALUE_NODES" as DHTMessageType.FIND_VALUE_NODES,
      senderId: this.localNodeId,
      messageId: request.messageId,
      timestamp: Date.now(),
      nodes: closestNodes,
    };
  }

  /**
   * Handle incoming STORE request
   */
  handleStore(request: StoreRequest): StoreResponse {
    // Update sender's contact info
    this.addContact({
      nodeId: request.senderId,
      peerId: nodeIdToHex(request.senderId),
      lastSeen: Date.now(),
      failureCount: 0,
    });

    this.storeLocal(request.key, request.value);

    return {
      type: "STORE_RESPONSE" as DHTMessageType.STORE_RESPONSE,
      senderId: this.localNodeId,
      messageId: request.messageId,
      timestamp: Date.now(),
      success: true,
    };
  }

  /**
   * Handle incoming PING request
   */
  handlePing(request: PingRequest): PongResponse {
    // Update sender's contact info
    this.addContact({
      nodeId: request.senderId,
      peerId: nodeIdToHex(request.senderId),
      lastSeen: Date.now(),
      failureCount: 0,
    });

    return {
      type: "PONG" as DHTMessageType.PONG,
      senderId: this.localNodeId,
      messageId: request.messageId,
      timestamp: Date.now(),
    };
  }

  /**
   * Ping a contact to check if it's alive
   */
  async ping(contact: DHTContact): Promise<boolean> {
    if (!this.sendRpc) return false;

    const messageId = this.generateMessageId();
    const request: PingRequest = {
      type: "PING" as DHTMessageType.PING,
      senderId: this.localNodeId,
      messageId,
      timestamp: Date.now(),
    };

    try {
      const response = await this.sendRpcWithTimeout(contact, request);
      if (response.type === ("PONG" as DHTMessageType.PONG)) {
        const bucket = this.bucketManager.getBucket(
          getBucketIndex(this.localNodeId, contact.nodeId),
        );
        bucket?.resetFailures(contact.nodeId);
        bucket?.updateLastSeen(contact.nodeId);
        return true;
      }
    } catch {
      const bucket = this.bucketManager.getBucket(
        getBucketIndex(this.localNodeId, contact.nodeId),
      );
      bucket?.recordFailure(contact.nodeId);
    }

    return false;
  }

  /**
   * Send FIND_NODE request
   */
  private async sendFindNode(
    contact: DHTContact,
    targetId: NodeId,
  ): Promise<DHTContact[]> {
    if (!this.sendRpc) return [];

    const messageId = this.generateMessageId();
    const request: FindNodeRequest = {
      type: "FIND_NODE" as DHTMessageType.FIND_NODE,
      senderId: this.localNodeId,
      messageId,
      timestamp: Date.now(),
      targetId,
    };

    try {
      const response = await this.sendRpcWithTimeout(contact, request);
      if (
        response.type ===
        ("FIND_NODE_RESPONSE" as DHTMessageType.FIND_NODE_RESPONSE)
      ) {
        return (response as FindNodeResponse).nodes;
      }
    } catch {
      const bucket = this.bucketManager.getBucket(
        getBucketIndex(this.localNodeId, contact.nodeId),
      );
      bucket?.recordFailure(contact.nodeId);
    }

    return [];
  }

  /**
   * Send FIND_VALUE request
   */
  private async sendFindValue(
    contact: DHTContact,
    key: DHTKey,
  ): Promise<{ value?: DHTValue; nodes?: DHTContact[] }> {
    if (!this.sendRpc) return {};

    const messageId = this.generateMessageId();
    const request: FindValueRequest = {
      type: "FIND_VALUE" as DHTMessageType.FIND_VALUE,
      senderId: this.localNodeId,
      messageId,
      timestamp: Date.now(),
      key,
    };

    try {
      const response = await this.sendRpcWithTimeout(contact, request);
      if (
        response.type ===
        ("FIND_VALUE_RESPONSE" as DHTMessageType.FIND_VALUE_RESPONSE)
      ) {
        return { value: (response as FindValueResponse).value };
      } else if (
        response.type ===
        ("FIND_VALUE_NODES" as DHTMessageType.FIND_VALUE_NODES)
      ) {
        return { nodes: (response as FindValueNodesResponse).nodes };
      }
    } catch {
      const bucket = this.bucketManager.getBucket(
        getBucketIndex(this.localNodeId, contact.nodeId),
      );
      bucket?.recordFailure(contact.nodeId);
    }

    return {};
  }

  /**
   * Send STORE request
   */
  private async sendStore(
    contact: DHTContact,
    key: DHTKey,
    value: DHTValue,
  ): Promise<boolean> {
    if (!this.sendRpc) return false;

    const messageId = this.generateMessageId();
    const request: StoreRequest = {
      type: "STORE" as DHTMessageType.STORE,
      senderId: this.localNodeId,
      messageId,
      timestamp: Date.now(),
      key,
      value,
    };

    try {
      const response = await this.sendRpcWithTimeout(contact, request);
      return (
        response.type === ("STORE_RESPONSE" as DHTMessageType.STORE_RESPONSE) &&
        (response as StoreResponse).success
      );
    } catch {
      return false;
    }
  }

  /**
   * Send RPC with timeout
   */
  private async sendRpcWithTimeout(
    contact: DHTContact,
    request: DHTRPCMessage,
  ): Promise<DHTRPCMessage> {
    if (!this.sendRpc) {
      throw new Error("RPC sender not configured");
    }

    return new Promise<DHTRPCMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.messageId);
        reject(new Error("RPC timeout"));
      }, this.config.pingTimeout);

      this.pendingRequests.set(request.messageId, {
        resolve,
        reject,
        timeout,
        sentAt: Date.now(),
      });

      this.sendRpc!(contact, request).catch((err) => {
        this.pendingRequests.delete(request.messageId);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Handle incoming RPC response
   */
  handleResponse(response: DHTRPCMessage): void {
    const pending = this.pendingRequests.get(response.messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.messageId);

      // Update RTT for the responding contact via addContact to properly update LRU
      const rtt = Date.now() - pending.sentAt;
      const existingContact = this.getContact(response.senderId);
      if (existingContact) {
        // Re-add with updated info to trigger proper LRU update
        this.addContact({
          ...existingContact,
          rtt,
          lastSeen: Date.now(),
        });
      }

      pending.resolve(response);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${nodeIdToHex(this.localNodeId).slice(0, 8)}-${Date.now()}-${this.messageIdCounter++}`;
  }

  /**
   * Refresh stale buckets
   */
  private async refreshBuckets(): Promise<void> {
    const bucketsToRefresh = this.bucketManager.getBucketsNeedingRefresh(
      this.config.refreshInterval,
    );

    for (const bucket of bucketsToRefresh) {
      // Generate a random ID in this bucket's range and look it up
      const randomId = generateIdInBucket(this.localNodeId, bucket.index);
      try {
        await this.findNode(randomId);
        // Only mark as refreshed if lookup succeeded
        bucket.markRefreshed();
      } catch {
        // Lookup failed, don't mark bucket as refreshed so it will be retried
      }
    }
  }

  /**
   * Republish stored values
   */
  private async republishValues(): Promise<void> {
    const now = Date.now();

    for (const [keyHex, value] of this.valueStore.entries()) {
      // Check if value is expired
      if (now - value.storedAt > value.ttl) {
        this.valueStore.delete(keyHex);
        continue;
      }

      // Republish if we're the original publisher
      if (nodeIdsEqual(value.publisherId, this.localNodeId)) {
        // Validate hex string before parsing - must be non-empty and have valid hex chars
        if (keyHex.length === 0 || keyHex.length % 2 !== 0) {
          // Skip empty or odd-length hex strings
          continue;
        }
        const hexMatch = keyHex.match(/^[0-9a-fA-F]+$/);
        if (!hexMatch) {
          // Skip strings with invalid hex characters
          continue;
        }
        const byteArray = keyHex.match(/.{2}/g);
        if (!byteArray) {
          continue;
        }
        const key = new Uint8Array(byteArray.map((byte) => parseInt(byte, 16)));
        await this.store(key, value);
      }
    }
  }

  /**
   * Get routing table statistics
   */
  getStats(): DHTStats {
    const bucketStats = this.bucketManager.getStats();

    return {
      nodeCount: bucketStats.totalContacts,
      valueCount: this.valueStore.size,
      activeBuckets: bucketStats.activeBuckets,
      totalLookups: this.stats.totalLookups,
      successfulLookups: this.stats.successfulLookups,
      avgLookupTime:
        this.stats.totalLookups > 0
          ? this.stats.totalLookupTime / this.stats.totalLookups
          : 0,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: 200 bytes per contact, 100 bytes per stored value key
    const contactBytes = this.bucketManager.getTotalContacts() * 200;
    const valueBytes = this.valueStore.size * 100;
    // Add overhead for maps and other data structures
    return (contactBytes + valueBytes) * 1.2;
  }

  /**
   * Get bucket distribution (for network state awareness)
   */
  getBucketDistribution(): number[] {
    return this.bucketManager.getStats().bucketDistribution;
  }

  /**
   * Clear all data
   */
  clear(): void {
    for (let i = 0; i < NODE_ID_BITS; i++) {
      this.bucketManager.getBucket(i)?.clear();
    }
    this.valueStore.clear();
    this.stats = {
      totalLookups: 0,
      successfulLookups: 0,
      totalLookupTime: 0,
    };
  }
}
