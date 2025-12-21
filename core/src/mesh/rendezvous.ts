import { Message, MessageType } from "../protocol/message.js";
import { DHT } from "./dht.js";
import { sha256 } from "@noble/hashes/sha2.js";

function hashRegion(region: string): string {
  const hash = sha256(new TextEncoder().encode(region));
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PeerConnectionInfo {
  peerId: string;
  transports: { type: string; details: any }[];
  lastSeen: number;
}

export class RendezvousManager {
  private dht: DHT;
  private localPeerId: string;
  private send: (
    peerId: string,
    type: MessageType,
    payload: Uint8Array,
  ) => Promise<void>;

  // Local storage of rendezvous data: region -> peers
  private regionStore: Map<string, PeerConnectionInfo[]> = new Map();
  private pendingQueries: Map<
    string,
    { resolve: (val: PeerConnectionInfo[]) => void }
  > = new Map();

  constructor(
    localPeerId: string,
    dht: DHT,
    send: (
      peerId: string,
      type: MessageType,
      payload: Uint8Array,
    ) => Promise<void>,
  ) {
    this.localPeerId = localPeerId;
    this.dht = dht;
    this.send = send;
  }

  /**
   * Handle incoming Rendezvous messages
   */
  async handleMessage(message: Message): Promise<void> {
    const senderId = Buffer.from(message.header.senderId).toString("hex");

    switch (message.header.type) {
      case MessageType.RENDEZVOUS_ANNOUNCE:
        this.handleAnnounce(senderId, message.payload);
        break;
      case MessageType.RENDEZVOUS_QUERY:
        await this.handleQuery(senderId, message.payload);
        break;
      case MessageType.RENDEZVOUS_RESPONSE:
        await this.handleResponse(senderId, message.payload);
        break;
    }
  }

  /**
   * Announce presence in a region
   */
  async announce(region: string, info: PeerConnectionInfo): Promise<void> {
    const regionHash = hashRegion(region);

    // 1. Find Rendezvous Points (k closest nodes to region hash)
    const nodes = await this.dht.findNode(regionHash);

    // 2. Send ANNOUNCE to them
    const payload = new TextEncoder().encode(
      JSON.stringify({
        region,
        info,
      }),
    );

    nodes.forEach((node) => {
      this.send(node.id, MessageType.RENDEZVOUS_ANNOUNCE, payload).catch(
        console.error,
      );
    });
  }

  /**
   * Discover peers in a region
   */
  async discover(
    region: string,
    timeoutMs: number = 5000,
  ): Promise<PeerConnectionInfo[]> {
    const regionHash = hashRegion(region);

    // 1. Find Rendezvous Points
    const nodes = await this.dht.findNode(regionHash);
    if (!nodes || nodes.length === 0) return [];

    const requestId = Math.random().toString(36).substring(7);
    const payload = new TextEncoder().encode(
      JSON.stringify({
        region,
        requestId,
      }),
    );

    // 2. Setup promise to collect responses
    return new Promise<PeerConnectionInfo[]>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingQueries.delete(requestId);
        resolve([]);
      }, timeoutMs);

      this.pendingQueries.set(requestId, {
        resolve: (peers) => {
          clearTimeout(timeout);
          this.pendingQueries.delete(requestId);
          resolve(peers);
        },
      });

      // 3. Ask nodes
      nodes.forEach((node) => {
        this.send(node.id, MessageType.RENDEZVOUS_QUERY, payload).catch(
          () => {},
        );
      });
    });
  }

  // --- Handlers ---

  private handleAnnounce(senderId: string, payload: Uint8Array): void {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { region, info } = data;
      if (!region || !info) return;

      if (!this.regionStore.has(region)) {
        this.regionStore.set(region, []);
      }
      const peers = this.regionStore.get(region)!;

      // Update or add
      const existingIdx = peers.findIndex((p) => p.peerId === info.peerId);
      if (existingIdx >= 0) {
        peers[existingIdx] = info;
      } else {
        peers.push(info);
      }

      // Cap size
      if (peers.length > 50) peers.shift();
    } catch (e) {
      console.error("Error handling Rendezvous ANNOUNCE", e);
    }
  }

  private async handleQuery(
    senderId: string,
    payload: Uint8Array,
  ): Promise<void> {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { region, requestId } = data;

      const peers = this.regionStore.get(region) || [];

      const responsePayload = new TextEncoder().encode(
        JSON.stringify({
          region,
          peers,
          requestId,
        }),
      );

      await this.send(
        senderId,
        MessageType.RENDEZVOUS_RESPONSE,
        responsePayload,
      );
    } catch (e) {
      console.error("Error handling Rendezvous QUERY", e);
    }
  }

  private async handleResponse(
    senderId: string,
    payload: Uint8Array,
  ): Promise<void> {
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      const { peers, requestId } = data;

      const resolver = this.pendingQueries.get(requestId);
      if (resolver && peers && peers.length > 0) {
        resolver.resolve(peers);
      }
    } catch (e) {
      console.error("Error handling Rendezvous RESPONSE", e);
    }
  }
}
