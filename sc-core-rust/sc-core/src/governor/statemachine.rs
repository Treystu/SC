// Vitality State Machine - Calculates node state based on environmental conditions

use super::{EnvironmentalMonitor, NodeState};

/// State machine that determines node vitality based on environmental conditions
pub struct VitalityStateMachine {
    current_state: NodeState,
    vitality_score: f32,
}

impl VitalityStateMachine {
    /// Create a new state machine with default Active state
    pub fn new() -> Self {
        Self {
            current_state: NodeState::Active,
            vitality_score: NodeState::Active.base_vitality(),
        }
    }

    /// Update state based on environmental conditions
    pub fn update(&mut self, monitor: &EnvironmentalMonitor) {
        let battery = monitor.battery_level();
        let network_quality = monitor.network_quality_score();
        let is_high_quality_net = monitor.is_high_quality_network();

        // State transition logic from the spec:
        // If Battery > 0.8 && Wifi: State = Hub (Vitality 1.0)
        // If Battery < 0.2 || Cell: State = Leaf (Vitality 0.2)
        // Otherwise: Active (Vitality ~0.6)

        let new_state = if battery > 0.8 && is_high_quality_net {
            // High battery + good network = Hub mode
            NodeState::Hub
        } else if battery < 0.2 || !is_high_quality_net {
            // Low battery OR poor network = Leaf mode
            NodeState::Leaf
        } else {
            // Everything else = Active mode
            NodeState::Active
        };

        // Calculate vitality score based on state
        // Formula: base score adjusted by battery and network
        self.vitality_score = match new_state {
            NodeState::Hub => {
                // Hub: High score, influenced by battery and network
                let score = (battery * 0.6) + (network_quality * 0.4);
                score.max(0.8).min(1.0)
            }
            NodeState::Active => {
                // Active: Medium score
                let score = (battery * 0.5) + (network_quality * 0.5);
                score.max(0.4).min(0.8)
            }
            NodeState::Leaf => {
                // Leaf: Low score, primarily based on battery
                // Even with good network, low battery means low vitality
                let score = (battery * 0.8) + (network_quality * 0.2);
                score.min(0.4)
            }
            NodeState::Sleeping => 0.0,
        };

        // Log state transitions
        if new_state != self.current_state {
            tracing::info!(
                "⚡ Vitality state transition: {:?} -> {:?} (score: {:.2})",
                self.current_state,
                new_state,
                self.vitality_score
            );
        }

        self.current_state = new_state;
    }

    /// Get the current node state
    pub fn current_state(&self) -> NodeState {
        self.current_state
    }

    /// Get the current vitality score (0.0 to 1.0)
    pub fn vitality_score(&self) -> f32 {
        self.vitality_score
    }

    /// Get mesh networking parameters for current state
    pub fn mesh_config(&self) -> MeshConfig {
        match self.current_state {
            NodeState::Hub => MeshConfig {
                mesh_n_low: 6,
                enable_relay: true,
                dht_mode: DhtMode::Server,
            },
            NodeState::Active => MeshConfig {
                mesh_n_low: 3,
                enable_relay: false,
                dht_mode: DhtMode::Client,
            },
            NodeState::Leaf => MeshConfig {
                mesh_n_low: 0,
                enable_relay: false,
                dht_mode: DhtMode::Client,
            },
            NodeState::Sleeping => MeshConfig {
                mesh_n_low: 0,
                enable_relay: false,
                dht_mode: DhtMode::Client,
            },
        }
    }
}

impl Default for VitalityStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

/// Mesh networking configuration based on vitality state
#[derive(Debug, Clone, PartialEq)]
pub struct MeshConfig {
    /// Minimum number of mesh connections (GossipSub mesh_n_low)
    pub mesh_n_low: usize,
    /// Whether to act as a relay for other nodes
    pub enable_relay: bool,
    /// DHT participation mode
    pub dht_mode: DhtMode,
}

/// Kademlia DHT mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DhtMode {
    Server, // Serve DHT queries
    Client, // Only query DHT
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::governor::NetworkType;

    #[test]
    fn test_hub_state_conditions() {
        let mut sm = VitalityStateMachine::new();
        let mut monitor = EnvironmentalMonitor::new();

        // High battery + WiFi = Hub
        monitor.update(0.9, NetworkType::Wifi);
        sm.update(&monitor);

        assert_eq!(sm.current_state(), NodeState::Hub);
        assert!(sm.vitality_score() >= 0.8);

        let config = sm.mesh_config();
        assert_eq!(config.mesh_n_low, 6);
        assert!(config.enable_relay);
        assert_eq!(config.dht_mode, DhtMode::Server);
    }

    #[test]
    fn test_leaf_state_low_battery() {
        let mut sm = VitalityStateMachine::new();
        let mut monitor = EnvironmentalMonitor::new();

        // Low battery = Leaf (even with WiFi)
        monitor.update(0.15, NetworkType::Wifi);
        sm.update(&monitor);

        assert_eq!(sm.current_state(), NodeState::Leaf);
        assert!(sm.vitality_score() < 0.4);

        let config = sm.mesh_config();
        assert_eq!(config.mesh_n_low, 0);
        assert!(!config.enable_relay);
    }

    #[test]
    fn test_leaf_state_poor_network() {
        let mut sm = VitalityStateMachine::new();
        let mut monitor = EnvironmentalMonitor::new();

        // Good battery but cellular = Leaf
        monitor.update(0.9, NetworkType::Cellular);
        sm.update(&monitor);

        assert_eq!(sm.current_state(), NodeState::Leaf);
    }

    #[test]
    fn test_active_state() {
        let mut sm = VitalityStateMachine::new();
        let mut monitor = EnvironmentalMonitor::new();

        // Mid battery + WiFi = Active
        monitor.update(0.5, NetworkType::Wifi);
        sm.update(&monitor);

        assert_eq!(sm.current_state(), NodeState::Active);
        assert!(sm.vitality_score() >= 0.4 && sm.vitality_score() <= 0.8);

        let config = sm.mesh_config();
        assert_eq!(config.mesh_n_low, 3);
        assert!(!config.enable_relay);
        assert_eq!(config.dht_mode, DhtMode::Client);
    }

    #[test]
    fn test_state_transitions() {
        let mut sm = VitalityStateMachine::new();
        let mut monitor = EnvironmentalMonitor::new();

        // Start: Hub
        monitor.update(0.9, NetworkType::Wifi);
        sm.update(&monitor);
        assert_eq!(sm.current_state(), NodeState::Hub);

        // Transition: Hub -> Active (battery drops)
        monitor.update(0.5, NetworkType::Wifi);
        sm.update(&monitor);
        assert_eq!(sm.current_state(), NodeState::Active);

        // Transition: Active -> Leaf (battery critical)
        monitor.update(0.15, NetworkType::Wifi);
        sm.update(&monitor);
        assert_eq!(sm.current_state(), NodeState::Leaf);

        // Transition: Leaf -> Hub (battery recovered)
        monitor.update(0.9, NetworkType::Wifi);
        sm.update(&monitor);
        assert_eq!(sm.current_state(), NodeState::Hub);
    }

    #[test]
    fn test_vitality_score_calculation() {
        let mut sm = VitalityStateMachine::new();
        let mut monitor = EnvironmentalMonitor::new();

        // High battery + WiFi -> Hub state
        // Hub formula: score = (battery * 0.6) + (network_quality * 0.4)
        // WiFi quality = 0.9, Battery = 0.9 (needs to be > 0.8 for Hub)
        // Expected: (0.9 * 0.6) + (0.9 * 0.4) = 0.54 + 0.36 = 0.90
        monitor.update(0.9, NetworkType::Wifi);
        sm.update(&monitor);

        assert_eq!(sm.current_state(), NodeState::Hub);
        let score = sm.vitality_score();
        assert!(score >= 0.8 && score <= 1.0); // Hub state clamps to [0.8, 1.0]
    }
}
