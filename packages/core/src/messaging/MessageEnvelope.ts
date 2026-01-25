/**
 * Unified Message Envelope
 *
 * This defines the standard message format that works across:
 * - Web (browser)
 * - Mobile (React Native / native)
 * - P2P direct delivery
 * - Server relay (1 hop)
 * - Mesh relay (N hops)
 *
 * The key principle: ALWAYS preserve original sender and final recipient,
 * regardless of how many hops the message takes.
 */

export interface MessageEnvelope {
  // === CORE FIELDS (always present) ===

  /** Unique message ID (for deduplication) */
  id: string;

  /** Original author who created/wrote the message */
  authorId: string;

  /** Final intended recipient */
  destinationId: string;

  /** Message content (can be encrypted) */
  content: string;

  /** When the message was created (not relayed) */
  timestamp: number;

  // === OPTIONAL FIELDS ===

  /** Group ID if this is a group message */
  groupId?: string;

  /** Message type */
  type?: "text" | "voice" | "file" | "reaction";

  // === RELAY/HOP TRACKING ===

  /** Number of hops this message has taken */
  hopCount?: number;

  /** Path of relay nodes (for debugging, not required) */
  relayPath?: string[];

  /** TTL - max remaining hops before message is dropped */
  ttl?: number;
}

/**
 * Create a new message envelope
 */
export function createMessageEnvelope(
  authorId: string,
  destinationId: string,
  content: string,
  options?: {
    groupId?: string;
    type?: MessageEnvelope["type"];
    id?: string;
  },
): MessageEnvelope {
  return {
    id:
      options?.id ||
      `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    authorId,
    destinationId,
    content,
    timestamp: Date.now(),
    groupId: options?.groupId,
    type: options?.type || "text",
    hopCount: 0,
    ttl: 10, // Max 10 hops
  };
}

/**
 * Serialize envelope for transport
 */
export function serializeEnvelope(envelope: MessageEnvelope): string {
  return JSON.stringify(envelope);
}

/**
 * Parse a message payload into an envelope
 * Handles various legacy formats for backwards compatibility
 */
export function parseEnvelope(payload: unknown): MessageEnvelope | null {
  if (!payload) return null;

  // If it's a string, try to parse as JSON
  let data = payload;
  if (typeof payload === "string") {
    try {
      data = JSON.parse(payload);
    } catch {
      // Not JSON, might be plain text from old format
      return null;
    }
  }

  if (typeof data !== "object" || data === null) {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check for new envelope format
  if (obj.authorId && obj.destinationId && obj.content) {
    return {
      id: String(obj.id || `msg_${Date.now()}`),
      authorId: String(obj.authorId),
      destinationId: String(obj.destinationId),
      content: String(obj.content),
      timestamp: typeof obj.timestamp === "number" ? obj.timestamp : Date.now(),
      groupId: obj.groupId ? String(obj.groupId) : undefined,
      type: obj.type as MessageEnvelope["type"],
      hopCount: typeof obj.hopCount === "number" ? obj.hopCount : 0,
      relayPath: Array.isArray(obj.relayPath)
        ? obj.relayPath.map(String)
        : undefined,
      ttl: typeof obj.ttl === "number" ? obj.ttl : 10,
    };
  }

  // Handle legacy format: { text, timestamp, recipient, originalSenderId }
  if (obj.text || obj.content) {
    const text = String(obj.text || obj.content || "");
    const authorId = String(
      obj.originalSenderId || obj.from || obj.authorId || "unknown",
    );
    const destinationId = String(
      obj.recipient || obj.to || obj.destinationId || "unknown",
    );

    return {
      id: String(obj.id || obj.messageId || `legacy_${Date.now()}`),
      authorId,
      destinationId,
      content: text,
      timestamp: typeof obj.timestamp === "number" ? obj.timestamp : Date.now(),
      groupId: obj.groupId ? String(obj.groupId) : undefined,
      type: "text",
      hopCount: 0,
    };
  }

  return null;
}

/**
 * Check if envelope is for the local peer
 */
export function isEnvelopeForMe(
  envelope: MessageEnvelope,
  localPeerId: string,
): boolean {
  const normalizedLocal = localPeerId.replace(/\s/g, "").toUpperCase();
  const normalizedDest = envelope.destinationId
    .replace(/\s/g, "")
    .toUpperCase();
  return normalizedLocal === normalizedDest;
}

/**
 * Check if envelope is from the local peer (loopback)
 */
export function isEnvelopeFromMe(
  envelope: MessageEnvelope,
  localPeerId: string,
): boolean {
  const normalizedLocal = localPeerId.replace(/\s/g, "").toUpperCase();
  const normalizedAuthor = envelope.authorId.replace(/\s/g, "").toUpperCase();
  return normalizedLocal === normalizedAuthor;
}

/**
 * Increment hop count when relaying
 */
export function incrementHop(
  envelope: MessageEnvelope,
  relayerId: string,
): MessageEnvelope {
  return {
    ...envelope,
    hopCount: (envelope.hopCount || 0) + 1,
    ttl: (envelope.ttl || 10) - 1,
    relayPath: [...(envelope.relayPath || []), relayerId],
  };
}

/**
 * Check if message should still be relayed (TTL > 0)
 */
export function shouldRelay(envelope: MessageEnvelope): boolean {
  return (envelope.ttl || 0) > 0;
}
