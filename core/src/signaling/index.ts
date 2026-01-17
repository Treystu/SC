/**
 * Signaling module - P2P connection establishment without central servers
 *
 * Two methods for WebRTC signaling:
 * 1. DHTSignaling - Uses distributed hash table (requires network)
 * 2. QRSignaling - Uses QR code exchange (works fully offline)
 */

export * from "./DHTSignaling.js";
export * from "./QRSignaling.js";
