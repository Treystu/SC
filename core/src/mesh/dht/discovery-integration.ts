/**
 * DHT Discovery Integration
 * 
 * Connects existing peer discovery mechanisms (QR codes, manual entry)
 * with the DHT bootstrap system to enable seamless network joining.
 */

import type { PeerInfo } from '../../discovery/peer.js';
import type { KademliaRoutingTable } from './kademlia.js';
import { bootstrapFromPeer, createBootstrapNodesFromPeers } from './bootstrap.js';
import { nodeIdFromPublicKey } from './node-id.js';

/**
 * Bootstrap DHT from a QR code scanned peer
 * 
 * @param routingTable - DHT routing table
 * @param peerInfo - Peer information from QR code
 * @returns Bootstrap result
 */
export async function bootstrapFromQRCode(
  routingTable: KademliaRoutingTable,
  peerInfo: PeerInfo
) {
  return bootstrapFromPeer(routingTable, {
    peerId: peerInfo.peerId,
    publicKey: peerInfo.publicKey,
    endpoints: peerInfo.endpoints.map(ep => ({
      type: ep.type,
      address: ep.address,
      // Preserve signaling information for WebRTC endpoints
      ...(ep.signaling && { signaling: ep.signaling }),
    })),
  });
}

/**
 * Bootstrap DHT from a manually entered peer
 * 
 * @param routingTable - DHT routing table
 * @param peerId - Peer ID
 * @param publicKey - Peer's public key
 * @param address - Connection address (e.g., "192.168.1.100:8080")
 * @param transportType - Transport type to use
 * @returns Bootstrap result
 */
export async function bootstrapFromManualEntry(
  routingTable: KademliaRoutingTable,
  peerId: string,
  publicKey: Uint8Array,
  address: string,
  transportType: 'webrtc' | 'local' | 'manual' = 'manual'
) {
  return bootstrapFromPeer(routingTable, {
    peerId,
    publicKey,
    endpoints: [{
      type: transportType,
      address,
    }],
  });
}

/**
 * Bootstrap DHT from multiple discovered peers
 * 
 * Useful when using mDNS or other bulk discovery mechanisms.
 * 
 * @param routingTable - DHT routing table
 * @param peers - Array of discovered peers
 * @param minBootstrapNodes - Minimum successful bootstraps required
 * @returns Bootstrap result
 */
export async function bootstrapFromDiscoveredPeers(
  routingTable: KademliaRoutingTable,
  peers: Array<{
    peerId: string;
    publicKey: Uint8Array;
    endpoints: Array<{ type: string; address?: string }>;
  }>,
  minBootstrapNodes: number = 1
) {
  const { DHTBootstrap } = await import('./bootstrap.js');
  
  const bootstrap = new DHTBootstrap(routingTable, {
    bootstrapNodes: createBootstrapNodesFromPeers(peers),
    minBootstrapNodes,
  });

  return bootstrap.bootstrap();
}

/**
 * Add geographic/regional bootstrap nodes
 * 
 * This function can be extended to support bootstrap node lists
 * based on geographic regions or specific network segments.
 * 
 * @param routingTable - DHT routing table
 * @param region - Geographic region identifier
 * @returns Array of bootstrap nodes for the region
 */
export function getRegionalBootstrapNodes(region: string): Array<{
  peerId: string;
  publicKey: Uint8Array;
  endpoints: Array<{ type: string; address?: string }>;
  trusted: boolean;
}> {
  // This is a placeholder implementation
  // In production, this would fetch from a configuration or discovery service
  
  const bootstrapConfig: Record<string, Array<{
    peerId: string;
    publicKey: Uint8Array;
    endpoints: Array<{ type: string; address?: string }>;
    trusted: boolean;
  }>> = {
    'north-america': [],
    'europe': [],
    'asia': [],
    'default': [],
  };

  return bootstrapConfig[region] || bootstrapConfig['default'];
}

/**
 * Create a DHT-aware peer discovery handler
 * 
 * This factory creates a callback that can be used with existing
 * discovery mechanisms to automatically bootstrap DHT when peers
 * are discovered.
 * 
 * @param routingTable - DHT routing table
 * @param autoBootstrap - Whether to automatically bootstrap on discovery
 * @returns Discovery callback function
 */
export function createDHTDiscoveryHandler(
  routingTable: KademliaRoutingTable,
  autoBootstrap: boolean = true
) {
  return async (peerInfo: PeerInfo) => {
    // Add peer to DHT routing table
    const nodeId = nodeIdFromPublicKey(peerInfo.publicKey);
    
    routingTable.addContact({
      nodeId,
      peerId: peerInfo.peerId,
      lastSeen: peerInfo.timestamp,
      failureCount: 0,
      endpoints: peerInfo.endpoints.map(ep => ({
        type: ep.type as 'webrtc' | 'bluetooth' | 'local' | 'manual',
        address: ep.address,
      })),
    });

    // Optionally bootstrap from this peer
    if (autoBootstrap) {
      try {
        await bootstrapFromQRCode(routingTable, peerInfo);
      } catch (error) {
        // Bootstrap failure is non-fatal, log for debugging
        // In production, this would use a configured logger
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`DHT bootstrap from discovered peer ${peerInfo.peerId} failed:`, error);
        }
      }
    }
  };
}

/**
 * Check if a peer has sufficient information for DHT bootstrap
 * 
 * @param peerInfo - Peer information to validate
 * @returns True if peer can be used for bootstrap
 */
/**
 * Check if a peer has sufficient information for DHT bootstrap
 * 
 * Note: This performs basic structural validation only. Cryptographic
 * validation of the Ed25519 public key occurs during bootstrap when
 * the peer is contacted and its signature is verified.
 * 
 * @param peerInfo - Peer information to validate
 * @returns True if peer can be used for bootstrap
 */
export function isValidBootstrapPeer(peerInfo: Partial<PeerInfo>): boolean {
  return (
    typeof peerInfo.peerId === 'string' &&
    peerInfo.peerId.length > 0 &&
    peerInfo.publicKey instanceof Uint8Array &&
    peerInfo.publicKey.length === 32 &&
    Array.isArray(peerInfo.endpoints) &&
    peerInfo.endpoints.length > 0
  );
}
