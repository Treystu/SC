/**
 * Silent Mesh Manager
 *
 * The Silent Mesh architecture separates mesh connectivity from social contacts:
 * - meshNeighbors: Technical connections for relaying and health checks (automatic)
 * - potentialSocialContacts: Peers that require user action to become contacts
 *
 * KEY PRINCIPLES:
 * 1. Aggressive Connection: Connect to all discoverable peers as mesh nodes
 * 2. Social Silence: NEVER create Contacts or Conversations without user action
 * 3. Eternal Ledger: Maintain persistent node history that survives identity resets
 */

import { EternalLedger, KnownNode } from './ledger.js';

export interface MeshNeighbor {
  peerId: string;
  publicKey?: string;
  transportType: 'webrtc' | 'ble' | 'local' | 'dht';
  connectedAt: number;
  lastActivity: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  relayCapable: boolean;          // Can this peer relay messages?
  bytesRelayed: number;           // How much data have we relayed through this peer?
  source: 'discovery' | 'dht' | 'ledger' | 'manual';
}

export interface PotentialSocialContact {
  peerId: string;
  displayName?: string;
  publicKey?: string;
  discoveredAt: number;
  discoverySource: string;
  hasMessaged: boolean;           // Have they sent us a message?
  messageCount: number;           // How many messages have they sent?
  promoted: boolean;              // Has user promoted this to a contact?
}

export interface SilentMeshStats {
  meshNeighbors: number;
  potentialContacts: number;
  totalRelayedBytes: number;
  ledgerNodes: number;
  activeConnections: number;
}

export interface WateringHoleMessage {
  messageId: string;
  destinationPeerId: string;
  message: Uint8Array;
  storedAt: number;
  expiresAt: number;
  gatewayIds: string[];           // Gateways where destination was last seen
  deliveryAttempts: number;
}

/**
 * Silent Mesh Manager
 *
 * Coordinates aggressive background connectivity while keeping the UI clean.
 */
export class SilentMeshManager {
  private meshNeighbors: Map<string, MeshNeighbor> = new Map();
  private potentialContacts: Map<string, PotentialSocialContact> = new Map();
  private ledger: EternalLedger;
  private wateringHoleQueue: Map<string, WateringHoleMessage> = new Map();

  // Configuration
  private static readonly MAX_MESH_NEIGHBORS = 100;
  private static readonly MAX_POTENTIAL_CONTACTS = 500;
  private static readonly WATERING_HOLE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly MAX_WATERING_HOLE_MESSAGES = 1000;

  // Callbacks
  private onMeshNeighborConnectedCallback?: (neighbor: MeshNeighbor) => void;
  private onMeshNeighborDisconnectedCallback?: (peerId: string) => void;
  private onPotentialContactDiscoveredCallback?: (contact: PotentialSocialContact) => void;

  constructor(ledger?: EternalLedger) {
    this.ledger = ledger || new EternalLedger();
  }

  /**
   * Record a mesh neighbor connection (automatic, no UI impact)
   */
  async addMeshNeighbor(
    peerId: string,
    options: {
      publicKey?: string;
      transportType?: 'webrtc' | 'ble' | 'local' | 'dht';
      source?: 'discovery' | 'dht' | 'ledger' | 'manual';
      relayCapable?: boolean;
    } = {}
  ): Promise<MeshNeighbor> {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();
    const now = Date.now();

    // Check if already a neighbor
    let neighbor = this.meshNeighbors.get(normalizedId);

    if (neighbor) {
      // Update existing neighbor
      neighbor.lastActivity = now;
      if (options.publicKey) neighbor.publicKey = options.publicKey;
      if (options.relayCapable !== undefined) neighbor.relayCapable = options.relayCapable;
    } else {
      // Enforce size limit
      if (this.meshNeighbors.size >= SilentMeshManager.MAX_MESH_NEIGHBORS) {
        this.pruneInactiveNeighbors();
      }

      // Create new neighbor
      neighbor = {
        peerId: normalizedId,
        publicKey: options.publicKey,
        transportType: options.transportType || 'webrtc',
        connectedAt: now,
        lastActivity: now,
        connectionQuality: 'good',
        relayCapable: options.relayCapable ?? true,
        bytesRelayed: 0,
        source: options.source || 'discovery',
      };

      this.meshNeighbors.set(normalizedId, neighbor);

      // Record in Eternal Ledger
      await this.ledger.recordNodeSighting(normalizedId, {
        publicKey: options.publicKey,
        connectionSuccessful: true,
      });

      console.log(`[SilentMesh] 🔗 Added mesh neighbor: ${normalizedId.substring(0, 8)}... (total: ${this.meshNeighbors.size})`);

      // Notify callback (for logs/diagnostics, NOT for UI contact lists)
      this.onMeshNeighborConnectedCallback?.(neighbor);
    }

    return neighbor;
  }

  /**
   * Remove a mesh neighbor (disconnect)
   */
  removeMeshNeighbor(peerId: string): void {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();
    const neighbor = this.meshNeighbors.get(normalizedId);

    if (neighbor) {
      this.meshNeighbors.delete(normalizedId);
      console.log(`[SilentMesh] 🔌 Removed mesh neighbor: ${normalizedId.substring(0, 8)}...`);
      this.onMeshNeighborDisconnectedCallback?.(normalizedId);
    }
  }

  /**
   * Get all mesh neighbors (for network status display)
   */
  getMeshNeighbors(): MeshNeighbor[] {
    return Array.from(this.meshNeighbors.values());
  }

  /**
   * Get mesh neighbor count (for UI indicator)
   */
  getMeshNeighborCount(): number {
    return this.meshNeighbors.size;
  }

  /**
   * Get active mesh neighbors (connected and responding)
   */
  getActiveMeshNeighbors(): MeshNeighbor[] {
    return Array.from(this.meshNeighbors.values())
      .filter(n => n.connectionQuality !== 'offline');
  }

  /**
   * Update mesh neighbor activity (on message received/sent)
   */
  updateNeighborActivity(peerId: string, bytesTransferred: number = 0): void {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();
    const neighbor = this.meshNeighbors.get(normalizedId);

    if (neighbor) {
      neighbor.lastActivity = Date.now();
      neighbor.bytesRelayed += bytesTransferred;
    }
  }

  /**
   * Update mesh neighbor connection quality
   */
  updateNeighborQuality(peerId: string, quality: 'excellent' | 'good' | 'poor' | 'offline'): void {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();
    const neighbor = this.meshNeighbors.get(normalizedId);

    if (neighbor) {
      neighbor.connectionQuality = quality;

      // Mark in ledger if connection failed
      if (quality === 'offline') {
        this.ledger.recordNodeSighting(normalizedId, {
          connectionSuccessful: false,
        }).catch(console.error);
      }
    }
  }

  /**
   * Record a potential social contact (discovered but not yet a contact)
   * This does NOT create a UI contact - only tracks for potential promotion
   */
  async recordPotentialContact(
    peerId: string,
    options: {
      displayName?: string;
      publicKey?: string;
      discoverySource?: string;
    } = {}
  ): Promise<PotentialSocialContact> {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();

    let contact = this.potentialContacts.get(normalizedId);

    if (contact) {
      // Update existing potential contact
      if (options.displayName) contact.displayName = options.displayName;
      if (options.publicKey) contact.publicKey = options.publicKey;
    } else {
      // Enforce size limit
      if (this.potentialContacts.size >= SilentMeshManager.MAX_POTENTIAL_CONTACTS) {
        this.pruneOldPotentialContacts();
      }

      // Create new potential contact
      contact = {
        peerId: normalizedId,
        displayName: options.displayName,
        publicKey: options.publicKey,
        discoveredAt: Date.now(),
        discoverySource: options.discoverySource || 'mesh',
        hasMessaged: false,
        messageCount: 0,
        promoted: false,
      };

      this.potentialContacts.set(normalizedId, contact);

      console.log(`[SilentMesh] 👤 Recorded potential contact: ${normalizedId.substring(0, 8)}...`);

      // Notify callback
      this.onPotentialContactDiscoveredCallback?.(contact);
    }

    return contact;
  }

  /**
   * Record that a potential contact has messaged us
   * This still does NOT create a UI contact automatically
   */
  recordIncomingMessage(peerId: string): void {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();
    const contact = this.potentialContacts.get(normalizedId);

    if (contact) {
      contact.hasMessaged = true;
      contact.messageCount++;
    } else {
      // Create potential contact record
      this.recordPotentialContact(normalizedId, {
        discoverySource: 'incoming_message',
      }).catch(console.error);
    }
  }

  /**
   * Mark a potential contact as promoted to a real contact
   * Called when user explicitly adds them or accepts their message
   */
  markAsPromoted(peerId: string): void {
    const normalizedId = peerId.replace(/\s/g, '').toUpperCase();
    const contact = this.potentialContacts.get(normalizedId);

    if (contact) {
      contact.promoted = true;
      console.log(`[SilentMesh] ⬆️ Promoted to contact: ${normalizedId.substring(0, 8)}...`);
    }
  }

  /**
   * Get potential contacts that have messaged us but aren't promoted
   * These are "message requests" in the UI
   */
  getPendingMessageRequests(): PotentialSocialContact[] {
    return Array.from(this.potentialContacts.values())
      .filter(c => c.hasMessaged && !c.promoted);
  }

  /**
   * Get all potential contacts
   */
  getPotentialContacts(): PotentialSocialContact[] {
    return Array.from(this.potentialContacts.values());
  }

  // ===== WATERING HOLE DELIVERY =====

  /**
   * Store a message for watering hole delivery
   * If destination is offline, store message and attempt delivery when
   * they appear at a known gateway
   */
  async storeWateringHoleMessage(
    messageId: string,
    destinationPeerId: string,
    message: Uint8Array,
    gatewayIds: string[] = []
  ): Promise<void> {
    // Enforce size limit
    if (this.wateringHoleQueue.size >= SilentMeshManager.MAX_WATERING_HOLE_MESSAGES) {
      this.pruneExpiredWateringHoleMessages();

      // If still over limit, remove oldest
      if (this.wateringHoleQueue.size >= SilentMeshManager.MAX_WATERING_HOLE_MESSAGES) {
        const oldest = Array.from(this.wateringHoleQueue.entries())
          .sort((a, b) => a[1].storedAt - b[1].storedAt)[0];
        if (oldest) {
          this.wateringHoleQueue.delete(oldest[0]);
        }
      }
    }

    const now = Date.now();
    const normalizedDestination = destinationPeerId.replace(/\s/g, '').toUpperCase();

    // Get gateways from ledger if not provided
    if (gatewayIds.length === 0) {
      const node = await this.ledger.getNode(normalizedDestination);
      if (node?.gatewayId) {
        gatewayIds = [node.gatewayId];
      }
    }

    this.wateringHoleQueue.set(messageId, {
      messageId,
      destinationPeerId: normalizedDestination,
      message,
      storedAt: now,
      expiresAt: now + SilentMeshManager.WATERING_HOLE_TTL,
      gatewayIds,
      deliveryAttempts: 0,
    });

    console.log(`[SilentMesh] 💧 Stored watering hole message for ${normalizedDestination.substring(0, 8)}... (gateways: ${gatewayIds.length})`);
  }

  /**
   * Check for watering hole messages when a peer connects
   * Returns messages that should be attempted for delivery through this peer
   */
  async checkWateringHoleDelivery(connectedPeerId: string): Promise<WateringHoleMessage[]> {
    const normalizedPeerId = connectedPeerId.replace(/\s/g, '').toUpperCase();
    const messagesToDeliver: WateringHoleMessage[] = [];
    const now = Date.now();

    for (const [id, whMessage] of this.wateringHoleQueue) {
      // Check if expired
      if (whMessage.expiresAt < now) {
        this.wateringHoleQueue.delete(id);
        continue;
      }

      // Direct delivery: connected peer IS the destination
      if (whMessage.destinationPeerId === normalizedPeerId) {
        messagesToDeliver.push(whMessage);
        continue;
      }

      // Gateway relay: connected peer is a known gateway for destination
      if (whMessage.gatewayIds.includes(normalizedPeerId)) {
        messagesToDeliver.push(whMessage);
      }
    }

    if (messagesToDeliver.length > 0) {
      console.log(`[SilentMesh] 💧 Found ${messagesToDeliver.length} watering hole messages for delivery via ${normalizedPeerId.substring(0, 8)}...`);
    }

    return messagesToDeliver;
  }

  /**
   * Mark a watering hole message as delivered (remove from queue)
   */
  markWateringHoleDelivered(messageId: string): void {
    this.wateringHoleQueue.delete(messageId);
    console.log(`[SilentMesh] ✅ Watering hole message delivered: ${messageId}`);
  }

  /**
   * Increment delivery attempt counter
   */
  incrementWateringHoleAttempt(messageId: string): void {
    const message = this.wateringHoleQueue.get(messageId);
    if (message) {
      message.deliveryAttempts++;
    }
  }

  /**
   * Get pending watering hole messages count
   */
  getWateringHoleCount(): number {
    return this.wateringHoleQueue.size;
  }

  // ===== LIGHT PING PROTOCOL =====

  /**
   * Get nodes for Light Ping on startup
   * Returns recently active nodes from the ledger for quick reconnection
   */
  async getLightPingTargets(limit: number = 20): Promise<KnownNode[]> {
    return this.ledger.getRecentlyActiveNodes(24 * 60 * 60 * 1000).then(
      nodes => nodes.slice(0, limit)
    );
  }

  /**
   * LIGHT PING PROTOCOL
   *
   * Perform lightweight checks against known nodes from the Eternal Ledger.
   * This is called on startup to quickly bootstrap into the existing mesh.
   *
   * @param connectCallback - Function to attempt connection to a peer
   * @param maxParallel - Maximum parallel connection attempts (default: 5)
   * @returns Results of the Light Ping attempts
   */
  async performLightPing(
    connectCallback: (peerId: string) => Promise<boolean>,
    maxParallel: number = 5
  ): Promise<{ attempted: number; successful: number; nodes: string[] }> {
    const targets = await this.getLightPingTargets(20);

    if (targets.length === 0) {
      console.log('[SilentMesh] 📡 Light Ping: No known nodes in ledger');
      return { attempted: 0, successful: 0, nodes: [] };
    }

    console.log(`[SilentMesh] 📡 Light Ping: Attempting to reach ${targets.length} known nodes...`);

    const results = {
      attempted: 0,
      successful: 0,
      nodes: [] as string[],
    };

    // Process in batches to limit parallel connections
    for (let i = 0; i < targets.length; i += maxParallel) {
      const batch = targets.slice(i, i + maxParallel);

      const batchResults = await Promise.allSettled(
        batch.map(async (node) => {
          results.attempted++;

          try {
            const success = await connectCallback(node.nodeId);

            if (success) {
              results.successful++;
              results.nodes.push(node.nodeId);

              // Update ledger with successful connection
              await this.ledger.recordNodeSighting(node.nodeId, {
                publicKey: node.publicKey,
                connectionSuccessful: true,
              });

              console.log(`[SilentMesh] 📡 Light Ping SUCCESS: ${node.nodeId.substring(0, 8)}...`);
            } else {
              // Update ledger with failed connection
              await this.ledger.recordNodeSighting(node.nodeId, {
                connectionSuccessful: false,
              });
            }

            return success;
          } catch (error) {
            console.warn(`[SilentMesh] 📡 Light Ping FAILED: ${node.nodeId.substring(0, 8)}...`, error);

            // Update ledger with failed connection
            await this.ledger.recordNodeSighting(node.nodeId, {
              connectionSuccessful: false,
            });

            return false;
          }
        })
      );

      // Small delay between batches to avoid flooding
      if (i + maxParallel < targets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`[SilentMesh] 📡 Light Ping complete: ${results.successful}/${results.attempted} nodes responded`);

    return results;
  }

  /**
   * Get reliable nodes for bootstrap
   */
  async getReliableBootstrapNodes(limit: number = 10): Promise<KnownNode[]> {
    return this.ledger.getReliableNodes(limit);
  }

  // ===== DEVICE PROFILE AWARENESS =====

  /**
   * Get discovery configuration based on device profile
   * Throttles discovery assertiveness based on power state and network conditions
   */
  getDiscoveryConfig(): {
    pollInterval: number;      // How often to poll for peers (ms)
    maxParallelConnections: number;
    enableAggressiveDiscovery: boolean;
    lightPingEnabled: boolean;
    lightPingInterval: number;  // How often to run Light Ping (ms)
  } {
    // Detect power profile
    const isBattery = this.detectBatteryMode();
    const isLowPower = this.detectLowPowerMode();

    if (isLowPower) {
      // Low Power Mode: Minimal activity
      return {
        pollInterval: 60000,        // 1 minute
        maxParallelConnections: 2,
        enableAggressiveDiscovery: false,
        lightPingEnabled: true,
        lightPingInterval: 300000,  // 5 minutes
      };
    }

    if (isBattery) {
      // Battery Mode: Conservative
      return {
        pollInterval: 30000,        // 30 seconds
        maxParallelConnections: 3,
        enableAggressiveDiscovery: false,
        lightPingEnabled: true,
        lightPingInterval: 120000,  // 2 minutes
      };
    }

    // Plugged In: Aggressive
    return {
      pollInterval: 5000,           // 5 seconds
      maxParallelConnections: 10,
      enableAggressiveDiscovery: true,
      lightPingEnabled: true,
      lightPingInterval: 60000,     // 1 minute
    };
  }

  /**
   * Detect if device is running on battery
   */
  private detectBatteryMode(): boolean {
    // Check for Battery API (browser)
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      // Note: Battery API is async, so this is a best-effort sync check
      // In practice, you'd want to cache the battery status
      return false; // Default to plugged in if we can't determine
    }

    // Node.js or environment without battery API
    return false;
  }

  /**
   * Detect if device is in low power mode
   */
  private detectLowPowerMode(): boolean {
    // Check for reduce motion preference (often correlates with low power mode)
    if (typeof window !== 'undefined' && window.matchMedia) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (reducedMotion.matches) {
        return true;
      }
    }

    // Check for memory pressure (if available)
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      const memory = (navigator as any).deviceMemory;
      if (memory && memory < 2) {
        return true; // Low memory device, assume low power
      }
    }

    return false;
  }

  // ===== STATISTICS =====

  /**
   * Get Silent Mesh statistics
   */
  async getStats(): Promise<SilentMeshStats> {
    const ledgerStats = await this.ledger.getStats();

    let totalRelayedBytes = 0;
    let activeConnections = 0;

    for (const neighbor of this.meshNeighbors.values()) {
      totalRelayedBytes += neighbor.bytesRelayed;
      if (neighbor.connectionQuality !== 'offline') {
        activeConnections++;
      }
    }

    return {
      meshNeighbors: this.meshNeighbors.size,
      potentialContacts: this.potentialContacts.size,
      totalRelayedBytes,
      ledgerNodes: ledgerStats.totalNodes,
      activeConnections,
    };
  }

  // ===== CALLBACKS =====

  onMeshNeighborConnected(callback: (neighbor: MeshNeighbor) => void): void {
    this.onMeshNeighborConnectedCallback = callback;
  }

  onMeshNeighborDisconnected(callback: (peerId: string) => void): void {
    this.onMeshNeighborDisconnectedCallback = callback;
  }

  onPotentialContactDiscovered(callback: (contact: PotentialSocialContact) => void): void {
    this.onPotentialContactDiscoveredCallback = callback;
  }

  // ===== INTERNAL HELPERS =====

  private pruneInactiveNeighbors(): void {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    const toRemove: string[] = [];

    for (const [id, neighbor] of this.meshNeighbors) {
      if (now - neighbor.lastActivity > inactiveThreshold) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.meshNeighbors.delete(id);
    }

    if (toRemove.length > 0) {
      console.log(`[SilentMesh] Pruned ${toRemove.length} inactive neighbors`);
    }
  }

  private pruneOldPotentialContacts(): void {
    const toRemove: string[] = [];

    // Remove old non-promoted contacts that haven't messaged
    for (const [id, contact] of this.potentialContacts) {
      if (!contact.promoted && !contact.hasMessaged) {
        toRemove.push(id);
      }
    }

    // Sort by age and remove oldest
    const sortedToRemove = toRemove
      .map(id => ({ id, contact: this.potentialContacts.get(id)! }))
      .sort((a, b) => a.contact.discoveredAt - b.contact.discoveredAt)
      .slice(0, 100);

    for (const { id } of sortedToRemove) {
      this.potentialContacts.delete(id);
    }

    if (sortedToRemove.length > 0) {
      console.log(`[SilentMesh] Pruned ${sortedToRemove.length} old potential contacts`);
    }
  }

  private pruneExpiredWateringHoleMessages(): void {
    const now = Date.now();
    let pruned = 0;

    for (const [id, message] of this.wateringHoleQueue) {
      if (message.expiresAt < now) {
        this.wateringHoleQueue.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      console.log(`[SilentMesh] Pruned ${pruned} expired watering hole messages`);
    }
  }

  /**
   * Get the Eternal Ledger instance
   */
  getLedger(): EternalLedger {
    return this.ledger;
  }

  /**
   * Reset mesh state (NOT the ledger - that persists)
   */
  reset(): void {
    this.meshNeighbors.clear();
    this.potentialContacts.clear();
    this.wateringHoleQueue.clear();
    console.log('[SilentMesh] Mesh state reset (ledger preserved)');
  }
}
