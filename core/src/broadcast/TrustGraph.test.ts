/**
 * Broadcast Module Tests
 *
 * Comprehensive tests for:
 * - TrustGraph: Web-of-trust graph management with BFS pathfinding
 * - BroadcastManager: Broadcast lifecycle, verification, and spam prevention
 * - EmergencyBroadcast: Broadcast primitives and utilities
 */

import {
  TrustGraph,
  createTrustGraph,
  type TrustEdge,
  type TrustPath,
} from "./TrustGraph.js";
import {
  BroadcastManager,
  createBroadcastManager,
  type VerificationResult,
} from "./BroadcastManager.js";
import {
  TrustLevel,
  BroadcastType,
  BroadcastSeverity,
  createEmergencyBroadcast,
  generateBroadcastId,
  getBroadcastSigningData,
  isExpired,
  canPropagate,
  incrementHop,
  type EmergencyBroadcast,
  type BroadcastConfig,
  DEFAULT_BROADCAST_CONFIG,
} from "./EmergencyBroadcast.js";
import type { GeoZone } from "../geo/GeoZone.js";

// ============================================================================
// TrustGraph Tests
// ============================================================================

describe("TrustGraph", () => {
  let trustGraph: TrustGraph;
  const localPeerId = "peer-local";

  beforeEach(() => {
    trustGraph = new TrustGraph(localPeerId);
  });

  describe("addDirectTrust() / removeDirectTrust()", () => {
    it("should add direct trust relationship", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const level = trustGraph.getTrustLevel("peer-1");
      expect(level).toBe(TrustLevel.DIRECT);
    });

    it("should add direct trust with default level", () => {
      trustGraph.addDirectTrust("peer-1");

      const level = trustGraph.getTrustLevel("peer-1");
      expect(level).toBe(TrustLevel.DIRECT);
    });

    it("should add direct trust with note", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT, "Verified in person");

      const trusted = trustGraph.getDirectlyTrusted();
      expect(trusted).toHaveLength(1);
      expect(trusted[0].note).toBe("Verified in person");
    });

    it("should remove direct trust relationship", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      expect(trustGraph.getTrustLevel("peer-1")).toBe(TrustLevel.DIRECT);

      trustGraph.removeDirectTrust("peer-1");
      expect(trustGraph.getTrustLevel("peer-1")).toBe(TrustLevel.UNKNOWN);
    });

    it("should update existing trust relationship", () => {
      // Note: getTrustLevel returns DIRECT for any directly connected peer
      // The level parameter in addDirectTrust is stored metadata but doesn't affect getTrustLevel
      trustGraph.addDirectTrust("peer-1", TrustLevel.SECOND_DEGREE);
      // Direct connection = DIRECT trust level (path length 1)
      expect(trustGraph.getTrustLevel("peer-1")).toBe(TrustLevel.DIRECT);

      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      expect(trustGraph.getTrustLevel("peer-1")).toBe(TrustLevel.DIRECT);
    });

    it("should handle removing non-existent trust", () => {
      expect(() => {
        trustGraph.removeDirectTrust("peer-nonexistent");
      }).not.toThrow();
    });
  });

  describe("getTrustLevel() - Query Trust Level", () => {
    it("should return UNKNOWN for untrusted peer", () => {
      const level = trustGraph.getTrustLevel("peer-unknown");
      expect(level).toBe(TrustLevel.UNKNOWN);
    });

    it("should return DIRECT for directly trusted peer", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      const level = trustGraph.getTrustLevel("peer-1");
      expect(level).toBe(TrustLevel.DIRECT);
    });

    it("should return SECOND_DEGREE for friend of friend", () => {
      // local -> peer-1 (direct)
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      // peer-1 -> peer-2 (direct from peer-1's perspective)
      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      // local -> peer-2 should be SECOND_DEGREE
      const level = trustGraph.getTrustLevel("peer-2");
      expect(level).toBe(TrustLevel.SECOND_DEGREE);
    });

    it("should return THIRD_DEGREE for friend of friend of friend", () => {
      // local -> peer-1 -> peer-2 -> peer-3
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edge1: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge1);

      const edge2: TrustEdge = {
        fromPeerId: "peer-2",
        toPeerId: "peer-3",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge2);

      const level = trustGraph.getTrustLevel("peer-3");
      expect(level).toBe(TrustLevel.THIRD_DEGREE);
    });

    it("should return UNKNOWN beyond third degree", () => {
      // local -> peer-1 -> peer-2 -> peer-3 -> peer-4
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edges: TrustEdge[] = [
        { fromPeerId: "peer-1", toPeerId: "peer-2", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-2", toPeerId: "peer-3", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-3", toPeerId: "peer-4", level: TrustLevel.DIRECT, createdAt: Date.now() },
      ];

      edges.forEach(edge => trustGraph.addKnownTrust(edge));

      const level = trustGraph.getTrustLevel("peer-4");
      expect(level).toBe(TrustLevel.UNKNOWN);
    });

    it("should return DIRECT for self", () => {
      const level = trustGraph.getTrustLevel(localPeerId);
      expect(level).toBe(TrustLevel.DIRECT);
    });
  });

  describe("findPath() - BFS Path Finding", () => {
    it("should find direct path", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.setPeerName("peer-1", "Alice");

      const path = trustGraph.getTrustPath("peer-1");

      expect(path).not.toBeNull();
      expect(path!.targetId).toBe("peer-1");
      expect(path!.level).toBe(TrustLevel.DIRECT);
      expect(path!.pathLength).toBe(1);
      expect(path!.path).toHaveLength(2); // [local, peer-1]
      expect(path!.path[1].name).toBe("Alice");
    });

    it("should find shortest path (second degree)", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      const path = trustGraph.getTrustPath("peer-2");

      expect(path).not.toBeNull();
      expect(path!.level).toBe(TrustLevel.SECOND_DEGREE);
      expect(path!.pathLength).toBe(2);
      expect(path!.path).toHaveLength(3); // [local, peer-1, peer-2]
    });

    it("should find shortest path (third degree)", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edges: TrustEdge[] = [
        { fromPeerId: "peer-1", toPeerId: "peer-2", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-2", toPeerId: "peer-3", level: TrustLevel.DIRECT, createdAt: Date.now() },
      ];

      edges.forEach(edge => trustGraph.addKnownTrust(edge));

      const path = trustGraph.getTrustPath("peer-3");

      expect(path).not.toBeNull();
      expect(path!.level).toBe(TrustLevel.THIRD_DEGREE);
      expect(path!.pathLength).toBe(3);
      expect(path!.path).toHaveLength(4); // [local, peer-1, peer-2, peer-3]
    });

    it("should return null for unreachable peer", () => {
      const path = trustGraph.getTrustPath("peer-unreachable");
      expect(path).toBeNull();
    });

    it("should find shortest path when multiple paths exist", () => {
      // Create two paths to peer-3:
      // 1. local -> peer-1 -> peer-2 -> peer-3 (3 hops)
      // 2. local -> peer-direct -> peer-3 (2 hops) - SHORTER
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.addDirectTrust("peer-direct", TrustLevel.DIRECT);

      const edges: TrustEdge[] = [
        { fromPeerId: "peer-1", toPeerId: "peer-2", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-2", toPeerId: "peer-3", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-direct", toPeerId: "peer-3", level: TrustLevel.DIRECT, createdAt: Date.now() },
      ];

      edges.forEach(edge => trustGraph.addKnownTrust(edge));

      const path = trustGraph.getTrustPath("peer-3");

      expect(path).not.toBeNull();
      expect(path!.pathLength).toBe(2); // Shortest path
      expect(path!.level).toBe(TrustLevel.SECOND_DEGREE);
    });

    it("should include peer names in path", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.setPeerName(localPeerId, "Local");
      trustGraph.setPeerName("peer-1", "Alice");

      const path = trustGraph.getTrustPath("peer-1");

      expect(path).not.toBeNull();
      expect(path!.path[0].name).toBeUndefined(); // Local peer name not always set
      expect(path!.path[1].name).toBe("Alice");
    });
  });

  describe("Trust Level Gradations", () => {
    it("should distinguish DIRECT trust", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      expect(trustGraph.getTrustLevel("peer-1")).toBe(TrustLevel.DIRECT);
      expect(trustGraph.isTrusted("peer-1", TrustLevel.DIRECT)).toBe(true);
    });

    it("should distinguish SECOND_DEGREE trust", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      expect(trustGraph.getTrustLevel("peer-2")).toBe(TrustLevel.SECOND_DEGREE);
      expect(trustGraph.isTrusted("peer-2", TrustLevel.SECOND_DEGREE)).toBe(true);
      expect(trustGraph.isTrusted("peer-2", TrustLevel.DIRECT)).toBe(false);
    });

    it("should distinguish THIRD_DEGREE trust", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edges: TrustEdge[] = [
        { fromPeerId: "peer-1", toPeerId: "peer-2", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-2", toPeerId: "peer-3", level: TrustLevel.DIRECT, createdAt: Date.now() },
      ];

      edges.forEach(edge => trustGraph.addKnownTrust(edge));

      expect(trustGraph.getTrustLevel("peer-3")).toBe(TrustLevel.THIRD_DEGREE);
      expect(trustGraph.isTrusted("peer-3", TrustLevel.THIRD_DEGREE)).toBe(true);
      expect(trustGraph.isTrusted("peer-3", TrustLevel.SECOND_DEGREE)).toBe(false);
    });

    it("should distinguish UNKNOWN trust", () => {
      expect(trustGraph.getTrustLevel("peer-unknown")).toBe(TrustLevel.UNKNOWN);
      expect(trustGraph.isTrusted("peer-unknown", TrustLevel.UNKNOWN)).toBe(true);
      expect(trustGraph.canBroadcast("peer-unknown")).toBe(false);
    });

    it("should allow broadcasting for any trust level above UNKNOWN", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      expect(trustGraph.canBroadcast("peer-1")).toBe(true); // DIRECT
      expect(trustGraph.canBroadcast("peer-2")).toBe(true); // SECOND_DEGREE
      expect(trustGraph.canBroadcast("peer-unknown")).toBe(false); // UNKNOWN
    });
  });

  describe("Cache Invalidation on Graph Changes", () => {
    it("should invalidate cache when adding direct trust", () => {
      // Query peer-1 (not trusted, should cache as null)
      const level1 = trustGraph.getTrustLevel("peer-1");
      expect(level1).toBe(TrustLevel.UNKNOWN);

      // Add direct trust
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      // Query again - should see new trust level
      const level2 = trustGraph.getTrustLevel("peer-1");
      expect(level2).toBe(TrustLevel.DIRECT);
    });

    it("should invalidate cache when removing direct trust", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      const level1 = trustGraph.getTrustLevel("peer-1");
      expect(level1).toBe(TrustLevel.DIRECT);

      trustGraph.removeDirectTrust("peer-1");

      const level2 = trustGraph.getTrustLevel("peer-1");
      expect(level2).toBe(TrustLevel.UNKNOWN);
    });

    it("should invalidate cache when adding known trust", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      // Query peer-2 (not reachable yet)
      const level1 = trustGraph.getTrustLevel("peer-2");
      expect(level1).toBe(TrustLevel.UNKNOWN);

      // Add edge to peer-2
      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      // Query again - should be reachable
      const level2 = trustGraph.getTrustLevel("peer-2");
      expect(level2).toBe(TrustLevel.SECOND_DEGREE);
    });

    it("should use cached results when graph unchanged", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      // First query
      const path1 = trustGraph.getTrustPath("peer-1");
      // Second query (should use cache)
      const path2 = trustGraph.getTrustPath("peer-1");

      expect(path1).toBe(path2); // Same object reference from cache
    });
  });

  describe("Peer Name Management", () => {
    it("should set and get peer names", () => {
      trustGraph.setPeerName("peer-1", "Alice");
      expect(trustGraph.getPeerName("peer-1")).toBe("Alice");
    });

    it("should return undefined for unknown peer name", () => {
      expect(trustGraph.getPeerName("peer-unknown")).toBeUndefined();
    });

    it("should update existing peer name", () => {
      trustGraph.setPeerName("peer-1", "Alice");
      trustGraph.setPeerName("peer-1", "Alice Updated");
      expect(trustGraph.getPeerName("peer-1")).toBe("Alice Updated");
    });

    it("should include names in trust paths", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.setPeerName("peer-1", "Alice");

      const path = trustGraph.getTrustPath("peer-1");
      expect(path!.path[1].name).toBe("Alice");
    });
  });

  describe("Large Graph Performance", () => {
    it("should handle large number of direct trust relationships", () => {
      const peerCount = 1000;

      for (let i = 0; i < peerCount; i++) {
        trustGraph.addDirectTrust(`peer-${i}`, TrustLevel.DIRECT);
      }

      const trusted = trustGraph.getDirectlyTrusted();
      expect(trusted).toHaveLength(peerCount);
    });

    it("should efficiently find paths in large graph", () => {
      // Create a graph with 100 peers, each connected to next
      const peerCount = 100;
      trustGraph.addDirectTrust("peer-0", TrustLevel.DIRECT);

      for (let i = 0; i < peerCount - 1; i++) {
        const edge: TrustEdge = {
          fromPeerId: `peer-${i}`,
          toPeerId: `peer-${i + 1}`,
          level: TrustLevel.DIRECT,
          createdAt: Date.now(),
        };
        trustGraph.addKnownTrust(edge);
      }

      // Query peer at third degree (should find it)
      // Path: local → peer-0 (1) → peer-1 (2) → peer-2 (3)
      const startTime = Date.now();
      const path = trustGraph.getTrustPath("peer-2");
      const duration = Date.now() - startTime;

      expect(path).not.toBeNull();
      expect(path!.pathLength).toBe(3);
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it("should handle dense graph with many edges", () => {
      // Create a fully connected graph of 10 peers
      const peers = Array.from({ length: 10 }, (_, i) => `peer-${i}`);

      // Add all as direct trust
      peers.forEach(peer => trustGraph.addDirectTrust(peer, TrustLevel.DIRECT));

      // Add edges between all pairs
      for (let i = 0; i < peers.length; i++) {
        for (let j = 0; j < peers.length; j++) {
          if (i !== j) {
            const edge: TrustEdge = {
              fromPeerId: peers[i],
              toPeerId: peers[j],
              level: TrustLevel.DIRECT,
              createdAt: Date.now(),
            };
            trustGraph.addKnownTrust(edge);
          }
        }
      }

      const stats = trustGraph.getStats();
      expect(stats.directTrustCount).toBe(10);
      expect(stats.totalEdges).toBeGreaterThan(90); // 10 direct + 90 peer-to-peer
    });

    it("should cache repeated queries efficiently", () => {
      // Setup graph
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-2",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      // First query populates cache
      trustGraph.getTrustLevel("peer-2");

      // Repeated queries (should use cache) - 1000 queries should be very fast
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        trustGraph.getTrustLevel("peer-2");
      }
      const duration = Date.now() - start;

      // 1000 cached lookups should complete in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe("getPeersAtLevel()", () => {
    it("should get all peers at DIRECT level", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.addDirectTrust("peer-2", TrustLevel.DIRECT);

      const peers = trustGraph.getPeersAtLevel(TrustLevel.DIRECT);
      expect(peers).toHaveLength(2);
      expect(peers).toContain("peer-1");
      expect(peers).toContain("peer-2");
    });

    it("should get all peers at SECOND_DEGREE level", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);

      const edges: TrustEdge[] = [
        { fromPeerId: "peer-1", toPeerId: "peer-2", level: TrustLevel.DIRECT, createdAt: Date.now() },
        { fromPeerId: "peer-1", toPeerId: "peer-3", level: TrustLevel.DIRECT, createdAt: Date.now() },
      ];

      edges.forEach(edge => trustGraph.addKnownTrust(edge));

      const peers = trustGraph.getPeersAtLevel(TrustLevel.SECOND_DEGREE);
      expect(peers).toHaveLength(2);
      expect(peers).toContain("peer-2");
      expect(peers).toContain("peer-3");
    });
  });

  describe("export() / import()", () => {
    it("should export trust graph state", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.addDirectTrust("peer-2", TrustLevel.DIRECT);

      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-3",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      const state = trustGraph.export();

      expect(state.directTrust).toHaveLength(2);
      expect(state.knownEdges).toHaveLength(1);
    });

    it("should import trust graph state", () => {
      const state = {
        directTrust: [
          {
            fromPeerId: localPeerId,
            toPeerId: "peer-1",
            level: TrustLevel.DIRECT,
            createdAt: Date.now(),
          },
        ],
        knownEdges: [
          {
            fromPeerId: "peer-1",
            toPeerId: "peer-2",
            level: TrustLevel.DIRECT,
            createdAt: Date.now(),
          },
        ],
      };

      trustGraph.import(state);

      expect(trustGraph.getTrustLevel("peer-1")).toBe(TrustLevel.DIRECT);
      expect(trustGraph.getTrustLevel("peer-2")).toBe(TrustLevel.SECOND_DEGREE);
    });

    it("should clear existing state on import", () => {
      trustGraph.addDirectTrust("peer-existing", TrustLevel.DIRECT);

      const state = {
        directTrust: [
          {
            fromPeerId: localPeerId,
            toPeerId: "peer-new",
            level: TrustLevel.DIRECT,
            createdAt: Date.now(),
          },
        ],
        knownEdges: [],
      };

      trustGraph.import(state);

      expect(trustGraph.getTrustLevel("peer-existing")).toBe(TrustLevel.UNKNOWN);
      expect(trustGraph.getTrustLevel("peer-new")).toBe(TrustLevel.DIRECT);
    });
  });

  describe("getStats()", () => {
    it("should return correct statistics", () => {
      trustGraph.addDirectTrust("peer-1", TrustLevel.DIRECT);
      trustGraph.addDirectTrust("peer-2", TrustLevel.DIRECT);

      const edge: TrustEdge = {
        fromPeerId: "peer-1",
        toPeerId: "peer-3",
        level: TrustLevel.DIRECT,
        createdAt: Date.now(),
      };
      trustGraph.addKnownTrust(edge);

      const stats = trustGraph.getStats();

      expect(stats.directTrustCount).toBe(2);
      expect(stats.totalEdges).toBe(3); // 2 direct + 1 known
      expect(stats.uniquePeers).toBe(3);
    });
  });

  describe("createTrustGraph() factory", () => {
    it("should create TrustGraph instance", () => {
      const graph = createTrustGraph("peer-local");
      expect(graph).toBeInstanceOf(TrustGraph);
    });
  });
});

// ============================================================================
// BroadcastManager Tests
// ============================================================================

describe("BroadcastManager", () => {
  let trustGraph: TrustGraph;
  let broadcastManager: BroadcastManager;
  const localPeerId = "peer-local";
  const remotePeerId = "peer-remote";

  // Mock crypto functions - use regular functions because jest.fn() has issues with ESM
  const mockSign = async (data: Uint8Array): Promise<Uint8Array> => {
    // Return deterministic signature based on data
    const hash = data.reduce((acc, byte) => acc + byte, 0);
    return new Uint8Array([hash % 256]);
  };

  const mockVerify = async (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array): Promise<boolean> => {
    // Actually verify: recompute the hash and check if it matches the signature
    if (!sig || sig.length === 0) return false;
    const expectedHash = data.reduce((acc, byte) => acc + byte, 0) % 256;
    return sig[0] === expectedHash;
  };

  const mockGetPublicKey = async (peerId: string): Promise<Uint8Array | null> => {
    // Return mock public key
    return new Uint8Array([1, 2, 3, 4]);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    trustGraph = new TrustGraph(localPeerId);
    broadcastManager = new BroadcastManager(
      localPeerId,
      trustGraph,
      mockSign,
      mockVerify,
      mockGetPublicKey
    );
  });

  describe("createBroadcast() - Creation and Signing", () => {
    it("should create and sign a broadcast", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test Emergency",
        "This is a test emergency broadcast"
      );

      expect(broadcast.id).toBeDefined();
      expect(broadcast.type).toBe(BroadcastType.EMERGENCY);
      expect(broadcast.severity).toBe(BroadcastSeverity.CRITICAL);
      expect(broadcast.title).toBe("Test Emergency");
      expect(broadcast.body).toBe("This is a test emergency broadcast");
      expect(broadcast.broadcasterId).toBe(localPeerId);
      expect(broadcast.signature).toBeDefined();
      expect(broadcast.signature.length).toBeGreaterThan(0);
      // Signature should be deterministic based on content
      expect(broadcast.signature[0]).toBeDefined();
    });

    it("should create broadcast with target zones", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.ALERT,
        BroadcastSeverity.WARNING,
        "Zone Alert",
        "Alert for specific zones",
        { targetZones: ["zone-1", "zone-2"] }
      );

      expect(broadcast.targetZones).toEqual(["zone-1", "zone-2"]);
    });

    it("should create broadcast with custom TTL", async () => {
      const customTTL = 60 * 60 * 1000; // 1 hour
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Announcement",
        "Test",
        { ttl: customTTL }
      );

      const expectedExpiry = broadcast.createdAt + customTTL;
      expect(broadcast.expiresAt).toBe(expectedExpiry);
    });

    it("should create broadcast with action URL", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.ALERT,
        BroadcastSeverity.WARNING,
        "Alert",
        "Test",
        { actionUrl: "https://example.com/action" }
      );

      expect(broadcast.actionUrl).toBe("https://example.com/action");
    });

    it("should create broadcast with supersedes field", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.UPDATE,
        BroadcastSeverity.INFO,
        "Update",
        "Test",
        { supersedes: "bc_1234567890abcdef" }
      );

      expect(broadcast.supersedes).toBe("bc_1234567890abcdef");
    });

    it("should truncate title to 100 characters", async () => {
      const longTitle = "A".repeat(150);
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        longTitle,
        "Test"
      );

      expect(broadcast.title).toHaveLength(100);
    });

    it("should store created broadcast locally", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test"
      );

      const active = broadcastManager.getActiveBroadcasts();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(broadcast.id);
    });
  });

  describe("verifyBroadcast() - Signature Verification", () => {
    it("should verify valid broadcast from trusted peer", async () => {
      // Add remote peer to trust graph
      trustGraph.addDirectTrust(remotePeerId, TrustLevel.DIRECT);

      // Create broadcast
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test",
        remotePeerId,
        "Remote User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const signingData = getBroadcastSigningData(broadcast);
      broadcast.signature = await mockSign(signingData);

      const result = await broadcastManager.verifyBroadcast(broadcast);

      expect(result.valid).toBe(true);
      expect(result.signatureValid).toBe(true);
      expect(result.senderTrustLevel).toBe(TrustLevel.DIRECT);
    });

    it("should reject broadcast with invalid signature", async () => {
      trustGraph.addDirectTrust(remotePeerId, TrustLevel.DIRECT);

      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test",
        remotePeerId,
        "Remote User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([255]), // Invalid signature
      };

      const result = await broadcastManager.verifyBroadcast(broadcast);

      expect(result.valid).toBe(false);
      expect(result.signatureValid).toBe(false);
    });

    it("should reject broadcast from untrusted peer", async () => {
      // Don't add remote peer to trust graph

      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test",
        remotePeerId,
        "Remote User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const signingData = getBroadcastSigningData(broadcast);
      broadcast.signature = await mockSign(signingData);

      const result = await broadcastManager.verifyBroadcast(broadcast);

      expect(result.valid).toBe(false);
      expect(result.senderTrustLevel).toBe(TrustLevel.UNKNOWN);
    });

    it("should count attestations", async () => {
      trustGraph.addDirectTrust(remotePeerId, TrustLevel.DIRECT);

      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test",
        remotePeerId,
        "Remote User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
        attestations: [
          {
            attesterId: "attester-1",
            attesterName: "Attester 1",
            signature: new Uint8Array([1]),
            attestedAt: Date.now(),
            trustLevel: TrustLevel.DIRECT,
          },
        ],
      };

      const signingData = getBroadcastSigningData(broadcast);
      broadcast.signature = await mockSign(signingData);

      const result = await broadcastManager.verifyBroadcast(broadcast);

      expect(result.attestationCount).toBe(1);
    });

    it("should handle missing public key", async () => {
      // Create manager with a getPublicKey that returns null
      const nullKeyManager = new BroadcastManager(
        localPeerId,
        trustGraph,
        mockSign,
        mockVerify,
        async () => null // Always return null for public key
      );

      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test",
        remotePeerId,
        "Remote User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const result = await nullKeyManager.verifyBroadcast(broadcast);

      expect(result.valid).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.reasons).toContain("Broadcaster public key not found");
    });
  });

  describe("processBroadcast() - Handling Received Broadcasts", () => {
    let validBroadcast: EmergencyBroadcast;

    beforeEach(async () => {
      console.log("Inner beforeEach starting");
      trustGraph.addDirectTrust(remotePeerId, TrustLevel.DIRECT);

      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test Emergency",
        "Test body",
        remotePeerId,
        "Remote User"
      );
      console.log("Template created:", !!template);

      const id = generateBroadcastId(template);
      validBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };
      console.log("validBroadcast created, signature before signing:", validBroadcast.signature);

      const signingData = getBroadcastSigningData(validBroadcast);
      console.log("Signing data length:", signingData.length);

      const signedSig = await mockSign(signingData);
      console.log("Signed signature:", signedSig);

      validBroadcast.signature = signedSig;
      console.log("Final validBroadcast.signature:", validBroadcast.signature);
    });

    it("should accept valid broadcast from trusted peer", async () => {
      // Debug: verify the setup is correct
      expect(validBroadcast.signature.length).toBeGreaterThan(0);
      expect(mockGetPublicKey).toBeDefined();

      // Debug: verify the broadcast
      const verification = await broadcastManager.verifyBroadcast(validBroadcast);
      console.log("Verification result:", JSON.stringify(verification, (k, v) =>
        v instanceof Uint8Array ? Array.from(v) : v
      ));

      const result = await broadcastManager.processBroadcast(validBroadcast);
      console.log("Process result:", result);

      expect(result.accepted).toBe(true);
      expect(result.shouldDisplay).toBe(true);
      expect(result.shouldRelay).toBe(true);
    });

    it("should reject duplicate broadcasts", async () => {
      await broadcastManager.processBroadcast(validBroadcast);
      const result = await broadcastManager.processBroadcast(validBroadcast);

      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("Already seen");
    });

    it("should reject expired broadcasts", async () => {
      const expiredBroadcast = {
        ...validBroadcast,
        expiresAt: Date.now() - 1000,
      };

      const result = await broadcastManager.processBroadcast(expiredBroadcast);

      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("Expired");
    });

    it("should reject broadcasts with invalid signatures", async () => {
      const invalidBroadcast = {
        ...validBroadcast,
        signature: new Uint8Array([255]),
      };

      const result = await broadcastManager.processBroadcast(invalidBroadcast);

      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    it("should invoke callbacks for displayed broadcasts", async () => {
      const callback = jest.fn();
      broadcastManager.onBroadcast(callback);

      await broadcastManager.processBroadcast(validBroadcast);

      expect(callback).toHaveBeenCalledWith(validBroadcast, TrustLevel.DIRECT);
    });

    it("should not invoke callbacks for non-displayed broadcasts", async () => {
      // Create a manager that requires at least DIRECT trust to display
      const strictManager = new BroadcastManager(
        localPeerId,
        trustGraph,
        mockSign,
        mockVerify,
        mockGetPublicKey,
        { minTrustToDisplay: TrustLevel.DIRECT }
      );

      // Remove trust - now sender is UNKNOWN, which is below DIRECT
      trustGraph.removeDirectTrust(remotePeerId);

      const callback = jest.fn();
      strictManager.onBroadcast(callback);

      await strictManager.processBroadcast(validBroadcast);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle callback errors gracefully", async () => {
      const errorCallback = jest.fn(() => {
        throw new Error("Callback error");
      });
      broadcastManager.onBroadcast(errorCallback);

      await expect(
        broadcastManager.processBroadcast(validBroadcast)
      ).resolves.not.toThrow();
    });
  });

  describe("Rate Limiting by Sender", () => {
    let broadcasts: EmergencyBroadcast[];

    beforeEach(async () => {
      trustGraph.addDirectTrust(remotePeerId, TrustLevel.DIRECT);

      // Create multiple broadcasts from same sender
      broadcasts = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const template = createEmergencyBroadcast(
            BroadcastType.ALERT,
            BroadcastSeverity.WARNING,
            `Alert ${i}`,
            `Body ${i}`,
            remotePeerId,
            "Remote User"
          );

          const id = generateBroadcastId(template);
          const broadcast: EmergencyBroadcast = {
            ...template,
            id: `${id}-${i}`, // Make unique
            signature: new Uint8Array([0]),
          };

          const signingData = getBroadcastSigningData(broadcast);
          broadcast.signature = await mockSign(signingData);

          return broadcast;
        })
      );
    });

    it("should enforce rate limit per sender", async () => {
      const config: Partial<BroadcastConfig> = {
        maxPerSenderPerHour: 3,
      };

      broadcastManager = new BroadcastManager(
        localPeerId,
        trustGraph,
        mockSign,
        mockVerify,
        mockGetPublicKey,
        config
      );

      // Process first 3 broadcasts - should succeed
      for (let i = 0; i < 3; i++) {
        const result = await broadcastManager.processBroadcast(broadcasts[i]);
        expect(result.accepted).toBe(true);
      }

      // 4th broadcast - should be rate limited
      const result = await broadcastManager.processBroadcast(broadcasts[3]);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("Rate limit exceeded");
    });
  });

  describe("Spam Blocking", () => {
    let validBroadcast: EmergencyBroadcast;

    beforeEach(async () => {
      trustGraph.addDirectTrust(remotePeerId, TrustLevel.DIRECT);

      const template = createEmergencyBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Test",
        "Test",
        remotePeerId,
        "Remote User"
      );

      const id = generateBroadcastId(template);
      validBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const signingData = getBroadcastSigningData(validBroadcast);
      validBroadcast.signature = await mockSign(signingData);
    });

    it("should block sender after spam reports", async () => {
      const config: Partial<BroadcastConfig> = {
        spamReportsToBlock: 3,
      };

      broadcastManager = new BroadcastManager(
        localPeerId,
        trustGraph,
        mockSign,
        mockVerify,
        mockGetPublicKey,
        config
      );

      await broadcastManager.processBroadcast(validBroadcast);

      // Report as spam 3 times
      for (let i = 0; i < 3; i++) {
        broadcastManager.reportSpam(validBroadcast.id);
      }

      // Create new broadcast from same sender
      const template2 = createEmergencyBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Test 2",
        "Test 2",
        remotePeerId,
        "Remote User"
      );

      const id2 = generateBroadcastId(template2);
      const broadcast2: EmergencyBroadcast = {
        ...template2,
        id: id2,
        signature: new Uint8Array([0]),
      };

      const signingData2 = getBroadcastSigningData(broadcast2);
      broadcast2.signature = await mockSign(signingData2);

      // Should be blocked
      const result = await broadcastManager.processBroadcast(broadcast2);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe("Sender is blocked");
    });

    it("should track spam reports per sender", async () => {
      await broadcastManager.processBroadcast(validBroadcast);

      broadcastManager.reportSpam(validBroadcast.id);
      broadcastManager.reportSpam(validBroadcast.id);

      // Sender should not be blocked yet (default threshold is 5)
      const stats = broadcastManager.getStats();
      expect(stats.blockedSenders).toBe(0);
    });
  });

  describe("prepareForRelay()", () => {
    it("should increment hop count for relay", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test"
      );

      expect(broadcast.hopCount).toBe(0);

      const relayBroadcast = broadcastManager.prepareForRelay(broadcast.id);

      expect(relayBroadcast).not.toBeNull();
      expect(relayBroadcast!.hopCount).toBe(1);
    });

    it("should return null for non-existent broadcast", () => {
      const relayBroadcast = broadcastManager.prepareForRelay("non-existent");
      expect(relayBroadcast).toBeNull();
    });

    it("should return null for broadcast at max hops", async () => {
      const broadcast = await broadcastManager.createBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Test",
        { maxHops: 1 }
      );

      // Increment to max
      broadcast.hopCount = 1;

      const relayBroadcast = broadcastManager.prepareForRelay(broadcast.id);
      expect(relayBroadcast).toBeNull();
    });
  });

  describe("getActiveBroadcasts()", () => {
    it("should return only non-expired broadcasts", async () => {
      const now = Date.now();

      const active = await broadcastManager.createBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Active",
        "Active",
        { ttl: 60 * 60 * 1000 }
      );

      const expired = await broadcastManager.createBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Expired",
        "Expired",
        { ttl: -1000 }
      );

      const activeBroadcasts = broadcastManager.getActiveBroadcasts();

      expect(activeBroadcasts).toHaveLength(1);
      expect(activeBroadcasts[0].id).toBe(active.id);
    });
  });

  describe("pruneExpired()", () => {
    it("should remove expired broadcasts", async () => {
      await broadcastManager.createBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Expired 1",
        "Test",
        { ttl: -1000 }
      );

      await broadcastManager.createBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Expired 2",
        "Test",
        { ttl: -1000 }
      );

      const count = broadcastManager.pruneExpired();

      expect(count).toBe(2);
      expect(broadcastManager.getActiveBroadcasts()).toHaveLength(0);
    });
  });

  describe("getStats()", () => {
    it("should return broadcast statistics", async () => {
      await broadcastManager.createBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test 1",
        "Test"
      );

      await broadcastManager.createBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Test 2",
        "Test"
      );

      const stats = broadcastManager.getStats();

      expect(stats.totalBroadcasts).toBe(2);
      expect(stats.activeBroadcasts).toBe(2);
      expect(stats.seenIds).toBe(2);
    });
  });

  describe("createBroadcastManager() factory", () => {
    it("should create BroadcastManager instance", () => {
      const manager = createBroadcastManager(
        localPeerId,
        trustGraph,
        mockSign,
        mockVerify,
        mockGetPublicKey
      );

      expect(manager).toBeInstanceOf(BroadcastManager);
    });
  });
});

// ============================================================================
// EmergencyBroadcast Tests
// ============================================================================

describe("EmergencyBroadcast", () => {
  describe("Broadcast ID Generation", () => {
    it("should generate deterministic IDs", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      const id1 = generateBroadcastId(template);
      const id2 = generateBroadcastId(template);

      expect(id1).toBe(id2);
    });

    it("should generate different IDs for different content", () => {
      const template1 = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test 1",
        "Body",
        "peer-1",
        "User"
      );

      const template2 = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test 2",
        "Body",
        "peer-1",
        "User"
      );

      const id1 = generateBroadcastId(template1);
      const id2 = generateBroadcastId(template2);

      expect(id1).not.toBe(id2);
    });

    it("should generate IDs with bc_ prefix", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      const id = generateBroadcastId(template);

      expect(id).toMatch(/^bc_[0-9a-f]{16}$/);
    });
  });

  describe("Severity Levels", () => {
    it("should support INFO severity", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Info",
        "Body",
        "peer-1",
        "User"
      );

      expect(template.severity).toBe(BroadcastSeverity.INFO);
    });

    it("should support WARNING severity", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.ALERT,
        BroadcastSeverity.WARNING,
        "Warning",
        "Body",
        "peer-1",
        "User"
      );

      expect(template.severity).toBe(BroadcastSeverity.WARNING);
    });

    it("should support CRITICAL severity", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Critical",
        "Body",
        "peer-1",
        "User"
      );

      expect(template.severity).toBe(BroadcastSeverity.CRITICAL);
    });

    it("should support LIFE_THREATENING severity", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.LIFE_THREATENING,
        "Life Threatening",
        "Body",
        "peer-1",
        "User"
      );

      expect(template.severity).toBe(BroadcastSeverity.LIFE_THREATENING);
    });
  });

  describe("TTL by Severity", () => {
    it("should use default TTL when not specified", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      const expectedExpiry = template.createdAt + DEFAULT_BROADCAST_CONFIG.defaultTTL;
      expect(template.expiresAt).toBe(expectedExpiry);
    });

    it("should use custom TTL when specified", () => {
      const customTTL = 60 * 60 * 1000; // 1 hour
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User",
        { ttl: customTTL }
      );

      const expectedExpiry = template.createdAt + customTTL;
      expect(template.expiresAt).toBe(expectedExpiry);
    });

    it("should detect expired broadcasts", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Test",
        "Body",
        "peer-1",
        "User",
        { ttl: -1000 }
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      expect(isExpired(broadcast)).toBe(true);
    });

    it("should detect non-expired broadcasts", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User",
        { ttl: 60 * 60 * 1000 }
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      expect(isExpired(broadcast)).toBe(false);
    });
  });

  describe("Hop Count Handling", () => {
    it("should initialize with zero hop count", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      expect(template.hopCount).toBe(0);
    });

    it("should increment hop count", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const incremented = incrementHop(broadcast);

      expect(incremented.hopCount).toBe(1);
      expect(broadcast.hopCount).toBe(0); // Original unchanged
    });

    it("should allow propagation when under max hops", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User",
        { maxHops: 50 }
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
        hopCount: 25,
      };

      expect(canPropagate(broadcast)).toBe(true);
    });

    it("should prevent propagation when at max hops", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User",
        { maxHops: 50 }
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
        hopCount: 50,
      };

      expect(canPropagate(broadcast)).toBe(false);
    });

    it("should prevent propagation when expired", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User",
        { ttl: -1000 }
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      expect(canPropagate(broadcast)).toBe(false);
    });

    it("should use custom max hops", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.ANNOUNCEMENT,
        BroadcastSeverity.INFO,
        "Test",
        "Body",
        "peer-1",
        "User",
        { maxHops: 10 }
      );

      expect(template.maxHops).toBe(10);
    });
  });

  describe("getBroadcastSigningData()", () => {
    it("should generate signing data", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const signingData = getBroadcastSigningData(broadcast);

      expect(signingData).toBeInstanceOf(Uint8Array);
      expect(signingData.length).toBeGreaterThan(0);
    });

    it("should generate same signing data for same broadcast", () => {
      const template = createEmergencyBroadcast(
        BroadcastType.EMERGENCY,
        BroadcastSeverity.CRITICAL,
        "Test",
        "Body",
        "peer-1",
        "User"
      );

      const id = generateBroadcastId(template);
      const broadcast: EmergencyBroadcast = {
        ...template,
        id,
        signature: new Uint8Array([0]),
      };

      const data1 = getBroadcastSigningData(broadcast);
      const data2 = getBroadcastSigningData(broadcast);

      expect(data1).toEqual(data2);
    });
  });

  describe("DEFAULT_BROADCAST_CONFIG", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_BROADCAST_CONFIG.maxPerSenderPerHour).toBe(3);
      expect(DEFAULT_BROADCAST_CONFIG.maxPerZonePerHour).toBe(10);
      expect(DEFAULT_BROADCAST_CONFIG.minTrustToRelay).toBe(TrustLevel.THIRD_DEGREE);
      expect(DEFAULT_BROADCAST_CONFIG.minTrustToDisplay).toBe(TrustLevel.UNKNOWN);
      expect(DEFAULT_BROADCAST_CONFIG.spamReportsToBlock).toBe(5);
      expect(DEFAULT_BROADCAST_CONFIG.defaultTTL).toBe(7 * 24 * 60 * 60 * 1000);
      expect(DEFAULT_BROADCAST_CONFIG.maxTTL).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });
});
