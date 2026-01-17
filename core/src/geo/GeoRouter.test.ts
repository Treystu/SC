/**
 * GeoRouter Tests - Geographic-aware message routing
 */

import {
  GeoRouter,
  createGeoRouter,
  DEFAULT_GEO_ROUTER_CONFIG,
  type PeerGeoInfo,
  type GeoRoutingHint,
  type PeerScore,
} from "./GeoRouter.js";
import {
  LocationPrecision,
  encodeGeoZone,
  KNOWN_ZONES,
  type GeoZone,
} from "./GeoZone.js";

describe("GeoRouter", () => {
  let router: GeoRouter;

  beforeEach(() => {
    router = new GeoRouter();
  });

  describe("constructor and configuration", () => {
    it("should use default configuration", () => {
      const defaultRouter = new GeoRouter();
      expect(defaultRouter.getOwnZone()).toBeUndefined();
    });

    it("should accept custom configuration", () => {
      const customRouter = new GeoRouter({
        proximityWeight: 0.5,
        directionWeight: 0.5,
        ownZone: KNOWN_ZONES.NYC,
      });
      expect(customRouter.getOwnZone()).toEqual(KNOWN_ZONES.NYC);
    });

    it("should create router with factory function", () => {
      const factoryRouter = createGeoRouter({ ownZone: KNOWN_ZONES.LA });
      expect(factoryRouter.getOwnZone()).toEqual(KNOWN_ZONES.LA);
    });
  });

  describe("setOwnZone / getOwnZone", () => {
    it("should set and get own zone", () => {
      router.setOwnZone(KNOWN_ZONES.NYC);
      expect(router.getOwnZone()).toEqual(KNOWN_ZONES.NYC);
    });

    it("should update own zone", () => {
      router.setOwnZone(KNOWN_ZONES.NYC);
      router.setOwnZone(KNOWN_ZONES.LA);
      expect(router.getOwnZone()).toEqual(KNOWN_ZONES.LA);
    });
  });

  describe("calculateRoute", () => {
    beforeEach(() => {
      router.setOwnZone(KNOWN_ZONES.NYC);
    });

    it("should detect local delivery (same zone)", () => {
      const hint = router.calculateRoute(KNOWN_ZONES.NYC, KNOWN_ZONES.NYC);

      expect(hint.isLocal).toBe(true);
      expect(hint.preferredDirection).toBe("local");
      expect(hint.estimatedHops).toBe(1);
    });

    it("should calculate westward direction for NYC to LA", () => {
      const hint = router.calculateRoute(KNOWN_ZONES.NYC, KNOWN_ZONES.LA);

      expect(hint.isLocal).toBe(false);
      expect(hint.preferredDirection).toBe("W");
      expect(hint.estimatedHops).toBeGreaterThan(1);
    });

    it("should handle missing destination zone", () => {
      const hint = router.calculateRoute(KNOWN_ZONES.NYC, undefined);

      expect(hint.preferredDirection).toBe("any");
      expect(hint.estimatedHops).toBe(10); // Default unknown
    });

    it("should handle destination with NONE precision", () => {
      const noneZone = encodeGeoZone(0, 0, LocationPrecision.NONE);
      const hint = router.calculateRoute(KNOWN_ZONES.NYC, noneZone);

      expect(hint.preferredDirection).toBe("any");
    });

    it("should use own zone when source is undefined", () => {
      const hint = router.calculateRoute(undefined, KNOWN_ZONES.LA);

      expect(hint.sourceZone).toEqual(KNOWN_ZONES.NYC);
      expect(hint.preferredDirection).toBe("W");
    });

    it("should estimate delivery time based on distance", () => {
      const nearby = router.calculateRoute(
        KNOWN_ZONES.NYC,
        KNOWN_ZONES.CHICAGO
      );
      const faraway = router.calculateRoute(KNOWN_ZONES.NYC, KNOWN_ZONES.TOKYO);

      expect(faraway.estimatedDeliveryTime).toBeGreaterThan(
        nearby.estimatedDeliveryTime
      );
    });
  });

  describe("scorePeerForMessage", () => {
    beforeEach(() => {
      router.setOwnZone(KNOWN_ZONES.NYC);
    });

    function createMockPeer(
      overrides: Partial<PeerGeoInfo> = {}
    ): PeerGeoInfo {
      return {
        peerId: "peer-" + Math.random().toString(36).substring(7),
        geoZone: undefined,
        knownPeers: 5,
        messageCount: 100,
        isCourier: false,
        connectionQuality: 80,
        transportType: "webrtc",
        ...overrides,
      };
    }

    it("should give higher score to peer closer to destination", () => {
      const closerPeer = createMockPeer({ geoZone: KNOWN_ZONES.CHICAGO });
      const fartherPeer = createMockPeer({ geoZone: KNOWN_ZONES.LONDON });

      const closerScore = router.scorePeerForMessage(
        closerPeer,
        KNOWN_ZONES.LA
      );
      const fartherScore = router.scorePeerForMessage(
        fartherPeer,
        KNOWN_ZONES.LA
      );

      expect(closerScore.score).toBeGreaterThan(fartherScore.score);
    });

    it("should give maximum score to peer in destination zone", () => {
      const peerInDest = createMockPeer({ geoZone: KNOWN_ZONES.LA });
      const score = router.scorePeerForMessage(peerInDest, KNOWN_ZONES.LA);

      expect(score.breakdown.proximityScore).toBe(100);
    });

    it("should give bonus to courier peers", () => {
      const regularPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        isCourier: false,
      });
      const courierPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        isCourier: true,
      });

      const regularScore = router.scorePeerForMessage(
        regularPeer,
        KNOWN_ZONES.LA
      );
      const courierScore = router.scorePeerForMessage(
        courierPeer,
        KNOWN_ZONES.LA
      );

      expect(courierScore.score).toBeGreaterThan(regularScore.score);
      expect(courierScore.breakdown.courierScore).toBe(
        DEFAULT_GEO_ROUTER_CONFIG.courierBonus
      );
    });

    it("should penalize overloaded peers", () => {
      const lightPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        messageCount: 100,
      });
      const heavyPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        messageCount: 9000,
      });

      const lightScore = router.scorePeerForMessage(lightPeer, KNOWN_ZONES.LA);
      const heavyScore = router.scorePeerForMessage(heavyPeer, KNOWN_ZONES.LA);

      expect(lightScore.breakdown.loadScore).toBeGreaterThan(
        heavyScore.breakdown.loadScore
      );
    });

    it("should prefer well-connected peers", () => {
      const fewPeers = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        knownPeers: 2,
      });
      const manyPeers = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        knownPeers: 20,
      });

      const fewScore = router.scorePeerForMessage(fewPeers, KNOWN_ZONES.LA);
      const manyScore = router.scorePeerForMessage(manyPeers, KNOWN_ZONES.LA);

      expect(manyScore.breakdown.connectivityScore).toBeGreaterThan(
        fewScore.breakdown.connectivityScore
      );
    });

    it("should give transport type bonus to long-range transports", () => {
      const webrtcPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        transportType: "webrtc",
      });
      const loraPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        transportType: "lora",
      });
      const meshtasticPeer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        transportType: "meshtastic",
      });

      const webrtcScore = router.scorePeerForMessage(
        webrtcPeer,
        KNOWN_ZONES.LA
      );
      const loraScore = router.scorePeerForMessage(loraPeer, KNOWN_ZONES.LA);
      const meshScore = router.scorePeerForMessage(
        meshtasticPeer,
        KNOWN_ZONES.LA
      );

      // Meshtastic > LoRa > WebRTC for transport score
      expect(meshScore.breakdown.transportScore).toBeGreaterThan(
        loraScore.breakdown.transportScore
      );
      expect(loraScore.breakdown.transportScore).toBeGreaterThan(
        webrtcScore.breakdown.transportScore
      );
    });

    it("should handle peer with unknown zone", () => {
      const unknownPeer = createMockPeer({ geoZone: undefined });
      const score = router.scorePeerForMessage(unknownPeer, KNOWN_ZONES.LA);

      expect(score.breakdown.proximityScore).toBe(40);
      expect(score.reason).toContain("Peer zone unknown");
    });

    it("should handle missing destination zone", () => {
      const peer = createMockPeer({ geoZone: KNOWN_ZONES.CHICAGO });
      const score = router.scorePeerForMessage(peer, undefined);

      expect(score.breakdown.proximityScore).toBe(50); // Neutral
    });

    it("should include reason in score", () => {
      const peer = createMockPeer({
        geoZone: KNOWN_ZONES.CHICAGO,
        isCourier: true,
      });
      const score = router.scorePeerForMessage(peer, KNOWN_ZONES.LA);

      expect(score.reason).toBeTruthy();
      expect(score.reason).toContain("courier");
    });
  });

  describe("selectRelayPeers", () => {
    beforeEach(() => {
      router.setOwnZone(KNOWN_ZONES.NYC);
    });

    function createMockPeer(
      id: string,
      zone?: GeoZone,
      extras: Partial<PeerGeoInfo> = {}
    ): PeerGeoInfo {
      return {
        peerId: id,
        geoZone: zone,
        knownPeers: 5,
        messageCount: 100,
        isCourier: false,
        connectionQuality: 80,
        transportType: "webrtc",
        ...extras,
      };
    }

    it("should return top N peers by score", () => {
      const peers = [
        createMockPeer("peer1", KNOWN_ZONES.LONDON),
        createMockPeer("peer2", KNOWN_ZONES.CHICAGO),
        createMockPeer("peer3", KNOWN_ZONES.LA),
        createMockPeer("peer4", KNOWN_ZONES.TOKYO),
      ];

      const selected = router.selectRelayPeers(peers, KNOWN_ZONES.LA, 2);

      expect(selected).toHaveLength(2);
      // LA peer should be first (in destination)
      expect(selected[0].peerId).toBe("peer3");
    });

    it("should sort by score descending", () => {
      const peers = [
        createMockPeer("peer1", KNOWN_ZONES.LONDON),
        createMockPeer("peer2", KNOWN_ZONES.CHICAGO),
        createMockPeer("peer3", KNOWN_ZONES.LA),
      ];

      const selected = router.selectRelayPeers(peers, KNOWN_ZONES.LA, 3);

      for (let i = 1; i < selected.length; i++) {
        expect(selected[i - 1].score).toBeGreaterThanOrEqual(selected[i].score);
      }
    });

    it("should return empty array for empty peer list", () => {
      const selected = router.selectRelayPeers([], KNOWN_ZONES.LA);
      expect(selected).toEqual([]);
    });

    it("should default to returning 3 peers", () => {
      const peers = [
        createMockPeer("peer1", KNOWN_ZONES.LONDON),
        createMockPeer("peer2", KNOWN_ZONES.CHICAGO),
        createMockPeer("peer3", KNOWN_ZONES.LA),
        createMockPeer("peer4", KNOWN_ZONES.TOKYO),
        createMockPeer("peer5", KNOWN_ZONES.SYDNEY),
      ];

      const selected = router.selectRelayPeers(peers, KNOWN_ZONES.LA);

      expect(selected).toHaveLength(3);
    });

    it("should return all peers if fewer than maxPeers", () => {
      const peers = [
        createMockPeer("peer1", KNOWN_ZONES.CHICAGO),
        createMockPeer("peer2", KNOWN_ZONES.LA),
      ];

      const selected = router.selectRelayPeers(peers, KNOWN_ZONES.LA, 5);

      expect(selected).toHaveLength(2);
    });
  });

  describe("isGoodRelay", () => {
    beforeEach(() => {
      router.setOwnZone(KNOWN_ZONES.NYC);
    });

    it("should return true for peer in destination zone", () => {
      const peer: PeerGeoInfo = {
        peerId: "peer1",
        geoZone: KNOWN_ZONES.LA,
        knownPeers: 5,
        messageCount: 100,
        isCourier: false,
        connectionQuality: 80,
        transportType: "webrtc",
      };

      expect(router.isGoodRelay(peer, KNOWN_ZONES.LA)).toBe(true);
    });

    it("should respect minScore parameter", () => {
      const peer: PeerGeoInfo = {
        peerId: "peer1",
        geoZone: KNOWN_ZONES.LONDON, // Far from LA
        knownPeers: 1,
        messageCount: 9000,
        isCourier: false,
        connectionQuality: 20,
        transportType: "bluetooth",
      };

      // With low bar, might pass
      const passesLow = router.isGoodRelay(peer, KNOWN_ZONES.LA, 10);
      // With high bar, should fail
      const passesHigh = router.isGoodRelay(peer, KNOWN_ZONES.LA, 100);

      expect(passesHigh).toBe(false);
    });
  });

  describe("getRoutingStats", () => {
    beforeEach(() => {
      router.setOwnZone(KNOWN_ZONES.NYC);
    });

    it("should return comprehensive stats", () => {
      const peers: PeerGeoInfo[] = [
        {
          peerId: "peer1",
          geoZone: KNOWN_ZONES.CHICAGO,
          knownPeers: 5,
          messageCount: 100,
          isCourier: false,
          connectionQuality: 80,
          transportType: "webrtc",
        },
        {
          peerId: "peer2",
          geoZone: undefined,
          knownPeers: 3,
          messageCount: 50,
          isCourier: true,
          connectionQuality: 90,
          transportType: "lora",
        },
        {
          peerId: "peer3",
          geoZone: KNOWN_ZONES.LA,
          knownPeers: 10,
          messageCount: 200,
          isCourier: false,
          connectionQuality: 70,
          transportType: "meshtastic",
        },
      ];

      const stats = router.getRoutingStats(peers, KNOWN_ZONES.LA);

      expect(stats.totalPeers).toBe(3);
      expect(stats.peersWithZone).toBe(2);
      expect(stats.goodRelays).toBeGreaterThanOrEqual(0);
      expect(stats.bestScore).toBeGreaterThan(0);
      expect(stats.averageScore).toBeGreaterThan(0);
      expect(stats.preferredDirection).toBe("W"); // NYC to LA
    });

    it("should handle empty peer list", () => {
      const stats = router.getRoutingStats([], KNOWN_ZONES.LA);

      expect(stats.totalPeers).toBe(0);
      expect(stats.peersWithZone).toBe(0);
      expect(stats.goodRelays).toBe(0);
      expect(stats.bestScore).toBe(0);
      expect(stats.averageScore).toBe(0);
    });
  });
});
