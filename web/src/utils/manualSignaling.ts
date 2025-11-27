import { MeshNetwork } from '@sc/core';

/**
 * Peer Identity Exchange for Manual Bootstrapping
 * 
 * Facilitates the exchange of Peer IDs via QR code or manual entry.
 * Once Peer IDs are exchanged, the Mesh Network's discovery mechanisms (mDNS, BLE, etc.)
 * or direct IP connection (if available) are used to establish the actual WebRTC connection.
 * 
 * Note: Full SDP exchange via QR code is often impractical due to size limits.
 * This approach relies on the peers being discoverable once their IDs are known.
 */

/**
 * Creates a signaling offer (Peer Identity) to be shared with a peer.
 * Returns a JSON object with the local peer ID.
 */
export async function createSignalingOffer(meshNetwork: MeshNetwork, publicKey?: Uint8Array): Promise<string> {
  const localPeerId = meshNetwork.getLocalPeerId();

  // We exchange Peer IDs to allow the discovery layer to prioritize and connect to this peer.
  // The actual SDP exchange happens automatically via the Mesh Network's signaling channel
  // once the peers discover each other.

  const offerPayload: { peerId: string; publicKey?: string } = {
    peerId: localPeerId,
  };

  if (publicKey) {
    // Convert Uint8Array to hex string for transport
    offerPayload.publicKey = Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return JSON.stringify(offerPayload, null, 2);
}

/**
 * Handles a signaling answer from a peer.
 * Connects to the peer using the peer ID from the answer.
 */
export async function handleSignalingAnswer(meshNetwork: MeshNetwork, answerJSON: string): Promise<string> {
  const answerPayload = JSON.parse(answerJSON);
  const remotePeerId = answerPayload.peerId;

  if (!remotePeerId) {
    throw new Error('Invalid signaling answer: missing peerId');
  }

  // Initiate connection to the identified peer
  await meshNetwork.connectToPeer(remotePeerId);
  return remotePeerId;
}