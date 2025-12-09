//
//  CoreBridge.swift
//  SovereignCommunications
//
//  Bridge between iOS and the core TypeScript/JavaScript library
//

import Foundation
import JavaScriptCore
import os.log
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
        let secureRandomBytes: @convention(block) (Int) -> [UInt8] = { count in
            var bytes = [UInt8](repeating: 0, count: count)
            _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
            return bytes
        }
        jsContext.setObject(secureRandomBytes, forKeyedSubscript: "_nativeSecureRandomBytes" as NSString)
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
    
    // MARK: - Identity Management
    
    /// Generate a new identity keypair
    func generateIdentity() async throws -> CoreIdentity {
        try await ensureInitialized()
        
        let script = """
            (function() {
                var identity = SCCore.generateIdentity();
                return JSON.stringify({
                    publicKey: Array.from(identity.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
                    privateKey: Array.from(identity.privateKey).map(b => b.toString(16).padStart(2, '0')).join('')
                });
            })()
        """
        
        guard let result = jsContext.evaluateScript(script)?.toString(),
              let data = result.data(using: .utf8),
              let identity = try? JSONDecoder().decode(CoreIdentity.self, from: data) else {
            throw CoreBridgeError.evaluationFailed("Failed to generate identity")
        }
        
        self.localIdentity = identity
        return identity
    }
    
    /// Generate fingerprint for a public key
    func generateFingerprint(publicKeyHex: String) async throws -> String {
        try await ensureInitialized()
        
        let script = """
            (function() {
                var publicKeyBytes = new Uint8Array('\(publicKeyHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                return SCCore.generateFingerprint(publicKeyBytes);
            })()
        """
        
        guard let result = jsContext.evaluateScript(script)?.toString() else {
            throw CoreBridgeError.evaluationFailed("Failed to generate fingerprint")
        }
        
        return result
    }
    
    // MARK: - Cryptographic Operations
    
    /// Sign a message with the private key
    func signMessage(message: Data, privateKeyHex: String) async throws -> Data {
        try await ensureInitialized()
        
        let messageHex = message.map { String(format: "%02x", $0) }.joined()
        
        let script = """
            (function() {
                var messageBytes = new Uint8Array('\(messageHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var privateKeyBytes = new Uint8Array('\(privateKeyHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var signature = SCCore.signMessage(messageBytes, privateKeyBytes);
                return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
            })()
        """
        
        guard let signatureHex = jsContext.evaluateScript(script)?.toString() else {
            throw CoreBridgeError.evaluationFailed("Failed to sign message")
        }
        
        return hexToData(signatureHex)
    }
    
    /// Verify a signature
    func verifySignature(message: Data, signature: Data, publicKeyHex: String) async throws -> Bool {
        try await ensureInitialized()
        
        let messageHex = message.map { String(format: "%02x", $0) }.joined()
        let signatureHex = signature.map { String(format: "%02x", $0) }.joined()
        
        let script = """
            (function() {
                var messageBytes = new Uint8Array('\(messageHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var signatureBytes = new Uint8Array('\(signatureHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var publicKeyBytes = new Uint8Array('\(publicKeyHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                return SCCore.verifySignature(messageBytes, signatureBytes, publicKeyBytes);
            })()
        """
        
        guard let result = jsContext.evaluateScript(script)?.toBool() else {
            throw CoreBridgeError.evaluationFailed("Failed to verify signature")
        }
        
        return result
    }
    
    /// Encrypt a message
    func encryptMessage(plaintext: Data, key: Data, nonce: Data) async throws -> Data {
        try await ensureInitialized()
        
        let plaintextHex = plaintext.map { String(format: "%02x", $0) }.joined()
        let keyHex = key.map { String(format: "%02x", $0) }.joined()
        let nonceHex = nonce.map { String(format: "%02x", $0) }.joined()
        
        let script = """
            (function() {
                var plaintextBytes = new Uint8Array('\(plaintextHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var keyBytes = new Uint8Array('\(keyHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var nonceBytes = new Uint8Array('\(nonceHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var ciphertext = SCCore.encryptMessage(plaintextBytes, keyBytes, nonceBytes);
                return Array.from(ciphertext).map(b => b.toString(16).padStart(2, '0')).join('');
            })()
        """
        
        guard let ciphertextHex = jsContext.evaluateScript(script)?.toString() else {
            throw CoreBridgeError.evaluationFailed("Failed to encrypt message")
        }
        
        return hexToData(ciphertextHex)
    }
    
    /// Decrypt a message
    func decryptMessage(ciphertext: Data, key: Data, nonce: Data) async throws -> Data {
        try await ensureInitialized()
        
        let ciphertextHex = ciphertext.map { String(format: "%02x", $0) }.joined()
        let keyHex = key.map { String(format: "%02x", $0) }.joined()
        let nonceHex = nonce.map { String(format: "%02x", $0) }.joined()
        
        let script = """
            (function() {
                var ciphertextBytes = new Uint8Array('\(ciphertextHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var keyBytes = new Uint8Array('\(keyHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var nonceBytes = new Uint8Array('\(nonceHex)'.match(/.{2}/g).map(b => parseInt(b, 16)));
                var plaintext = SCCore.decryptMessage(ciphertextBytes, keyBytes, nonceBytes);
                return Array.from(plaintext).map(b => b.toString(16).padStart(2, '0')).join('');
            })()
        """
        
        guard let plaintextHex = jsContext.evaluateScript(script)?.toString() else {
            throw CoreBridgeError.evaluationFailed("Failed to decrypt message")
        }
        
        return hexToData(plaintextHex)
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
        
        let script = """
            (function() {
                var sessionKey = SCCore.generateSessionKey();
                return JSON.stringify({
                    key: Array.from(sessionKey.key).map(b => b.toString(16).padStart(2, '0')).join(''),
                    nonce: Array.from(sessionKey.nonce).map(b => b.toString(16).padStart(2, '0')).join(''),
                    timestamp: sessionKey.timestamp
                });
            })()
        """
        
        guard let result = jsContext.evaluateScript(script)?.toString(),
              let data = result.data(using: .utf8),
              let sessionKey = try? JSONDecoder().decode(SessionKeyResult.self, from: data) else {
            throw CoreBridgeError.evaluationFailed("Failed to generate session key")
        }
        
        return sessionKey
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
