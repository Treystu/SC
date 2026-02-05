// Mesh networking types

use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Simplified Peer ID for Phase 2
pub type PeerId = String;

/// Simplified multiaddr for Phase 2
pub type Multiaddr = String;

/// Events emitted by the mesh network
#[derive(Debug, Clone)]
pub enum MeshEvent {
    /// New peer connected
    PeerConnected { peer_id: PeerId, address: Multiaddr },
    /// Peer disconnected
    PeerDisconnected { peer_id: PeerId },
    /// Message received on gossipsub
    MessageReceived { peer_id: PeerId, data: Vec<u8> },
    /// DHT record found
    DhtRecordFound { key: Vec<u8>, value: Vec<u8> },
    /// Listening on address
    ListeningOn { address: Multiaddr },
}

/// Information about a connected peer
#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub peer_id: PeerId,
    pub addresses: Vec<Multiaddr>,
    pub vitality_score: Option<f32>,
    pub latency: Option<Duration>,
    pub connected_at: Instant,
}

impl PeerInfo {
    pub fn new(peer_id: PeerId) -> Self {
        Self {
            peer_id,
            addresses: vec![],
            vitality_score: None,
            latency: None,
            connected_at: Instant::now(),
        }
    }

    /// Calculate connection age
    pub fn connection_age(&self) -> Duration {
        Instant::now().duration_since(self.connected_at)
    }

    /// Check if peer is fresh (connected recently)
    pub fn is_fresh(&self, threshold: Duration) -> bool {
        self.connection_age() < threshold
    }
}

/// Message to be sent over the mesh
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshMessage {
    /// Unique message ID
    pub id: String,
    /// Sender peer ID
    pub sender: String,
    /// Message payload
    pub payload: Vec<u8>,
    /// Timestamp (Unix epoch seconds)
    pub timestamp: u64,
}

impl MeshMessage {
    pub fn new(sender: PeerId, payload: Vec<u8>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            sender,
            payload,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(data)
    }

    /// Check if message is recent (within threshold)
    pub fn is_recent(&self, threshold_secs: u64) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        now.saturating_sub(self.timestamp) < threshold_secs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_peer_info_creation() {
        let peer_id = "peer1".to_string();
        let info = PeerInfo::new(peer_id.clone());

        assert_eq!(info.peer_id, peer_id);
        assert!(info.vitality_score.is_none());
        assert!(info.connection_age().as_secs() == 0);
    }

    #[test]
    fn test_peer_info_freshness() {
        let peer_id = "peer1".to_string();
        let info = PeerInfo::new(peer_id);

        assert!(info.is_fresh(Duration::from_secs(10)));
    }

    #[test]
    fn test_mesh_message_serialization() {
        let peer_id = "peer1".to_string();
        let payload = b"Hello, mesh!".to_vec();
        let msg = MeshMessage::new(peer_id.clone(), payload.clone());

        assert_eq!(msg.sender, peer_id);
        assert_eq!(msg.payload, payload);

        let bytes = msg.to_bytes().unwrap();
        let decoded = MeshMessage::from_bytes(&bytes).unwrap();

        assert_eq!(decoded.id, msg.id);
        assert_eq!(decoded.sender, msg.sender);
        assert_eq!(decoded.payload, msg.payload);
        assert_eq!(decoded.timestamp, msg.timestamp);
    }

    #[test]
    fn test_mesh_message_recency() {
        let peer_id = "peer1".to_string();
        let payload = b"test".to_vec();
        let msg = MeshMessage::new(peer_id, payload);

        // Message just created should be recent
        assert!(msg.is_recent(60));

        // Create an old message
        let old_msg = MeshMessage {
            id: uuid::Uuid::new_v4().to_string(),
            sender: "peer2".to_string(),
            payload: vec![],
            timestamp: 0, // Unix epoch
        };

        assert!(!old_msg.is_recent(60));
    }
}
