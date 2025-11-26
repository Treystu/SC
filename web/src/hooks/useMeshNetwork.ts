import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MeshNetwork, Message, MessageType, Peer } from '@sc/core';
import { getDatabase } from '../storage/database';
import { createSignalingOffer, handleSignalingAnswer } from '../utils/manualSignaling';

export interface MeshStatus {
  isConnected: boolean;
  peerCount: number;
  localPeerId: string;
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
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const meshNetworkRef = useRef<MeshNetwork | null>(null);

  // Initialize mesh network with persistence
  useEffect(() => {
    const initMeshNetwork = async () => {
      const network = new MeshNetwork({
        defaultTTL: 10,
        maxPeers: 50,
      });

      meshNetworkRef.current = network;

      // Initialize database
      const db = getDatabase();
      await db.init();

      // Load persisted identity (if exists)
      try {
        const identity = await db.getPrimaryIdentity();
        if (identity) {
          console.log('Loaded persisted identity:', identity.fingerprint);
          // Identity is loaded and can be used for cryptographic operations
          // The network layer will create its own identity if needed
        } else {
          console.log('No persisted identity found, network will generate new one');
        }
      } catch (error) {
        console.error('Failed to load identity:', error);
      }

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
      });

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
      };
    };

    initMeshNetwork();

    // Cleanup on unmount
    return () => {
      if (meshNetworkRef.current) {
        meshNetworkRef.current.shutdown();
        meshNetworkRef.current = null;
      }
    };
  }, []);

  // Send message function with persistence
  const sendMessage = useCallback(async (recipientId: string, content: string, attachments?: File[]) => {
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }

    let messageStatus: 'sent' | 'queued' = 'sent';

    // Handle file attachments
    if (attachments && attachments.length > 0) {
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
    try {
      await meshNetworkRef.current.sendMessage(recipientId, content);
    } catch (error) {
      console.error('Failed to send message to network:', error);
      // Mark as queued if offline or failed
      messageStatus = 'queued';
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
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }

    await meshNetworkRef.current.connectToPeer(peerId);
  }, []);

  // Get network stats
  const getStats = useCallback(async () => {
    if (!meshNetworkRef.current) {
      return null;
    }

    return await meshNetworkRef.current.getStats();
  }, []);

  const generateConnectionOffer = useCallback(async (): Promise<string> => {
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }
    return createSignalingOffer(meshNetworkRef.current);
  }, []);

  const acceptConnectionOffer = useCallback(async (offer: string): Promise<string> => {
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }
    const remotePeerId = await handleSignalingAnswer(meshNetworkRef.current, offer);
    // Manually update peer status after connection
    const connectedPeers = meshNetworkRef.current.getConnectedPeers();
    setPeers(connectedPeers);
    setStatus((prev: MeshStatus) => ({
      ...prev,
      peerCount: connectedPeers.length,
      isConnected: connectedPeers.length > 0,
    }));
    return remotePeerId;
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
  }), [status, peers, messages, sendMessage, connectToPeer, getStats, generateConnectionOffer, acceptConnectionOffer]);
}
