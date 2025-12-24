//
//  CoreBridge.swift
//  SovereignCommunications
//
//  Bridge between iOS and the core TypeScript/JavaScript library
//

import Foundation
import JavaScriptCore
import os.log
import CryptoKit
import Security
import Security

/// CoreBridge - Bridge between iOS and the core TypeScript/JavaScript library
///
/// This class loads the core library bundle using JavaScriptCore and provides
/// a Swift interface to interact with the crypto, protocol, and mesh networking
/// functionality.
///
/// JavaScriptCore is the native JavaScript engine on iOS and provides excellent
/// performance and ES6+ support.
class CoreBridge {
    
    // MARK: - Singleton
    
    static let shared = CoreBridge()
    
    // MARK: - Properties
    
    private let jsContext: JSContext
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "CoreBridge")
    private var isInitialized = false
    
    // Callbacks
    var outboundTransportCallback: ((String, Data) -> Void)?

    
    // Cached identity
    private(set) var localIdentity: CoreIdentity?
    
    // MARK: - Initialization
    
    private init() {
        guard let context = JSContext() else {
            fatalError("Failed to initialize JSContext - JavaScriptCore unavailable")
        }
        jsContext = context
        
        // Set up error handling
        jsContext.exceptionHandler = { [weak self] context, exception in
            if let exception = exception {
                self?.logger.error("JavaScript exception: \(exception.toString() ?? "unknown")")
            }
        }
        
        // Add console.log support for debugging
        let consoleLog: @convention(block) (String) -> Void = { message in
            print("[JSCore] \(message)")
        }
        jsContext.setObject(consoleLog, forKeyedSubscript: "consoleLog" as NSString)
        jsContext.evaluateScript("var console = { log: consoleLog, error: consoleLog, warn: consoleLog };")
        
        // Register secure random function for crypto polyfill
        let logger = self.logger
        let secureRandomBytes: @convention(block) (Int) -> [UInt8] = { count in
            var bytes = [UInt8](repeating: 0, count: count)
            let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
            if status != errSecSuccess {
                logger.error("SecRandomCopyBytes failed with status: \(status)")
                // Return zeros on failure - the crypto operations will likely fail
                // but this prevents undefined behavior
            }
            return bytes
        }
        jsContext.setObject(secureRandomBytes, forKeyedSubscript: "_nativeSecureRandomBytes" as NSString)
        
        // Register outbound transport callback
        let outboundTransport: @convention(block) (String, [Any]?) -> Void = { [weak self] peerId, dataArray in
            guard let self = self, let dataArray = dataArray else { return }
            
            // Convert JS number array to Data
            var bytes = [UInt8]()
            for item in dataArray {
                if let num = item as? NSNumber {
                    bytes.append(UInt8(num.uint8Value))
                }
            }
            
            self.outboundTransportCallback?(peerId, Data(bytes))
        }
        jsContext.setObject(outboundTransport, forKeyedSubscript: "_nativeOutboundTransport" as NSString)
    }
    
    // MARK: - Initialization
    
    /// Initialize the core library
    func initialize() async throws {
        guard !isInitialized else { return }
        
        logger.info("Initializing CoreBridge...")
        
        // Load the core bundle from Resources
        guard let bundleURL = Bundle.main.url(forResource: "sc-core.bundle", withExtension: "js"),
              let bundleCode = try? String(contentsOf: bundleURL, encoding: .utf8) else {
            throw CoreBridgeError.bundleNotFound
        }
        
        // Inject crypto polyfill for getRandomValues
        // Uses native SecRandomCopyBytes via the _nativeSecureRandomBytes bridge
        let cryptoPolyfill = """
            if (typeof crypto === 'undefined') {
                var crypto = {};
            }
            if (typeof crypto.getRandomValues === 'undefined') {
                crypto.getRandomValues = function(arr) {
                    // Use native iOS SecRandomCopyBytes for cryptographic security
                    var bytes = _nativeSecureRandomBytes(arr.length);
                    for (var i = 0; i < arr.length; i++) {
                        arr[i] = bytes[i];
                    }
                    return arr;
                };
            }
        """
        jsContext.evaluateScript(cryptoPolyfill)
        
        // Execute the bundle to load SCCore global
        jsContext.evaluateScript(bundleCode)
        
        // Verify SCCore is available
        let testResult = jsContext.evaluateScript("typeof SCCore !== 'undefined'")
        guard testResult?.toBool() == true else {
            throw CoreBridgeError.initializationFailed("SCCore global not defined")
        }
        
        isInitialized = true
        logger.info("CoreBridge initialized successfully")
    }
    
    // MARK: - Mesh Network Logic (Unified Core)
    
    /// Initialize the MeshNetwork in JS logic
    func initMeshNetwork(peerId: String) async throws {
        try await ensureInitialized()
        
        // Check if MeshNetwork exists in bundle
        let checkScript = "typeof SCCore.MeshNetwork !== 'undefined'"
        guard jsContext.evaluateScript(checkScript)?.toBool() == true else {
             throw CoreBridgeError.initializationFailed("MeshNetwork not exported in bundle")
        }
        
        let script = """
            (function() {
                if (globalThis.meshNetwork) {
                    return "Already initialized";
                }

                // Initialize MeshNetwork with explicit peerId
                globalThis.meshNetwork = new SCCore.MeshNetwork({
                    peerId: '\(peerId)'
                });

                // Register outbound transport
                globalThis.meshNetwork.registerOutboundTransport((peerId, data) => {
                     // Convert Uint8Array to Array for Native bridge
                     _nativeOutboundTransport(peerId, Array.from(data));
                     return Promise.resolve();
                });
                
                return "success";
            })()
        """
        
        let result = jsContext.evaluateScript(script)?.toString()
        if result == "success" || result == "Already initialized" {
             logger.info("MeshNetwork initialized in JS")
        } else {
             throw CoreBridgeError.initializationFailed("MeshNetwork init failed: \(result ?? "unknown")")
        }
    }
    
    /// Handle incoming packet from Native Transport -> JS MeshNetwork
    func handleIncomingPacket(peerId: String, data: Data) async throws {
        try await ensureInitialized()
        let dataHex = data.map { String(format: "%02x", $0) }.joined()
        
        let script = """
            (function() {
                if (globalThis.meshNetwork) {
                    var dataBytes = new Uint8Array('\(dataHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    globalThis.meshNetwork.handleIncomingPacket('\(peerId)', dataBytes);
                }
            })()
        """
        jsContext.evaluateScript(script)
    }
    
    /// Send text message via JS MeshNetwork
    func sendTextMessage(recipientId: String, text: String) async throws {
        try await ensureInitialized()
        // Simple escaping
        let safeText = text.replacingOccurrences(of: "'", with: "\\'").replacingOccurrences(of: "\n", with: "\\n")
        
        let script = """
            (function() {
                if (globalThis.meshNetwork) {
                    globalThis.meshNetwork.sendTextMessage('\(recipientId)', '\(safeText)');
                }
            })()
        """
        jsContext.evaluateScript(script)
    }

    
    // MARK: - Identity Management
    
    /// Generate a new identity keypair
    func generateIdentity() async throws -> CoreIdentity {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        let privateKey = NativeCryptoManager.shared.getEd25519PrivateKey()
        let publicKey = NativeCryptoManager.shared.getEd25519PublicKey()
        
        let publicKeyHex = publicKey.rawRepresentation.map { String(format: "%02x", $0) }.joined()
        let privateKeyHex = privateKey.rawRepresentation.map { String(format: "%02x", $0) }.joined()
        
        let identity = CoreIdentity(publicKey: publicKeyHex, privateKey: privateKeyHex)
        self.localIdentity = identity
        return identity
    }
    
    /// Generate fingerprint for a public key
    func generateFingerprint(publicKeyHex: String) async throws -> String {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        guard let publicKeyData = hexToData(publicKeyHex) else {
            throw CoreBridgeError.evaluationFailed("Invalid public key hex")
        }
        
        let fingerprint = NativeCryptoManager.shared.sha256(publicKeyData)
        return fingerprint.map { String(format: "%02x", $0) }.joined()
    }
    
    // MARK: - Cryptographic Operations
    
    /// Sign a message with the private key
    func signMessage(message: Data, privateKeyHex: String) async throws -> Data {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        let signature = NativeCryptoManager.shared.sign(message)
        return signature
    }
    
    /// Verify a signature
    func verifySignature(message: Data, signature: Data, publicKeyHex: String) async throws -> Bool {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        guard let publicKey = NativeCryptoManager.shared.base64ToPublicKey(publicKeyHex) else {
            throw CoreBridgeError.evaluationFailed("Invalid public key")
        }
        
        return NativeCryptoManager.shared.verify(signature: signature, for: message, with: publicKey)
    }
    
    /// Encrypt a message
    func encryptMessage(plaintext: Data, key: Data, nonce: Data) async throws -> Data {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        // Convert key and nonce to SymmetricKey
        let symmetricKey = SymmetricKey(data: key)
        let encryptedData = NativeCryptoManager.shared.encryptChaCha20(plaintext, key: symmetricKey)
        return encryptedData
    }
    
    /// Decrypt a message
    func decryptMessage(ciphertext: Data, key: Data, nonce: Data) async throws -> Data {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        let symmetricKey = SymmetricKey(data: key)
        guard let decryptedData = NativeCryptoManager.shared.decryptChaCha20(ciphertext, key: symmetricKey) else {
            throw CoreBridgeError.evaluationFailed("Failed to decrypt message")
        }
        return decryptedData
    }
    
    // MARK: - Protocol Operations
    
    /// Encode a protocol message
    func encodeMessage(type: Int, ttl: Int, senderId: Data, payload: Data) async throws -> Data {
        try await ensureInitialized()
        
        let senderIdHex = senderId.map { String(format: "%02x", $0) }.joined()
        let payloadHex = payload.map { String(format: "%02x", $0) }.joined()
        
        let script = """
            (function() {
                var senderIdBytes = new Uint8Array('\(senderIdHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var payloadBytes = new Uint8Array('\(payloadHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var message = {
                    header: {
                        version: 0x01,
                        type: \(type),
                        ttl: \(ttl),
                        timestamp: Date.now(),
                        senderId: senderIdBytes,
                        signature: new Uint8Array(65)
                    },
                    payload: payloadBytes
                };
                var encoded = SCCore.encodeMessage(message);
                return Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join('');
            })()
        """
        
        guard let encodedHex = jsContext.evaluateScript(script)?.toString() else {
            throw CoreBridgeError.evaluationFailed("Failed to encode message")
        }
        
        return hexToData(encodedHex)
    }
    
    // MARK: - Session Key Management
    
    /// Generate a session key
    func generateSessionKey() async throws -> SessionKeyResult {
        try await ensureInitialized()
        
        // Use native crypto instead of JavaScript bridge
        let keyData = NativeCryptoManager.shared.generateRandomBytes(count: 32)
        let nonceData = NativeCryptoManager.shared.generateRandomBytes(count: 12)
        
        let keyHex = keyData.map { String(format: "%02x", $0) }.joined()
        let nonceHex = nonceData.map { String(format: "%02x", $0) }.joined()
        
        return SessionKeyResult(
            key: keyHex,
            nonce: nonceHex,
            timestamp: Int(Date().timeIntervalSince1970 * 1000)
        )
    }
    
    // MARK: - Version
    
    /// Get the core library version
    func getVersion() async throws -> String {
        try await ensureInitialized()
        
        guard let version = jsContext.evaluateScript("SCCore.VERSION")?.toString() else {
            throw CoreBridgeError.evaluationFailed("Failed to get version")
        }
        
        return version
    }
    
    // MARK: - Self-Hosting TURN Server
    
    /// Create configuration for self-hosted TURN server
    func createSelfHostedTurnConfig() -> TurnServerConfig {
        return NativeCryptoManager.shared.createSelfHostedTurnConfig()
    }
    
    // MARK: - Mesh Networking
    
    /// Create a relay-ready encrypted message for mesh routing
    func createRelayMessage(
        _ message: Data,
        recipientId: String,
        ttl: Int = 255,
        priority: MessagePriority = .normal
    ) -> RelayMessage {
        return NativeCryptoManager.shared.createRelayMessage(message, recipientId: recipientId, ttl: ttl, priority: priority)
    }
    
    /// Process and potentially relay a message
    func processRelayMessage(_ relayMessage: RelayMessage) -> RelayAction {
        return NativeCryptoManager.shared.processRelayMessage(relayMessage)
    }
    
    /// Encrypt message for specific recipient using native crypto
    func encryptMessageForRecipient(_ message: Data, recipientPublicKey: Curve25519.KeyAgreement.PublicKey) -> EncryptedMessage {
        return NativeCryptoManager.shared.encryptMessageForRecipient(message, recipientPublicKey: recipientPublicKey)
    }
    
    /// Decrypt message intended for us using native crypto
    func decryptMessageForUs(_ encryptedMessage: EncryptedMessage) -> Data? {
        return NativeCryptoManager.shared.decryptMessageForUs(encryptedMessage)
    }
    
    // MARK: - Private Helpers
    
    private func ensureInitialized() async throws {
        if !isInitialized {
            try await initialize()
        }
    }
    
    private func hexToData(_ hex: String) -> Data {
        var data = Data()
        var startIndex = hex.startIndex
        while startIndex < hex.endIndex {
            let endIndex = hex.index(startIndex, offsetBy: 2)
            let byteString = String(hex[startIndex..<endIndex])
            if let byte = UInt8(byteString, radix: 16) {
                data.append(byte)
            }
            startIndex = endIndex
        }
        return data
    }
}

// MARK: - Data Types

/// Identity keypair from core library
struct CoreIdentity: Codable {
    let publicKey: String
    let privateKey: String
}

/// Session key result from core library
struct SessionKeyResult: Codable {
    let key: String
    let nonce: String
    let timestamp: Int
}

/// TURN server configuration for self-hosting
struct TurnServerConfig {
    let host: String
    let port: Int
    let username: String
    let password: String
    let isSelfHosted: Bool
}

/// Encrypted message for mesh routing
struct EncryptedMessage {
    let encryptedContent: Data
    let ephemeralPublicKey: Data
    let recipientPublicKey: Data
}

/// Relay message for mesh networking
struct RelayMessage {
    let id: String
    let encryptedContent: Data
    let recipientId: String
    let senderId: String
    let timestamp: TimeInterval
    let ttl: Int
    let priority: MessagePriority
    let signature: String
    var route: [String]
}

/// Message priority levels
enum MessagePriority {
    case low, normal, high, critical
}

/// Relay action for message processing
enum RelayAction {
    case deliver
    case relay(ttl: Int)
    case hold
    case drop
}

// MARK: - Errors

enum CoreBridgeError: Error, LocalizedError {
    case bundleNotFound
    case initializationFailed(String)
    case evaluationFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .bundleNotFound:
            return "Core bundle file not found in Resources"
        case .initializationFailed(let message):
            return "CoreBridge initialization failed: \(message)"
        case .evaluationFailed(let message):
            return "JavaScript evaluation failed: \(message)"
        }
    }
}

// MARK: - Transport Protocol Extension

/// Extension to integrate CoreBridge with the MeshNetworkManager
extension CoreBridge {
    
    /// Create a signed and encoded message ready for transport
    func createMessage(
        type: MessageType,
        recipientId: String,
        payload: Data,
        identity: CoreIdentity? = nil
    ) async throws -> Data {
        let resolvedIdentity = identity ?? localIdentity
        guard let id = resolvedIdentity else {
            throw CoreBridgeError.evaluationFailed("No identity available")
        }
        
        // Get sender ID bytes
        let senderIdData = hexToData(id.publicKey)
        
        // Encode the message (with placeholder signature)
        let encodedMessage = try await encodeMessage(
            type: type.rawValue,
            ttl: 10,
            senderId: senderIdData,
            payload: payload
        )
        
        // Sign the message
        let signature = try await signMessage(
            message: encodedMessage,
            privateKeyHex: id.privateKey
        )
        
        // Embed signature into the encoded message at offset 44 (after version, type, ttl, reserved, timestamp, senderId)
        // Header structure: version(1) + type(1) + ttl(1) + reserved(1) + timestamp(8) + senderId(32) = 44 bytes
        var signedMessage = encodedMessage
        let signatureOffset = 44
        guard signedMessage.count >= signatureOffset + 64, signature.count >= 64 else {
            throw CoreBridgeError.evaluationFailed("Invalid message or signature length")
        }
        
        // Replace placeholder signature with actual signature (first 64 bytes)
        signedMessage.replaceSubrange(signatureOffset..<(signatureOffset + 64), with: signature.prefix(64))
        
        return signedMessage
    }
}

/// Message type enumeration (mirrors core/protocol/message.ts)
enum MessageType: Int {
    case text = 0x01
    case fileMetadata = 0x02
    case fileChunk = 0x03
    case voice = 0x04
    case controlAck = 0x10
    case controlPing = 0x11
    case controlPong = 0x12
    case peerDiscovery = 0x20
    case peerIntroduction = 0x21
    case keyExchange = 0x30
    case sessionKey = 0x31
}
