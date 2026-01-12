export interface AppConfig {
  publicHub: boolean;
  relayUrl: string;
  bootstrapEnabled: boolean;
  logUrl?: string; // Optional remote logging URL
}

// All web deployments are equal - they can all:
// 1. Act as full mesh nodes (P2P)
// 2. Bootstrap new nodes
// 3. Serve as public chat rooms
// The only difference is whether a relay/room server is available

const publicHub = import.meta.env.VITE_PUBLIC_HUB !== "false"; // Default to true

// Auto-detect relay URL - try common endpoints
const getRelayUrl = () => {
  // First check if explicitly configured
  if (import.meta.env.VITE_RELAY_URL) {
    return import.meta.env.VITE_RELAY_URL;
  }

  // Defensive check for non-browser environments (SSR, tests, Node.js)
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }

  // Detect Netlify deployment by hostname
  const isNetlifyHost =
    window.location.hostname.endsWith(".netlify.app") ||
    window.location.hostname.endsWith(".netlify.com");

  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const isSovcomAliasHost = window.location.hostname === "sovcomnetlify.app";

  if (isNetlifyHost || isSovcomAliasHost) {
    return window.location.origin + "/.netlify/functions/room";
  }

  // For local dev, default to the production hub so local↔prod can connect.
  // Override with VITE_RELAY_URL if you want a different hub.
  if (isLocalHost) {
    return "https://sovcom.netlify.app/.netlify/functions/room";
  }

  // For other deployments, return empty string to allow P2P-only mode
  // App.tsx checks for relayUrl before attempting to connect
  return "";
};

export const config: AppConfig = {
  publicHub,
  relayUrl: getRelayUrl(),
  bootstrapEnabled: true, // All web nodes can bootstrap others
};
