export interface AppConfig {
  deploymentMode: "netlify" | "server" | "p2p-only";
  publicHub: boolean;
  relayUrl: string;
  logUrl: string;
}

const mode = import.meta.env.VITE_DEPLOYMENT_MODE || "netlify";
const publicHub = import.meta.env.VITE_PUBLIC_HUB === "true";

// Determine the default relay URL based on deployment mode
const getRelayUrl = () => {
  if (mode === "netlify") {
    return window.location.origin + "/.netlify/functions/room";
  } else if (mode === "server") {
    // In standalone server mode, the relay is on the same host/port but via WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }
  return "";
};

const getLogUrl = () => {
  if (mode === "netlify") {
    return window.location.origin + "/.netlify/functions/log";
  }
  // For other modes, we might not have a remote logger, or it could be a specific endpoint
  return "";
};

export const config: AppConfig = {
  deploymentMode: mode as AppConfig["deploymentMode"],
  publicHub,
  relayUrl: getRelayUrl(),
  logUrl: getLogUrl(),
};
