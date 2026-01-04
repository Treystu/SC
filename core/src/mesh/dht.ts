/**
 * Kademlia DHT Network Operations
 * Implements the iterative lookup algorithm and RPCs
 */

import { Message, MessageType } from "../protocol/message.js";
import { RoutingTable, Peer } from "./routing.js";
import { xorDistance } from "./kademlia.js";
import { StorageAdapter } from "./dht/storage/StorageAdapter.js";
import { MemoryStorage } from "./dht/storage/MemoryStorage.js";
import { bytesToHex } from "../utils/encoding.js";

export interface DHTConfig {
  alpha?: number; // Concurrency parameter (default 3)
  k?: number; // Replication parameter (default 20)
  lookupTimeout?: number; // Timeout for a single lookup query (default 5000ms)
  storage?: StorageAdapter; // Persistence adapter
  maxValueSize?: number; // Maximum size of a single value in bytes (default 1MB)
  maxStoragePerPeer?: number; // Maximum storage per peer in bytes (default 10MB)
  storeRateLimit?: number; // Maximum STORE operations per minute per peer (default 100)
}

interface PeerStorageQuota {
  used: number; // Bytes used by this peer
  lastReset: number; // Timestamp of last rate limit reset
  storeCount: number; // Number of stores in current window
  keys: Set<string>; // Keys stored by this peer (for tracking and cleanup)
}

export interface NodeLookupResult {
  closestPeers: Peer[];
  value?: Uint8Array;
}

export class DHT {
  private routingTable: RoutingTable;
  private alpha: number;
  private k: number;
  private lookupTimeout: number;
  private maxValueSize: number;
  private maxStoragePerPeer: number;
  private storeRateLimit: number;

  // Dependencies injected to avoid circular deps with MeshNetwork
  private sendRequest: (
    peerId: string,
    type: MessageType,
    payload: Uint8Array,
  ) => Promise<void>;
  private pendingLookups: Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void }
  > = new Map();

  // Storage Adapter for DHT values
  private storage: StorageAdapter;

  // Quota and rate limiting tracking
  private peerQuotas: Map<string, PeerStorageQuota> = new Map();
  private keyToPeer: Map<string, string> = new Map(); // Track which peer stored which key

  constructor(
    routingTable: RoutingTable,
    sendRequest: (
      peerId: string,
      type: MessageType,
      payload: Uint8Array,
    ) => Promise<void>,
    config: DHTConfig = {},
  ) {
    this.routingTable = routingTable;
    this.sendRequest = sendRequest;
    this.alpha = config.alpha || 3;
    this.k = config.k || 20;
    this.lookupTimeout = config.lookupTimeout || 5000;
    this.storage = config.storage || new MemoryStorage();
    this.maxValueSize = config.maxValueSize || 1024 * 1024; // 1MB default
    this.maxStoragePerPeer = config.maxStoragePerPeer || 10 * 1024 * 1024; // 10MB default
    this.storeRateLimit = config.storeRateLimit || 100; // 100 stores per minute default
  }

  /**
   * Validate value size
   */
  private validateValueSize(value: any): boolean {
    const size = JSON.stringify(value).length;
    return size <= this.maxValueSize;
  }

  /**
   * Check and update peer quota
   * @returns true if store is allowed, false if quota exceeded
   */
  private checkPeerQuota(
    peerId: string,
    key: string,
    valueSize: number,
  ): boolean {
    const now = Date.now();
    let quota = this.peerQuotas.get(peerId);

    if (!quota) {
      quota = {
        used: 0,
        lastReset: now,
        storeCount: 0,
        keys: new Set(),
      };
      this.peerQuotas.set(peerId, quota);
    }

    // Reset rate limit counter every minute
    if (now - quota.lastReset > 60000) {
      quota.storeCount = 0;
      quota.lastReset = now;
    }

    // Check rate limit
    if (quota.storeCount >= this.storeRateLimit) {
      console.warn(`Rate limit exceeded for peer ${peerId}`);
      return false;
    }

    // Check if updating existing key - if so, we need to account for size difference
    const existingPeer = this.keyToPeer.get(key);
    if (existingPeer === peerId && quota.keys.has(key)) {
      // Peer is updating their own key - this is allowed without counting against quota
      // Size adjustment happens in the store operation itself
      quota.storeCount++;
      return true;
    }

    // Check storage quota for new key
    const newUsage = quota.used + valueSize;
    if (newUsage > this.maxStoragePerPeer) {
      console.warn(
        `Storage quota exceeded for peer ${peerId}: ${newUsage} bytes`,
      );
      return false;
    }

    // Update quota for new key
    quota.storeCount++;
    quota.used += valueSize;
    quota.keys.add(key);
    this.keyToPeer.set(key, peerId);

    return true;
  }

  /**
   * Remove a key from peer quota tracking
   */
  private async removePeerQuota(key: string): Promise<void> {
    const peerId = this.keyToPeer.get(key);
    if (!peerId) return;

    const quota = this.peerQuotas.get(peerId);
    if (quota) {
      // Get the actual stored value to determine its size
      try {
        const storedValue = await this.storage.get(key);
        if (storedValue) {
          const valueSize = JSON.stringify(Array.from(storedValue)).length;
          quota.used = Math.max(0, quota.used - valueSize);
        }
      } catch (e) {
        console.error(
          `Failed to retrieve stored value for quota cleanup: ${e}`,
        );
      }
      quota.keys.delete(key);
    }
    this.keyToPeer.delete(key);
  }

  /**
   * Handle incoming DHT messages
   */
  async handleMessage(message: Message): Promise<void> {
    const senderId = bytesToHex(message.header.senderId);

    switch (message.header.type) {
      case MessageType.DHT_FIND_NODE:
        await this.handleFindNode(senderId, message.payload);
        break;
      case MessageType.DHT_FOUND_NODES:
        this.handleFoundNodes(senderId, message.payload);
        break;
        break;
      case MessageType.DHT_FIND_VALUE:
        await this.handleFindValue(senderId, message.payload);
        break;
      case MessageType.DHT_FOUND_VALUE:
        this.handleFoundValue(senderId, message.payload);
        break;
      case MessageType.DHT_STORE:
        this.handleStore(senderId, message.payload);
        break;
    }
  }

  /**
   * Handle FIND_NODE request
   */
  private async handleFindNode(
    senderId: string,
    payload: Uint8Array,
  ): Promise<void> {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const targetId = data.targetId;

      const closest = this.routingTable.findClosestPeers(targetId, this.k);

      const nodes = closest.map((p: Peer) => ({
        id: p.id,
        publicKey: Array.from(p.publicKey),
        transportType: p.transportType,
        // In real impl, add connection/signaling info
      }));

      const responsePayload = new TextEncoder().encode(
        JSON.stringify({
          nodes,
          requestId: data.requestId,
        }),
      );

      await this.sendRequest(
        senderId,
        MessageType.DHT_FOUND_NODES,
        responsePayload,
      );
    } catch (e) {
      console.error("Error handling FIND_NODE:", e);
    }
  }

  /**
   * Handle FOUND_NODES response
   */
  private handleFoundNodes(senderId: string, payload: Uint8Array): void {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { nodes, requestId } = data;

      const resolver = this.pendingLookups.get(requestId);
      if (resolver) {
        resolver.resolve({ senderId, nodes });
      }
    } catch (e) {
      console.error("Error handling FOUND_NODES:", e);
    }
  }

  /**
   * Handle FIND_VALUE request
   */
  private async handleFindValue(
    senderId: string,
    payload: Uint8Array,
  ): Promise<void> {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const key = data.key; // Key is usually the transparent hash

      const storedValue = await this.storage.get(key);
      if (storedValue) {
        // We have the value!
        const responsePayload = new TextEncoder().encode(
          JSON.stringify({
            key,
            value: Array.from(storedValue), // Encode as array for JSON
            requestId: data.requestId,
          }),
        );

        await this.sendRequest(
          senderId,
          MessageType.DHT_FOUND_VALUE,
          responsePayload,
        );
      } else {
        // We don't have it, behave like FIND_NODE
        const closest = this.routingTable.findClosestPeers(key, this.k);
        const nodes = closest.map((p) => ({
          id: p.id,
          publicKey: Array.from(p.publicKey),
          transportType: p.transportType,
        }));

        const responsePayload = new TextEncoder().encode(
          JSON.stringify({
            nodes,
            requestId: data.requestId,
          }),
        );

        // Return closest nodes so they can keep searching
        await this.sendRequest(
          senderId,
          MessageType.DHT_FOUND_NODES,
          responsePayload,
        );
      }
    } catch (e) {
      console.error("Error handling FIND_VALUE:", e);
    }
  }

  /**
   * Handle FOUND_VALUE response
   */
  private handleFoundValue(senderId: string, payload: Uint8Array): void {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { value, requestId } = data;

      const resolver = this.pendingLookups.get(requestId);
      if (resolver) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
          console.log(
            `[DHT][TEST] Found value response from ${senderId} for ${requestId}`,
          );
        }
        // Resolve with the value
        resolver.resolve({ senderId, value: new Uint8Array(value) });
      }
    } catch (e) {
      console.error("Error handling FOUND_VALUE:", e);
    }
  }

  /**
   * Handle STORE request
   */
  private handleStore(senderId: string, payload: Uint8Array): void {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { key, value } = data;

      // Validate value size
      if (!this.validateValueSize(value)) {
        console.warn(`Rejected STORE from ${senderId}: value too large`);
        return;
      }

      // Calculate value size
      const valueSize = JSON.stringify(value).length;

      // Check peer quota and rate limit
      if (!this.checkPeerQuota(senderId, key, valueSize)) {
        console.warn(
          `Rejected STORE from ${senderId}: quota or rate limit exceeded`,
        );
        return;
      }

      // Store the value
      this.handleStoreAsync(key, value, senderId);
    } catch (e) {
      console.error("Error handling STORE:", e);
    }
  }

  private async handleStoreAsync(
    key: string,
    value: any,
    _senderId: string,
  ): Promise<void> {
    try {
      await this.storage.store(key, new Uint8Array(value));
    } catch (e) {
      console.error("Failed to store value in DHT adapter", e);
      // Remove from quota tracking if store failed
      await this.removePeerQuota(key);
    }
  }

  /**
   * Perform a Node Lookup (FindNode)
   * Iteratively queries peers to find the k closest nodes to targetId
   */
  async findNode(targetId: string): Promise<Peer[]> {
    const requestId = Math.random().toString(36).substring(7);

    // 1. Start with closest nodes from local table
    let shortlist = this.routingTable
      .findClosestPeers(targetId, this.k)
      .map((p: Peer) => ({
        peer: p,
        distance: xorDistance(targetId, p.id),
        queried: false,
      }));

    if (shortlist.length === 0) return [];

    // const queriedSet = new Set<string>();
    let activeQueries = 0;

    // Helper to process results
    const processResult = (nodes: any[]) => {
      let changed = false;
      for (const nodeData of nodes) {
        // Here we would normally verify/add the peer to the routing table
        // For this simple impl, we just add to shortlist if not present
        if (
          !processResult.seen.has(nodeData.id) &&
          nodeData.id !== this.routingTable.localNodeId
        ) {
          // Create a temporary Peer object (incomplete, missing connection info)
          // In real app we would use connection info to connect/ping
          const peer: Peer = {
            id: nodeData.id,
            publicKey: new Uint8Array(nodeData.publicKey),
            lastSeen: Date.now(),
            connectedAt: 0,
            transportType: nodeData.transportType,
            connectionQuality: 0,
            bytesSent: 0,
            bytesReceived: 0,
            state: "disconnected" as any,
            metadata: {
              capabilities: {
                supportedTransports: [],
                protocolVersion: 1,
                features: [],
              },
              reputation: 50,
              blacklisted: false,
              failureCount: 0,
              successCount: 0,
            },
          };

          shortlist.push({
            peer,
            distance: xorDistance(targetId, peer.id),
            queried: false,
          });
          processResult.seen.add(nodeData.id);
          changed = true;

          // CRITICAL FIX: Add discovered peer to routing table
          // In Kademlia, we validly discover nodes here.
          // We need to ensure we don't overwrite existing "connected" state with "disconnected"
          const existing = this.routingTable.getPeer(peer.id);
          if (!existing) {
            this.routingTable.addPeer(peer);
          }
        }
      }
      return changed;
    };
    processResult.seen = new Set<string>(shortlist.map((s) => s.peer.id));

    // Iterative loop
    // In a real implementation this would be more event-driven or use a loop with Promise.race
    // Simplified version:

    for (let round = 0; round < 10; round++) {
      // Max rounds safety
      // Sort by distance
      shortlist.sort((a, b) => (a.distance < b.distance ? -1 : 1));

      // Pick alpha unqueried nodes
      const toQuery = shortlist.filter((n) => !n.queried).slice(0, this.alpha);

      if (toQuery.length === 0 && activeQueries === 0) break; // Done

      const promises = toQuery.map(
        async (node: { peer: Peer; queried: boolean }) => {
          node.queried = true;
          activeQueries++;

          // Send query
          try {
            const subRequestId = `${requestId}-${node.peer.id}`;
            const payload = new TextEncoder().encode(
              JSON.stringify({
                targetId,
                requestId: subRequestId,
              }),
            );

            // We need to wait for response
            // This requires a temporary promise in pendingLookups
            return await new Promise<any>((resolve) => {
              const timeout = setTimeout(() => {
                this.pendingLookups.delete(subRequestId);
                resolve(null);
              }, this.lookupTimeout);

              this.pendingLookups.set(subRequestId, {
                resolve: (val) => {
                  clearTimeout(timeout);
                  this.pendingLookups.delete(subRequestId);
                  resolve(val);
                },
                reject: () => {},
              });

              this.sendRequest(
                node.peer.id,
                MessageType.DHT_FIND_NODE,
                payload,
              ).catch(() => {
                clearTimeout(timeout);
                this.pendingLookups.delete(subRequestId);
                resolve(null);
              });
            });
          } catch (e) {
            return null;
          } finally {
            activeQueries--;
          }
        },
      );

      const results = await Promise.all(promises);

      // Process results
      let madeProgress = false;
      for (const res of results) {
        if (res && res.nodes) {
          if (processResult(res.nodes)) madeProgress = true;
        }
      }

      // Prune shortlist to k best
      shortlist.sort((a, b) => (a.distance < b.distance ? -1 : 1));
      if (shortlist.length > this.k) {
        // Keep the ones we queried + best unqueried?
        // Standard Kademlia: keep k closest seen
        shortlist = shortlist.slice(0, this.k);
      }

      if (!madeProgress && activeQueries === 0) break;
    }

    return shortlist.map((s: { peer: Peer }) => s.peer);
  }

  /**
   * Find a value in the DHT
   */
  async findValue(key: string): Promise<Uint8Array | null> {
    const requestId = Math.random().toString(36).substring(7);

    // 1. Check local storage first
    const localValue = await this.storage.get(key);
    if (localValue) {
      return localValue;
    }

    // 2. Iterative lookup (similar to findNode but looking for value)
    const shortlist = this.routingTable
      .findClosestPeers(key, this.k)
      .map((p: Peer) => ({
        peer: p,
        distance: xorDistance(key, p.id),
        queried: false,
      }));

    if (shortlist.length === 0) return null;

    // const queriedSet = new Set<string>();
    let activeQueries = 0;
    let foundValue: Uint8Array | null = null;

    // Helper to process results
    const processResult = (result: any) => {
      // If we found the value, we are done!
      if (result.value) {
        foundValue = result.value;
        return true; // Stop everything
      }

      // Otherwise process nodes like in findNode
      if (result.nodes) {
        for (const nodeData of result.nodes) {
          if (
            !processResult.seen.has(nodeData.id) &&
            nodeData.id !== this.routingTable.localNodeId
          ) {
            const peer: Peer = {
              id: nodeData.id,
              publicKey: new Uint8Array(nodeData.publicKey),
              lastSeen: Date.now(),
              connectedAt: 0,
              transportType: nodeData.transportType,
              connectionQuality: 0,
              bytesSent: 0,
              bytesReceived: 0,
              state: "disconnected" as any,
              metadata: {
                capabilities: {
                  supportedTransports: [],
                  protocolVersion: 1,
                  features: [],
                },
                reputation: 50,
                blacklisted: false,
                failureCount: 0,
                successCount: 0,
              },
            };

            shortlist.push({
              peer,
              distance: xorDistance(key, peer.id),
              queried: false,
            });
            processResult.seen.add(nodeData.id);
          }
        }
      }
      return false;
    };
    processResult.seen = new Set<string>(shortlist.map((s) => s.peer.id));

    // Iterative loop
    for (let round = 0; round < 10; round++) {
      if (foundValue) break;

      shortlist.sort((a, b) => (a.distance < b.distance ? -1 : 1));
      const toQuery = shortlist.filter((n) => !n.queried).slice(0, this.alpha);

      if (toQuery.length === 0 && activeQueries === 0) break;

      const promises = toQuery.map(async (node) => {
        node.queried = true;
        activeQueries++;

        try {
          const subRequestId = `${requestId}-${node.peer.id}`;
          const payload = new TextEncoder().encode(
            JSON.stringify({
              key,
              requestId: subRequestId,
            }),
          );

          if (
            typeof process !== "undefined" &&
            process.env.NODE_ENV === "test"
          ) {
            console.log(
              `[DHT][TEST] Querying ${node.peer.id} for key ${key} (req ${subRequestId})`,
            );
          }

          const result = await new Promise<any>((resolve) => {
            const timeout = setTimeout(() => {
              this.pendingLookups.delete(subRequestId);
              resolve(null);
            }, this.lookupTimeout);

            this.pendingLookups.set(subRequestId, {
              resolve: (val) => {
                clearTimeout(timeout);
                this.pendingLookups.delete(subRequestId);
                resolve(val);
              },
              reject: () => {},
            });

            this.sendRequest(
              node.peer.id,
              MessageType.DHT_FIND_VALUE,
              payload,
            ).catch(() => {
              clearTimeout(timeout);
              this.pendingLookups.delete(subRequestId);
              resolve(null);
            });
          });

          return result;
        } catch (e) {
          return null;
        } finally {
          activeQueries--;
        }
      });

      const results = await Promise.all(promises);

      for (const res of results) {
        if (res) {
          if (processResult(res)) break; // Found value
        }
      }
    }

    return foundValue;
  }

  /**
   * Store a value in the DHT
   * Stores it on the k closest nodes
   */
  async store(key: string, value: Uint8Array): Promise<void> {
    // 1. Find k closest nodes
    const closestNodes = await this.findNode(key);

    // 2. Send STORE to them
    const payload = new TextEncoder().encode(
      JSON.stringify({
        key,
        value: Array.from(value),
      }),
    );

    const promises = closestNodes.map((peer) =>
      this.sendRequest(peer.id, MessageType.DHT_STORE, payload),
    );

    // We don't strictly wait for all, but good to know
    await Promise.allSettled(promises);

    // Also store locally if we are among closest?
    // For simplicity, always store locally as a cache or if we are the origin
    await this.storage.store(key, value);
  }
}
