// sc-mobile - Native mobile bindings for iOS and Android
// This crate exports the Iron Core API via UniFFI

use sc_core::{IronCore, VitalityReport, NodeState, NetworkType, EnvironmentalReading, CoreDelegate};

// Re-export the main types for UniFFI
pub use sc_core;

// UniFFI will generate the foreign language bindings from this
uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mobile_bindings() {
        let core = IronCore::new();
        core.start();

        let reading = EnvironmentalReading {
            battery_level: 0.8,
            network_type: NetworkType::Wifi,
        };

        core.set_environmental_reading(reading);
        let report = core.get_vitality_report();

        assert!(matches!(report.state, NodeState::Hub));
        core.stop();
    }
}
