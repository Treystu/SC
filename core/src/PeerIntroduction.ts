export interface PeerInfo {
  id: string;
  publicKey: Uint8Array;
  endpoints: string[];
  lastSeen: number;
}

export class PeerIntroduction {
  private knownPeers = new Map<string, PeerInfo>();

  // A tells B about C's existence
  async introducePeer(
    peerBId: string,
    peerCInfo: PeerInfo
  ): Promise<void> {
    const introductionMessage = {
      type: 'PEER_INTRODUCTION',
      introducedPeer: {
        id: peerCInfo.id,
        publicKey: Array.from(peerCInfo.publicKey),
        endpoints: peerCInfo.endpoints,
        lastSeen: peerCInfo.lastSeen
      },
      timestamp: Date.now()
    };

    // Send introduction message to peer B
    await this.sendToPeer(peerBId, introductionMessage);
    
    console.log(`Introduced peer ${peerCInfo.id} to ${peerBId}`);
  }

  async handleIntroduction(introductionMessage: any): Promise<void> {
    const { introducedPeer } = introductionMessage;
    
    const peerInfo: PeerInfo = {
      id: introducedPeer.id,
      publicKey: new Uint8Array(introducedPeer.publicKey),
      endpoints: introducedPeer.endpoints,
      lastSeen: introducedPeer.lastSeen
    };

    // Store the introduced peer
    this.knownPeers.set(peerInfo.id, peerInfo);
    
    // Attempt to connect to the introduced peer
    await this.attemptConnection(peerInfo);
    
    console.log(`Received introduction for peer: ${peerInfo.id}`);
  }

  async broadcastPeerList(targetPeerId: string): Promise<void> {
    const peerList = Array.from(this.knownPeers.values())
      .filter(peer => peer.id !== targetPeerId)
      .map(peer => ({
        id: peer.id,
        endpoints: peer.endpoints,
        lastSeen: peer.lastSeen
      }));

    const message = {
      type: 'PEER_LIST',
      peers: peerList,
      timestamp: Date.now()
    };

    await this.sendToPeer(targetPeerId, message);
  }

  private async sendToPeer(peerId: string, message: any): Promise<void> {
    // Placeholder - would send via mesh network
    console.log(`Sending to ${peerId}:`, message);
  }

  private async attemptConnection(peerInfo: PeerInfo): Promise<void> {
    console.log(`Attempting connection to introduced peer: ${peerInfo.id}`);
    // Would initiate WebRTC or BLE connection
  }

  addKnownPeer(peerInfo: PeerInfo): void {
    this.knownPeers.set(peerInfo.id, peerInfo);
  }

  getKnownPeers(): PeerInfo[] {
    return Array.from(this.knownPeers.values());
  }
}
