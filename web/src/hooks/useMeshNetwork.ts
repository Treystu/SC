import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MeshNetwork, Message, MessageType, Peer } from '@sc/core';
import { ConnectionMonitor, ConnectionQuality } from '../../../core/src/connection-quality';
import { getDatabase } from '../storage/database';
import { createSignalingOffer, handleSignalingAnswer } from '../utils/manualSignaling';
import { WebPersistenceAdapter } from '../utils/WebPersistenceAdapter';
import { validateFileList } from '../../../core/src/file-validation';
import { rateLimiter } from '../../../core/src/rate-limiter';
import { performanceMonitor } from '../../../core/src/performance-monitor';
import { offlineQueue } from '../../../core/src/offline-queue';

export interface MeshStatus {
  isConnected: boolean;
  peerCount: number;
  localPeerId: string;
  connectionQuality: ConnectionQuality;
  initializationError?: string;
}

export interface ReceivedMessage {
  id: string;
  from: string;
  to?: string; // Add recipient for local messages
  conversationId?: string; // Explicit conversation ID
  content: string;
  timestamp: number;
  type: MessageType;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'queued' | 'failed';
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
    localPeerId: '',
    connectionQuality: 'offline',
    initializationError: undefined,
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const meshNetworkRef = useRef<MeshNetwork | null>(null);
  const connectionMonitorRef = useRef<ConnectionMonitor | null>(null);

  // Initialize mesh network with persistence
  useEffect(() => {
    let retryInterval: NodeJS.Timeout;

    const initMeshNetwork = async () => {
      try {
        // Initialize database
        const db = getDatabase();
        await db.init();

        // Load persisted identity (if exists) or generate new one
        let identityKeyPair;
        try {
          const storedIdentity = await db.getPrimaryIdentity();
          if (storedIdentity) {
            console.log('Loaded persisted identity:', storedIdentity.fingerprint);
            identityKeyPair = {
              publicKey: storedIdentity.publicKey,
              privateKey: storedIdentity.privateKey
            };
          } else {
            console.log('No persisted identity found, generating new one...');
            const { generateIdentity, generateFingerprint, publicKeyToBase64 } = await import('@sc/core');
            const newIdentity = generateIdentity();
            const fingerprint = await generateFingerprint(newIdentity.publicKey);

            // Save to database
            await db.saveIdentity({
              id: fingerprint.substring(0, 16), // Use first 16 chars of fingerprint as ID
              publicKey: newIdentity.publicKey,
              privateKey: newIdentity.privateKey,
              fingerprint: fingerprint,
              createdAt: Date.now(),
              isPrimary: true,
              label: 'Primary Identity'
            });

            identityKeyPair = newIdentity;
            console.log('Generated and saved new identity:', fingerprint);
          }
        } catch (error) {
          console.error('Failed to load/generate identity:', error);
          // Fallback to temporary identity if DB fails
          const { generateIdentity } = await import('@sc/core');
          identityKeyPair = generateIdentity();
        }

        const network = new MeshNetwork({
          defaultTTL: 10,
          maxPeers: 50,
          persistence: new WebPersistenceAdapter(),
          identity: identityKeyPair
        });

        meshNetworkRef.current = network;
        connectionMonitorRef.current = new ConnectionMonitor();

        // Load persisted peers and populate routing table
        try {
          const activePeers = await db.getActivePeers();
          console.log(`Loaded ${activePeers.length} persisted peers`);

          // Note: Persisted peers will be used to attempt reconnection
          // The routing table is rebuilt dynamically as connections are established
          if (activePeers.length > 0) {
            console.log('Persisted peers available for reconnection:',
              activePeers.map(p => p.id.substring(0, 8)).join(', '));
          }
        } catch (error) {
          console.error('Failed to load peers:', error);
        }

        // Load persisted routes
        try {
          const routes = await db.getAllRoutes();
          console.log(`Loaded ${routes.length} persisted routes`);

          // Note: Routes are rebuilt dynamically through peer announcements
          // Persisted routes serve as hints for initial connectivity
        } catch (error) {
          console.error('Failed to load routes:', error);
        }

        // Clean up expired data
        try {
          await db.deleteExpiredRoutes();
          await db.deleteExpiredSessionKeys();
        } catch (error) {
          console.error('Failed to clean up expired data:', error);
        }

        // Update status
        setStatus({
          isConnected: true,
          peerCount: 0,
          localPeerId: network.getLocalPeerId(),
          connectionQuality: 'good',
          initializationError: undefined,
        });
      } catch (error) {
        console.error('Failed to initialize mesh network:', error);
        setStatus(prev => ({
          ...prev,
          initializationError: error instanceof Error ? error.message : String(error)
        }));
        return; // Stop initialization on critical error
      }

      // Handle incoming messages with persistence
      network.onMessage(async (message: Message) => {
        try {
          const payload = new TextDecoder().decode(message.payload);
          const data = JSON.parse(payload);

          const senderId = Array.from(message.header.senderId as Uint8Array)
            .map((b) => (b as number).toString(16).padStart(2, '0'))
            .join('')
            .substring(0, 8); // Simplified ID for now

          // In a real app, we'd map this ID to a contact

          const receivedMessage: ReceivedMessage = {
            id: `${message.header.timestamp}-${Math.random()}`,
            from: senderId,
            conversationId: senderId, // Incoming message belongs to sender's conversation
            content: data.text || '',
            timestamp: data.timestamp || message.header.timestamp,
            type: message.header.type,
            status: 'read', // Assume read for simplicity in this demo
          };

          setMessages((prev: ReceivedMessage[]) => [...prev, receivedMessage]);

          // Persist message to IndexedDB
          try {
            await db.saveMessage({
              id: receivedMessage.id,
              conversationId: receivedMessage.from, // Use sender as conversation ID for now
              content: receivedMessage.content,
              timestamp: receivedMessage.timestamp,
              senderId: receivedMessage.from,
              recipientId: network.getLocalPeerId(),
              type: receivedMessage.type === MessageType.TEXT ? 'text' :
                receivedMessage.type === MessageType.FILE_METADATA || receivedMessage.type === MessageType.FILE_CHUNK ? 'file' :
                  receivedMessage.type === MessageType.VOICE ? 'voice' : 'text',
              status: 'delivered',
            });
          } catch (error) {
            console.error('Failed to persist message:', error);
          }
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      // Handle peer connected with persistence
      network.onPeerConnected(async (peerId: string) => {
        console.log('Peer connected:', peerId);
        updatePeerStatus();
        // retryQueuedMessages();

        // Persist peer connection
        try {
          await db.savePeer({
            id: peerId,
            publicKey: '', // TODO: Get actual public key
            transportType: 'webrtc',
            lastSeen: Date.now(),
            connectedAt: Date.now(),
            connectionQuality: 100,
            bytesSent: 0,
            bytesReceived: 0,
            reputation: 50, // Start with neutral reputation
            isBlacklisted: false,
          });
        } catch (error) {
          console.error('Failed to persist peer:', error);
        }
      });

      // Handle peer disconnected with persistence
      network.onPeerDisconnected(async (peerId: string) => {
        console.log('Peer disconnected:', peerId);
        updatePeerStatus();

        // Update peer's last seen time
        try {
          const peer = await db.getPeer(peerId);
          if (peer) {
            peer.lastSeen = Date.now();
            await db.savePeer(peer);
          }
        } catch (error) {
          console.error('Failed to update peer last seen:', error);
        }
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
          setStatus(prev => ({ ...prev, connectionQuality: monitor.getQuality() }));
        }
      };

      // Process offline queue
      const retryQueuedMessages = async () => {
        if (!meshNetworkRef.current) return;

        await offlineQueue.processQueue(async (msg) => {
          try {
            await meshNetworkRef.current!.sendMessage(msg.recipientId, msg.content);
            return true; // Sent successfully
          } catch (e) {
            return false; // Failed to send
          }
        });
      };

      // Set up periodic retry
      retryInterval = setInterval(retryQueuedMessages, 30000); // 30 seconds

      // Initial retry
      retryQueuedMessages();

    };

    initMeshNetwork();

    // Cleanup on unmount
    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (meshNetworkRef.current) {
        meshNetworkRef.current.shutdown();
        meshNetworkRef.current = null;
      }
    };
  }, []);

  // Send message function with persistence
  const sendMessage = useCallback(async (recipientId: string, content: string, attachments?: File[]) => {
    const endMeasure = performanceMonitor.startMeasure('sendMessage');
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }

    let messageStatus: 'sent' | 'queued' = 'sent';

    // Handle file attachments
    if (attachments && attachments.length > 0) {
      const validationResult = validateFileList(attachments);
      if (!validationResult.valid) {
        throw new Error(validationResult.error || 'Invalid file');
      }

      const fileRateLimitResult = rateLimiter.canSendFile(meshNetworkRef.current.getLocalPeerId());
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
          content: content // Optional caption
        };

        try {
          // Send file start metadata
          const payload = JSON.stringify({
            type: 'file_start',
            metadata: fileMetadata
          });

          await meshNetworkRef.current.sendMessage(recipientId, payload);

          // Chunking logic
          const CHUNK_SIZE = 16 * 1024; // 16KB chunks
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
          const fileIdBytes = new TextEncoder().encode(fileId.padEnd(36, ' ').substring(0, 36));
          const buffer = await file.arrayBuffer();

          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunkData = new Uint8Array(buffer.slice(start, end));

            // Construct chunk payload: [FileID (36)][Index (4)][Total (4)][Data]
            const chunkPayload = new Uint8Array(36 + 4 + 4 + chunkData.length);
            const view = new DataView(chunkPayload.buffer);

            chunkPayload.set(fileIdBytes, 0);
            view.setUint32(36, i, false); // Big endian
            view.setUint32(40, totalChunks, false);
            chunkPayload.set(chunkData, 44);

            await meshNetworkRef.current.sendBinaryMessage(recipientId, chunkPayload);

            // Optional: minimal delay to prevent flooding
            if (i % 10 === 0) await new Promise(r => setTimeout(r, 10));
          }
        } catch (error) {
          console.error('Failed to send file:', error);
          messageStatus = 'queued';
        }

        // Add to local messages
        const localFileMessage: ReceivedMessage = {
          id: fileId,
          from: 'me',
          to: recipientId,
          conversationId: recipientId,
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
            conversationId: recipientId,
            content: localFileMessage.content,
            timestamp: localFileMessage.timestamp,
            senderId: meshNetworkRef.current!.getLocalPeerId(),
            recipientId,
            type: 'file',
            status: messageStatus,
            metadata: {
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type
            }
          });
        } catch (error) {
          console.error('Failed to persist file message:', error);
        }
      }
      return;
    }

    // Handle text message
    const rateLimitResult = rateLimiter.canSendMessage(meshNetworkRef.current.getLocalPeerId());
    if (!rateLimitResult.allowed) {
      throw new Error(rateLimitResult.reason);
    }

    try {
      await meshNetworkRef.current.sendMessage(recipientId, content);
      endMeasure({ success: true });
    } catch (error) {
      console.error('Failed to send message to network:', error);
      // Enqueue the message for later retry
      await offlineQueue.enqueue({
        recipientId,
        content,
        timestamp: Date.now(),
      });
      messageStatus = 'queued';
      endMeasure({ success: false, error: (error as Error).message });
    }

    // Add to local messages (optimistic update)
    const localMessage: ReceivedMessage = {
      id: `${Date.now()}-${Math.random()}`,
      from: 'me',
      to: recipientId,
      conversationId: recipientId, // Outgoing message belongs to recipient's conversation
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
        conversationId: recipientId,
        content: localMessage.content,
        timestamp: localMessage.timestamp,
        senderId: meshNetworkRef.current!.getLocalPeerId(),
        recipientId,
        type: 'text',
        status: messageStatus,
      });
    } catch (error) {
      console.error('Failed to persist sent message:', error);
    }
  }, []);

  // Connect to peer
  const connectToPeer = useCallback(async (peerId: string) => {
    const endMeasure = performanceMonitor.startMeasure('connectToPeer');
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }

    try {
      await meshNetworkRef.current.connectToPeer(peerId);
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
    const endMeasure = performanceMonitor.startMeasure('generateConnectionOffer');
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }
    // V1: Include public key in offer
    const db = getDatabase();
    const identity = await db.getPrimaryIdentity();
    if (!identity) {
      // Fallback for when identity isn't created yet
      console.warn("No primary identity found for connection offer, generating temporary one.");
      const offer = createSignalingOffer(meshNetworkRef.current);
      endMeasure({ success: true });
      return offer;
    }
    const offer = createSignalingOffer(meshNetworkRef.current, identity.publicKey);
    endMeasure({ success: true });
    return offer;
  }, []);

  const acceptConnectionOffer = useCallback(async (offer: string): Promise<string> => {
    const endMeasure = performanceMonitor.startMeasure('acceptConnectionOffer');
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }
    try {
      const remotePeerId = await handleSignalingAnswer(meshNetworkRef.current, offer);
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
  }, []);

  const createManualOffer = useCallback(async (peerId: string): Promise<string> => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    return await meshNetworkRef.current.createManualConnection(peerId);
  }, []);

  const acceptManualOffer = useCallback(async (offerData: string): Promise<string> => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    return await meshNetworkRef.current.acceptManualConnection(offerData);
  }, []);

  const finalizeManualConnection = useCallback(async (answerData: string): Promise<void> => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    await meshNetworkRef.current.finalizeManualConnection(answerData);

    // Update peer status
    const connectedPeers = meshNetworkRef.current.getConnectedPeers();
    setPeers(connectedPeers);
    setStatus((prev: MeshStatus) => ({
      ...prev,
      peerCount: connectedPeers.length,
      isConnected: connectedPeers.length > 0,
    }));
  }, []);

  const joinRoom = useCallback(async (url: string): Promise<void> => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    await meshNetworkRef.current.joinPublicRoom(url);
  }, []);

  const joinRelay = useCallback(async (url: string): Promise<void> => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    await meshNetworkRef.current.joinRelay(url);
  }, []);

  const addStreamToPeer = useCallback(async (peerId: string, stream: MediaStream) => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    await meshNetworkRef.current.addStreamToPeer(peerId, stream);
  }, []);

  const onPeerTrack = useCallback((callback: (peerId: string, track: MediaStreamTrack, stream: MediaStream) => void) => {
    if (!meshNetworkRef.current) throw new Error('Mesh network not initialized');
    meshNetworkRef.current.onPeerTrack(callback);
  }, []);

  // Memoized return value to prevent unnecessary re-renders
  return useMemo(() => ({
    status,
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
    joinRelay,
    addStreamToPeer,
    onPeerTrack,
    identity: meshNetworkRef.current?.getIdentity(), // Expose identity
  }), [status, peers, messages, sendMessage, connectToPeer, getStats, generateConnectionOffer, acceptConnectionOffer, createManualOffer, acceptManualOffer, finalizeManualConnection, joinRoom, joinRelay, addStreamToPeer, onPeerTrack]);
}