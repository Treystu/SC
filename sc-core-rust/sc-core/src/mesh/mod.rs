// The Mycorrhizal Mesh - Adaptive P2P Networking
// Phase 2: Core mesh primitives with vitality-adaptive configuration

mod scoring;
mod types;

pub use scoring::VitalityPeerScore;
pub use types::{MeshEvent, PeerInfo, MeshMessage};

use crate::governor::{VitalityReport, NodeState};

/// Mesh parameters based on vitality state
#[derive(Debug, Clone, PartialEq)]
pub struct MeshParameters {
    /// Minimum number of mesh connections (Gossipsub mesh_n_low)
    pub mesh_n_low: usize,
    /// Target number of mesh connections (Gossipsub mesh_n)
    pub mesh_n: usize,
    /// Maximum number of mesh connections (Gossipsub mesh_n_high)
    pub mesh_n_high: usize,
    /// Enable relay functionality
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

/// Calculate mesh parameters based on vitality
pub fn mesh_params_for_vitality(report: &VitalityReport) -> MeshParameters {
    match report.state {
        NodeState::Hub => {
            // Hub: Maximum mesh participation
            MeshParameters {
                mesh_n_low: 6,
                mesh_n: 8,
                mesh_n_high: 12,
                enable_relay: true,
                dht_mode: DhtMode::Server,
            }
        }
        NodeState::Active => {
            // Active: Normal participation
            MeshParameters {
                mesh_n_low: 3,
                mesh_n: 4,
                mesh_n_high: 6,
                enable_relay: false,
                dht_mode: DhtMode::Client,
            }
        }
        NodeState::Sleeping | NodeState::Leaf => {
            // Leaf/Sleeping: Minimal participation
            MeshParameters {
                mesh_n_low: 0,
                mesh_n: 1,
                mesh_n_high: 2,
                enable_relay: false,
                dht_mode: DhtMode::Client,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::governor::NetworkType;

    #[test]
    fn test_mesh_params_hub() {
        let report = VitalityReport {
            state: NodeState::Hub,
            score: 1.0,
            battery_level: 0.9,
            network_type: NetworkType::Wifi,
            is_roaming: false,
        };

        let params = mesh_params_for_vitality(&report);
        assert_eq!(params.mesh_n_low, 6);
        assert_eq!(params.mesh_n, 8);
        assert_eq!(params.mesh_n_high, 12);
        assert!(params.enable_relay);
        assert_eq!(params.dht_mode, DhtMode::Server);
    }

    #[test]
    fn test_mesh_params_active() {
        let report = VitalityReport {
            state: NodeState::Active,
            score: 0.6,
            battery_level: 0.5,
            network_type: NetworkType::Wifi,
            is_roaming: false,
        };

        let params = mesh_params_for_vitality(&report);
        assert_eq!(params.mesh_n_low, 3);
        assert_eq!(params.mesh_n, 4);
        assert!(!params.enable_relay);
        assert_eq!(params.dht_mode, DhtMode::Client);
    }

    #[test]
    fn test_mesh_params_leaf() {
        let report = VitalityReport {
            state: NodeState::Leaf,
            score: 0.2,
            battery_level: 0.1,
            network_type: NetworkType::Cellular,
            is_roaming: false,
        };

        let params = mesh_params_for_vitality(&report);
        assert_eq!(params.mesh_n_low, 0);
        assert_eq!(params.mesh_n, 1);
        assert!(!params.enable_relay);
    }

    #[test]
    fn test_vitality_transitions() {
        // Hub -> Active
        let hub_report = VitalityReport {
            state: NodeState::Hub,
            score: 1.0,
            battery_level: 0.9,
            network_type: NetworkType::Wifi,
            is_roaming: false,
        };
        let active_report = VitalityReport {
            state: NodeState::Active,
            score: 0.6,
            battery_level: 0.5,
            network_type: NetworkType::Wifi,
            is_roaming: false,
        };

        let hub_params = mesh_params_for_vitality(&hub_report);
        let active_params = mesh_params_for_vitality(&active_report);

        assert!(hub_params.mesh_n > active_params.mesh_n);
        assert_eq!(hub_params.dht_mode, DhtMode::Server);
        assert_eq!(active_params.dht_mode, DhtMode::Client);
    }
}
