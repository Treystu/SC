// sc-wasm - WebAssembly bindings for browser environments
// Exports Iron Core functionality to JavaScript via wasm-bindgen

use wasm_bindgen::prelude::*;
use sc_core::{
    IronCore as RustIronCore,
    VitalityReport,
    NetworkType,
    EnvironmentalReading,
    MeshParameters,
    PeerScore,
    DelegationStatus,
    IdentityInfo,
    SignatureResult,
};
use std::sync::Arc;

#[wasm_bindgen]
pub fn init_logging() {
    console_error_panic_hook::set_once();
    tracing_wasm::set_as_global_default();
}

#[wasm_bindgen]
pub struct IronCore {
    inner: Arc<RustIronCore>,
}

#[wasm_bindgen]
impl IronCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_logging();
        Self {
            inner: Arc::new(RustIronCore::new()),
        }
    }

    #[wasm_bindgen(js_name = withStorage)]
    pub fn with_storage(storage_path: String) -> Self {
        init_logging();
        Self {
            inner: Arc::new(RustIronCore::with_storage(storage_path)),
        }
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    pub fn start(&self) -> Result<(), JsValue> {
        self.inner.start()
            .map_err(|e| JsValue::from_str(&format!("{}", e)))
    }

    pub fn stop(&self) {
        self.inner.stop();
    }

    #[wasm_bindgen(js_name = isRunning)]
    pub fn is_running(&self) -> bool {
        self.inner.is_running()
    }

    // ========================================================================
    // GOVERNOR
    // ========================================================================

    #[wasm_bindgen(js_name = setEnvironmentalReading)]
    pub fn set_environmental_reading(&self, battery_level: f32, network_type: String) {
        let network = match network_type.as_str() {
            "wifi" => NetworkType::Wifi,
            "cellular" => NetworkType::Cellular,
            "ethernet" => NetworkType::Ethernet,
            _ => NetworkType::Unknown,
        };

        self.inner.set_environmental_reading(EnvironmentalReading {
            battery_level,
            network_type: network,
        });
    }

    #[wasm_bindgen(js_name = getVitalityReport)]
    pub fn get_vitality_report(&self) -> JsValue {
        let report = self.inner.get_vitality_report();
        serde_wasm_bindgen::to_value(&WasmVitalityReport::from(report)).unwrap()
    }

    // ========================================================================
    // MESH NETWORKING
    // ========================================================================

    #[wasm_bindgen(js_name = getMeshParameters)]
    pub fn get_mesh_parameters(&self) -> JsValue {
        let params = self.inner.get_mesh_parameters();
        serde_wasm_bindgen::to_value(&WasmMeshParameters::from(params)).unwrap()
    }

    #[wasm_bindgen(js_name = getPeerScores)]
    pub fn get_peer_scores(&self) -> JsValue {
        let scores = self.inner.get_peer_scores();
        let wasm_scores: Vec<WasmPeerScore> = scores.into_iter()
            .map(WasmPeerScore::from)
            .collect();
        serde_wasm_bindgen::to_value(&wasm_scores).unwrap()
    }

    #[wasm_bindgen(js_name = publishMessage)]
    pub fn publish_message(&self, data: Vec<u8>) -> Result<(), JsValue> {
        self.inner.publish_message(data)
            .map_err(|e| JsValue::from_str(&format!("{}", e)))
    }

    // ========================================================================
    // SYMBIOSIS (DELEGATED LISTENING)
    // ========================================================================

    #[wasm_bindgen(js_name = enableDelegatedListening)]
    pub fn enable_delegated_listening(&self, push_token: String) -> Result<(), JsValue> {
        self.inner.enable_delegated_listening(push_token)
            .map_err(|e| JsValue::from_str(&format!("{}", e)))
    }

    #[wasm_bindgen(js_name = disableDelegatedListening)]
    pub fn disable_delegated_listening(&self) {
        self.inner.disable_delegated_listening();
    }

    #[wasm_bindgen(js_name = getDelegationStatus)]
    pub fn get_delegation_status(&self) -> JsValue {
        let status = self.inner.get_delegation_status();
        serde_wasm_bindgen::to_value(&WasmDelegationStatus::from(status)).unwrap()
    }

    // ========================================================================
    // IDENTITY & CRYPTOGRAPHY
    // ========================================================================

    #[wasm_bindgen(js_name = initializeIdentity)]
    pub fn initialize_identity(&self) -> Result<(), JsValue> {
        self.inner.initialize_identity()
            .map_err(|e| JsValue::from_str(&format!("{}", e)))
    }

    #[wasm_bindgen(js_name = getIdentityInfo)]
    pub fn get_identity_info(&self) -> JsValue {
        let info = self.inner.get_identity_info();
        serde_wasm_bindgen::to_value(&WasmIdentityInfo::from(info)).unwrap()
    }

    #[wasm_bindgen(js_name = signData)]
    pub fn sign_data(&self, data: Vec<u8>) -> Result<JsValue, JsValue> {
        self.inner.sign_data(data)
            .map(|sig| {
                let wasm_sig = WasmSignatureResult::from(sig);
                serde_wasm_bindgen::to_value(&wasm_sig).unwrap()
            })
            .map_err(|e| JsValue::from_str(&format!("{}", e)))
    }

    #[wasm_bindgen(js_name = verifySignature)]
    pub fn verify_signature(&self, data: Vec<u8>, signature: Vec<u8>, public_key_hex: String) -> Result<bool, JsValue> {
        self.inner.verify_signature(data, signature, public_key_hex)
            .map_err(|e| JsValue::from_str(&format!("{}", e)))
    }

    // ========================================================================
    // PUSH NOTIFICATIONS
    // ========================================================================

    #[wasm_bindgen(js_name = registerPushToken)]
    pub fn register_push_token(&self, token: String) {
        self.inner.register_push_token(token);
    }
}

// ============================================================================
// WASM-SERIALIZABLE DATA TYPES
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmVitalityReport {
    state: String,
    score: f32,
    battery_level: f32,
    network_type: String,
    is_roaming: bool,
}

impl From<VitalityReport> for WasmVitalityReport {
    fn from(report: VitalityReport) -> Self {
        Self {
            state: format!("{:?}", report.state).to_lowercase(),
            score: report.score,
            battery_level: report.battery_level,
            network_type: format!("{:?}", report.network_type).to_lowercase(),
            is_roaming: report.is_roaming,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmMeshParameters {
    mesh_n_low: u32,
    mesh_n: u32,
    mesh_n_high: u32,
    enable_relay: bool,
    dht_mode: String,
}

impl From<MeshParameters> for WasmMeshParameters {
    fn from(params: MeshParameters) -> Self {
        Self {
            mesh_n_low: params.mesh_n_low,
            mesh_n: params.mesh_n,
            mesh_n_high: params.mesh_n_high,
            enable_relay: params.enable_relay,
            dht_mode: params.dht_mode,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmPeerScore {
    peer_id: String,
    score: f32,
}

impl From<PeerScore> for WasmPeerScore {
    fn from(ps: PeerScore) -> Self {
        Self {
            peer_id: ps.peer_id,
            score: ps.score,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmDelegationStatus {
    is_active: bool,
    delegate_count: u32,
    delegate_ids: Vec<String>,
}

impl From<DelegationStatus> for WasmDelegationStatus {
    fn from(status: DelegationStatus) -> Self {
        Self {
            is_active: status.is_active,
            delegate_count: status.delegate_count,
            delegate_ids: status.delegate_ids,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmIdentityInfo {
    identity_id: Option<String>,
    public_key_hex: Option<String>,
    initialized: bool,
}

impl From<IdentityInfo> for WasmIdentityInfo {
    fn from(info: IdentityInfo) -> Self {
        Self {
            identity_id: info.identity_id,
            public_key_hex: info.public_key_hex,
            initialized: info.initialized,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmSignatureResult {
    signature: Vec<u8>,
    public_key_hex: String,
}

impl From<SignatureResult> for WasmSignatureResult {
    fn from(sig: SignatureResult) -> Self {
        Self {
            signature: sig.signature,
            public_key_hex: sig.public_key_hex,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test_configure!(run_in_browser);

    #[wasm_bindgen_test]
    fn test_wasm_core_creation() {
        let core = IronCore::new();
        core.start().unwrap();
        assert!(core.is_running());

        let report = core.get_vitality_report();
        assert!(!report.is_null());

        core.stop();
        assert!(!core.is_running());
    }

    #[wasm_bindgen_test]
    fn test_wasm_mesh_parameters() {
        let core = IronCore::new();
        core.start().unwrap();

        let params = core.get_mesh_parameters();
        assert!(!params.is_null());

        core.stop();
    }

    #[wasm_bindgen_test]
    fn test_wasm_identity() {
        let core = IronCore::new();
        core.initialize_identity().unwrap();

        let info = core.get_identity_info();
        assert!(!info.is_null());
    }
}
