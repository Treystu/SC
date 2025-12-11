/**
 * DHT Bootstrap Protocol
 * 
 * Handles initial network join by connecting to bootstrap nodes
 * and populating the routing table through iterative lookups.
 */

import type {
  NodeId,
  DHTContact,
  BootstrapConfig,
  BootstrapNode,
} from './types.js';
import { DEFAULT_BOOTSTRAP_CONFIG } from './types.js';
import { KademliaRoutingTable } from './kademlia.js';
import { nodeIdsEqual, copyNodeId, generateIdInBucket, nodeIdFromPublicKey, generateNodeId } from './node-id.js';

/**
 * Bootstrap result
 */
export interface BootstrapResult {
  /** Whether bootstrap was successful */
  success: boolean;
  /** Number of nodes discovered */
  nodesDiscovered: number;
  /** Bootstrap nodes that responded */
  respondedNodes: DHTContact[];
  /** Bootstrap nodes that failed */
  failedNodes: BootstrapNode[];
  /** Time taken in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Bootstrap progress callback
 */
export type BootstrapProgressCallback = (
  phase: 'connecting' | 'discovering' | 'populating' | 'complete' | 'failed',
  progress: number,
  message: string
) => void;

/**
 * DHT Bootstrap Manager
 * 
 * Manages the bootstrap process for joining the DHT network.
 */
export class DHTBootstrap {
  private routingTable: KademliaRoutingTable;
  private config: BootstrapConfig;
  private bootstrapNodes: BootstrapNode[] = [];
  private isBootstrapping = false;
  private progressCallback?: BootstrapProgressCallback;

  constructor(
    routingTable: KademliaRoutingTable,
    config?: Partial<BootstrapConfig>
  ) {
    this.routingTable = routingTable;
    this.config = {
      ...DEFAULT_BOOTSTRAP_CONFIG,
      bootstrapNodes: config?.bootstrapNodes ?? [],
      ...config,
    };
    this.bootstrapNodes = [...this.config.bootstrapNodes];
  }

  /**
   * Set progress callback
   */
  onProgress(callback: BootstrapProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Add a bootstrap node
   */
  addBootstrapNode(node: BootstrapNode): void {
    // Avoid duplicates
    if (!this.bootstrapNodes.some(n => nodeIdsEqual(n.nodeId, node.nodeId))) {
      this.bootstrapNodes.push(node);
    }
  }

  /**
   * Remove a bootstrap node
   */
  removeBootstrapNode(nodeId: NodeId): void {
    this.bootstrapNodes = this.bootstrapNodes.filter(
      n => !nodeIdsEqual(n.nodeId, nodeId)
    );
  }

  /**
   * Get all bootstrap nodes
   */
  getBootstrapNodes(): BootstrapNode[] {
    return [...this.bootstrapNodes];
  }

  /**
   * Start the bootstrap process
   */
  async bootstrap(): Promise<BootstrapResult> {
    if (this.isBootstrapping) {
      return {
        success: false,
        nodesDiscovered: 0,
        respondedNodes: [],
        failedNodes: [],
        duration: 0,
        error: 'Bootstrap already in progress',
      };
    }

    if (this.bootstrapNodes.length === 0) {
      return {
        success: false,
        nodesDiscovered: 0,
        respondedNodes: [],
        failedNodes: [],
        duration: 0,
        error: 'No bootstrap nodes configured',
      };
    }

    this.isBootstrapping = true;
    const startTime = Date.now();
    const respondedNodes: DHTContact[] = [];
    const failedNodes: BootstrapNode[] = [];

    try {
      this.reportProgress('connecting', 0, 'Connecting to bootstrap nodes...');

      // Phase 1: Connect to bootstrap nodes
      const connectionResults = await this.connectToBootstrapNodes();
      
      for (const result of connectionResults) {
        if (result.success && result.contact) {
          respondedNodes.push(result.contact);
        } else {
          failedNodes.push(result.node);
        }
      }

      // Check if we have minimum required connections
      if (respondedNodes.length < this.config.minBootstrapNodes) {
        this.reportProgress(
          'failed',
          0,
          `Only ${respondedNodes.length}/${this.config.minBootstrapNodes} bootstrap nodes responded`
        );
        return {
          success: false,
          nodesDiscovered: respondedNodes.length,
          respondedNodes,
          failedNodes,
          duration: Date.now() - startTime,
          error: `Insufficient bootstrap nodes: ${respondedNodes.length}/${this.config.minBootstrapNodes}`,
        };
      }

      this.reportProgress(
        'discovering',
        30,
        `Connected to ${respondedNodes.length} bootstrap nodes, discovering peers...`
      );

      // Phase 2: Perform self-lookup to populate routing table
      const localNodeId = this.routingTable.localNodeId;
      await this.routingTable.findNode(localNodeId);

      this.reportProgress('populating', 60, 'Populating routing table...');

      // Phase 3: Perform random lookups to further populate buckets
      await this.populateBuckets();

      const nodesDiscovered = this.routingTable.getAllContacts().length;
      const duration = Date.now() - startTime;

      this.reportProgress(
        'complete',
        100,
        `Bootstrap complete: ${nodesDiscovered} nodes discovered`
      );

      return {
        success: true,
        nodesDiscovered,
        respondedNodes,
        failedNodes,
        duration,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.reportProgress('failed', 0, `Bootstrap failed: ${message}`);
      
      return {
        success: false,
        nodesDiscovered: respondedNodes.length,
        respondedNodes,
        failedNodes,
        duration: Date.now() - startTime,
        error: message,
      };
    } finally {
      this.isBootstrapping = false;
    }
  }

  /**
   * Connect to bootstrap nodes
   */
  private async connectToBootstrapNodes(): Promise<Array<{
    node: BootstrapNode;
    success: boolean;
    contact?: DHTContact;
  }>> {
    // Sort by trusted status (trusted nodes first)
    const sortedNodes = [...this.bootstrapNodes].sort((a, b) => 
      (b.trusted ? 1 : 0) - (a.trusted ? 1 : 0)
    );

    // Connect in parallel batches
    const results: Array<{ node: BootstrapNode; success: boolean; contact?: DHTContact }> = [];
    
    for (let i = 0; i < sortedNodes.length; i += this.config.parallelBootstraps) {
      const batch = sortedNodes.slice(i, i + this.config.parallelBootstraps);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (node) => {
          const contact = await this.pingBootstrapNode(node);
          return { node, contact };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { node, contact } = result.value;
          if (contact) {
            // Add to routing table
            this.routingTable.addContact(contact);
            results.push({ node, success: true, contact });
          } else {
            results.push({ node, success: false });
          }
        } else {
          // Find the corresponding node (it failed)
          const idx = batchResults.indexOf(result);
          results.push({ node: batch[idx], success: false });
        }
      }

      // Check if we have enough responsive nodes
      const successCount = results.filter(r => r.success).length;
      if (successCount >= this.config.minBootstrapNodes) {
        // We have enough, no need to try more
        break;
      }
    }

    return results;
  }

  /**
   * Ping a bootstrap node
   */
  private async pingBootstrapNode(node: BootstrapNode): Promise<DHTContact | null> {
    const contact: DHTContact = {
      nodeId: copyNodeId(node.nodeId),
      peerId: node.peerId,
      lastSeen: 0,
      failureCount: 0,
      endpoints: node.endpoints,
    };

    try {
      const alive = await Promise.race([
        this.routingTable.ping(contact),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Ping timeout')), this.config.bootstrapTimeout)
        ),
      ]);

      if (alive) {
        contact.lastSeen = Date.now();
        return contact;
      }
    } catch {
      // Ping failed
    }

    return null;
  }

  /**
   * Populate buckets with random lookups.
   * 
   * Instead of only checking 5 fixed bucket indices, we check a larger sample
   * to ensure better coverage of the routing table.
   */
  private async populateBuckets(): Promise<void> {
    // Perform lookups to populate different parts of the routing table
    const lookupPromises: Promise<unknown>[] = [];
    
    // Generate bucket indices at regular intervals for better coverage
    // We sample every 10th bucket plus key boundary buckets
    const bucketIndices: number[] = [];
    for (let i = 0; i < 160; i += 10) {
      bucketIndices.push(i);
    }
    // Add the final bucket if not already included
    if (!bucketIndices.includes(159)) {
      bucketIndices.push(159);
    }
    
    for (const bucketIndex of bucketIndices) {
      if (this.routingTable.isBucketEmpty(bucketIndex)) {
        // Bucket is empty, try to populate it
        const randomId = this.generateRandomIdInBucket(bucketIndex);
        lookupPromises.push(
          this.routingTable.findNode(randomId).catch(() => {})
        );
      }
    }

    await Promise.allSettled(lookupPromises);
  }

  /**
   * Generate a random node ID in a specific bucket
   */
  private generateRandomIdInBucket(bucketIndex: number): NodeId {
    return generateIdInBucket(this.routingTable.localNodeId, bucketIndex);
  }

  /**
   * Report progress
   */
  private reportProgress(
    phase: 'connecting' | 'discovering' | 'populating' | 'complete' | 'failed',
    progress: number,
    message: string
  ): void {
    this.progressCallback?.(phase, progress, message);
  }

  /**
   * Check if bootstrap is currently in progress
   */
  isInProgress(): boolean {
    return this.isBootstrapping;
  }

  /**
   * Cancel bootstrap (sets flag, actual cancellation is best-effort)
   */
  cancel(): void {
    this.isBootstrapping = false;
  }
}

/**
 * Create bootstrap nodes from peer IDs
 * Helper function for integration with existing peer discovery
 */
export function createBootstrapNodesFromPeers(
  peers: Array<{ peerId: string; publicKey?: Uint8Array; endpoints?: Array<{ type: string; address?: string }> }>
): BootstrapNode[] {
  return peers.map(peer => ({
    nodeId: peer.publicKey 
      ? nodeIdFromPublicKey(peer.publicKey)
      : generateNodeId(), // Fallback if no public key
    peerId: peer.peerId,
    endpoints: (peer.endpoints ?? []).map(ep => ({
      type: ep.type as 'webrtc' | 'bluetooth' | 'local' | 'manual',
      address: ep.address,
    })),
    trusted: false,
  }));
}

/**
 * Simple bootstrap from a single peer
 * Useful for QR code or manual peer entry scenarios
 */
export async function bootstrapFromPeer(
  routingTable: KademliaRoutingTable,
  peer: { peerId: string; publicKey: Uint8Array; endpoints?: Array<{ type: string; address?: string }> }
): Promise<BootstrapResult> {
  const bootstrap = new DHTBootstrap(routingTable, {
    bootstrapNodes: createBootstrapNodesFromPeers([peer]),
    minBootstrapNodes: 1,
  });
  
  return bootstrap.bootstrap();
}
