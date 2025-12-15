export interface RoomDisplayPeer {
  _id: string;
  metadata?: any;
}

export interface RoomSignal {
  id: string;
  from: string;
  to: string;
  type: string;
  signal: any;
  timestamp: string;
}

export interface RoomMessage {
  id: string;
  from: string;
  content: string;
  timestamp: string;
}

export class RoomClient {
  private url: string;
  private peerId: string;

  constructor(url: string, peerId: string) {
    this.url = url;
    this.peerId = peerId.replace(/\s/g, "");
  }

  private async request(action: string, payload: any = {}) {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          peerId: this.peerId,
          payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Room request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`RoomClient ${action} error:`, error);
      throw error;
    }
  }

  async join(metadata: any = {}): Promise<RoomDisplayPeer[]> {
    const data = await this.request("join", { metadata });
    return data.peers || [];
  }

  async signal(targetId: string, type: string, signalData: any) {
    await this.request("signal", {
      to: targetId,
      type,
      signal: signalData,
    });
  }

  async message(content: string) {
    await this.request("message", { content });
  }

  async poll(): Promise<{
    signals: RoomSignal[];
    messages: RoomMessage[];
    peers: RoomDisplayPeer[];
  }> {
    // Safe Polling: Always ask for the last 60 seconds of messages.
    // This allows for significant clock skew and network delay without missing messages.
    // Client-side deduplication handles the overlap.
    const safeSince = Date.now() - 60000;

    const data = await this.request("poll", {
      since: safeSince,
    });

    // No need to track strict polledSince anymore
    // this.polledSince = Date.now();

    return {
      signals: data.signals || [],
      messages: data.messages || [],
      peers: data.peers || [],
    };
  }
}
