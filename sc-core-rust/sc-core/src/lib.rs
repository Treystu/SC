// Iron Core V2 - "One Binary, Infinite Possibilities"
// Resource-Adaptive Mesh Networking

pub mod governor;
pub mod mesh;
pub mod symbiosis;
pub mod identity;

use std::sync::Arc;
use parking_lot::RwLock;
use anyhow::Result;

pub use governor::{VitalityReport, NodeState, NetworkType, EnvironmentalReading};

// UniFFI exports
uniffi::include_scaffolding!("api");

/// The main Iron Core instance
pub struct IronCore {
    governor: Arc<RwLock<governor::VitalityEngine>>,
    delegate: Option<Arc<dyn CoreDelegate>>,
}

impl IronCore {
    /// Create a new Iron Core instance
    pub fn new() -> Self {
        // Try to initialize tracing, but don't panic if already initialized
        let _ = tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
            )
            .try_init();

        Self {
            governor: Arc::new(RwLock::new(governor::VitalityEngine::new())),
            delegate: None,
        }
    }

    /// Start the Iron Core
    pub fn start(&self) {
        tracing::info!("🦀 Iron Core V2 starting...");
        // Future: Start mesh networking, symbiosis protocol, etc.
    }

    /// Stop the Iron Core
    pub fn stop(&self) {
        tracing::info!("Iron Core V2 stopping...");
        // Future: Clean shutdown of all subsystems
    }

    /// Update environmental conditions and recalculate vitality
    pub fn set_environmental_reading(&self, reading: EnvironmentalReading) {
        let mut engine = self.governor.write();
        engine.update_conditions(reading.battery_level, reading.network_type);

        // Get the new vitality report
        let report = engine.get_vitality_report();

        // Notify delegate of vitality change
        if let Some(delegate) = &self.delegate {
            delegate.on_vitality_changed(report);
        }
    }

    /// Get current vitality report
    pub fn get_vitality_report(&self) -> VitalityReport {
        self.governor.read().get_vitality_report()
    }

    /// Register a push notification token for delegated listening
    pub fn register_push_token(&self, _token: String) {
        tracing::info!("Registered push token for delegated listening");
        // Future: Store token for symbiosis protocol
    }

    /// Enable or disable delegated listening mode
    pub fn enable_delegated_listening(&self, _enable: bool) {
        tracing::info!("Delegated listening mode toggled");
        // Future: Activate symbiosis protocol
    }
}

impl Default for IronCore {
    fn default() -> Self {
        Self::new()
    }
}

/// Callback trait for platform integration
pub trait CoreDelegate: Send + Sync {
    /// Called when a delegated wakeup is triggered
    fn on_wakeup_trigger(&self, reason: String);

    /// Called when vitality state changes
    fn on_vitality_changed(&self, report: VitalityReport);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iron_core_creation() {
        let core = IronCore::new();
        let report = core.get_vitality_report();

        // Default state should be Active with mid-range vitality
        assert!(matches!(report.state, NodeState::Active));
        assert!(report.score > 0.0 && report.score <= 1.0);
    }

    #[test]
    fn test_environmental_updates() {
        let core = IronCore::new();

        // Set high battery + WiFi -> Should become Hub
        core.set_environmental_reading(EnvironmentalReading {
            battery_level: 0.9,
            network_type: NetworkType::Wifi,
        });

        let report = core.get_vitality_report();
        assert!(matches!(report.state, NodeState::Hub));
        assert!(report.score > 0.8);

        // Set low battery + Cellular -> Should become Leaf
        core.set_environmental_reading(EnvironmentalReading {
            battery_level: 0.15,
            network_type: NetworkType::Cellular,
        });

        let report = core.get_vitality_report();
        assert!(matches!(report.state, NodeState::Leaf));
        assert!(report.score < 0.3);
    }
}
