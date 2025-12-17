import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MeshNetwork, Message, MessageType, Peer } from "@sc/core";
import {
  ConnectionMonitor,
  ConnectionQuality,
} from "../../../core/src/connection-quality";
import { getDatabase } from "../storage/database";
import { getMeshNetwork } from "../services/mesh-network-service";
import { validateFileList } from "../../../core/src/file-validation";
import { rateLimiter } from "../../../core/src/rate-limiter";
import { performanceMonitor } from "../../../core/src/performance-monitor";
import { offlineQueue } from "../../../core/src/offline-queue";
import { RoomClient } from "../utils/RoomClient"; // Import RoomClient

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
  reactions?: Array<{ userId: string; emoji: string }>;
  metadata?: any;
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

            // Filter out echo messages (messages sent by us that might be relayed back)
            if (senderId === network.getLocalPeerId()) {
              console.log("Ignored echo message from self");
              return;
            }

            // Create a unique ID for the message if one doesn't exist in the payload
            // Use a combination of timestamp, sender, and content hash/signature if possible
            // For now, we'll trust the timestamp from the header + senderId to be fairly unique
            // But to be safe, we generate a local ID that we can use for React keys
            const messageId =
              data.id || `${message.header.timestamp}-${senderId}`;

            // Check if we've already processed this message ID
            if (seenMessageIdsRef.current.has(messageId)) {
              console.log(
                "Duplicate message ignored (in-memory ref):",
                messageId,
              );
              return;
            }

            // Check if message already exists in DB to avoid unnecessary processing and duplicates
            try {
              const existingMsg = await db.getMessage(messageId);
              if (existingMsg) {
                console.log(
                  "Message already exists in DB, ignoring:",
                  messageId,
                );
                // We add it to the seen ref so we don't query DB again for this ID in this session
                seenMessageIdsRef.current.add(messageId);
                return;
              }
            } catch (dbError) {
              console.warn("Error checking DB for message existence:", dbError);
              // Continue processing if DB check fails, to ensure we don't drop messages on DB error?
              // Or abort? Safest is to continue but risk duplicate.
            }

            seenMessageIdsRef.current.add(messageId);

            // Handle message types
            if (message.header.type === MessageType.MESSAGE_REACTION) {
              const reactionData = data as {
                targetMessageId: string;
                emoji: string;
                action?: "add" | "remove";
                groupId?: string; // For group contexts
              };

              // Update DB
              try {
                const targetMsg = await db.getMessage(
                  reactionData.targetMessageId,
                );
                if (targetMsg) {
                  const reactions = targetMsg.reactions || [];
                  const newReaction = {
                    userId: senderId,
                    emoji: reactionData.emoji,
                  };

                  // Check for duplicates
                  const exists = reactions.some(
                    (r) =>
                      r.userId === senderId && r.emoji === reactionData.emoji,
                  );

                  if (!exists) {
                    targetMsg.reactions = [...reactions, newReaction];
                    await db.saveMessage(targetMsg);
                    console.log(
                      `Added reaction ${reactionData.emoji} to ${reactionData.targetMessageId}`,
                    );

                    // Update local state if message is currently in view
                    setMessages((prev) =>
                      prev.map((m) => {
                        if (m.id === reactionData.targetMessageId) {
                          const currentReactions = m.reactions || [];
                          // Avoid duplicates in state
                          if (
                            currentReactions.some(
                              (r) =>
                                r.userId === senderId &&
                                r.emoji === reactionData.emoji,
                            )
                          ) {
                            return m;
                          }
                          return {
                            ...m,
                            reactions: [...currentReactions, newReaction],
                          };
                        }
                        return m;
                      }),
                    );
                  }
                }
              } catch (e) {
                console.error("Failed to apply reaction:", e);
              }
              return; // Done processing reaction
            }

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

          // Trigger retry of queued messages immediately
          retryQueuedMessages();

          // Create conversation if it doesn't exist (e.g. from direct connection)
          try {
            const conversation = await db.getConversation(peerId);
            if (!conversation) {
              // Check if we have contact info (from QR or Room discovery)
              // Only create conversation if we know who they are, or if we want to allow "Unknown" chats
              // For now, let's create it so the window appears as requested.
              const threadId = peerId;
              console.log(
                `Creating new conversation for connected peer: ${peerId}`,
              );
              await db.saveConversation({
                id: threadId,
                contactId: peerId,
                lastMessageTimestamp: Date.now(),
                unreadCount: 0,
                createdAt: Date.now(),
              });
            }
          } catch (err) {
            console.error("Error ensuring conversation exists:", err);
          }

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
          console.log("Discovered peer via Mesh Discovery:", peer);
          // Only add to discoveredPeers, connection is handled by user or auto-connect logic
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

        // Update Conversation
        const convId = groupId || recipientId;
        const conversation = await db.getConversation(convId);
        if (conversation) {
          await db.saveConversation({
            ...conversation,
            lastMessageTimestamp: localMessage.timestamp,
            lastMessageId: localMessage.id,
            // unreadCount: conversation.unreadCount // Don't change unread for sent msg
          });
        } else {
          // Should exist, but just in case
          await db.saveConversation({
            id: convId,
            contactId: convId, // Assuming 1:1 for fallback
            lastMessageTimestamp: localMessage.timestamp,
            lastMessageId: localMessage.id,
            unreadCount: 0,
            createdAt: Date.now(),
          });
        }
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
      // Prioritize Room Signaling if available (Bootstrapping usually happens here)
      if (roomClientRef.current) {
        console.log(`Initiating connection to ${peerId} via Room Signaling...`);
        // Generate proper SDP Offer
        const offerJson =
          await meshNetworkRef.current.createManualConnection(peerId);
        const offerData = JSON.parse(offerJson);

        await roomClientRef.current.signal(peerId, "offer", offerData);
        console.log("Sent SDP offer via Room to", peerId);
      } else {
        // Fallback to mesh-only connection attempt (e.g. mDNS/Local)
        console.log(`Initiating connection to ${peerId} via Mesh/Local...`);
        await meshNetworkRef.current.connectToPeer(peerId);
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
    // Keep using simple ID for QR to keep it small.
    // The scanner will use this ID to trigger connectToPeer -> Room Signal.
    // This relies on both parties being on the Room (Netlify).
    const endMeasure = performanceMonitor.startMeasure(
      "generateConnectionOffer",
    );
    if (!meshNetworkRef.current) {
      throw new Error("Mesh network not initialized");
    }
    const db = getDatabase();
    const identity = await db.getPrimaryIdentity();

    // We stick to the minimal payload for QR codes, but add Name for UX
    const offerPayload = {
      peerId: meshNetworkRef.current.getLocalPeerId(),
      publicKey: identity
        ? Array.from(identity.publicKey)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        : undefined,
      displayName: identity?.displayName,
    };

    endMeasure({ success: true });
    return JSON.stringify(offerPayload, null, 2);
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
        const offerData = JSON.parse(offer);
        if (!offerData.peerId) throw new Error("Invalid offer: missing peerId");

        // Save contact info if present
        if (offerData.displayName) {
          const db = getDatabase();
          try {
            const existing = await db.getContact(offerData.peerId);
            if (!existing) {
              await db.saveContact({
                id: offerData.peerId,
                publicKey: offerData.publicKey || "",
                displayName: offerData.displayName,
                lastSeen: Date.now(),
                createdAt: Date.now(),
                fingerprint: "",
                verified: false,
                blocked: false,
                endpoints: [],
              });
              console.log(`Saved contact from QR: ${offerData.displayName}`);
            }
          } catch (e) {
            console.error("Error saving QR contact:", e);
          }
        }

        // Use our robust connectToPeer logic
        await connectToPeer(offerData.peerId);

        endMeasure({ success: true });
        return offerData.peerId;
      } catch (error) {
        endMeasure({ success: false, error: (error as Error).message });
        throw error;
      }
    },
    [connectToPeer],
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

  const sendReaction = useCallback(
    async (
      targetMessageId: string,
      emoji: string,
      recipientId: string,
      groupId?: string,
    ) => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");

      const payload = JSON.stringify({
        targetMessageId,
        emoji,
        groupId,
        timestamp: Date.now(),
      });

      // Send to recipient (or group fan-out handled by caller/network)
      // Note: MessageType.MESSAGE_REACTION is 0x05
      await meshNetworkRef.current.sendMessage(
        recipientId,
        payload,
        0x05 as MessageType,
      );

      // Local update
      const db = getDatabase();
      const targetMsg = await db.getMessage(targetMessageId);
      if (targetMsg) {
        const reactions = targetMsg.reactions || [];
        const newReaction = {
          userId: meshNetworkRef.current.getLocalPeerId(),
          emoji,
        };
        // dedupe
        if (
          !reactions.some(
            (r) => r.userId === newReaction.userId && r.emoji === emoji,
          )
        ) {
          targetMsg.reactions = [...reactions, newReaction];
          await db.saveMessage(targetMsg);

          // Update state
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === targetMessageId) {
                const currentReactions = m.reactions || [];
                return {
                  ...m,
                  reactions: [...currentReactions, newReaction],
                };
              }
              return m;
            }),
          );
        }
      }
    },
    [],
  );

  const sendVoice = useCallback(
    async (
      recipientId: string,
      audioBlob: Blob,
      duration?: number,
      groupId?: string,
    ) => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");

      const buffer = await audioBlob.arrayBuffer();
      const data = new Uint8Array(buffer);

      // Send via mesh
      // Note: MessageType.VOICE is 0x04
      await meshNetworkRef.current.sendBinaryMessage(
        recipientId,
        data,
        0x04 as MessageType,
      );

      // Local update (store as file-like message or distinct voice type)
      const db = getDatabase();
      const messageId = `msg-voice-${Date.now()}`;
      const newMessage: any = {
        id: messageId,
        conversationId: groupId || recipientId,
        senderId: meshNetworkRef.current.getLocalPeerId(), // Correct field name for StoredMessage
        recipientId: recipientId, // Correct field name for StoredMessage
        content: "[Voice Message]", // Fallback text
        timestamp: Date.now(),
        type: "voice", // StoredMessage uses string union "voice"
        status: "sent",
        metadata: {
          duration,
          blob: audioBlob, // Note: We might need to persist this blob carefully
        },
      };

      try {
        await db.saveMessage(newMessage);

        // Update Conversation
        const convId = groupId || recipientId;
        const conversation = await db.getConversation(convId);
        if (conversation) {
          await db.saveConversation({
            ...conversation,
            lastMessageTimestamp: newMessage.timestamp,
            lastMessageId: newMessage.id,
          });
        } else {
          await db.saveConversation({
            id: convId,
            contactId: convId,
            lastMessageTimestamp: newMessage.timestamp,
            lastMessageId: newMessage.id,
            unreadCount: 0,
            createdAt: Date.now(),
          });
        }

        // Update local state
        setMessages((prev) => [
          ...prev,
          {
            ...newMessage,
            from: newMessage.senderId, // ReceivedMessage uses 'from'
            to: newMessage.recipientId,
            type: 0x04 as MessageType, // ReceivedMessage uses MessageType enum
          },
        ]);
      } catch (err) {
        console.error("Failed to save local voice message:", err);
      }
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

        // Fetch/Init Metadata
        const db = getDatabase();
        const identity = await db.getPrimaryIdentity();
        const metadata = {
          publicKey: identity
            ? Array.from(identity.publicKey)
                .map((b) => (b as number).toString(16).padStart(2, "0"))
                .join("")
            : undefined,
          displayName: identity?.displayName || "Unknown User",
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

            // 1. Update Peers & Save Contacts
            if (peers && peers.length > 0) {
              const db = getDatabase();
              for (const p of peers) {
                if (p.metadata && p._id !== localPeerId) {
                  try {
                    // Check if we already have this contact
                    const existing = await db.getContact(p._id);
                    if (!existing && p.metadata.displayName) {
                      console.log(
                        `Discovered new peer ${p.metadata.displayName} (${p._id})`,
                      );
                      await db.saveContact({
                        id: p._id,
                        publicKey: p.metadata.publicKey || "",
                        displayName: p.metadata.displayName,
                        lastSeen: Date.now(),
                        createdAt: Date.now(),
                        fingerprint: "", // To be filled on verification
                        verified: false,
                        blocked: false,
                        endpoints: [{ type: "room" }],
                      });
                    }
                  } catch (err) {
                    console.error("Error saving discovered peer contact:", err);
                  }
                }
              }

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

                    // Generate proper Answer using Core Logic
                    // acceptManualConnection expects stringified { peerId, sdp }
                    const answerJson =
                      await meshNetworkRef.current!.acceptManualConnection(
                        JSON.stringify({
                          peerId: sig.from,
                          sdp: signalData.sdp || signalData, // Handle nested sdp or flat
                        }),
                      );

                    const answerData = JSON.parse(answerJson);

                    // Send Answer back
                    await roomClientRef.current!.signal(sig.from, "answer", {
                      type: "answer",
                      sdp: answerData.sdp,
                    });
                  }
                  // Handling Answers
                  else if (
                    sig.type === "answer" ||
                    signalData.type === "answer"
                  ) {
                    console.log("Received answer signal from", sig.from);

                    // Finalize connection using Core Logic
                    // finalizeManualConnection expects stringified { peerId, sdp }
                    await meshNetworkRef.current!.finalizeManualConnection(
                      JSON.stringify({
                        peerId: sig.from,
                        sdp: signalData.sdp || signalData,
                      }),
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
      const ROOM_URL = "/.netlify/functions/room";
      joinRoom(ROOM_URL).catch((err) => {
        console.error("Failed to auto-join public room on init:", err);
      });
    }
  }, [status.isConnected, isJoinedToRoom, joinRoom]);

  // Auto-connect to discovered peers that we have conversations with
  useEffect(() => {
    const connectToKnownPeers = async () => {
      if (!meshNetworkRef.current) return;
      const db = getDatabase();
      const conversations = await db.getConversations();
      const knownPeerIds = conversations.map((c) => c.contactId);

      for (const peerId of discoveredPeers) {
        // If we have a conversation with them, but aren't connected in Mesh
        if (
          knownPeerIds.includes(peerId) &&
          !meshNetworkRef.current.isConnectedToPeer(peerId)
        ) {
          console.log(`Auto-connecting to known peer from Room: ${peerId}`);
          connectToPeer(peerId).catch(console.warn);
        }
      }
    };
    connectToKnownPeers();
  }, [discoveredPeers, connectToPeer]);

  // DHT Bootstrap Effect
  const [hasBootstrapped, setHasBootstrapped] = useState(false);

  useEffect(() => {
    if (status.peerCount > 0 && !hasBootstrapped && meshNetworkRef.current) {
      // Small delay to ensure connection stability before heavy DHT activity
      const timer = setTimeout(() => {
        console.log(
          "Peers connected (count: " +
            status.peerCount +
            "), starting DHT bootstrap...",
        );
        meshNetworkRef.current
          ?.bootstrap()
          .then(() => {
            console.log("DHT Bootstrap finished successfully.");
            setHasBootstrapped(true);
          })
          .catch((err: unknown) => {
            console.error("DHT Bootstrap failed:", err);
          });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status.peerCount, hasBootstrapped]);

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
      sendReaction,
      sendVoice,
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
      sendReaction,
      sendVoice,
      meshNetworkRef.current, // Add ref to deps to update when initialized
    ],
  );
}
