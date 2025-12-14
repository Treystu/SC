/**
 * Kademlia DHT Network Operations
 * Implements the iterative lookup algorithm and RPCs
 */

import { Message, MessageType } from "../protocol/message.js";
import { RoutingTable, Peer } from "./routing.js";
import { xorDistance } from "./kademlia.js";

export interface DHTConfig {
  alpha?: number; // Concurrency parameter (default 3)
  k?: number; // Replication parameter (default 20)
  lookupTimeout?: number; // Timeout for a single lookup query (default 5000ms)
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

  // Simple in-memory storage for DHT values
  // In a real app, this would be backed by a database or filesystem
  private storage: Map<string, Uint8Array> = new Map();

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
  }

  /**
   * Handle incoming DHT messages
   */
  async handleMessage(message: Message): Promise<void> {
    const senderId = Buffer.from(message.header.senderId).toString("hex");

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

      const nodes = closest.map((p) => ({
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

      if (this.storage.has(key)) {
        // We have the value!
        const value = this.storage.get(key)!;
        const responsePayload = new TextEncoder().encode(
          JSON.stringify({
            key,
            value: Array.from(value), // Encode as array for JSON
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

      // TODO: Add quotas and validation
      this.storage.set(key, new Uint8Array(value));

      // Ideally send ACK
      // For now, silent success
    } catch (e) {
      console.error("Error handling STORE:", e);
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
      .map((p) => ({
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
          nodeData.id !== this.routingTable["kademliaTable"].localNodeId
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

      const promises = toQuery.map(async (node) => {
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
      });

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

    return shortlist.map((s) => s.peer);
  }

  /**
   * Find a value in the DHT
   */
  async findValue(key: string): Promise<Uint8Array | null> {
    const requestId = Math.random().toString(36).substring(7);

    // 1. Check local storage first
    if (this.storage.has(key)) {
      return this.storage.get(key)!;
    }

    // 2. Iterative lookup (similar to findNode but looking for value)
    const shortlist = this.routingTable
      .findClosestPeers(key, this.k)
      .map((p) => ({
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
            nodeData.id !== this.routingTable["kademliaTable"].localNodeId
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
    this.storage.set(key, value);
  }
}
