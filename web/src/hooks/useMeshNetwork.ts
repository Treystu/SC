import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MeshNetwork, Message, MessageType, Peer } from "@sc/core";
import {
  ConnectionMonitor,
  ConnectionQuality,
} from "../../../core/src/connection-quality";
import { getDatabase } from "../storage/database";
import {
  createSignalingOffer,
  handleSignalingAnswer,
} from "../utils/manualSignaling";
import { getMeshNetwork } from "../services/mesh-network-service";
import { validateFileList } from "../../../core/src/file-validation";
import { rateLimiter } from "../../../core/src/rate-limiter";
import { performanceMonitor } from "../../../core/src/performance-monitor";
import { offlineQueue } from "../../../core/src/offline-queue";
import { BootstrapDiscoveryProvider } from "@sc/core";
import { RoomClient, RoomDisplayPeer } from "../utils/RoomClient"; // Import RoomClient

export interface MeshStatus {
  isConnected: boolean;
  peerCount: number;
  localPeerId: string;
  connectionQuality: ConnectionQuality;
  initializationError?: string;
  joinError?: string | null;
}

export interface ReceivedMessage {
  id: string;
  from: string;
  to?: string; // Add recipient for local messages
  conversationId?: string; // Explicit conversation ID
  content: string;
  timestamp: number;
  type: MessageType;
  status?: "pending" | "sent" | "delivered" | "read" | "queued" | "failed";
}

/**
 * React Hook for Mesh Network
 * Optimized with useMemo and useCallback for performance
 * Integrated with IndexedDB persistence (V1)
 */
export function useMeshNetwork() {
  const [status, setStatus] = useState<MeshStatus>({
    isConnected: false,
    peerCount: 0,
    localPeerId: "",
    connectionQuality: "offline",
    initializationError: undefined,
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const meshNetworkRef = useRef<MeshNetwork | null>(null);
  const connectionMonitorRef = useRef<ConnectionMonitor | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const roomClientRef = useRef<RoomClient | null>(null); // Store RoomClient instance
  const roomPollTimerRef = useRef<NodeJS.Timeout | null>(null); // Store poll timer

  // Initialize mesh network with persistence
  useEffect(() => {
    let retryInterval: NodeJS.Timeout;

    // Process offline queue
    const retryQueuedMessages = async () => {
      if (!meshNetworkRef.current) return;

      await offlineQueue.processQueue(async (msg) => {
        try {
          await meshNetworkRef.current!.sendMessage(
            msg.recipientId,
            msg.content,
          );
          return true; // Sent successfully
        } catch (e) {
          return false; // Failed to send
        }
      });
    };

    const initMeshNetwork = async () => {
      try {
        const network = await getMeshNetwork();
        const db = getDatabase();

        // Start heartbeat
        network.startHeartbeat();

        meshNetworkRef.current = network;
        connectionMonitorRef.current = new ConnectionMonitor();

        // Load persisted peers and populate routing table
        try {
          const activePeers = await db.getActivePeers();
          console.log(`Loaded ${activePeers.length} persisted peers`);

          // Note: Persisted peers will be used to attempt reconnection
          // The routing table is rebuilt dynamically as connections are established
          if (activePeers.length > 0) {
            console.log(
              "Persisted peers available for reconnection:",
              activePeers.map((p) => p.id.substring(0, 8)).join(", "),
            );
          }
        } catch (error) {
          console.error("Failed to load peers:", error);
        }

        // Load persisted routes
        try {
          const routes = await db.getAllRoutes();
          console.log(`Loaded ${routes.length} persisted routes`);
        } catch (error) {
          console.error("Failed to load routes:", error);
        }

        // Clean up expired data
        try {
          await db.deleteExpiredRoutes();
          await db.deleteExpiredSessionKeys();
        } catch (error) {
          console.error("Failed to clean up expired data:", error);
        }

        // Handle incoming messages with persistence
        network.onMessage(async (message: Message) => {
          try {
            const payload = new TextDecoder().decode(message.payload);
            const data = JSON.parse(payload);

            const senderId = Array.from(message.header.senderId as Uint8Array)
              .map((b) => (b as number).toString(16).padStart(2, "0"))
              .join("")
              .substring(0, 8); // Simplified ID for now

            // Create a unique ID for the message if one doesn't exist in the payload
            // Use a combination of timestamp, sender, and content hash/signature if possible
            // For now, we'll trust the timestamp from the header + senderId to be fairly unique
            // But to be safe, we generate a local ID that we can use for React keys
            const messageId =
              data.id || `${message.header.timestamp}-${senderId}`;

            // Check if we've already processed this message ID
            if (seenMessageIdsRef.current.has(messageId)) {
              console.log("Duplicate message ignored:", messageId);
              return;
            }
            seenMessageIdsRef.current.add(messageId);

            const receivedMessage: ReceivedMessage = {
              id: messageId,
              from: senderId,
              conversationId: data.groupId || senderId, // Incoming message belongs to sender's conversation OR group
              content: data.text || "",
              timestamp: data.timestamp || message.header.timestamp,
              type: message.header.type,
              status: "read", // Assume read for simplicity in this demo
            };

            setMessages((prev: ReceivedMessage[]) => {
              // Double check against state just in case
              if (prev.some((m) => m.id === receivedMessage.id)) {
                return prev;
              }
              return [...prev, receivedMessage];
            });

            // Persist message to IndexedDB
            try {
              // Check if message already exists in DB to avoid unnecessary writes
              const existingMsg = await db.getMessage(receivedMessage.id);
              if (existingMsg) {
                console.log(
                  "Message already exists in DB:",
                  receivedMessage.id,
                );
                return;
              }

              await db.saveMessage({
                id: receivedMessage.id,
                conversationId: receivedMessage.conversationId!, // Use resolved conversation ID
                content: receivedMessage.content,
                timestamp: receivedMessage.timestamp,
                senderId: receivedMessage.from,
                recipientId: network.getLocalPeerId(),
                type:
                  receivedMessage.type === MessageType.TEXT
                    ? "text"
                    : receivedMessage.type === MessageType.FILE_METADATA ||
                        receivedMessage.type === MessageType.FILE_CHUNK
                      ? "file"
                      : receivedMessage.type === MessageType.VOICE
                        ? "voice"
                        : "text",
                status: "delivered",
              });

              if (data.groupId) {
                // Update Group
                const group = await db.getGroup(data.groupId);
                if (group) {
                  await db.saveGroup({
                    ...group,
                    lastMessageTimestamp: receivedMessage.timestamp,
                    unreadCount: (group.unreadCount || 0) + 1,
                  });
                }
              } else {
                // Update Conversation
                const conversation = await db.getConversation(
                  receivedMessage.from,
                );
                if (conversation) {
                  await db.saveConversation({
                    ...conversation,
                    lastMessageTimestamp: receivedMessage.timestamp,
                    unreadCount: conversation.unreadCount + 1,
                    lastMessageId: receivedMessage.id,
                  });
                } else {
                  await db.saveConversation({
                    id: receivedMessage.from,
                    contactId: receivedMessage.from,
                    lastMessageTimestamp: receivedMessage.timestamp,
                    unreadCount: 1,
                    createdAt: Date.now(),
                    lastMessageId: receivedMessage.id,
                  });
                }
              }
            } catch (error) {
              console.error("Failed to persist message:", error);
            }
          } catch (error) {
            console.error("Failed to parse message:", error);
          }
        });

        // Handle peer connected with persistence
        network.onPeerConnected(async (peerId: string) => {
          console.log("Peer connected:", peerId);
          updatePeerStatus();

          // Persist peer connection
          try {
            await db.savePeer({
              id: peerId,
              publicKey: network.getPeer(peerId)?.publicKey
                ? Array.from(network.getPeer(peerId)!.publicKey)
                    .map((b: unknown) =>
                      (b as number).toString(16).padStart(2, "0"),
                    )
                    .join("")
                : "",
              transportType: "webrtc",
              lastSeen: Date.now(),
              connectedAt: Date.now(),
              connectionQuality: 100,
              bytesSent: 0,
              bytesReceived: 0,
              reputation: 50, // Start with neutral reputation
              isBlacklisted: false,
            });
          } catch (error) {
            console.error("Failed to persist peer:", error);
          }
        });

        // Handle peer disconnected with persistence
        network.onPeerDisconnected(async (peerId: string) => {
          console.log("Peer disconnected:", peerId);
          updatePeerStatus();

          // Update peer's last seen time
          try {
            const peer = await db.getPeer(peerId);
            if (peer) {
              peer.lastSeen = Date.now();
              await db.savePeer(peer);
            }
          } catch (error) {
            console.error("Failed to update peer last seen:", error);
          }
        });

        network.discovery.onPeerDiscovered((peer) => {
          console.log("Discovered peer:", peer);
          setDiscoveredPeers((prev) => {
            if (prev.includes(peer.id)) return prev;
            return [...prev, peer.id];
          });
        });

        const updatePeerStatus = () => {
          const connectedPeers = network.getConnectedPeers();
          setPeers(connectedPeers);
          setStatus((prev: MeshStatus) => ({
            ...prev,
            peerCount: connectedPeers.length,
            isConnected: connectedPeers.length > 0,
          }));

          // Simulate connection quality updates
          if (connectionMonitorRef.current) {
            const monitor = connectionMonitorRef.current;
            monitor.updateLatency(Math.random() * 100); // Simulate latency
            monitor.updatePacketLoss(100, 100 - Math.random() * 5); // Simulate packet loss
            setStatus((prev) => ({
              ...prev,
              connectionQuality: monitor.getQuality(),
            }));
          }
        };

        // Set up periodic retry
        retryInterval = setInterval(retryQueuedMessages, 30000); // 30 seconds

        // Initial retry
        retryQueuedMessages();

        // Update status
        setStatus({
          isConnected: true,
          peerCount: 0,
          localPeerId: network.getLocalPeerId(),
          connectionQuality: "good",
          initializationError: undefined,
        });
      } catch (error) {
        console.error("Failed to initialize mesh network:", error);
        setStatus((prev) => ({
          ...prev,
          initializationError:
            error instanceof Error ? error.message : String(error),
        }));
        return; // Stop initialization on critical error
      }
    };

    initMeshNetwork();

    // Listen for Service Worker sync requests
    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === "SYNC_OFFLINE_MESSAGES") {
        console.log("Received sync request from Service Worker");
        await retryQueuedMessages();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    }

    // Cleanup on unmount
    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (navigator.serviceWorker && handleServiceWorkerMessage) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage,
        );
      }
      if (meshNetworkRef.current) {
        meshNetworkRef.current.shutdown();
        meshNetworkRef.current = null;
      }
      if (roomPollTimerRef.current) {
        clearInterval(roomPollTimerRef.current);
      }
    };
  }, []);

  // Send message function with persistence
  const sendMessage = useCallback(
    async (
      recipientId: string,
      content: string,
      attachments?: File[],
      groupId?: string,
    ) => {
      const endMeasure = performanceMonitor.startMeasure("sendMessage");
      if (!meshNetworkRef.current) {
        throw new Error("Mesh network not initialized");
      }

      let messageStatus: "sent" | "queued" = "sent";

      // Handle file attachments
      if (attachments && attachments.length > 0) {
        const validationResult = validateFileList(attachments);
        if (!validationResult.valid) {
          throw new Error(validationResult.error || "Invalid file");
        }

        const fileRateLimitResult = rateLimiter.canSendFile(
          meshNetworkRef.current.getLocalPeerId(),
        );
        if (!fileRateLimitResult.allowed) {
          throw new Error(fileRateLimitResult.reason);
        }

        for (const file of attachments) {
          // Create file metadata message
          const fileId = `${Date.now()}-${Math.random()}`;
          const fileMetadata = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            content: content, // Optional caption
            groupId: groupId, // Include groupId in file metadata
          };

          try {
            // Send file start metadata
            const payload = JSON.stringify({
              type: "file_start",
              metadata: fileMetadata,
            });

            await meshNetworkRef.current.sendMessage(recipientId, payload);

            // Chunking logic
            const CHUNK_SIZE = 16 * 1024; // 16KB chunks
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const fileIdBytes = new TextEncoder().encode(
              fileId.padEnd(36, " ").substring(0, 36),
            );
            const buffer = await file.arrayBuffer();

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, file.size);
              const chunkData = new Uint8Array(buffer.slice(start, end));

              // Construct chunk payload: [FileID (36)][Index (4)][Total (4)][Data]
              const chunkPayload = new Uint8Array(
                36 + 4 + 4 + chunkData.length,
              );
              const view = new DataView(chunkPayload.buffer);

              chunkPayload.set(fileIdBytes, 0);
              view.setUint32(36, i, false); // Big endian
              view.setUint32(40, totalChunks, false);
              chunkPayload.set(chunkData, 44);

              await meshNetworkRef.current.sendBinaryMessage(
                recipientId,
                chunkPayload,
              );

              // Optional: minimal delay to prevent flooding
              if (i % 10 === 0) await new Promise((r) => setTimeout(r, 10));
            }
          } catch (error) {
            console.error("Failed to send file:", error);
            messageStatus = "queued";
          }

          // Add to local messages
          const localFileMessage: ReceivedMessage = {
            id: fileId,
            from: "me",
            to: recipientId,
            conversationId: groupId || recipientId, // Use groupId if present
            content: `Sent file: ${file.name}`,
            timestamp: Date.now(),
            type: MessageType.FILE_METADATA,
            status: messageStatus,
          };

          setMessages((prev: ReceivedMessage[]) => [...prev, localFileMessage]);

          // Persist
          try {
            const db = getDatabase();
            await db.saveMessage({
              id: localFileMessage.id,
              conversationId: groupId || recipientId,
              content: localFileMessage.content,
              timestamp: localFileMessage.timestamp,
              senderId: meshNetworkRef.current!.getLocalPeerId(),
              recipientId,
              type: "file",
              status: messageStatus,
              metadata: {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                groupId: groupId,
              },
            });
          } catch (error) {
            console.error("Failed to persist file message:", error);
          }
        }
        return;
      }

      // Handle text message
      const rateLimitResult = rateLimiter.canSendMessage(
        meshNetworkRef.current.getLocalPeerId(),
      );
      if (!rateLimitResult.allowed) {
        throw new Error(rateLimitResult.reason);
      }

      try {
        // Construct payload with groupId
        const payload = JSON.stringify({
          text: content,
          timestamp: Date.now(),
          groupId: groupId,
        });

        await meshNetworkRef.current.sendMessage(recipientId, payload);
        endMeasure({ success: true });
      } catch (error) {
        console.error("Failed to send message to network:", error);
        // Enqueue the message for later retry
        await offlineQueue.enqueue({
          recipientId,
          content,
          timestamp: Date.now(),
        });
        messageStatus = "queued";
        endMeasure({ success: false, error: (error as Error).message });
      }

      // Add to local messages (optimistic update)
      const localMessage: ReceivedMessage = {
        id: `${Date.now()}-${Math.random()}`,
        from: "me",
        to: recipientId,
        conversationId: groupId || recipientId, // Use groupId if present
        content,
        timestamp: Date.now(),
        type: MessageType.TEXT,
        status: messageStatus,
      };

      setMessages((prev: ReceivedMessage[]) => [...prev, localMessage]);

      // Persist sent message to IndexedDB
      try {
        const db = getDatabase();
        await db.saveMessage({
          id: localMessage.id,
          conversationId: groupId || recipientId,
          content: localMessage.content,
          timestamp: localMessage.timestamp,
          senderId: meshNetworkRef.current!.getLocalPeerId(),
          recipientId,
          type: "text",
          status: messageStatus,
        });
      } catch (error) {
        console.error("Failed to persist sent message:", error);
      }
    },
    [],
  );

  // Connect to peer
  const connectToPeer = useCallback(async (peerId: string) => {
    const endMeasure = performanceMonitor.startMeasure("connectToPeer");
    if (!meshNetworkRef.current) {
      throw new Error("Mesh network not initialized");
    }

    try {
      // 1. Try manual connection first (WebRTC / direct)
      try {
        await meshNetworkRef.current.connectToPeer(peerId);
      } catch (e) {
        console.warn(
          "Direct connection failed, checking if we have a Room Signal...",
          e,
        );
        // If direct connection fails, we might need to signal via Room
        if (roomClientRef.current) {
          const offer = await createSignalingOffer(meshNetworkRef.current);
          await roomClientRef.current.signal(peerId, "offer", {
            sdp: offer,
            type: "offer",
          });
          console.log("Sent offer via Room to", peerId);
          // We can't await connection here easily unless we poll for answer.
          // The polling loop handles the answer.
        } else {
          throw e;
        }
      }
      endMeasure({ success: true });
    } catch (error) {
      endMeasure({ success: false, error: (error as Error).message });
      throw error;
    }
  }, []);

  // Get network stats
  const getStats = useCallback(async () => {
    if (!meshNetworkRef.current) {
      return null;
    }

    return await meshNetworkRef.current.getStats();
  }, []);

  const generateConnectionOffer = useCallback(async (): Promise<string> => {
    const endMeasure = performanceMonitor.startMeasure(
      "generateConnectionOffer",
    );
    if (!meshNetworkRef.current) {
      throw new Error("Mesh network not initialized");
    }
    // V1: Include public key in offer
    const db = getDatabase();
    const identity = await db.getPrimaryIdentity();
    if (!identity) {
      // Fallback for when identity isn't created yet
      console.warn(
        "No primary identity found for connection offer, generating temporary one.",
      );
      const offer = createSignalingOffer(meshNetworkRef.current);
      endMeasure({ success: true });
      return offer;
    }
    const offer = createSignalingOffer(
      meshNetworkRef.current,
      identity.publicKey,
    );
    endMeasure({ success: true });
    return offer;
  }, []);

  const acceptConnectionOffer = useCallback(
    async (offer: string): Promise<string> => {
      const endMeasure = performanceMonitor.startMeasure(
        "acceptConnectionOffer",
      );
      if (!meshNetworkRef.current) {
        throw new Error("Mesh network not initialized");
      }
      try {
        const remotePeerId = await handleSignalingAnswer(
          meshNetworkRef.current,
          offer,
        );
        // Manually update peer status after connection
        const connectedPeers = meshNetworkRef.current.getConnectedPeers();
        setPeers(connectedPeers);
        setStatus((prev: MeshStatus) => ({
          ...prev,
          peerCount: connectedPeers.length,
          isConnected: connectedPeers.length > 0,
        }));
        endMeasure({ success: true });
        return remotePeerId;
      } catch (error) {
        endMeasure({ success: false, error: (error as Error).message });
        throw error;
      }
    },
    [],
  );

  const createManualOffer = useCallback(
    async (peerId: string): Promise<string> => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");
      return await meshNetworkRef.current.createManualConnection(peerId);
    },
    [],
  );

  const acceptManualOffer = useCallback(
    async (offerData: string): Promise<string> => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");
      return await meshNetworkRef.current.acceptManualConnection(offerData);
    },
    [],
  );

  const finalizeManualConnection = useCallback(
    async (answerData: string): Promise<void> => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");
      await meshNetworkRef.current.finalizeManualConnection(answerData);

      // Update peer status
      const connectedPeers = meshNetworkRef.current.getConnectedPeers();
      setPeers(connectedPeers);
      setStatus((prev: MeshStatus) => ({
        ...prev,
        peerCount: connectedPeers.length,
        isConnected: connectedPeers.length > 0,
      }));
    },
    [],
  );

  const [joinError, setJoinError] = useState<string | null>(null);
  const [discoveredPeers, setDiscoveredPeers] = useState<string[]>([]);
  const [roomMessages, setRoomMessages] = useState<any[]>([]);
  const [isJoinedToRoom, setIsJoinedToRoom] = useState(false);

  // New Join Room with RoomClient
  const joinRoom = useCallback(
    async (url: string): Promise<void> => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");

      const localPeerId = meshNetworkRef.current.getLocalPeerId();
      setJoinError(null);
      setRoomMessages([]); // Clear messages on join
      setIsJoinedToRoom(true);

      try {
        // Instantiate Room Client
        const roomClient = new RoomClient(url, localPeerId);
        roomClientRef.current = roomClient;

        // Fetch/Init Metadata (Public Key)
        const db = getDatabase();
        const identity = await db.getPrimaryIdentity();
        const metadata = {
          publicKey: identity
            ? Array.from(identity.publicKey)
                .map((b) => (b as number).toString(16).padStart(2, "0"))
                .join("")
            : undefined,
          userAgent: navigator.userAgent,
        };

        // Initial Join
        const peers = await roomClient.join(metadata);
        console.log("Joined room, active peers:", peers.length);

        // Update discovered peers immediately
        setDiscoveredPeers((prev) => {
          const newPeers = peers
            .map((p) => p._id)
            .filter((id) => !prev.includes(id) && id !== localPeerId);
          return [...prev, ...newPeers];
        });

        // Start Polling Loop
        if (roomPollTimerRef.current) clearInterval(roomPollTimerRef.current);
        roomPollTimerRef.current = setInterval(async () => {
          if (!roomClientRef.current) return;
          try {
            const { signals, messages, peers } =
              await roomClientRef.current.poll();

            // 1. Update Peers
            if (peers && peers.length > 0) {
              setDiscoveredPeers((prev) => {
                // Simple dedupe - just add new ones
                const newPeers = peers
                  .map((p) => p._id)
                  .filter((id) => !prev.includes(id) && id !== localPeerId);
                if (newPeers.length === 0) return prev;
                return [...prev, ...newPeers];
              });
            }

            // 2. Process Messages
            if (messages && messages.length > 0) {
              setRoomMessages((prev) => {
                // Dedup
                const newMsgs = messages.filter(
                  (m) => !prev.some((existing) => existing.id === m.id),
                );
                if (newMsgs.length === 0) return prev;
                return [...prev, ...newMsgs];
              });
            }

            // 3. Process Signals (Offers/Answers)
            if (signals && signals.length > 0) {
              for (const sig of signals) {
                try {
                  const signalData =
                    typeof sig.signal === "string"
                      ? JSON.parse(sig.signal)
                      : sig.signal;

                  // Handling Offers
                  if (sig.type === "offer" || signalData.type === "offer") {
                    console.log("Received offer signal from", sig.from);
                    const answer = await handleSignalingAnswer(
                      meshNetworkRef.current!,
                      signalData.sdp || signalData,
                    );
                    // Send Answer back
                    await roomClientRef.current.signal(sig.from, "answer", {
                      type: "answer",
                      sdp: answer,
                    });
                  }
                  // Handling Answers
                  else if (
                    sig.type === "answer" ||
                    signalData.type === "answer"
                  ) {
                    console.log("Received answer signal from", sig.from);
                    await meshNetworkRef.current!.finalizeManualConnection(
                      signalData.sdp || signalData,
                    );
                  }
                } catch (e) {
                  console.error("Error processing signal:", e);
                }
              }
            }
          } catch (e) {
            console.warn("Poll failed:", e);
          }
        }, 3000); // Poll every 3 seconds
      } catch (error) {
        console.error("Failed to join room:", error);
        setJoinError(error instanceof Error ? error.message : String(error));
        setIsJoinedToRoom(false);
        throw error;
      }
    },
    [setJoinError, setRoomMessages, setDiscoveredPeers, setIsJoinedToRoom],
  );

  const leaveRoom = useCallback(() => {
    if (roomPollTimerRef.current) {
      clearInterval(roomPollTimerRef.current);
      roomPollTimerRef.current = null;
    }
    roomClientRef.current = null;

    // Also stop discovery if needed
    if (meshNetworkRef.current) {
      meshNetworkRef.current.discovery.stop();
    }

    setDiscoveredPeers([]);
    setRoomMessages([]);
    setIsJoinedToRoom(false);
  }, []);

  const sendRoomMessage = useCallback(async (content: string) => {
    if (!roomClientRef.current) {
      // Fallback to broadcast if not in HTTP room (e.g. ad-hoc mesh)
      if (meshNetworkRef.current) {
        await meshNetworkRef.current.broadcastMessage(content);
        return;
      }
      throw new Error("Not joined to room");
    }
    await roomClientRef.current.message(content);
  }, []);

  const addStreamToPeer = useCallback(
    async (peerId: string, stream: MediaStream) => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");
      await meshNetworkRef.current.addStreamToPeer(peerId, stream);
    },
    [],
  );

  const onPeerTrack = useCallback(
    (
      callback: (
        peerId: string,
        track: MediaStreamTrack,
        stream: MediaStream,
      ) => void,
    ) => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");
      meshNetworkRef.current.onPeerTrack(callback);
    },
    [],
  );

  // Auto-join public room on initialization
  useEffect(() => {
    if (status.isConnected && !isJoinedToRoom) {
      // Use the actual Netlify function URL
      // If we are in dev main, it might be localhost:8888/.netlify...
      // but essentially relative path works.
      const ROOM_URL = "/.netlify/functions/room";
      joinRoom(ROOM_URL).catch((err) => {
        console.error("Failed to auto-join public room on init:", err);
      });
    }
  }, [status.isConnected, isJoinedToRoom, joinRoom]);

  // Memoized return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      status: { ...status, joinError },
      peers,
      messages,
      sendMessage,
      connectToPeer,
      getStats,
      generateConnectionOffer,
      acceptConnectionOffer,
      createManualOffer,
      acceptManualOffer,
      finalizeManualConnection,
      joinRoom,
      leaveRoom,
      isJoinedToRoom,
      sendRoomMessage,
      addStreamToPeer,
      onPeerTrack,
      discoveredPeers,
      roomMessages,
      identity: meshNetworkRef.current?.getIdentity(), // Expose identity
    }),
    [
      status,
      joinError,
      peers,
      messages,
      sendMessage,
      connectToPeer,
      getStats,
      generateConnectionOffer,
      acceptConnectionOffer,
      createManualOffer,
      acceptManualOffer,
      finalizeManualConnection,
      joinRoom,
      leaveRoom,
      isJoinedToRoom,
      sendRoomMessage,
      addStreamToPeer,
      onPeerTrack,
      discoveredPeers,
      roomMessages,
      meshNetworkRef.current, // Add ref to deps to update when initialized
    ],
  );
}
