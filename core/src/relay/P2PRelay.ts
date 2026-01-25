export enum RelayPacketType {
  DATA = 0x01,
  SIGNALING = 0x02,
  CONTROL = 0x03,
}

export interface RelayHeader {
  sourceId: string;
  destinationId: string;
  type: RelayPacketType;
  sessionId: string;
}

export class P2PRelay {
  private activeRelays = new Map<
    string,
    {
      sourceId: string;
      destinationId: string;
      lastSeen: number;
    }
  >();

  /**
   * Encapsulate a packet for relaying
   */
  static encapsulate(header: RelayHeader, payload: Uint8Array): Uint8Array {
    const sourceBytes = new TextEncoder().encode(
      header.sourceId.padEnd(16, " "),
    );
    const destBytes = new TextEncoder().encode(
      header.destinationId.padEnd(16, " "),
    );
    const sessionBytes = new TextEncoder().encode(
      header.sessionId.padEnd(16, " "),
    );

    const combined = new Uint8Array(2 + 16 + 16 + 16 + payload.length);
    combined[0] = 0x52; // 'R'
    combined[1] = header.type;
    combined.set(sourceBytes, 2);
    combined.set(destBytes, 18);
    combined.set(sessionBytes, 34);
    combined.set(payload, 50);

    return combined;
  }

  /**
   * Decapsulate a relayed packet
   */
  static decapsulate(
    data: Uint8Array,
  ): { header: RelayHeader; payload: Uint8Array } | null {
    if (data.length < 50 || data[0] !== 0x52) return null;

    const type = data[1] as RelayPacketType;
    const sourceId = new TextDecoder().decode(data.slice(2, 18)).trim();
    const destinationId = new TextDecoder().decode(data.slice(18, 34)).trim();
    const sessionId = new TextDecoder().decode(data.slice(34, 50)).trim();
    const payload = data.slice(50);

    return {
      header: { sourceId, destinationId, type, sessionId },
      payload,
    };
  }

  /**
   * Register a relay session
   */
  registerRelay(sessionId: string, sourceId: string, destinationId: string) {
    this.activeRelays.set(sessionId, {
      sourceId,
      destinationId,
      lastSeen: Date.now(),
    });
  }

  /**
   * Check if we should forward this packet
   */
  getDestination(sessionId: string): string | null {
    const relay = this.activeRelays.get(sessionId);
    if (!relay) return null;
    relay.lastSeen = Date.now();
    return relay.destinationId;
  }

  /**
   * Cleanup old relay sessions
   */
  prune(timeoutMs = 60000) {
    const now = Date.now();
    for (const [id, relay] of this.activeRelays.entries()) {
      if (now - relay.lastSeen > timeoutMs) {
        this.activeRelays.delete(id);
      }
    }
  }
}
