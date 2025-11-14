import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MeshNetwork, Message, MessageType, Peer } from '@sc/core';

export interface MeshStatus {
  isConnected: boolean;
  peerCount: number;
  localPeerId: string;
}

export interface ReceivedMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number;
  type: MessageType;
}

/**
 * React Hook for Mesh Network
 * Optimized with useMemo and useCallback for performance
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

  // Initialize mesh network
  useEffect(() => {
    const network = new MeshNetwork({
      defaultTTL: 10,
      maxPeers: 50,
    });

    meshNetworkRef.current = network;

    // Update status
    setStatus({
      isConnected: true,
      peerCount: 0,
      localPeerId: network.getLocalPeerId(),
    });

    // Handle incoming messages
    network.onMessage((message: Message) => {
      try {
        const payload = new TextDecoder().decode(message.payload);
        const data = JSON.parse(payload);
        
        const receivedMessage: ReceivedMessage = {
          id: `${message.header.timestamp}-${Math.random()}`,
          from: Array.from(message.header.senderId)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .substring(0, 8),
          content: data.text || '',
          timestamp: data.timestamp || message.header.timestamp,
          type: message.header.type,
        };

        setMessages(prev => [...prev, receivedMessage]);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    // Handle peer connected
    network.onPeerConnected((peerId) => {
      console.log('Peer connected:', peerId);
      updatePeerStatus();
    });

    // Handle peer disconnected
    network.onPeerDisconnected((peerId) => {
      console.log('Peer disconnected:', peerId);
      updatePeerStatus();
    });

    const updatePeerStatus = () => {
      const connectedPeers = network.getConnectedPeers();
      setPeers(connectedPeers);
      setStatus(prev => ({
        ...prev,
        peerCount: connectedPeers.length,
        isConnected: connectedPeers.length > 0,
      }));
    };

    // Cleanup on unmount
    return () => {
      network.shutdown();
      meshNetworkRef.current = null;
    };
  }, []);

  // Send message function
  const sendMessage = useCallback(async (recipientId: string, content: string) => {
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }

    await meshNetworkRef.current.sendMessage(recipientId, content);

    // Add to local messages (optimistic update)
    const localMessage: ReceivedMessage = {
      id: `${Date.now()}-${Math.random()}`,
      from: 'me',
      content,
      timestamp: Date.now(),
      type: MessageType.TEXT,
    };

    setMessages(prev => [...prev, localMessage]);
  }, []);

  // Connect to peer
  const connectToPeer = useCallback(async (peerId: string) => {
    if (!meshNetworkRef.current) {
      throw new Error('Mesh network not initialized');
    }

    await meshNetworkRef.current.connectToPeer(peerId);
  }, []);

  // Get network stats
  const getStats = useCallback(() => {
    if (!meshNetworkRef.current) {
      return null;
    }

    return meshNetworkRef.current.getStats();
  }, []);

  // Memoized return value to prevent unnecessary re-renders
  return useMemo(() => ({
    status,
    peers,
    messages,
    sendMessage,
    connectToPeer,
    getStats,
  }), [status, peers, messages, sendMessage, connectToPeer, getStats]);
}
