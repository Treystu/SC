/**
 * Tests for Enhanced Peer Discovery
 */

import {
  EnhancedPeerDiscovery,
  DiscoveryMethod,
  DEFAULT_DISCOVERY_CONFIG,
} from "./enhanced";
import { type NodeCapabilities } from "../node/capabilities";
import { NATType } from "../nat/NATDetector";
import { type PeerAddress } from "../mesh/dht/records";

const MOCK_CAPABILITIES: NodeCapabilities = {
  hasPublicIP: true,
  isAlwaysOn: true,
  bandwidth: "high",
  storage: 1000,
  batteryPowered: false,
  natType: NATType.OPEN,
  publicIP: "1.2.3.4",
  canSignal: true,
  canRelay: true,
  canStore: true,
  canDHT: true,
  lastChecked: Date.now(),
  connectionQuality: 100,
  maxConnections: 100,
};

describe("EnhancedPeerDiscovery", () => {
  let discovery: EnhancedPeerDiscovery;

  beforeEach(() => {
    discovery = new EnhancedPeerDiscovery();
    // Clear any timers
    discovery.stop();
  });

  afterEach(() => {
    discovery.stop();
  });

  describe("Cache Management", () => {
    it("should cache and retrieve peers", async () => {
      const peerId = "TEST_PEER_1";
      const addresses: PeerAddress[] = [
        { type: "tcp", address: "127.0.0.1:8080", priority: 1, active: true },
      ];

      const peer = discovery.addManualPeer(peerId, addresses);
      expect(peer).toBeDefined();
      expect(peer.peerId).toBe(peerId);
      expect(peer.discoveryMethod).toBe(DiscoveryMethod.MANUAL);

      const found = await discovery.findPeer(peerId);
      expect(found).toBeDefined();
      expect(found?.peerId).toBe(peerId);
    });

    it("should respect cache TTL", async () => {
      const shortTTLConfig = { ...DEFAULT_DISCOVERY_CONFIG, cacheTTL: 100 };
      const shortDiscovery = new EnhancedPeerDiscovery(shortTTLConfig);

      const peerId = "TEST_PEER_TTL";
      const addresses: PeerAddress[] = [
        { type: "tcp", address: "127.0.0.1:8080", priority: 1, active: true },
      ];

      shortDiscovery.addManualPeer(peerId, addresses);

      // Should be found immediately
      let found = await shortDiscovery.findPeer(peerId);
      expect(found).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      found = await shortDiscovery.findPeer(peerId);
      expect(found).toBeNull();
    });

    it("should enforce max cache size", () => {
      const maxTwoConfig = { ...DEFAULT_DISCOVERY_CONFIG, maxCachedPeers: 2 };
      const limitedDiscovery = new EnhancedPeerDiscovery(maxTwoConfig);

      const addresses: PeerAddress[] = [
        { type: "tcp", address: "127.0.0.1:8080", priority: 1, active: true },
      ];

      limitedDiscovery.addManualPeer("PEER_1", addresses);
      limitedDiscovery.addManualPeer("PEER_2", addresses);
      limitedDiscovery.addManualPeer("PEER_3", addresses);

      // Should have evicted one (likely PEER_1 as it was oldest)
      const stats = limitedDiscovery.getStats();
      expect(stats.cachedPeers).toBe(2);
    });
  });

  describe("Local Peer Discovery", () => {
    it("should manage local peers", async () => {
      const peerId = "LOCAL_PEER";
      const addresses: PeerAddress[] = [
        {
          type: "wifi-direct",
          address: "192.168.1.5:3000",
          priority: 1,
          active: true,
        },
      ];
      const capabilities: NodeCapabilities = {
        ...MOCK_CAPABILITIES,
        canStore: false, // Variation
      };

      const peer = {
        peerId,
        addresses,
        capabilities,
        discoveryMethod: DiscoveryMethod.LOCAL,
        discoveredAt: Date.now(),
        lastVerified: Date.now(),
        confidence: 100,
      };

      discovery.addLocalPeer(peer);

      const found = await discovery.findPeer(peerId);
      expect(found).toBeDefined();
      expect(found?.discoveryMethod).toBe(DiscoveryMethod.LOCAL);

      const localPeers = discovery.getLocalPeers();
      expect(localPeers).toContainEqual(peer);
    });
  });

  describe("Capability Search", () => {
    it("should find peers with specific capabilities", async () => {
      const addresses: PeerAddress[] = [
        { type: "tcp", address: "1.1.1.1:80", priority: 1, active: true },
      ];

      const relayPeer = {
        peerId: "RELAY_PEER",
        addresses,
        capabilities: {
          ...MOCK_CAPABILITIES,
          canRelay: true,
          canSignal: false,
          canStore: false,
        },
        discoveryMethod: DiscoveryMethod.MANUAL,
        discoveredAt: Date.now(),
        lastVerified: Date.now(),
        confidence: 100,
      };

      const storagePeer = {
        peerId: "STORE_PEER",
        addresses,
        capabilities: {
          ...MOCK_CAPABILITIES,
          canRelay: false,
          canSignal: false,
          canStore: true,
        },
        discoveryMethod: DiscoveryMethod.MANUAL,
        discoveredAt: Date.now(),
        lastVerified: Date.now(),
        confidence: 100,
      };

      // We need to inject these into cache/local
      // Using addLocalPeer as it updates cache
      discovery.addLocalPeer(relayPeer);
      discovery.addLocalPeer(storagePeer);

      const relays = await discovery.findCapablePeers({ canRelay: true });
      expect(relays.length).toBe(1);
      expect(relays[0].peerId).toBe("RELAY_PEER");

      const stores = await discovery.findCapablePeers({ canStore: true });
      expect(stores.length).toBe(1);
      expect(stores[0].peerId).toBe("STORE_PEER");
    });
  });

  describe("Bootstrap Peers", () => {
    it("should load bootstrap peers", async () => {
      const bootstrapPeer = {
        peerId: "BOOTSTRAP_1",
        addresses: [],
        capabilities: null,
        discoveryMethod: DiscoveryMethod.BOOTSTRAP,
        discoveredAt: Date.now(),
        lastVerified: Date.now(),
        confidence: 100,
      };

      const bootstrapDiscovery = new EnhancedPeerDiscovery({
        bootstrapPeers: [bootstrapPeer],
      });

      const found = await bootstrapDiscovery.findPeer("BOOTSTRAP_1");
      expect(found).toBeDefined();
      expect(found?.peerId).toBe("BOOTSTRAP_1");
    });
  });
});
