import { jest } from "@jest/globals";
import { MeshNetwork } from "./network.js";
import { EternalLedger } from "./ledger.js";
import { SilentMeshManager } from "./silent-mesh.js";
import { GeoRouter } from "../geo/GeoRouter.js";
import { WebRTCTransport } from "../transport/WebRTCTransport.js";
import { P2PRelay, RelayPacketType } from "../relay/P2PRelay.js";
import { generateIdentity } from "../crypto/primitives.js";

// Mock WebRTC APIs
class MockRTCDataChannel {
  label: string;
  readyState: string = "open";
  onmessage: ((ev: any) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  binaryType: string = "arraybuffer";
  bufferedAmount: number = 0;

  constructor(label: string) {
    this.label = label;
    setTimeout(() => this.onopen?.(), 10);
  }

  send(data: any) {
    // In a real test we'd pipe this to another peer
  }
  close() {
    this.readyState = "closed";
    this.onclose?.();
  }
}

class MockRTCPeerConnection {
  connectionState: string = "new";
  iceGatheringState: string = "new";
  onconnectionstatechange: (() => void) | null = null;
  onicecandidate: ((ev: any) => void) | null = null;
  ondatachannel: ((ev: any) => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  remoteDescription: any = null;

  createDataChannel(label: string) {
    return new MockRTCDataChannel(label);
  }
  async createOffer() {
    return { type: "offer" as RTCSdpType, sdp: "mock" };
  }
  async createAnswer() {
    return { type: "answer" as RTCSdpType, sdp: "mock" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {
    this.remoteDescription = {};
  }
  async addIceCandidate() {}
  async getStats() {
    const stats = new Map();
    return stats as any;
  }
  close() {}
}

(global as any).RTCPeerConnection = MockRTCPeerConnection;
(global as any).RTCDataChannel = MockRTCDataChannel;

describe("Unified Mesh Routing Integration", () => {
  const peerIdA = "A".repeat(16);
  const peerIdB = "B".repeat(16);
  const peerIdC = "C".repeat(16);
  const peerIdD = "D".repeat(16); // Target

  it("should rank peers based on NAT type and reliability", async () => {
    const ledger = new EternalLedger();
    const silentMesh = new SilentMeshManager(ledger);
    const router = new GeoRouter({
      ownZone: { precision: 0, lat: 0, lon: 0 } as any,
    });

    // Record peer B: Open NAT, Highly Reliable
    await ledger.recordNodeSighting(peerIdB, {
      natType: "Open",
      profile: {
        nodeId: peerIdB,
        natType: "open" as any,
        latency: {},
        lastUpdate: Date.now(),
        ipStability: 3600000 * 24, // 24hr+
        isWAN: true,
        resources: { load: 0.1 }, // High resources (low load)
      },
    });

    // Record peer C: Symmetric NAT, Low Reliability
    await ledger.recordNodeSighting(peerIdC, {
      natType: "Symmetric",
      profile: {
        nodeId: peerIdC,
        natType: "symmetric" as any,
        latency: {},
        lastUpdate: Date.now(),
        ipStability: 0,
        isWAN: false,
        resources: { load: 0.9 }, // Overloaded
      },
    });

    await silentMesh.addMeshNeighbor(peerIdB, { source: "ledger" });
    await silentMesh.addMeshNeighbor(peerIdC, { source: "ledger" });

    const availablePeers = [
      {
        peerId: peerIdB,
        coordinates: [0, 0],
        profile: await silentMesh.getPeerProfile(peerIdB),
        transportType: "webrtc",
        knownPeers: 10,
        messageCount: 1,
        isCourier: false,
        connectionQuality: 100,
      },
      {
        peerId: peerIdC,
        coordinates: [0, 0],
        profile: await silentMesh.getPeerProfile(peerIdC),
        transportType: "webrtc",
        knownPeers: 2,
        messageCount: 1,
        isCourier: false,
        connectionQuality: 50,
      },
    ] as any;

    const scores = router.selectRelayPeers(availablePeers, undefined, 5);

    expect(scores[0].peerId).toBe(peerIdB);
    expect(scores[1].peerId).toBe(peerIdC);
    expect(scores[0].score).toBeGreaterThan(scores[1].score);

    expect(scores[0].reason).toContain("friendly NAT");
    expect(scores[0].breakdown.reliabilityScore).toBeGreaterThan(
      scores[1].breakdown.reliabilityScore,
    );
  });

  const createFullMockPeer = (peerId: string) => ({
    peerId: peerId,
    connection: new MockRTCPeerConnection(),
    state: "connected",
    reliableChannel: new MockRTCDataChannel("reliable"),
    unreliableChannel: null,
    bytesSent: 0,
    bytesReceived: 0,
    lastSeen: Date.now(),
    lastRTT: 0,
    pingTimestamp: 0,
    rttTimeoutId: null,
    batchBuffer: [],
    batchBufferLength: 0,
    batchTimeoutId: null,
  });

  it("should correctly encapsulate and forward a P2P relay packet", async () => {
    const transportB = new WebRTCTransport(peerIdB);
    await transportB.start({
      onMessage: (msg: any) => {},
      onStateChange: () => {},
      onPeerConnected: () => {},
      onPeerDisconnected: () => {},
      onError: () => {},
    });

    // Mock send on B to see where it forwards
    let forwardedPayload: Uint8Array | null = null;
    let forwardedTo: string | null = null;
    transportB.send = async (peerId, payload) => {
      forwardedTo = peerId;
      forwardedPayload = payload;
    };

    // Add peer D as connected to B
    (transportB as any).peers.set(peerIdD, createFullMockPeer(peerIdD));

    // Add peer A as connected to B
    (transportB as any).peers.set(peerIdA, createFullMockPeer(peerIdA));

    const originalPayload = new TextEncoder().encode("Hello D");
    const relayPacket = P2PRelay.encapsulate(
      {
        sourceId: peerIdA,
        destinationId: peerIdD,
        type: RelayPacketType.DATA,
        sessionId: "test-session",
      },
      originalPayload,
    );

    const channelFromA = (transportB as any).peers.get(peerIdA).reliableChannel;
    (transportB as any).setupDataChannel(peerIdA, channelFromA);

    // Trigger relay packet on B coming from A
    channelFromA.onmessage!({ data: relayPacket.buffer });

    expect(forwardedTo).toBe(peerIdD);
    expect(forwardedPayload).toEqual(relayPacket);

    // Test local delivery
    let localMessageReceived = false;
    (transportB as any).events = {
      onMessage: (msg: any) => {
        if (new TextDecoder().decode(msg.payload) === "Hello B") {
          localMessageReceived = true;
        }
      },
    };

    const localRelayPacket = P2PRelay.encapsulate(
      {
        sourceId: peerIdA,
        destinationId: peerIdB, // Destined for B
        type: RelayPacketType.DATA,
        sessionId: "test-local",
      },
      new TextEncoder().encode("Hello B"),
    );

    channelFromA.onmessage!({ data: localRelayPacket.buffer });

    expect(localMessageReceived).toBe(true);
  });
});
