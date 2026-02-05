// Vitality-based peer scoring for Gossipsub
// Score = (Vitality * 0.5) + (1/Latency * 0.5)

use std::time::Duration;
use std::collections::HashMap;
use parking_lot::RwLock;
use std::sync::Arc;

/// Peer ID type (simplified for Phase 2)
pub type PeerId = String;

/// Peer score calculator based on vitality and network performance
#[derive(Clone)]
pub struct VitalityPeerScore {
    /// Vitality scores for each peer (0.0 to 1.0)
    vitality_scores: Arc<RwLock<HashMap<PeerId, f32>>>,
    /// Latency measurements for each peer
    latencies: Arc<RwLock<HashMap<PeerId, Duration>>>,
}

impl VitalityPeerScore {
    pub fn new() -> Self {
        Self {
            vitality_scores: Arc::new(RwLock::new(HashMap::new())),
            latencies: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Update vitality score for a peer
    pub fn set_peer_vitality(&self, peer_id: PeerId, vitality: f32) {
        let clamped = vitality.clamp(0.0, 1.0);
        self.vitality_scores.write().insert(peer_id.clone(), clamped);
        tracing::trace!("Peer {} vitality: {:.2}", peer_id, clamped);
    }

    /// Update latency for a peer
    pub fn set_peer_latency(&self, peer_id: PeerId, latency: Duration) {
        self.latencies.write().insert(peer_id.clone(), latency);
        tracing::trace!("Peer {} latency: {:?}", peer_id, latency);
    }

    /// Calculate peer score: (Vitality * 0.5) + (1/Latency * 0.5)
    pub fn calculate_score(&self, peer_id: &PeerId) -> f32 {
        let vitality = self.vitality_scores.read()
            .get(peer_id)
            .copied()
            .unwrap_or(0.5); // Default to neutral score

        let latency_score = self.latencies.read()
            .get(peer_id)
            .map(|lat| {
                // Convert latency to score: lower is better
                // 10ms = 1.0, 100ms = 0.1, 1000ms = 0.01
                let ms = lat.as_millis() as f32;
                if ms < 1.0 {
                    1.0
                } else {
                    (10.0 / ms).min(1.0)
                }
            })
            .unwrap_or(0.5); // Default to neutral score

        // Weighted combination
        let score = (vitality * 0.5) + (latency_score * 0.5);

        tracing::trace!(
            "Peer {} score: {:.2} (vitality: {:.2}, latency_score: {:.2})",
            peer_id, score, vitality, latency_score
        );

        score
    }

    /// Get all peer scores
    pub fn get_all_scores(&self) -> Vec<(PeerId, f32)> {
        let vitality_scores = self.vitality_scores.read();
        vitality_scores
            .keys()
            .map(|peer_id| (peer_id.clone(), self.calculate_score(peer_id)))
            .collect()
    }

    /// Remove peer data
    pub fn remove_peer(&self, peer_id: &PeerId) {
        self.vitality_scores.write().remove(peer_id);
        self.latencies.write().remove(peer_id);
    }

    /// Get top N peers by score
    pub fn get_top_peers(&self, n: usize) -> Vec<(PeerId, f32)> {
        let mut scores = self.get_all_scores();
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        scores.into_iter().take(n).collect()
    }
}

impl Default for VitalityPeerScore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_peer_score_vitality_only() {
        let scorer = VitalityPeerScore::new();
        let peer_id = "peer1".to_string();

        scorer.set_peer_vitality(peer_id.clone(), 0.8);
        let score = scorer.calculate_score(&peer_id);

        // With default latency (0.5), score = (0.8 * 0.5) + (0.5 * 0.5) = 0.65
        assert!((score - 0.65).abs() < 0.01);
    }

    #[test]
    fn test_peer_score_with_latency() {
        let scorer = VitalityPeerScore::new();
        let peer_id = "peer1".to_string();

        scorer.set_peer_vitality(peer_id.clone(), 0.8);
        scorer.set_peer_latency(peer_id.clone(), Duration::from_millis(20));

        let score = scorer.calculate_score(&peer_id);

        // Vitality: 0.8 * 0.5 = 0.4
        // Latency: (10 / 20) * 0.5 = 0.25
        // Total: 0.65
        assert!((score - 0.65).abs() < 0.01);
    }

    #[test]
    fn test_peer_score_low_latency() {
        let scorer = VitalityPeerScore::new();
        let peer_id = "peer1".to_string();

        scorer.set_peer_vitality(peer_id.clone(), 0.6);
        scorer.set_peer_latency(peer_id.clone(), Duration::from_millis(10));

        let score = scorer.calculate_score(&peer_id);

        // Vitality: 0.6 * 0.5 = 0.3
        // Latency: (10 / 10) * 0.5 = 0.5 (capped at 1.0 * 0.5)
        // Total: 0.8
        assert!((score - 0.8).abs() < 0.01);
    }

    #[test]
    fn test_peer_score_high_latency() {
        let scorer = VitalityPeerScore::new();
        let peer_id = "peer1".to_string();

        scorer.set_peer_vitality(peer_id.clone(), 1.0);
        scorer.set_peer_latency(peer_id.clone(), Duration::from_millis(1000));

        let score = scorer.calculate_score(&peer_id);

        // Vitality: 1.0 * 0.5 = 0.5
        // Latency: (10 / 1000) * 0.5 = 0.005
        // Total: ~0.505
        assert!((score - 0.505).abs() < 0.01);
    }

    #[test]
    fn test_peer_score_removal() {
        let scorer = VitalityPeerScore::new();
        let peer_id = "peer1".to_string();

        scorer.set_peer_vitality(peer_id.clone(), 0.9);
        scorer.remove_peer(&peer_id);

        let score = scorer.calculate_score(&peer_id);
        // Should return default score of 0.5
        assert_eq!(score, 0.5);
    }

    #[test]
    fn test_get_all_scores() {
        let scorer = VitalityPeerScore::new();
        let peer1 = "peer1".to_string();
        let peer2 = "peer2".to_string();

        scorer.set_peer_vitality(peer1.clone(), 0.8);
        scorer.set_peer_vitality(peer2.clone(), 0.6);

        let scores = scorer.get_all_scores();
        assert_eq!(scores.len(), 2);
    }

    #[test]
    fn test_get_top_peers() {
        let scorer = VitalityPeerScore::new();

        scorer.set_peer_vitality("peer1".to_string(), 0.9);
        scorer.set_peer_vitality("peer2".to_string(), 0.6);
        scorer.set_peer_vitality("peer3".to_string(), 0.8);

        let top_peers = scorer.get_top_peers(2);
        assert_eq!(top_peers.len(), 2);
        // peer1 should be first (highest score)
        assert_eq!(top_peers[0].0, "peer1");
    }
}
