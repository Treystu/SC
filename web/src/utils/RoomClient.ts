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
  private polledSince?: number;

  constructor(url: string, peerId: string) {
    this.url = url;
    this.peerId = peerId;
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
    const data = await this.request("poll", {
      since: this.polledSince,
    });

    // Update timestamp for next poll (using server time would be better, but local is ok for basic diff)
    // Actually, checking the max timestamp in messages/signals is safer, but "since" usually implies "msgs after this time"
    // Let's just track call time.
    this.polledSince = Date.now();

    return {
      signals: data.signals || [],
      messages: data.messages || [],
      peers: data.peers || [],
    };
  }
}
