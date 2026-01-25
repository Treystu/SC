/**
 * Unified Message Parser
 *
 * This utility extracts the actual text content from messages that may be
 * wrapped in various JSON formats due to different transport mechanisms
 * (P2P WebRTC, server relay, etc.)
 *
 * Handles these formats:
 * - Plain string: "hello"
 * - Simple object: { text: "hello" }
 * - Nested JSON string: { text: "{\"text\":\"hello\"}" }
 * - Double nested: { text: { text: "hello" } }
 * - Relay format: { text: "hello", timestamp: 123, recipient: "ABC" }
 */

export interface ParsedMessage {
  text: string;
  timestamp?: number;
  senderId?: string;
  recipientId?: string;
  groupId?: string;
}

/**
 * Extract the actual text content from a message payload
 * @param content - The raw message content (string or object)
 * @returns The extracted text string
 */
export function extractMessageText(content: unknown): string {
  // Handle null/undefined
  if (content === null || content === undefined) {
    return "";
  }

  // If it's already a plain string, check if it's JSON
  if (typeof content === "string") {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(content);
      return extractMessageText(parsed);
    } catch {
      // Not JSON, return as-is
      return content;
    }
  }

  // If it's an object, extract the text field
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;

    // Check for 'text' property
    if ("text" in obj && obj.text !== undefined) {
      return extractMessageText(obj.text);
    }

    // Check for 'content' property (some formats use this)
    if ("content" in obj && obj.content !== undefined) {
      return extractMessageText(obj.content);
    }

    // Check for 'message' property
    if ("message" in obj && obj.message !== undefined) {
      return extractMessageText(obj.message);
    }

    // Last resort: stringify but filter out known metadata fields
    const {
      timestamp: _ts,
      recipient: _r,
      recipientId: _rid,
      originalSenderId: _osid,
      groupId: _gid,
      id: _id,
      ...rest
    } = obj as Record<string, unknown>;
    if (Object.keys(rest).length === 0) {
      // Only metadata, no actual content
      return "";
    }

    // Don't return raw JSON - this is likely a parsing error
    console.warn(
      "[extractMessageText] Could not extract text from object:",
      obj,
    );
    return "";
  }

  // For numbers, booleans, etc.
  return String(content);
}

/**
 * Parse a complete message payload including metadata
 * @param content - The raw message content
 * @returns ParsedMessage with text and optional metadata
 */
export function parseMessagePayload(content: unknown): ParsedMessage {
  const result: ParsedMessage = { text: "" };

  // Handle null/undefined
  if (content === null || content === undefined) {
    return result;
  }

  // If it's a string, try to parse as JSON
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return parseMessagePayload(parsed);
    } catch {
      // Not JSON, treat as plain text
      result.text = content;
      return result;
    }
  }

  // If it's an object, extract all relevant fields
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;

    // Extract text (recursively in case it's nested)
    result.text = extractMessageText(obj);

    // Extract metadata
    if (typeof obj.timestamp === "number") {
      result.timestamp = obj.timestamp;
    } else if (typeof obj.timestamp === "string") {
      result.timestamp = new Date(obj.timestamp).getTime();
    }

    if (typeof obj.originalSenderId === "string") {
      result.senderId = obj.originalSenderId;
    }

    if (typeof obj.recipient === "string") {
      result.recipientId = obj.recipient;
    } else if (typeof obj.recipientId === "string") {
      result.recipientId = obj.recipientId;
    }

    if (typeof obj.groupId === "string") {
      result.groupId = obj.groupId;
    }
  }

  return result;
}

/**
 * Check if a message should be skipped (loopback prevention)
 * @param senderId - The sender's peer ID
 * @param localPeerId - The local peer's ID
 * @returns true if the message is from self and should be skipped
 */
export function isLoopbackMessage(
  senderId: string | undefined,
  localPeerId: string,
): boolean {
  if (!senderId) return false;

  const normalizedSender = senderId.replace(/\s/g, "").toUpperCase();
  const normalizedLocal = localPeerId.replace(/\s/g, "").toUpperCase();

  return normalizedSender === normalizedLocal;
}
