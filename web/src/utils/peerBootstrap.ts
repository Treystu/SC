/**
 * Peer Bootstrap Utilities
 * Handles peer list persistence and transfer for seamless webapp-to-mobile transition
 */

export interface BootstrapPeerInfo {
  peerId: string;
  lastSeen: number;
  isConnected: boolean;
}

export interface BootstrapData {
  peers: BootstrapPeerInfo[];
  roomUrl?: string;
  timestamp: number;
  version: number;
}

const STORAGE_KEY = 'sc-bootstrap-peers';
const VERSION = 1;
const BOOTSTRAP_DATA_MAX_AGE_MS = 3600000; // 1 hour in milliseconds
const DEEP_LINK_SCHEME = 'sc';
const NETLIFY_BASE_URL = 'https://sc.netlify.app';

/**
 * Save current peer list to localStorage for mobile app bootstrap
 */
export function saveBootstrapPeers(
  discoveredPeers: string[],
  connectedPeers: string[],
  roomUrl?: string
): void {
  const now = Date.now();
  
  const bootstrapData: BootstrapData = {
    peers: [
      ...connectedPeers.map(peerId => ({
        peerId,
        lastSeen: now,
        isConnected: true,
      })),
      ...discoveredPeers
        .filter(p => !connectedPeers.includes(p))
        .map(peerId => ({
          peerId,
          lastSeen: now,
          isConnected: false,
        })),
    ],
    roomUrl,
    timestamp: now,
    version: VERSION,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bootstrapData));
    console.log('Bootstrap peers saved:', bootstrapData.peers.length);
  } catch (error) {
    console.error('Failed to save bootstrap peers:', error);
  }
}

/**
 * Load bootstrap peers from localStorage
 */
export function loadBootstrapPeers(): BootstrapData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: BootstrapData = JSON.parse(stored);
    
    // Validate version
    if (data.version !== VERSION) {
      console.warn('Bootstrap data version mismatch, clearing');
      clearBootstrapPeers();
      return null;
    }

    // Filter out stale peers (older than max age)
    const minTimestamp = Date.now() - BOOTSTRAP_DATA_MAX_AGE_MS;
    if (data.timestamp < minTimestamp) {
      console.log('Bootstrap data is stale, clearing');
      clearBootstrapPeers();
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to load bootstrap peers:', error);
    return null;
  }
}

/**
 * Clear bootstrap peers from storage
 */
export function clearBootstrapPeers(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear bootstrap peers:', error);
  }
}

/**
 * Encode bootstrap data for URL transmission (deep link)
 * Uses base64url encoding for URL safety
 */
export function encodeBootstrapData(data: BootstrapData): string {
  try {
    // Compress data - only send peer IDs and connection status
    const compact = {
      v: data.version,
      p: data.peers.slice(0, 20).map(p => ({ // Limit to 20 peers
        i: p.peerId,
        c: p.isConnected ? 1 : 0,
      })),
      r: data.roomUrl,
      t: data.timestamp,
    };

    const json = JSON.stringify(compact);
    // Base64 encode and make URL-safe
    const base64 = btoa(json);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch (error) {
    console.error('Failed to encode bootstrap data:', error);
    return '';
  }
}

/**
 * Decode bootstrap data from URL parameter
 */
export function decodeBootstrapData(encoded: string): BootstrapData | null {
  try {
    // Restore base64 padding and characters
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padding);

    const json = atob(base64);
    const compact = JSON.parse(json);

    // Expand to full format
    return {
      version: compact.v || 1,
      peers: (compact.p || []).map((p: any) => ({
        peerId: p.i,
        lastSeen: compact.t || Date.now(),
        isConnected: p.c === 1,
      })),
      roomUrl: compact.r,
      timestamp: compact.t || Date.now(),
    };
  } catch (error) {
    console.error('Failed to decode bootstrap data:', error);
    return null;
  }
}

/**
 * Generate mobile app launch URL with bootstrap data
 */
export function generateMobileBootstrapUrl(
  inviteCode?: string,
  inviterName?: string,
  includeBootstrapPeers = true
): string {
  const params = new URLSearchParams();

  if (inviteCode) {
    params.set('code', inviteCode);
  }

  if (inviterName) {
    params.set('inviter', inviterName);
  }

  // Include bootstrap peers if available and requested
  if (includeBootstrapPeers) {
    const bootstrapData = loadBootstrapPeers();
    if (bootstrapData && bootstrapData.peers.length > 0) {
      const encoded = encodeBootstrapData(bootstrapData);
      if (encoded) {
        params.set('bootstrap', encoded);
      }
    }
  }

  const baseUrl = NETLIFY_BASE_URL + '/join';
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate Android deep link URL
 */
export function generateAndroidDeepLink(
  inviteCode?: string,
  inviterName?: string,
  includeBootstrapPeers = true
): string {
  const params = new URLSearchParams();

  if (inviteCode) {
    params.set('code', inviteCode);
  }

  if (inviterName) {
    params.set('inviter', inviterName);
  }

  if (includeBootstrapPeers) {
    const bootstrapData = loadBootstrapPeers();
    if (bootstrapData && bootstrapData.peers.length > 0) {
      const encoded = encodeBootstrapData(bootstrapData);
      if (encoded) {
        params.set('bootstrap', encoded);
      }
    }
  }

  return `${DEEP_LINK_SCHEME}://join?${params.toString()}`;
}
