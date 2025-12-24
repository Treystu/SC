import { renderHook, act, waitFor } from "@testing-library/react";
import { useMeshNetwork } from "../useMeshNetwork";
import { MeshNetwork } from "@sc/core";
import { getDatabase } from "../../storage/database";

// Mock dependencies
jest.mock("@sc/core", () => ({
  MeshNetwork: jest.fn(),
  BootstrapDiscoveryProvider: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    onPeerFound: jest.fn(),
  })),
  MessageType: {
    TEXT: "text",
    FILE_METADATA: "file_metadata",
    FILE_CHUNK: "file_chunk",
    VOICE: "voice",
  },
  generateIdentity: jest
    .fn()
    .mockReturnValue({ publicKey: "pub", privateKey: "priv" }),
  generateFingerprint: jest.fn().mockResolvedValue("fingerprint-123"),
  ConnectionMonitor: jest.fn().mockImplementation(() => ({
    updateLatency: jest.fn(),
    updatePacketLoss: jest.fn(),
    getQuality: jest.fn().mockReturnValue("good"),
  })),
  rateLimiter: {
    canSendMessage: jest.fn().mockReturnValue({ allowed: true }),
    canSendFile: jest.fn().mockReturnValue({ allowed: true }),
  },
  performanceMonitor: {
    startMeasure: jest.fn().mockReturnValue(() => {}),
  },
  offlineQueue: {
    processQueue: jest.fn(),
    enqueue: jest.fn(),
  },
}));

jest.mock("../../storage/database", () => ({
  getDatabase: jest.fn().mockReturnValue({
    init: jest.fn().mockResolvedValue(undefined),
    getPrimaryIdentity: jest.fn().mockResolvedValue(null),
    saveIdentity: jest.fn().mockResolvedValue(undefined),
    getActivePeers: jest.fn().mockResolvedValue([]),
    getAllRoutes: jest.fn().mockResolvedValue([]),
    deleteExpiredRoutes: jest.fn().mockResolvedValue(undefined),
    deleteExpiredSessionKeys: jest.fn().mockResolvedValue(undefined),
    saveMessage: jest.fn().mockResolvedValue(undefined),
    getMessage: jest.fn().mockResolvedValue(null),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    getConversation: jest.fn().mockResolvedValue(null),
    savePeer: jest.fn().mockResolvedValue(undefined),
    getPeer: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock("../../utils/WebPersistenceAdapter", () => ({
  WebPersistenceAdapter: jest.fn(),
}));

// Note: core helpers (ConnectionMonitor, rateLimiter, performanceMonitor, offlineQueue)
// are mocked above in the @sc/core mock to match how the module is imported in the hook.

describe("useMeshNetwork", () => {
  let mockMeshInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMeshInstance = {
      startHeartbeat: jest.fn(),
      onMessage: jest.fn(),
      onPeerConnected: jest.fn(),
      onPeerDisconnected: jest.fn(),
      onDiscoveryUpdate: jest.fn(),
      onPublicRoomMessage: jest.fn(),
      discovery: {
        onPeerDiscovered: jest.fn(),
        registerProvider: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      },
      getLocalPeerId: jest.fn().mockReturnValue("local-peer-id"),
      getConnectedPeers: jest.fn().mockReturnValue([]),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      connectToPeer: jest.fn().mockResolvedValue(undefined),
      joinPublicRoom: jest.fn().mockResolvedValue(undefined),
      leavePublicRoom: jest.fn(),
      shutdown: jest.fn(),
      getIdentity: jest
        .fn()
        .mockReturnValue({ publicKey: "pub", privateKey: "priv" }),
      createManualConnection: jest.fn().mockResolvedValue("offer"),
      acceptManualConnection: jest.fn().mockResolvedValue("answer"),
      finalizeManualConnection: jest.fn().mockResolvedValue(undefined),
      sendPublicRoomMessage: jest.fn().mockResolvedValue(undefined),
      joinRelay: jest.fn().mockResolvedValue(undefined),
      addStreamToPeer: jest.fn().mockResolvedValue(undefined),
      onPeerTrack: jest.fn(),
      getStats: jest.fn().mockResolvedValue({}),
    };

    (MeshNetwork as jest.Mock).mockImplementation(() => mockMeshInstance);
  });

  it("initializes the mesh network on mount", async () => {
    const { result } = renderHook(() => useMeshNetwork());

    await waitFor(() => {
      expect(result.current.status.localPeerId).toBe("local-peer-id");
    });

    expect(MeshNetwork).toHaveBeenCalled();
    expect(getDatabase).toHaveBeenCalled();
  });

  it("sends a message", async () => {
    const { result } = renderHook(() => useMeshNetwork());

    await waitFor(() => {
      expect(result.current.status.localPeerId).toBe("local-peer-id");
    });

    await act(async () => {
      await result.current.sendMessage("recipient-id", "Hello World");
    });

    expect(mockMeshInstance.sendMessage).toHaveBeenCalledWith(
      "recipient-id",
      expect.stringContaining("Hello World"),
    );
  });

  it("joins a public room", async () => {
    const { result } = renderHook(() => useMeshNetwork());

    await waitFor(() => {
      expect(result.current.status.localPeerId).toBe("local-peer-id");
    });

    await act(async () => {
      await result.current.joinRoom("https://example.com/room");
    });

    expect(mockMeshInstance.discovery.registerProvider).toHaveBeenCalled();
    expect(mockMeshInstance.discovery.start).toHaveBeenCalled();
    expect(result.current.isJoinedToRoom).toBe(true);
  });
});
