// Environmental Monitor - Ingests battery and network conditions

use super::NetworkType;

/// Monitors environmental conditions like battery and network
pub struct EnvironmentalMonitor {
    battery_level: f32,
    network_type: NetworkType,
}

impl EnvironmentalMonitor {
    /// Create a new monitor with default values
    pub fn new() -> Self {
        Self {
            battery_level: 0.5, // Start at 50%
            network_type: NetworkType::Unknown,
        }
    }

    /// Update environmental conditions
    pub fn update(&mut self, battery_level: f32, network_type: NetworkType) {
        // Clamp battery level to valid range
        self.battery_level = battery_level.clamp(0.0, 1.0);
        self.network_type = network_type;

        tracing::trace!(
            "Environmental update: Battery={:.0}%, Network={:?}",
            self.battery_level * 100.0,
            self.network_type
        );
    }

    /// Get current battery level (0.0 to 1.0)
    pub fn battery_level(&self) -> f32 {
        self.battery_level
    }

    /// Get current network type
    pub fn network_type(&self) -> NetworkType {
        self.network_type
    }

    /// Check if on a high-quality network (WiFi or Ethernet)
    pub fn is_high_quality_network(&self) -> bool {
        matches!(self.network_type, NetworkType::Wifi | NetworkType::Ethernet)
    }

    /// Check if battery is in critical state
    pub fn is_battery_critical(&self) -> bool {
        self.battery_level < 0.2
    }

    /// Check if battery is in healthy state
    pub fn is_battery_healthy(&self) -> bool {
        self.battery_level > 0.8
    }

    /// Calculate a network quality score (0.0 to 1.0)
    pub fn network_quality_score(&self) -> f32 {
        match self.network_type {
            NetworkType::Ethernet => 1.0,
            NetworkType::Wifi => 0.9,
            NetworkType::Cellular => 0.5,
            NetworkType::Unknown => 0.3,
        }
    }
}

impl Default for EnvironmentalMonitor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_monitor_initialization() {
        let monitor = EnvironmentalMonitor::new();
        assert_eq!(monitor.battery_level(), 0.5);
        assert!(matches!(monitor.network_type(), NetworkType::Unknown));
    }

    #[test]
    fn test_battery_clamping() {
        let mut monitor = EnvironmentalMonitor::new();

        // Test over-range values
        monitor.update(1.5, NetworkType::Wifi);
        assert_eq!(monitor.battery_level(), 1.0);

        monitor.update(-0.2, NetworkType::Wifi);
        assert_eq!(monitor.battery_level(), 0.0);
    }

    #[test]
    fn test_battery_states() {
        let mut monitor = EnvironmentalMonitor::new();

        monitor.update(0.1, NetworkType::Wifi);
        assert!(monitor.is_battery_critical());
        assert!(!monitor.is_battery_healthy());

        monitor.update(0.9, NetworkType::Wifi);
        assert!(!monitor.is_battery_critical());
        assert!(monitor.is_battery_healthy());
    }

    #[test]
    fn test_network_quality() {
        let mut monitor = EnvironmentalMonitor::new();

        monitor.update(0.5, NetworkType::Wifi);
        assert!(monitor.is_high_quality_network());
        assert_eq!(monitor.network_quality_score(), 0.9);

        monitor.update(0.5, NetworkType::Cellular);
        assert!(!monitor.is_high_quality_network());
        assert_eq!(monitor.network_quality_score(), 0.5);

        monitor.update(0.5, NetworkType::Ethernet);
        assert!(monitor.is_high_quality_network());
        assert_eq!(monitor.network_quality_score(), 1.0);
    }
}
