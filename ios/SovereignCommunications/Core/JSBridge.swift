//
//  JSBridge.swift
//  SovereignCommunications
//
//  Bridge to @sc/core Javascript runtime.
//

import Foundation
import JavaScriptCore
import os.log

@objc protocol JSBridgeExports: JSExport {
    func onOutboundMessage(_ peerId: String, _ data: String) // Base64 encoded string for data
    func onApplicationMessage(_ messageJson: String)
}

class JSBridge: NSObject, JSBridgeExports {
    static let shared = JSBridge()
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "JSBridge")
    
    private var context: JSContext?
    private var coreNetwork: JSValue?
    
    var outboundCallback: ((String, Data) -> Void)?
    var applicationMessageCallback: ((String) -> Void)? // JSON string
    
    private override init() {
        super.init()
        setupContext()
    }
    
    private func setupContext() {
        context = JSContext()
        
        context?.exceptionHandler = { context, exception in
            if let exception = exception {
                self.logger.error("JS Exception: \(exception.toString() ?? "unknown")")
            }
        }
        
        // Inject self to handle callbacks from JS
        context?.setObject(self, forKeyedSubscript: "NativeBridge" as NSString)
        
        // Load the Core Bundle
        if let bundlePath = Bundle.main.path(forResource: "sc-core", ofType: "js") {
            do {
                let script = try String(contentsOfFile: bundlePath)
                context?.evaluateScript(script)
                
                // Initialize MeshNetwork
                // Assumes Global 'SCCore' object exposes MeshNetwork
                let initScript = """
                const network = new SCCore.MeshNetwork();
                
                // Register outbound transport
                network.registerOutboundTransport(async (peerId, data) => {
                    // Convert Uint8Array to Base64 to send across bridge
                    const base64 = SCCore.utils.bytesToBase64(data); // Assuming utility exists or we use Buffer
                    NativeBridge.onOutboundMessage(peerId, base64);
                });
                
                // Register application message listener
                network.onMessage((msg) => {
                    NativeBridge.onApplicationMessage(JSON.stringify(msg));
                });
                
                globalThis.meshNetwork = network;
                """
                context?.evaluateScript(initScript)
                
                coreNetwork = context?.objectForKeyedSubscript("meshNetwork")
                logger.info("JS Core initialized successfully")
            } catch {
                logger.error("Failed to load sc-core.js: \(error.localizedDescription)")
            }
        } else {
            logger.error("sc-core.js not found in bundle")
        }
    }
    
    // MARK: - Native Inputs
    
    /**
     * Pass incoming binary data from Native Transport (BLE/WebRTC) to JS Core
     */
    func handleIncomingPacket(data: Data, from peerId: String) {
        guard let network = coreNetwork else { return }
        
        // Convert Data to Uint8Array via Base64 or direct array
        // Easy way: Pass Base64 -> JS converts to Uint8Array
        let base64 = data.base64EncodedString()
        
        let script = """
        const data = SCCore.utils.base64ToBytes("\(base64)");
        meshNetwork.handleIncomingPacket("\(peerId)", data);
        """
        context?.evaluateScript(script)
    }
    
    /**
     * Send message from UI (Application Layer) -> JS Core -> Mesh
     */
    func sendMessage(to recipientId: String, content: String) {
        let script = """
        meshNetwork.sendTextMessage("\(recipientId)", "\(content)");
        """
        context?.evaluateScript(script)
    }
    
    // MARK: - JSBridgeExports
    
    func onOutboundMessage(_ peerId: String, _ dataBase64: String) {
        if let data = Data(base64Encoded: dataBase64) {
            outboundCallback?(peerId, data)
        }
    }
    
    func onApplicationMessage(_ messageJson: String) {
        applicationMessageCallback?(messageJson)
    }
}
