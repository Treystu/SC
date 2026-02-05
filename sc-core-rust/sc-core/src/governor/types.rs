// Governor Types - Vitality data structures

use serde::{Deserialize, Serialize};

/// Network connectivity type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NetworkType {
    Wifi,
    Cellular,
    Ethernet,
    Unknown,
}

impl Default for NetworkType {
    fn default() -> Self {
        Self::Unknown
    }
}

/// Node operational state based on vitality
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeState {
    /// High vitality - can relay, serve DHT, and support other nodes
    Hub,
    /// Medium vitality - participates normally in the mesh
    Active,
    /// Low vitality - minimal participation, conserve resources
    Leaf,
    /// Delegated listening mode - node is asleep, delegates are listening
    Sleeping,
}

impl Default for NodeState {
    fn default() -> Self {
        Self::Active
    }
}

impl NodeState {
    /// Get the base vitality score for this state
    pub fn base_vitality(&self) -> f32 {
        match self {
            NodeState::Hub => 1.0,
            NodeState::Active => 0.6,
            NodeState::Leaf => 0.2,
            NodeState::Sleeping => 0.0,
        }
    }

    /// Check if this state can act as a relay
    pub fn can_relay(&self) -> bool {
        matches!(self, NodeState::Hub)
    }

    /// Check if this state should participate in DHT
    pub fn should_serve_dht(&self) -> bool {
        matches!(self, NodeState::Hub)
    }
}

/// Complete vitality report for a node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VitalityReport {
    pub state: NodeState,
    pub score: f32,
    pub battery_level: f32,
    pub network_type: NetworkType,
    pub is_roaming: bool,
}

impl Default for VitalityReport {
    fn default() -> Self {
        Self {
            state: NodeState::Active,
            score: 0.6,
            battery_level: 0.5,
            network_type: NetworkType::Unknown,
            is_roaming: false,
        }
    }
}

/// Environmental reading from the platform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentalReading {
    pub battery_level: f32,
    pub network_type: NetworkType,
}

impl Default for EnvironmentalReading {
    fn default() -> Self {
        Self {
            battery_level: 0.5,
            network_type: NetworkType::Unknown,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_state_capabilities() {
        assert!(NodeState::Hub.can_relay());
        assert!(!NodeState::Active.can_relay());
        assert!(!NodeState::Leaf.can_relay());
        assert!(!NodeState::Sleeping.can_relay());

        assert!(NodeState::Hub.should_serve_dht());
        assert!(!NodeState::Leaf.should_serve_dht());
    }

    #[test]
    fn test_base_vitality_scores() {
        assert_eq!(NodeState::Hub.base_vitality(), 1.0);
        assert_eq!(NodeState::Active.base_vitality(), 0.6);
        assert_eq!(NodeState::Leaf.base_vitality(), 0.2);
        assert_eq!(NodeState::Sleeping.base_vitality(), 0.0);
    }
}
