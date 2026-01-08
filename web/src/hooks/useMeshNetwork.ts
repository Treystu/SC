import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MeshNetwork, Message, MessageType, Peer } from "@sc/core";
import { ConnectionMonitor, type ConnectionQuality } from "@sc/core";
import { getDatabase } from "../storage/database";
import { getMeshNetwork } from "../services/mesh-network-service";
import {
  validateFileList,
  rateLimiter,
  performanceMonitor,
  offlineQueue,
} from "@sc/core";
import { RoomClient } from "../utils/RoomClient";
import { useMeshNetworkLogger } from "../utils/unifiedLogger";

export interface MeshStatus {
  isConnected: boolean;
  peerCount: number;
  localPeerId: string;
  connectionQuality: ConnectionQuality;
  initializationError?: string;
  joinError?: string | null;
  isSessionInvalidated?: boolean;
}

export interface ReceivedMessage {
  id: string;
  from: string;
  to?: string;
  conversationId?: string;
  content: string;
  timestamp: number;
  type: MessageType;
  status?: "pending" | "sent" | "delivered" | "read" | "queued" | "failed";
  reactions?: Array<{ userId: string; emoji: string }>;
  metadata?: any;
}

export function useMeshNetwork() {
  const [status, setStatus] = useState<MeshStatus>({
    isConnected: false,
    peerCount: 0,
    localPeerId: "",
    connectionQuality: "offline",
    initializationError: undefined,
    isSessionInvalidated: false,
  });

  // Safe env accessor for both Vite (import.meta.env) and Jest/node (process.env)
  const getRuntimeEnv = () => {
    // In browser environments, use import.meta.env (Vite). In test/node environments use process.env.
    if (typeof import.meta !== "undefined" && import.meta.env) {
      return import.meta.env as Record<string, any>;
    }
    // Fallback for test/node environments
    if (typeof process !== "undefined" && process.env) {
      return process.env as Record<string, any>;
    }
    // Return empty object as last resort
    return {} as Record<string, any>;
  };

  const [identity, setIdentity] = useState<any>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const meshNetworkRef = useRef<MeshNetwork | null>(null);
  const connectionMonitorRef = useRef<ConnectionMonitor | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const roomClientRef = useRef<RoomClient | null>(null);
  const roomPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!meshNetworkRef.current) return;
    const updateIdentity = async () => {
      try {
        const id = meshNetworkRef.current?.getIdentity?.();
        setIdentity(id || null);
      } catch (e) {
        setIdentity(null);
      }
    };
    updateIdentity();
  }, [status.localPeerId]);

  useEffect(() => {
    let retryInterval: NodeJS.Timeout;

    const retryQueuedMessages = async () => {
      if (!meshNetworkRef.current) return;
      await offlineQueue.processQueue(async (msg) => {
        try {
          await meshNetworkRef.current!.sendMessage(
            msg.recipientId,
            msg.content,
          );
          return true;
        } catch (e) {
          return false;
        }
      });
    };

    const initMeshNetwork = async () => {
      try {
        const network = await getMeshNetwork();
        const db = getDatabase();
        console.log("[useMeshNetwork] Starting network...");
        await network.start();
        console.log("[useMeshNetwork] Network started.");
        meshNetworkRef.current = network;
        connectionMonitorRef.current = new ConnectionMonitor();

        try {
          const activePeers = await db.getActivePeers();
          useMeshNetworkLogger.info(
            `Loaded ${activePeers.length} persisted peers`,
          );
          if (activePeers.length > 0) {
            useMeshNetworkLogger.debug(
              "Persisted peers available for reconnection:",
              activePeers.map((p) => p.id.substring(0, 8)).join(", "),
            );
          }
        } catch (error) {
          useMeshNetworkLogger.error("Failed to load peers:", error);
        }

        try {
          const routes = await db.getAllRoutes();
          useMeshNetworkLogger.debug(
            `Loaded ${routes.length} persisted routes`,
          );
        } catch (error) {
          useMeshNetworkLogger.error("Failed to load routes:", error);
        }

        try {
          await db.deleteExpiredRoutes();
          await db.deleteExpiredSessionKeys();
        } catch (error) {
          useMeshNetworkLogger.error("Failed to clean up expired data:", error);
        }

        network.onMessage(async (message: Message) => {
          try {
            const payload = new TextDecoder().decode(message.payload);
            const data = JSON.parse(payload);
            const senderId = Array.from(message.header.senderId as Uint8Array)
              .map((b) => (b as number).toString(16).padStart(2, "0"))
              .join("")
              .substring(0, 8);

            if (senderId === network.getLocalPeerId()) {
              useMeshNetworkLogger.debug("Ignored echo message from self");
              return;
            }

            const messageId =
              data.id || `${message.header.timestamp}-${senderId}`;

            if (seenMessageIdsRef.current.has(messageId)) {
              useMeshNetworkLogger.debug(
                "Duplicate message ignored (in-memory ref):",
                messageId,
              );
              return;
            }

            try {
              const existingMsg = await db.getMessage(messageId);
              if (existingMsg) {
                useMeshNetworkLogger.debug(
                  "Message already exists in DB, ignoring:",
                  messageId,
                );
                seenMessageIdsRef.current.add(messageId);
                return;
              }
            } catch (dbError) {
              useMeshNetworkLogger.warn(
                "Error checking DB for message existence:",
                dbError,
              );
            }

            seenMessageIdsRef.current.add(messageId);

            if (message.header.type === MessageType.MESSAGE_REACTION) {
              const reactionData = data as {
                targetMessageId: string;
                emoji: string;
                action?: "add" | "remove";
                groupId?: string;
              };

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
                  const exists = reactions.some(
                    (r) =>
                      r.userId === senderId && r.emoji === reactionData.emoji,
                  );
                  if (!exists) {
                    targetMsg.reactions = [...reactions, newReaction];
                    await db.saveMessage(targetMsg);
                    useMeshNetworkLogger.debug(
                      `Added reaction ${reactionData.emoji} to ${reactionData.targetMessageId}`,
                    );
                    setMessages((prev) =>
                      prev.map((m) => {
                        if (m.id === reactionData.targetMessageId) {
                          const currentReactions = m.reactions || [];
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
                useMeshNetworkLogger.error("Failed to apply reaction:", e);
              }
              return;
            }

            const receivedMessage: ReceivedMessage = {
              id: messageId,
              from: senderId,
              conversationId: data.groupId || senderId,
              content: data.text || "",
              timestamp: data.timestamp || message.header.timestamp,
              type: message.header.type,
              status: "read",
            };

            setMessages((prev: ReceivedMessage[]) => {
              if (prev.some((m) => m.id === receivedMessage.id)) return prev;
              return [...prev, receivedMessage];
            });

            try {
              await db.saveMessage({
                id: receivedMessage.id,
                conversationId: receivedMessage.conversationId!,
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
                const group = await db.getGroup(data.groupId);
                if (group) {
                  await db.saveGroup({
                    ...group,
                    lastMessageTimestamp: receivedMessage.timestamp,
                    unreadCount: (group.unreadCount || 0) + 1,
                  });
                }
              } else {
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
                  const contact = await db.getContact(receivedMessage.from);
                  const isUnknown = !contact || !contact.verified;

                  await db.saveConversation({
                    id: receivedMessage.from,
                    contactId: receivedMessage.from,
                    lastMessageTimestamp: receivedMessage.timestamp,
                    unreadCount: 1,
                    createdAt: Date.now(),
                    lastMessageId: receivedMessage.id,
                    metadata: isUnknown ? { requestStatus: 'pending', isRequest: true } : undefined
                  });
                }
              }
            } catch (error) {
              useMeshNetworkLogger.error("Failed to persist message:", error);
            }
          } catch (error) {
            useMeshNetworkLogger.error("Failed to parse message:", error);
          }
        });

        network.onPeerConnected(async (peerId: string) => {
          useMeshNetworkLogger.info("Peer connected:", peerId);
          updatePeerStatus();
          retryQueuedMessages();

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
              reputation: 50,
              isBlacklisted: false,
            });
            useMeshNetworkLogger.debug(
              "initMeshNetwork: triggering initial retry of queued messages",
            );
          } catch (error) {
            useMeshNetworkLogger.error("Failed to persist peer:", error);
          }
        });

        network.onPeerDisconnected(async (peerId: string) => {
          useMeshNetworkLogger.info("Peer disconnected:", peerId);
          updatePeerStatus();
          try {
            const peer = await db.getPeer(peerId);
            if (peer) {
              peer.lastSeen = Date.now();
              await db.savePeer(peer);
            }
          } catch (error) {
            useMeshNetworkLogger.error(
              "Failed to update peer last seen:",
              error,
            );
          }
        });

        network.discovery.onPeerDiscovered((peer) => {
          useMeshNetworkLogger.debug(
            "Discovered peer via Mesh Discovery:",
            peer,
          );
          setDiscoveredPeers((prev) => {
            if (prev.includes(peer.id)) return prev;
            return [...prev, peer.id];
          });
        });

        // Handle session invalidation (single-session enforcement)
        network.onSessionInvalidated(() => {
          useMeshNetworkLogger.warn(
            "Session invalidated: Another session with this identity has been detected.",
          );
          setStatus((prev) => ({ ...prev, isSessionInvalidated: true }));
        });

        const updatePeerStatus = () => {
          const connectedPeers = network.getConnectedPeers();
          setPeers(connectedPeers);
          setStatus((prev: MeshStatus) => ({
            ...prev,
            peerCount: connectedPeers.length,
            isConnected: connectedPeers.length > 0,
          }));

          if (connectionMonitorRef.current) {
            const monitor = connectionMonitorRef.current;
            monitor.updateLatency(Math.random() * 100);
            monitor.updatePacketLoss(100, 100 - Math.random() * 5);
            setStatus((prev) => ({
              ...prev,
              connectionQuality: monitor.getQuality(),
            }));
          }
        };

        retryInterval = setInterval(retryQueuedMessages, 30000);
        retryQueuedMessages();

        let localId = network.getLocalPeerId();
        try {
          if (!localId && network.getIdentity) {
            const idObj = network.getIdentity();
            if (idObj && idObj.publicKey) {
              const pk = idObj.publicKey as Uint8Array;
              localId = Array.from(pk)
                .slice(0, 8)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            }
          }
        } catch (e) {
          useMeshNetworkLogger.debug(
            "Could not derive local ID from identity fingerprint",
          );
        }

        setStatus({
          isConnected: true,
          peerCount: 0,
          localPeerId: localId || "",
          connectionQuality: "good",
          initializationError: undefined,
        });
      } catch (error) {
        if ((error as Error).message === "NO_IDENTITY") {
          useMeshNetworkLogger.info("No identity found, waiting for onboarding.");
          return;
        }
        useMeshNetworkLogger.error("Failed to initialize mesh network:", error);
        setStatus((prev) => ({
          ...prev,
          initializationError:
            error instanceof Error ? error.message : String(error),
        }));
        return;
      }
    };

    initMeshNetwork();

    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === "SYNC_OFFLINE_MESSAGES") {
        useMeshNetworkLogger.debug("Received sync request from Service Worker");
        await retryQueuedMessages();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    }

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

  const connectToPeer = useCallback(async (peerId: string) => {
    const endMeasure = performanceMonitor.startMeasure("connectToPeer");
    useMeshNetworkLogger.info(`connectToPeer called for ${peerId}`);

    if (!meshNetworkRef.current) {
      useMeshNetworkLogger.error(
        "connectToPeer failed: Mesh network not initialized",
      );
      throw new Error("Mesh network not initialized");
    }

    const alreadyConnected =
      meshNetworkRef.current &&
      typeof (meshNetworkRef.current as any).isConnectedToPeer === "function"
        ? (meshNetworkRef.current as any).isConnectedToPeer(peerId)
        : Boolean(
            meshNetworkRef.current &&
            meshNetworkRef.current.getConnectedPeers &&
            meshNetworkRef.current
              .getConnectedPeers()
              .some((p: Peer) => p.id === peerId),
          );

    if (alreadyConnected) {
      useMeshNetworkLogger.debug(`Already connected to ${peerId}`);
      return;
    }

    try {
      if (roomClientRef.current) {
        useMeshNetworkLogger.info(
          `Initiating connection to ${peerId} via Room Signaling...`,
        );
        const offerJson =
          await meshNetworkRef.current.createManualConnection(peerId);
        let offerData: any;
        try {
          offerData = JSON.parse(offerJson as string);
        } catch (parseErr) {
          // Accept raw strings from mocks
          offerData = offerJson;
        }
        useMeshNetworkLogger.debug(
          `Sending SDP offer to ${peerId} via Room...`,
        );
        await roomClientRef.current.signal(peerId, "offer", offerData);
        useMeshNetworkLogger.debug("SDP offer sent via Room");
      } else {
        useMeshNetworkLogger.info(
          `Initiating connection to ${peerId} via Mesh/Local...`,
        );
        await meshNetworkRef.current.connectToPeer(peerId);
      }
      endMeasure({ success: true });
      useMeshNetworkLogger.info(
        `Connection initiated to ${peerId}, waiting for peer to accept...`,
      );
    } catch (error) {
      useMeshNetworkLogger.error(`Failed to connect to ${peerId}:`, error);
      endMeasure({ success: false, error: (error as Error).message });
      throw error;
    }
  }, []);

  const sendMessage = useCallback(
    async (
      recipientId: string,
      content: string,
      attachments?: File[],
      groupId?: string,
    ) => {
      const endMeasure = performanceMonitor.startMeasure("sendMessage");
      if (!meshNetworkRef.current) {
        useMeshNetworkLogger.error(
          "sendMessage failed: Mesh network not initialized",
        );
        throw new Error("Mesh network not initialized");
      }

      useMeshNetworkLogger.info(
        `sendMessage to ${recipientId}: "${content.substring(0, 50)}${content.length > 50 ? "..." : ""}"`,
      );

      // Handle File Attachments separately for now (keeping original logic for files, can optimize later)
      if (attachments && attachments.length > 0) {
        let messageStatus: "sent" | "queued" = "sent";
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

        // Connect if needed (blocking for files currently - acceptable)
        const isConnected =
          meshNetworkRef.current &&
          typeof (meshNetworkRef.current as any).isConnectedToPeer ===
            "function"
            ? (meshNetworkRef.current as any).isConnectedToPeer(recipientId)
            : Boolean(
                meshNetworkRef.current &&
                meshNetworkRef.current.getConnectedPeers &&
                meshNetworkRef.current
                  .getConnectedPeers()
                  .some((p: Peer) => p.id === recipientId),
              );

        if (!isConnected) {
          try {
            await connectToPeer(recipientId);
          } catch (e) {
            useMeshNetworkLogger.warn("Connect failed for file transfer", e);
          }
        }

        for (const file of attachments) {
          const fileId = `${Date.now()}-${Math.random()}`;
          const fileMetadata = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            content,
            groupId,
          };

          try {
            const payload = JSON.stringify({
              type: "file_start",
              metadata: fileMetadata,
            });
            await meshNetworkRef.current.sendMessage(recipientId, payload);

            const CHUNK_SIZE = 16 * 1024;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const fileIdBytes = new TextEncoder().encode(
              fileId.padEnd(36, " ").substring(0, 36),
            );
            const buffer = await file.arrayBuffer();

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, file.size);
              const chunkData = new Uint8Array(buffer.slice(start, end));
              const chunkPayload = new Uint8Array(
                36 + 4 + 4 + chunkData.length,
              );
              const view = new DataView(chunkPayload.buffer);
              chunkPayload.set(fileIdBytes, 0);
              view.setUint32(36, i, false);
              view.setUint32(40, totalChunks, false);
              chunkPayload.set(chunkData, 44);
              await meshNetworkRef.current.sendBinaryMessage(
                recipientId,
                chunkPayload,
              );
              if (i % 10 === 0) await new Promise((r) => setTimeout(r, 10));
            }
          } catch (error) {
            useMeshNetworkLogger.error("Failed to send file:", error);
            messageStatus = "queued";
          }

          const localFileMessage: ReceivedMessage = {
            id: fileId,
            from: "me",
            to: recipientId,
            conversationId: groupId || recipientId,
            content: `Sent file: ${file.name}`,
            timestamp: Date.now(),
            type: MessageType.FILE_METADATA,
            status: messageStatus,
          };

          setMessages((prev: ReceivedMessage[]) => [...prev, localFileMessage]);

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
                groupId,
              },
            });
          } catch (error) {
            useMeshNetworkLogger.error(
              "Failed to persist file message:",
              error,
            );
          }
        }
        return;
      }

      // --- OPTIMISTIC TEXT MESSAGE HANDLING ---

      // 1. Prepare message object immediately
      const tempId = `${Date.now()}-${Math.random()}`;
      const localMessage: ReceivedMessage = {
        id: tempId,
        from: "me",
        to: recipientId,
        conversationId: groupId || recipientId,
        content: content,
        timestamp: Date.now(),
        type: MessageType.TEXT,
        status: "pending",
      };

      // 2. Immediate Optimistic Update
      setMessages((prev: ReceivedMessage[]) => [...prev, localMessage]);

      // Optimistic persistence
      try {
        const db = getDatabase();
        await db.saveMessage({
          id: localMessage.id,
          conversationId: localMessage.conversationId!,
          content: localMessage.content,
          timestamp: localMessage.timestamp,
          senderId: meshNetworkRef.current!.getLocalPeerId(),
          recipientId,
          type: "text",
          status: "pending",
        });

        const convId = groupId || recipientId;
        const conversation = await db.getConversation(convId);
        if (conversation) {
          await db.saveConversation({
            ...conversation,
            lastMessageTimestamp: localMessage.timestamp,
            lastMessageId: localMessage.id,
          });
        } else {
          await db.saveConversation({
            id: convId,
            contactId: convId,
            lastMessageTimestamp: localMessage.timestamp,
            lastMessageId: localMessage.id,
            unreadCount: 0,
            createdAt: Date.now(),
          });
        }
      } catch (dbErr) {
        useMeshNetworkLogger.warn("Failed to save optimistic message:", dbErr);
      }

      // 3. Network Logic
      let finalStatus: "sent" | "queued" = "sent";
      try {
        const isConnected =
          meshNetworkRef.current &&
          typeof (meshNetworkRef.current as any).isConnectedToPeer ===
            "function"
            ? (meshNetworkRef.current as any).isConnectedToPeer(recipientId)
            : Boolean(
                meshNetworkRef.current &&
                meshNetworkRef.current.getConnectedPeers &&
                meshNetworkRef.current
                  .getConnectedPeers()
                  .some((p: Peer) => p.id === recipientId),
              );

        if (!isConnected) {
          useMeshNetworkLogger.warn(
            `Not connected to ${recipientId}. Attempting to connect...`,
          );
          // Timeout connection attempt to avoid hanging
          const connectPromise = connectToPeer(recipientId);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout")), 5000),
          );
          await Promise.race([connectPromise, timeoutPromise]);
        }

        const rateLimitResult = rateLimiter.canSendMessage(
          meshNetworkRef.current.getLocalPeerId(),
        );
        if (!rateLimitResult.allowed) {
          throw new Error(rateLimitResult.reason);
        }

        const payload = JSON.stringify({
          text: content,
          timestamp: Date.now(),
          groupId,
        });
        await meshNetworkRef.current.sendMessage(recipientId, payload);
        endMeasure({ success: true });
      } catch (error) {
        useMeshNetworkLogger.error("Failed to send message to network:", error);
        await offlineQueue.enqueue({
          recipientId,
          content,
          timestamp: Date.now(),
        });
        finalStatus = "queued";
        endMeasure({ success: false, error: (error as Error).message });
      }

      // 4. Update Status
      try {
        const db = getDatabase();
        // We need to re-fetch to ensure we don't overwrite if it changed?
        // Actually we just update status field.
        const msg = await db.getMessage(tempId);
        if (msg) {
          msg.status = finalStatus;
          await db.saveMessage(msg);
        }
      } catch (e) {
        useMeshNetworkLogger.error("Failed to update message status:", e);
      }
    },
    [connectToPeer],
  );

  const getStats = useCallback(async () => {
    if (!meshNetworkRef.current) return null;
    return await meshNetworkRef.current.getStats();
  }, []);

  const generateConnectionOffer = useCallback(async (): Promise<string> => {
    const endMeasure = performanceMonitor.startMeasure(
      "generateConnectionOffer",
    );
    if (!meshNetworkRef.current) {
      throw new Error("Mesh network not initialized");
    }
    const db = getDatabase();
    const identity = await db.getPrimaryIdentity();
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
              useMeshNetworkLogger.debug(
                `Saved contact from QR: ${offerData.displayName}`,
              );
            }
          } catch (e) {
            useMeshNetworkLogger.error("Error saving QR contact:", e);
          }
        }

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
      await meshNetworkRef.current.sendMessage(
        recipientId,
        payload,
        0x05 as MessageType,
      );
      const db = getDatabase();
      const targetMsg = await db.getMessage(targetMessageId);
      if (targetMsg) {
        const reactions = targetMsg.reactions || [];
        const newReaction = {
          userId: meshNetworkRef.current.getLocalPeerId(),
          emoji,
        };
        if (
          !reactions.some(
            (r) => r.userId === newReaction.userId && r.emoji === emoji,
          )
        ) {
          targetMsg.reactions = [...reactions, newReaction];
          await db.saveMessage(targetMsg);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === targetMessageId) {
                const currentReactions = m.reactions || [];
                return { ...m, reactions: [...currentReactions, newReaction] };
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
      await meshNetworkRef.current.sendBinaryMessage(
        recipientId,
        data,
        0x04 as MessageType,
      );
      const db = getDatabase();
      const messageId = `msg-voice-${Date.now()}`;
      const newMessage: any = {
        id: messageId,
        conversationId: groupId || recipientId,
        senderId: meshNetworkRef.current.getLocalPeerId(),
        recipientId,
        content: "[Voice Message]",
        timestamp: Date.now(),
        type: "voice",
        status: "sent",
        metadata: { duration, blob: audioBlob },
      };

      try {
        await db.saveMessage(newMessage);
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
        setMessages((prev) => [
          ...prev,
          {
            ...newMessage,
            from: newMessage.senderId,
            to: newMessage.recipientId,
            type: 0x04 as MessageType,
          },
        ]);
      } catch (err) {
        useMeshNetworkLogger.error("Failed to save local voice message:", err);
      }
    },
    [],
  );

  const [joinError, setJoinError] = useState<string | null>(null);
  const [discoveredPeers, setDiscoveredPeers] = useState<string[]>([]);
  const [roomMessages, setRoomMessages] = useState<any[]>([]);
  const [isJoinedToRoom, setIsJoinedToRoom] = useState(false);

  const joinRoom = useCallback(
    async (url: string): Promise<void> => {
      if (!meshNetworkRef.current)
        throw new Error("Mesh network not initialized");
      const localPeerId = meshNetworkRef.current.getLocalPeerId();
      setJoinError(null);
      setRoomMessages([]);
      setIsJoinedToRoom(true);

      try {
        const roomClient = new RoomClient(url, localPeerId);
        roomClientRef.current = roomClient;

        // Wire up WebRTC signaling to Room signalling path
        if (
          meshNetworkRef.current &&
          typeof (meshNetworkRef.current as any).registerSignalingCallback === "function"
        ) {
          (meshNetworkRef.current as any).registerSignalingCallback(async (peerId: string, signal: any) => {
            if (roomClientRef.current) {
              await roomClientRef.current.signal(peerId, signal.type, signal);
            }
          });
        }
        if (
          meshNetworkRef.current &&
          meshNetworkRef.current.discovery &&
          typeof meshNetworkRef.current.discovery.registerProvider ===
            "function"
        ) {
          try {
            meshNetworkRef.current.discovery.registerProvider(
              roomClient as any,
            );
            useMeshNetworkLogger.info("Registered room discovery provider");
            if (typeof meshNetworkRef.current.discovery.start === "function") {
              meshNetworkRef.current.discovery.start();
              useMeshNetworkLogger.info("Started room discovery provider");
            }
          } catch (e) {
            useMeshNetworkLogger.warn(
              "Failed to register/start room discovery provider:",
              e,
            );
          }
        }
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

        const peers = await roomClient.join(metadata);
        useMeshNetworkLogger.info(`Joined room, active peers: ${peers.length}`);

        setDiscoveredPeers((prev) => {
          const newPeers = peers
            .map((p) => p._id)
            .filter((id) => !prev.includes(id) && id !== localPeerId);
          return [...prev, ...newPeers];
        });

        if (roomPollTimerRef.current) clearTimeout(roomPollTimerRef.current);

        const pollLoop = async () => {
          if (!roomClientRef.current) return;

          try {
            const peerCount =
              meshNetworkRef.current &&
              typeof (meshNetworkRef.current as any).getPeerCount === "function"
                ? (meshNetworkRef.current as any).getPeerCount()
                : meshNetworkRef.current &&
                    meshNetworkRef.current.getConnectedPeers
                  ? meshNetworkRef.current.getConnectedPeers().length
                  : 0;
            
            const discoveredCount = discoveredPeers.length;
            const pendingConnections = discoveredCount - peerCount;
            const hasPendingConnections = pendingConnections > 0;
            
            let nextDelay: number;
            if (hasPendingConnections) {
              nextDelay = 1000;
            } else if (peerCount < 3) {
              nextDelay = 2000;
            } else if (peerCount < 10) {
              nextDelay = 10000;
            } else {
              nextDelay = 30000;
            }

            const { signals, messages, peers } =
              await roomClientRef.current.poll();

            if (peers && peers.length > 0) {
              const db = getDatabase();
              
              const newPeerIds = peers
                .filter((p) => p._id !== localPeerId)
                .map((p) => p._id);
              
              setDiscoveredPeers((prev) => {
                const combined = new Set([...prev, ...newPeerIds]);
                return Array.from(combined);
              });
              
              for (const p of peers) {
                if (p.metadata && p._id !== localPeerId) {
                  try {
                    const existing =
                      typeof db.getContact === "function"
                        ? await db.getContact(p._id)
                        : null;
                    if (!existing && p.metadata.displayName) {
                      useMeshNetworkLogger.debug(
                        `Discovered new peer ${p.metadata.displayName} (${p._id})`,
                      );
                      if (typeof db.saveContact === "function") {
                        await db.saveContact({
                          id: p._id,
                          publicKey: p.metadata.publicKey || "",
                          displayName: p.metadata.displayName,
                          lastSeen: Date.now(),
                          createdAt: Date.now(),
                          fingerprint: "",
                          verified: false,
                          blocked: false,
                          endpoints: [{ type: "room" }],
                        });
                      }
                    }

                    if (
                      meshNetworkRef.current &&
                      meshNetworkRef.current.getConnectedPeers
                    ) {
                      const connected =
                        meshNetworkRef.current.getConnectedPeers();
                      if (!connected.some((cp) => cp.id === p._id)) {
                        useMeshNetworkLogger.debug(
                          `[Room Bootstrap] Auto-connecting to discovered room peer: ${p._id}`,
                        );
                        
                        const connectWithTimeout = async (peerId: string, timeoutMs: number = 10000): Promise<void> => {
                          const timeoutPromise = new Promise<never>((_, reject) => {
                            setTimeout(() => reject(new Error(`Connection timeout after ${timeoutMs}ms`)), timeoutMs);
                          });
                          
                          const connectPromise = meshNetworkRef.current!.connectToPeer(peerId);
                          
                          return Promise.race([connectPromise, timeoutPromise]);
                        };
                        
                        connectWithTimeout(p._id, 10000)
                          .then(() => {
                            useMeshNetworkLogger.info(
                              `[Room Bootstrap] Successfully connected to ${p._id}`,
                            );
                          })
                          .catch((err) => {
                            useMeshNetworkLogger.debug(
                              `[Room Bootstrap] Failed to connect to ${p._id}:`,
                              err,
                            );
                          });
                      }
                    }
                  } catch (err) {
                    useMeshNetworkLogger.error(
                      "Error saving discovered peer contact:",
                      err,
                    );
                  }
                }
              }
            }

            if (messages && messages.length > 0) {
              setRoomMessages((prev) => {
                const newMsgs = messages.filter(
                  (m) => !prev.some((existing) => existing.id === m.id),
                );
                if (newMsgs.length === 0) return prev;
                return [...prev, ...newMsgs];
              });
            }

            if (signals && signals.length > 0) {
              useMeshNetworkLogger.info(
                `Received ${signals.length} signals from Room`,
              );
              for (const sig of signals) {
                try {
                  const signalData =
                    typeof sig.signal === "string"
                      ? JSON.parse(sig.signal)
                      : sig.signal;

                  if (sig.type === "offer" || signalData.type === "offer") {
                    useMeshNetworkLogger.info(
                      `📥 Received OFFER from ${sig.from}`,
                      { signalType: signalData.type, hasSdp: !!signalData.sdp },
                    );

                    const answerJson =
                      await meshNetworkRef.current!.acceptManualConnection(
                        JSON.stringify({
                          peerId: sig.from,
                          sdp: signalData.sdp || signalData,
                        }),
                      );
                    const answerData = JSON.parse(answerJson);

                    useMeshNetworkLogger.info(
                      `📤 Sending ANSWER to ${sig.from}`,
                      { answerSdp: !!answerData.sdp },
                    );
                    await roomClientRef.current!.signal(sig.from, "answer", {
                      type: "answer",
                      sdp: answerData.sdp,
                    });
                    useMeshNetworkLogger.info(`Answer sent to ${sig.from}`);
                  } else if (
                    sig.type === "answer" ||
                    signalData.type === "answer"
                  ) {
                    useMeshNetworkLogger.info(
                      `📥 Received ANSWER from ${sig.from}`,
                      { signalType: signalData.type, hasSdp: !!signalData.sdp },
                    );

                    await meshNetworkRef.current!.finalizeManualConnection(
                      JSON.stringify({
                        peerId: sig.from,
                        sdp: signalData.sdp || signalData,
                      }),
                    );
                    useMeshNetworkLogger.info(
                      `Connection finalized with ${sig.from}`,
                    );
                  } else if (
                    sig.type === "candidate" ||
                    signalData.type === "candidate" ||
                    signalData.candidate
                  ) {
                    useMeshNetworkLogger.debug(
                      `📥 Received ICE candidate from ${sig.from}`,
                    );
                    
                    if (meshNetworkRef.current && 
                        typeof (meshNetworkRef.current as any).handleIceCandidate === "function") {
                      await (meshNetworkRef.current as any).handleIceCandidate(
                        sig.from,
                        signalData.candidate || signalData,
                      );
                    }
                  }
                } catch (e) {
                  useMeshNetworkLogger.error(
                    `Error processing signal from ${sig.from}:`,
                    e,
                  );
                }
              }
            }

            roomPollTimerRef.current = setTimeout(pollLoop, nextDelay);
          } catch (e) {
            useMeshNetworkLogger.warn("Poll failed, retrying in 10s:", e);
            roomPollTimerRef.current = setTimeout(pollLoop, 10000);
          }
        };

        pollLoop();
      } catch (error) {
        useMeshNetworkLogger.error("Failed to join room:", error);
        setJoinError(error instanceof Error ? error.message : String(error));
        setIsJoinedToRoom(false);
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

    if (meshNetworkRef.current) {
      meshNetworkRef.current.discovery.stop();
    }

    setDiscoveredPeers([]);
    setRoomMessages([]);
    setIsJoinedToRoom(false);
  }, []);

  const sendRoomMessage = useCallback(async (content: string) => {
    if (!roomClientRef.current) {
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

  useEffect(() => {
    const env = getRuntimeEnv();
    const shouldSkipAutoJoin =
      env.MODE === "test" ||
      env.VITE_E2E === "true" ||
      (typeof navigator !== "undefined" &&
        "webdriver" in navigator &&
        navigator.webdriver === true);

    if (shouldSkipAutoJoin) return;

    if (status.isConnected && !isJoinedToRoom) {
      const ROOM_URL = "/.netlify/functions/room";
      joinRoom(ROOM_URL).catch((err) => {
        useMeshNetworkLogger.error(
          "Failed to auto-join public room on init:",
          err,
        );
      });
    }
  }, [status.isConnected, isJoinedToRoom, joinRoom]);

  useEffect(() => {
    const connectToKnownPeers = async () => {
      if (!meshNetworkRef.current) return;
      const db = getDatabase();
      const conversations =
        typeof db.getConversations === "function"
          ? await db.getConversations()
          : [];
      const knownPeerIds = (conversations || []).map((c: any) => c.contactId);

      for (const peerId of discoveredPeers) {
        const alreadyConnected =
          typeof (meshNetworkRef.current as any).isConnectedToPeer ===
          "function"
            ? (meshNetworkRef.current as any).isConnectedToPeer(peerId)
            : Boolean(
                meshNetworkRef.current &&
                meshNetworkRef.current.getConnectedPeers &&
                meshNetworkRef.current
                  .getConnectedPeers()
                  .some((p: Peer) => p.id === peerId),
              );

        if (knownPeerIds.includes(peerId) && !alreadyConnected) {
          useMeshNetworkLogger.debug(
            `Auto-connecting to known peer from Room: ${peerId}`,
          );
          connectToPeer(peerId).catch(console.warn);
        }
      }
    };
    connectToKnownPeers();
  }, [discoveredPeers, connectToPeer]);

  const [hasBootstrapped, setHasBootstrapped] = useState(false);

  useEffect(() => {
    if (status.peerCount > 0 && !hasBootstrapped && meshNetworkRef.current) {
      const timer = setTimeout(() => {
        useMeshNetworkLogger.info(
          `Peers connected (count: ${status.peerCount}), starting DHT bootstrap...`,
        );
        meshNetworkRef.current
          ?.bootstrap()
          .then(() => {
            useMeshNetworkLogger.info("DHT Bootstrap finished successfully.");
            setHasBootstrapped(true);
          })
          .catch((err: unknown) => {
            useMeshNetworkLogger.error("DHT Bootstrap failed:", err);
          });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status.peerCount, hasBootstrapped]);

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
      identity,
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
      identity,
      sendReaction,
      sendVoice,
    ],
  );
}
