/**
 * Bootstrap Service for Mesh Network Initialization
 * 
 * Web deployments act as supernodes with stable endpoints.
 * This service handles:
 * 1. Discovering bootstrap nodes (supernodes)
 * 2. Registering as a supernode (for web deployments)
 * 3. Initial peer discovery and connection
 */

import { MeshNetwork } from '../../../core/src/mesh/network';

export interface BootstrapNode {
  id: string;
  type: 'supernode' | 'peer';
  publicKey?: string;
  capabilities?: {
    isStable: boolean;
    hasPublicIP: boolean;
    bandwidthMbps: number;
    uptime: number;
    canRelay: boolean;
    supportsWebRTC: boolean;
    supportsWebSocket: boolean;
  };
  endpoints?: {
    webrtc?: string;
    websocket?: string;
    http?: string;
  };
  metadata?: {
    region?: string;
    version?: string;
  };
}

export interface BootstrapResponse {
  bootstrapNodes: BootstrapNode[];
  timestamp: number;
  ttl: number;
}

export class BootstrapService {
  private bootstrapUrl: string;
  private isWebDeployment: boolean;
  private registrationInterval?: number;

  constructor(bootstrapUrl?: string) {
    // Default to Netlify function endpoint
    this.bootstrapUrl = bootstrapUrl || '/.netlify/functions/bootstrap';
    
    // Detect if this is a web deployment (stable endpoint)
    this.isWebDeployment = this.detectWebDeployment();
  }

  /**
   * Detect if running as a web deployment (supernode candidate)
   */
  private detectWebDeployment(): boolean {
    // Check if running on stable infrastructure
    const isProduction = import.meta.env.PROD;
    const hasStableOrigin = typeof window !== 'undefined' && 
                           window.location.hostname !== 'localhost' &&
                           !window.location.hostname.includes('192.168') &&
                           !window.location.hostname.includes('127.0.0.1');
    
    return isProduction && hasStableOrigin;
  }

  /**
   * Get bootstrap nodes for initial mesh network connection
   */
  async getBootstrapNodes(): Promise<BootstrapNode[]> {
    try {
      const response = await fetch(this.bootstrapUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Bootstrap request failed: ${response.status}`);
      }

      const data: BootstrapResponse = await response.json();
      return data.bootstrapNodes;
    } catch (error) {
      console.error('[Bootstrap] Failed to fetch bootstrap nodes:', error);
      // Return empty array - will fall back to other discovery methods
      return [];
    }
  }

  /**
   * Register this node as a supernode (for web deployments)
   */
  async registerAsSupernode(network: MeshNetwork): Promise<boolean> {
    if (!this.isWebDeployment) {
      return false; // Not a web deployment, don't register as supernode
    }

    try {
      const identity = network.getIdentity();
      const nodeInfo = {
        id: network.getLocalPeerId(),
        publicKey: Buffer.from(identity.publicKey).toString('hex'),
        capabilities: {
          bandwidthMbps: 100, // Assume good bandwidth for web deployment
          uptime: Date.now(), // Track uptime
        },
        endpoints: {
          http: window.location.origin,
        },
        metadata: {
          region: 'unknown', // Could be detected via IP geolocation
          version: '1.0.0',
        },
      };

      const response = await fetch(this.bootstrapUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'register_supernode',
          nodeInfo,
        }),
      });

      if (!response.ok) {
        throw new Error(`Supernode registration failed: ${response.status}`);
      }

      // Re-register periodically to maintain supernode status
      this.startPeriodicRegistration(network);

      return true;
    } catch (error) {
      console.error('[Bootstrap] Failed to register as supernode:', error);
      return false;
    }
  }

  /**
   * Announce this peer to the bootstrap server
   */
  async announcePeer(network: MeshNetwork): Promise<void> {
    try {
      const nodeInfo = {
        id: network.getLocalPeerId(),
        metadata: {
          version: '1.0.0',
        },
      };

      await fetch(this.bootstrapUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'announce_peer',
          nodeInfo,
        }),
      });
    } catch (error) {
      // Non-critical - peer announcement is best-effort
    }
  }

  /**
   * Start periodic supernode registration (every 5 minutes)
   */
  private startPeriodicRegistration(network: MeshNetwork): void {
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
    }

    this.registrationInterval = window.setInterval(() => {
      this.registerAsSupernode(network);
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Initialize mesh network with bootstrap nodes
   */
  async initializeMeshNetwork(network: MeshNetwork): Promise<void> {
    // 1. Get bootstrap nodes
    const bootstrapNodes = await this.getBootstrapNodes();

    // 2. Register as supernode if applicable
    if (this.isWebDeployment) {
      await this.registerAsSupernode(network);
    } else {
      // Regular peer - announce presence
      await this.announcePeer(network);
    }

    // 3. Connect to bootstrap nodes
    for (const node of bootstrapNodes) {
      if (node.type === 'supernode' && node.id !== network.getLocalPeerId()) {
        try {
          // Attempt connection to supernode
          // This will trigger WebRTC signaling through the room endpoint
          await network.connectToPeer(node.id);
        } catch (error) {
          // Continue to next node if connection fails
          continue;
        }
      }
    }

    // 4. DHT will automatically populate routing table as peers connect
    // No explicit bootstrap needed - connections above will trigger DHT peer discovery
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
      this.registrationInterval = undefined;
    }
  }
}

/**
 * Create and initialize bootstrap service
 */
export async function initializeBootstrap(network: MeshNetwork): Promise<BootstrapService> {
  const bootstrap = new BootstrapService();
  await bootstrap.initializeMeshNetwork(network);
  return bootstrap;
}
