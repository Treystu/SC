// sc-wasm - WebAssembly bindings for browser environments
// Exports Iron Core functionality to JavaScript via wasm-bindgen

use wasm_bindgen::prelude::*;
use sc_core::{IronCore as RustIronCore, VitalityReport, NodeState, NetworkType, EnvironmentalReading, CoreDelegate};
use std::sync::Arc;

#[wasm_bindgen]
pub fn init_logging() {
    console_error_panic_hook::set_once();
    tracing_wasm::set_as_global_default();
}

#[wasm_bindgen]
pub struct IronCore {
    inner: RustIronCore,
}

#[wasm_bindgen]
impl IronCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_logging();
        Self {
            inner: RustIronCore::new(),
        }
    }

    pub fn start(&self) {
        self.inner.start();
    }

    pub fn stop(&self) {
        self.inner.stop();
    }

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

    #[wasm_bindgen(js_name = registerPushToken)]
    pub fn register_push_token(&self, token: String) {
        self.inner.register_push_token(token);
    }

    #[wasm_bindgen(js_name = enableDelegatedListening)]
    pub fn enable_delegated_listening(&self, enable: bool) {
        self.inner.enable_delegated_listening(enable);
    }
}

// Serializable version of VitalityReport for JavaScript
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

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test_configure!(run_in_browser);

    #[wasm_bindgen_test]
    fn test_wasm_core_creation() {
        let core = IronCore::new();
        core.start();
        let report = core.get_vitality_report();
        assert!(!report.is_null());
        core.stop();
    }
}
