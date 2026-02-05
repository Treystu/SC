// Symbiosis - Wakeup & Relay Protocol (Phase 3)
// Enables mobile nodes to delegate message listening to high-vitality peers

mod proto;
mod delegate;

pub use proto::{WakeupRequest, WakeupResponse, WakeupToken};
pub use delegate::{DelegateManager, DelegateSelection};

use std::time::{Duration, Instant};

/// Configuration for symbiosis protocol
#[derive(Debug, Clone)]
pub struct SymbiosisConfig {
    /// Number of delegates to select
    pub delegate_count: usize,
    /// Minimum vitality score for delegates
    pub min_delegate_vitality: f32,
    /// Token expiry duration
    pub token_expiry: Duration,
}

impl Default for SymbiosisConfig {
    fn default() -> Self {
        Self {
            delegate_count: 3,
            min_delegate_vitality: 0.8,
            token_expiry: Duration::from_secs(3600 * 24), // 24 hours
        }
    }
}

/// Manages the symbiosis protocol for a node
pub struct SymbiosisProtocol {
    config: SymbiosisConfig,
    delegate_manager: DelegateManager,
    is_delegating: bool,
    delegation_start: Option<Instant>,
}

impl SymbiosisProtocol {
    pub fn new(config: SymbiosisConfig) -> Self {
        Self {
            config,
            delegate_manager: DelegateManager::new(),
            is_delegating: false,
            delegation_start: None,
        }
    }

    /// Enable delegated listening mode
    pub fn enable_delegation(&mut self, push_token: String) -> Result<Vec<WakeupRequest>, String> {
        if self.is_delegating {
            return Err("Already in delegated mode".to_string());
        }

        // Select delegates
        let delegates = self.delegate_manager.select_delegates(
            self.config.delegate_count,
            self.config.min_delegate_vitality,
        );

        if delegates.is_empty() {
            return Err("No suitable delegates found".to_string());
        }

        // Create wakeup requests
        let token = WakeupToken::new(push_token);
        let requests: Vec<WakeupRequest> = delegates
            .iter()
            .map(|delegate_id| {
                WakeupRequest::new(
                    delegate_id.clone(),
                    token.clone(),
                    self.config.token_expiry,
                )
            })
            .collect();

        self.is_delegating = true;
        self.delegation_start = Some(Instant::now());

        tracing::info!("💤 Delegated listening enabled with {} delegates", delegates.len());

        Ok(requests)
    }

    /// Disable delegated listening mode
    pub fn disable_delegation(&mut self) {
        if !self.is_delegating {
            return;
        }

        self.is_delegating = false;

        if let Some(start) = self.delegation_start {
            let duration = Instant::now().duration_since(start);
            tracing::info!("⏰ Delegated listening disabled after {:?}", duration);
        }

        self.delegation_start = None;
    }

    /// Check if node is currently delegating
    pub fn is_delegating(&self) -> bool {
        self.is_delegating
    }

    /// Get delegate manager for peer updates
    pub fn delegate_manager_mut(&mut self) -> &mut DelegateManager {
        &mut self.delegate_manager
    }

    /// Get delegate manager (immutable)
    pub fn delegate_manager(&self) -> &DelegateManager {
        &self.delegate_manager
    }
}

impl Default for SymbiosisProtocol {
    fn default() -> Self {
        Self::new(SymbiosisConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_symbiosis_default() {
        let proto = SymbiosisProtocol::default();
        assert!(!proto.is_delegating());
    }

    #[test]
    fn test_delegation_lifecycle() {
        let mut proto = SymbiosisProtocol::default();

        // Add some peers
        proto.delegate_manager_mut().add_peer("peer1".to_string(), 0.9);
        proto.delegate_manager_mut().add_peer("peer2".to_string(), 0.85);
        proto.delegate_manager_mut().add_peer("peer3".to_string(), 0.95);

        // Enable delegation
        let result = proto.enable_delegation("push_token_123".to_string());
        assert!(result.is_ok());
        assert!(proto.is_delegating());

        let requests = result.unwrap();
        assert_eq!(requests.len(), 3);

        // Disable delegation
        proto.disable_delegation();
        assert!(!proto.is_delegating());
    }

    #[test]
    fn test_delegation_no_suitable_peers() {
        let mut proto = SymbiosisProtocol::default();

        // Add peers with low vitality
        proto.delegate_manager_mut().add_peer("peer1".to_string(), 0.5);
        proto.delegate_manager_mut().add_peer("peer2".to_string(), 0.6);

        // Should fail - no peers with vitality > 0.8
        let result = proto.enable_delegation("push_token_123".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_double_delegation() {
        let mut proto = SymbiosisProtocol::default();

        proto.delegate_manager_mut().add_peer("peer1".to_string(), 0.9);
        proto.delegate_manager_mut().add_peer("peer2".to_string(), 0.9);
        proto.delegate_manager_mut().add_peer("peer3".to_string(), 0.9);

        proto.enable_delegation("token1".to_string()).ok();

        // Second attempt should fail
        let result = proto.enable_delegation("token2".to_string());
        assert!(result.is_err());
    }
}
