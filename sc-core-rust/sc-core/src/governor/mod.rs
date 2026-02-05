// The Governor - Vitality Engine
// Monitors device conditions and calculates node vitality

mod types;
mod monitor;
mod statemachine;

pub use types::{VitalityReport, NodeState, NetworkType, EnvironmentalReading};
pub use monitor::EnvironmentalMonitor;
pub use statemachine::VitalityStateMachine;

use std::time::{SystemTime, UNIX_EPOCH};

/// The main Vitality Engine that orchestrates resource monitoring
/// and state management
pub struct VitalityEngine {
    monitor: EnvironmentalMonitor,
    state_machine: VitalityStateMachine,
    last_update: u64,
}

impl VitalityEngine {
    /// Create a new Vitality Engine with default conditions
    pub fn new() -> Self {
        Self {
            monitor: EnvironmentalMonitor::new(),
            state_machine: VitalityStateMachine::new(),
            last_update: current_timestamp(),
        }
    }

    /// Update environmental conditions and recalculate vitality
    pub fn update_conditions(&mut self, battery_level: f32, network_type: NetworkType) {
        let previous_network = self.monitor.network_type();

        // Update the monitor
        self.monitor.update(battery_level, network_type);

        // Detect roaming (IP address change simulation via network type change)
        let is_roaming = previous_network != self.monitor.network_type();
        if is_roaming {
            tracing::info!("🌐 Network roaming detected: {:?} -> {:?}",
                previous_network, network_type);
        }

        // Update state machine based on new conditions
        self.state_machine.update(&self.monitor);

        self.last_update = current_timestamp();

        tracing::debug!(
            "Vitality updated: State={:?}, Score={:.2}, Battery={:.0}%, Network={:?}",
            self.state_machine.current_state(),
            self.state_machine.vitality_score(),
            battery_level * 100.0,
            network_type
        );
    }

    /// Get the current vitality report
    pub fn get_vitality_report(&self) -> VitalityReport {
        VitalityReport {
            state: self.state_machine.current_state(),
            score: self.state_machine.vitality_score(),
            battery_level: self.monitor.battery_level(),
            network_type: self.monitor.network_type(),
            is_roaming: false, // Future: actual roaming detection
        }
    }

    /// Get time since last update in seconds
    pub fn time_since_update(&self) -> u64 {
        current_timestamp().saturating_sub(self.last_update)
    }
}

impl Default for VitalityEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Get current timestamp in seconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vitality_engine_default() {
        let engine = VitalityEngine::new();
        let report = engine.get_vitality_report();

        assert!(matches!(report.state, NodeState::Active));
        assert!(report.score >= 0.0 && report.score <= 1.0);
    }

    #[test]
    fn test_vitality_state_transitions() {
        let mut engine = VitalityEngine::new();

        // High battery + WiFi = Hub
        engine.update_conditions(0.9, NetworkType::Wifi);
        assert!(matches!(engine.get_vitality_report().state, NodeState::Hub));

        // Low battery = Leaf
        engine.update_conditions(0.15, NetworkType::Wifi);
        assert!(matches!(engine.get_vitality_report().state, NodeState::Leaf));

        // Mid battery + WiFi = Active
        engine.update_conditions(0.5, NetworkType::Wifi);
        assert!(matches!(engine.get_vitality_report().state, NodeState::Active));

        // Any battery + Cellular = Leaf (per spec: poor network)
        engine.update_conditions(0.5, NetworkType::Cellular);
        assert!(matches!(engine.get_vitality_report().state, NodeState::Leaf));
    }

    #[test]
    fn test_roaming_detection() {
        let mut engine = VitalityEngine::new();

        // Initialize with WiFi
        engine.update_conditions(0.8, NetworkType::Wifi);

        // Change to Cellular (simulates roaming)
        engine.update_conditions(0.8, NetworkType::Cellular);

        // The monitor should reflect the new network type
        assert!(matches!(engine.monitor.network_type(), NetworkType::Cellular));
    }
}
