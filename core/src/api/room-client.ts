import { logger } from "../logger.js";

export interface RoomPeer {
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
  private baseUrl: string;
  private peerId: string;

  constructor(
    peerId: string,
    baseUrl: string = "https://api.sovereigncommunications.app",
  ) {
    this.peerId = peerId;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(action: string, payload: any = {}): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/room`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          peerId: this.peerId,
          payload,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Room request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error("RoomClient", `Room action ${action} failed:`, error);
      throw error;
    }
  }

  async join(metadata: any = {}): Promise<RoomPeer[]> {
    const data = await this.request("join", { metadata });
    return data.peers || [];
  }

  async signal(
    targetId: string,
    type: string,
    signalData: any,
  ): Promise<boolean> {
    const response = await this.request("signal", {
      to: targetId,
      type,
      signal: signalData,
    });
    return response.success === true;
  }

  async poll(since?: number): Promise<{
    signals: RoomSignal[];
    messages: RoomMessage[];
    peers: RoomPeer[];
  }> {
    const data = await this.request("poll", {
      since: since || Date.now() - 60000,
    });

    return {
      signals: data.signals || [],
      messages: data.messages || [],
      peers: data.peers || [],
    };
  }
}
