// Iron Core V2 - "One Binary, Infinite Possibilities"
// Resource-Adaptive Mesh Networking

pub mod governor;
pub mod mesh;
pub mod symbiosis;
pub mod identity;

use std::sync::Arc;
use parking_lot::RwLock;
use thiserror::Error;

pub use governor::{VitalityReport, NodeState, NetworkType, EnvironmentalReading};
pub use mesh::{VitalityPeerScore, MeshParameters as MeshParams};
pub use symbiosis::{SymbiosisProtocol, SymbiosisConfig};
pub use identity::IdentityManager;

// UniFFI exports
uniffi::include_scaffolding!("api");

// ============================================================================
// ERROR TYPES
// ============================================================================

#[derive(Debug, Error, Clone)]
pub enum IronCoreError {
    #[error("Not initialized")]
    NotInitialized,
    #[error("Already running")]
    AlreadyRunning,
    #[error("Already delegating")]
    AlreadyDelegating,
    #[error("No suitable delegates found")]
    NoSuitableDelegates,
    #[error("Storage error: {0}")]
    StorageError(String),
    #[error("Cryptography error: {0}")]
    CryptoError(String),
    #[error("Network error: {0}")]
    NetworkError(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

impl From<anyhow::Error> for IronCoreError {
    fn from(err: anyhow::Error) -> Self {
        IronCoreError::NetworkError(err.to_string())
    }
}

// ============================================================================
// DATA TYPES
// ============================================================================

#[derive(Clone)]
pub struct MeshParameters {
    pub mesh_n_low: u32,
    pub mesh_n: u32,
    pub mesh_n_high: u32,
    pub enable_relay: bool,
    pub dht_mode: String,
}

#[derive(Clone)]
pub struct PeerScore {
    pub peer_id: String,
    pub score: f32,
}

#[derive(Clone)]
pub struct DelegationStatus {
    pub is_active: bool,
    pub delegate_count: u32,
    pub delegate_ids: Vec<String>,
}

#[derive(Clone)]
pub struct IdentityInfo {
    pub identity_id: Option<String>,
    pub public_key_hex: Option<String>,
    pub initialized: bool,
}

#[derive(Clone)]
pub struct SignatureResult {
    pub signature: Vec<u8>,
    pub public_key_hex: String,
}

#[derive(Clone)]
pub struct PushNotification {
    pub title: String,
    pub body: String,
    pub data: Option<String>,
    pub timestamp: u64,
}

// ============================================================================
// CORE DELEGATE TRAIT
// ============================================================================

pub trait CoreDelegate: Send + Sync {
    // Vitality changes
    fn on_vitality_changed(&self, report: VitalityReport);

    // Mesh events
    fn on_peer_connected(&self, peer_id: String);
    fn on_peer_disconnected(&self, peer_id: String);
    fn on_message_received(&self, peer_id: String, data: Vec<u8>);

    // Symbiosis events
    fn on_wakeup_trigger(&self, reason: String);
    fn on_delegation_changed(&self, status: DelegationStatus);

    // Push notifications
    fn on_push_notification(&self, notification: PushNotification);
}

// ============================================================================
// IRON CORE IMPLEMENTATION
// ============================================================================

pub struct IronCore {
    // Core systems
    governor: Arc<RwLock<governor::VitalityEngine>>,
    mesh_scorer: Arc<mesh::VitalityPeerScore>,
    symbiosis: Arc<RwLock<symbiosis::SymbiosisProtocol>>,
    identity: Arc<RwLock<identity::IdentityManager>>,

    // State
    running: Arc<RwLock<bool>>,
    push_token: Arc<RwLock<Option<String>>>,
    delegate: Arc<RwLock<Option<Arc<dyn CoreDelegate>>>>,
}

impl IronCore {
    /// Create a new Iron Core instance with in-memory storage
    pub fn new() -> Self {
        Self::init(None)
    }

    /// Create Iron Core with persistent storage
    pub fn with_storage(storage_path: String) -> Self {
        Self::init(Some(storage_path))
    }

    fn init(storage_path: Option<String>) -> Self {
        // Initialize tracing (idempotent)
        let _ = tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
            )
            .try_init();

        let identity = if let Some(path) = storage_path {
            Arc::new(RwLock::new(
                IdentityManager::with_path(&path)
                    .unwrap_or_else(|_| IdentityManager::new())
            ))
        } else {
            Arc::new(RwLock::new(IdentityManager::new()))
        };

        Self {
            governor: Arc::new(RwLock::new(governor::VitalityEngine::new())),
            mesh_scorer: Arc::new(mesh::VitalityPeerScore::new()),
            symbiosis: Arc::new(RwLock::new(symbiosis::SymbiosisProtocol::default())),
            identity,
            running: Arc::new(RwLock::new(false)),
            push_token: Arc::new(RwLock::new(None)),
            delegate: Arc::new(RwLock::new(None)),
        }
    }

    // ------------------------------------------------------------------------
    // LIFECYCLE
    // ------------------------------------------------------------------------

    pub fn start(&self) -> Result<(), IronCoreError> {
        let mut running = self.running.write();
        if *running {
            return Err(IronCoreError::AlreadyRunning);
        }

        tracing::info!("🦀 Iron Core V2 starting...");

        // Initialize identity if not already done
        if self.identity.read().keys().is_none() {
            self.identity.write().initialize()
                .map_err(|e| IronCoreError::StorageError(e.to_string()))?;
        }

        *running = true;
        tracing::info!("✅ Iron Core V2 started");

        Ok(())
    }

    pub fn stop(&self) {
        let mut running = self.running.write();
        if !*running {
            return;
        }

        tracing::info!("Iron Core V2 stopping...");

        // Disable delegation if active
        self.symbiosis.write().disable_delegation();

        *running = false;
        tracing::info!("✅ Iron Core V2 stopped");
    }

    pub fn is_running(&self) -> bool {
        *self.running.read()
    }

    // ------------------------------------------------------------------------
    // GOVERNOR
    // ------------------------------------------------------------------------

    pub fn set_environmental_reading(&self, reading: EnvironmentalReading) {
        let previous_state = self.governor.read().get_vitality_report().state;

        // Update governor
        let mut engine = self.governor.write();
        engine.update_conditions(reading.battery_level, reading.network_type);
        drop(engine);

        // Get new report
        let report = self.governor.read().get_vitality_report();

        // Notify delegate if state changed
        if report.state != previous_state {
            if let Some(delegate) = self.delegate.read().as_ref() {
                delegate.on_vitality_changed(report.clone());
            }
        }
    }

    pub fn get_vitality_report(&self) -> VitalityReport {
        self.governor.read().get_vitality_report()
    }

    // ------------------------------------------------------------------------
    // MESH NETWORKING
    // ------------------------------------------------------------------------

    pub fn get_mesh_parameters(&self) -> MeshParameters {
        let report = self.get_vitality_report();
        let params = mesh::mesh_params_for_vitality(&report);

        MeshParameters {
            mesh_n_low: params.mesh_n_low as u32,
            mesh_n: params.mesh_n as u32,
            mesh_n_high: params.mesh_n_high as u32,
            enable_relay: params.enable_relay,
            dht_mode: format!("{:?}", params.dht_mode),
        }
    }

    pub fn get_peer_scores(&self) -> Vec<PeerScore> {
        self.mesh_scorer
            .get_all_scores()
            .into_iter()
            .map(|(peer_id, score)| PeerScore { peer_id, score })
            .collect()
    }

    pub fn publish_message(&self, data: Vec<u8>) -> Result<(), IronCoreError> {
        if !self.is_running() {
            return Err(IronCoreError::NotInitialized);
        }

        tracing::info!("📤 Publishing message ({} bytes)", data.len());

        // Future: Actually send via libp2p
        Ok(())
    }

    // ------------------------------------------------------------------------
    // SYMBIOSIS (DELEGATED LISTENING)
    // ------------------------------------------------------------------------

    pub fn enable_delegated_listening(&self, push_token: String) -> Result<(), IronCoreError> {
        // Store push token
        *self.push_token.write() = Some(push_token.clone());

        // Enable delegation
        let result = self.symbiosis.write().enable_delegation(push_token);

        match result {
            Ok(requests) => {
                tracing::info!("💤 Delegated listening enabled with {} delegates", requests.len());

                // Notify delegate
                if let Some(delegate) = self.delegate.read().as_ref() {
                    delegate.on_delegation_changed(self.get_delegation_status());
                }

                Ok(())
            }
            Err(e) => {
                if e.contains("Already in delegated mode") {
                    Err(IronCoreError::AlreadyDelegating)
                } else if e.contains("No suitable delegates") {
                    Err(IronCoreError::NoSuitableDelegates)
                } else {
                    Err(IronCoreError::NetworkError(e))
                }
            }
        }
    }

    pub fn disable_delegated_listening(&self) {
        self.symbiosis.write().disable_delegation();

        // Notify delegate
        if let Some(delegate) = self.delegate.read().as_ref() {
            delegate.on_delegation_changed(self.get_delegation_status());
        }
    }

    pub fn get_delegation_status(&self) -> DelegationStatus {
        let symbiosis = self.symbiosis.read();
        let is_active = symbiosis.is_delegating();
        let delegate_ids = symbiosis.delegate_manager().get_selected_delegates();

        DelegationStatus {
            is_active,
            delegate_count: delegate_ids.len() as u32,
            delegate_ids,
        }
    }

    // ------------------------------------------------------------------------
    // IDENTITY & CRYPTOGRAPHY
    // ------------------------------------------------------------------------

    pub fn initialize_identity(&self) -> Result<(), IronCoreError> {
        self.identity.write().initialize()
            .map_err(|e| IronCoreError::CryptoError(e.to_string()))
    }

    pub fn get_identity_info(&self) -> IdentityInfo {
        let identity = self.identity.read();

        IdentityInfo {
            identity_id: identity.identity_id(),
            public_key_hex: identity.public_key_hex(),
            initialized: identity.keys().is_some(),
        }
    }

    pub fn sign_data(&self, data: Vec<u8>) -> Result<SignatureResult, IronCoreError> {
        let identity = self.identity.read();

        let signature = identity.sign(&data)
            .map_err(|e| IronCoreError::CryptoError(e.to_string()))?;

        let public_key_hex = identity.public_key_hex()
            .ok_or_else(|| IronCoreError::NotInitialized)?;

        Ok(SignatureResult {
            signature,
            public_key_hex,
        })
    }

    pub fn verify_signature(&self, data: Vec<u8>, signature: Vec<u8>, public_key_hex: String) -> Result<bool, IronCoreError> {
        let public_key = hex::decode(public_key_hex)
            .map_err(|e| IronCoreError::InvalidInput(e.to_string()))?;

        self.identity.read().verify(&data, &signature, &public_key)
            .map_err(|e| IronCoreError::CryptoError(e.to_string()))
    }

    // ------------------------------------------------------------------------
    // PUSH NOTIFICATIONS
    // ------------------------------------------------------------------------

    pub fn register_push_token(&self, token: String) {
        *self.push_token.write() = Some(token.clone());
        tracing::info!("📱 Registered push token");
    }

    pub fn set_delegate(&self, delegate: Option<Box<dyn CoreDelegate>>) {
        *self.delegate.write() = delegate.map(|d| Arc::from(d) as Arc<dyn CoreDelegate>);
    }

    // ------------------------------------------------------------------------
    // INTERNAL HELPERS
    // ------------------------------------------------------------------------

    /// Trigger a push notification (called internally)
    pub(crate) fn _trigger_push_notification(&self, title: String, body: String, data: Option<String>) {
        if let Some(delegate) = self.delegate.read().as_ref() {
            let notification = PushNotification {
                title,
                body,
                data,
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            };

            delegate.on_push_notification(notification);
        }
    }
}

impl Default for IronCore {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_iron_core_creation() {
        let core = IronCore::new();
        let report = core.get_vitality_report();

        assert!(matches!(report.state, NodeState::Active));
        assert!(report.score > 0.0 && report.score <= 1.0);
    }

    #[test]
    fn test_lifecycle() {
        let core = IronCore::new();

        assert!(!core.is_running());

        core.start().unwrap();
        assert!(core.is_running());

        core.stop();
        assert!(!core.is_running());
    }

    #[test]
    fn test_environmental_updates() {
        let core = IronCore::new();

        // Hub state
        core.set_environmental_reading(EnvironmentalReading {
            battery_level: 0.9,
            network_type: NetworkType::Wifi,
        });

        let report = core.get_vitality_report();
        assert!(matches!(report.state, NodeState::Hub));
        assert!(report.score > 0.8);

        // Leaf state
        core.set_environmental_reading(EnvironmentalReading {
            battery_level: 0.15,
            network_type: NetworkType::Cellular,
        });

        let report = core.get_vitality_report();
        assert!(matches!(report.state, NodeState::Leaf));
        assert!(report.score < 0.3);
    }

    #[test]
    fn test_mesh_parameters() {
        let core = IronCore::new();

        // Set to Hub state
        core.set_environmental_reading(EnvironmentalReading {
            battery_level: 0.95,
            network_type: NetworkType::Wifi,
        });

        let params = core.get_mesh_parameters();
        assert_eq!(params.mesh_n_low, 6);
        assert_eq!(params.mesh_n, 8);
        assert!(params.enable_relay);
        assert_eq!(params.dht_mode, "Server");
    }

    #[test]
    fn test_identity_initialization() {
        let core = IronCore::new();

        let info_before = core.get_identity_info();
        assert!(!info_before.initialized);

        core.initialize_identity().unwrap();

        let info_after = core.get_identity_info();
        assert!(info_after.initialized);
        assert!(info_after.identity_id.is_some());
        assert!(info_after.public_key_hex.is_some());
    }

    #[test]
    fn test_signing_and_verification() {
        let core = IronCore::new();
        core.initialize_identity().unwrap();

        let data = b"test message".to_vec();
        let sig_result = core.sign_data(data.clone()).unwrap();

        assert!(!sig_result.signature.is_empty());

        let valid = core.verify_signature(
            data,
            sig_result.signature.clone(),
            sig_result.public_key_hex.clone(),
        ).unwrap();

        assert!(valid);
    }

    #[test]
    fn test_delegation_status() {
        let core = IronCore::new();

        let status = core.get_delegation_status();
        assert!(!status.is_active);
        assert_eq!(status.delegate_count, 0);
    }
}
