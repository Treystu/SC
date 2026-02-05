// Delegate selection and management

use std::collections::HashMap;
use parking_lot::RwLock;
use std::sync::Arc;

/// Peer ID type
pub type PeerId = String;

/// Delegate selection result
#[derive(Debug, Clone, PartialEq)]
pub struct DelegateSelection {
    pub peer_id: PeerId,
    pub vitality_score: f32,
}

/// Manages delegate peer selection
pub struct DelegateManager {
    /// Peers and their vitality scores
    peers: Arc<RwLock<HashMap<PeerId, f32>>>,
    /// Currently selected delegates
    selected_delegates: Arc<RwLock<Vec<PeerId>>>,
}

impl DelegateManager {
    pub fn new() -> Self {
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            selected_delegates: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Add or update a peer's vitality score
    pub fn add_peer(&mut self, peer_id: PeerId, vitality_score: f32) {
        let clamped = vitality_score.clamp(0.0, 1.0);
        self.peers.write().insert(peer_id, clamped);
    }

    /// Remove a peer
    pub fn remove_peer(&mut self, peer_id: &PeerId) {
        self.peers.write().remove(peer_id);
        // Also remove from selected delegates if present
        let mut selected = self.selected_delegates.write();
        selected.retain(|id| id != peer_id);
    }

    /// Select N delegates with minimum vitality score
    /// Returns peer IDs sorted by vitality (highest first)
    pub fn select_delegates(&mut self, count: usize, min_vitality: f32) -> Vec<PeerId> {
        let peers = self.peers.read();

        // Filter peers by minimum vitality
        let mut candidates: Vec<(PeerId, f32)> = peers
            .iter()
            .filter(|(_, &score)| score >= min_vitality)
            .map(|(id, &score)| (id.clone(), score))
            .collect();

        // Sort by vitality (highest first)
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        // Take top N
        let selected: Vec<PeerId> = candidates
            .into_iter()
            .take(count)
            .map(|(id, _)| id)
            .collect();

        // Store selected delegates
        *self.selected_delegates.write() = selected.clone();

        tracing::debug!("Selected {} delegates (min vitality: {:.2})", selected.len(), min_vitality);

        selected
    }

    /// Get currently selected delegates
    pub fn get_selected_delegates(&self) -> Vec<PeerId> {
        self.selected_delegates.read().clone()
    }

    /// Get all peers with their vitality scores
    pub fn get_all_peers(&self) -> Vec<DelegateSelection> {
        self.peers
            .read()
            .iter()
            .map(|(id, &score)| DelegateSelection {
                peer_id: id.clone(),
                vitality_score: score,
            })
            .collect()
    }

    /// Get peer count
    pub fn peer_count(&self) -> usize {
        self.peers.read().len()
    }

    /// Clear all peers
    pub fn clear(&mut self) {
        self.peers.write().clear();
        self.selected_delegates.write().clear();
    }
}

impl Default for DelegateManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delegate_manager_creation() {
        let manager = DelegateManager::new();
        assert_eq!(manager.peer_count(), 0);
    }

    #[test]
    fn test_add_peers() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.7);
        manager.add_peer("peer3".to_string(), 0.85);

        assert_eq!(manager.peer_count(), 3);
    }

    #[test]
    fn test_select_delegates() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.7);
        manager.add_peer("peer3".to_string(), 0.85);
        manager.add_peer("peer4".to_string(), 0.95);

        // Select 2 delegates with min vitality 0.8
        let delegates = manager.select_delegates(2, 0.8);

        assert_eq!(delegates.len(), 2);
        // Should be peer4 (0.95) and peer1 (0.9)
        assert_eq!(delegates[0], "peer4");
        assert_eq!(delegates[1], "peer1");
    }

    #[test]
    fn test_select_delegates_insufficient() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.7);
        manager.add_peer("peer2".to_string(), 0.6);

        // Request 3 delegates with min vitality 0.8
        // Should return empty since no peers meet criteria
        let delegates = manager.select_delegates(3, 0.8);

        assert_eq!(delegates.len(), 0);
    }

    #[test]
    fn test_select_delegates_limited() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.85);

        // Request 5 delegates but only 2 available
        let delegates = manager.select_delegates(5, 0.8);

        assert_eq!(delegates.len(), 2);
    }

    #[test]
    fn test_remove_peer() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.85);

        assert_eq!(manager.peer_count(), 2);

        manager.remove_peer(&"peer1".to_string());

        assert_eq!(manager.peer_count(), 1);
    }

    #[test]
    fn test_get_selected_delegates() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.95);

        manager.select_delegates(2, 0.8);

        let selected = manager.get_selected_delegates();
        assert_eq!(selected.len(), 2);
    }

    #[test]
    fn test_get_all_peers() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.7);

        let all_peers = manager.get_all_peers();
        assert_eq!(all_peers.len(), 2);

        // Find peer1
        let peer1 = all_peers.iter().find(|p| p.peer_id == "peer1").unwrap();
        assert_eq!(peer1.vitality_score, 0.9);
    }

    #[test]
    fn test_clear() {
        let mut manager = DelegateManager::new();

        manager.add_peer("peer1".to_string(), 0.9);
        manager.add_peer("peer2".to_string(), 0.8);

        manager.clear();

        assert_eq!(manager.peer_count(), 0);
        assert_eq!(manager.get_selected_delegates().len(), 0);
    }

    #[test]
    fn test_vitality_clamping() {
        let mut manager = DelegateManager::new();

        // Test over-range values
        manager.add_peer("peer1".to_string(), 1.5);
        manager.add_peer("peer2".to_string(), -0.2);

        let peers = manager.get_all_peers();

        let peer1 = peers.iter().find(|p| p.peer_id == "peer1").unwrap();
        let peer2 = peers.iter().find(|p| p.peer_id == "peer2").unwrap();

        assert_eq!(peer1.vitality_score, 1.0);
        assert_eq!(peer2.vitality_score, 0.0);
    }
}
