export interface AppConfig {
  publicHub: boolean;
  relayUrl: string;
  bootstrapEnabled: boolean;
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

  // Try Netlify functions (common pattern)
  if (window.location.pathname.startsWith('/.netlify/') ||
      document.querySelector('script[src*=".netlify"]')) {
    return window.location.origin + "/.netlify/functions/room";
  }

  // Try standard /api endpoint
  return window.location.origin + "/api/room";
};

export const config: AppConfig = {
  publicHub,
  relayUrl: getRelayUrl(),
  bootstrapEnabled: true, // All web nodes can bootstrap others
};
