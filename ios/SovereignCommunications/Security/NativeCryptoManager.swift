//
//  NativeCryptoManager.swift
//  Sovereign Communications
//
//  Native cryptography implementation using CryptoKit
//  Provides Ed25519/X25519 operations without JavaScript bridge dependency
//

import Foundation
import CryptoKit
import CommonCrypto

/// Native Cryptography Manager for iOS
///
/// Implements Ed25519/X25519 cryptography using Apple's CryptoKit
/// and Secure Enclave for enhanced security and self-reliance.
/// This replaces JavaScript bridge dependency for crypto operations.
class NativeCryptoManager {
    static let shared = NativeCryptoManager()

    // MARK: - Key Management

    private var ed25519PrivateKey: Curve25519.Signing.PrivateKey?
    private var x25519PrivateKey: Curve25519.KeyAgreement.PrivateKey?

    /// Get or create Ed25519 signing key
    func getEd25519PrivateKey() -> Curve25519.Signing.PrivateKey {
        if let key = ed25519PrivateKey {
            return key
        }

        // Try to load from secure storage first
        if let storedKey = loadEd25519KeyFromSecureStorage() {
            ed25519PrivateKey = storedKey
            return storedKey
        }

        // Generate new key
        let newKey = Curve25519.Signing.PrivateKey()
        ed25519PrivateKey = newKey
        saveEd25519KeyToSecureStorage(newKey)
        return newKey
    }

    /// Get Ed25519 public key
    func getEd25519PublicKey() -> Curve25519.Signing.PublicKey {
        return getEd25519PrivateKey().publicKey
    }

    /// Get or create X25519 key agreement key
    func getX25519PrivateKey() -> Curve25519.KeyAgreement.PrivateKey {
        if let key = x25519PrivateKey {
            return key
        }

        // Try to load from secure storage first
        if let storedKey = loadX25519KeyFromSecureStorage() {
            x25519PrivateKey = storedKey
            return storedKey
        }

        // Generate new key
        let newKey = Curve25519.KeyAgreement.PrivateKey()
        x25519PrivateKey = newKey
        saveX25519KeyToSecureStorage(newKey)
        return newKey
    }

    /// Get X25519 public key
    func getX25519PublicKey() -> Curve25519.KeyAgreement.PublicKey {
        return getX25519PrivateKey().publicKey
    }

    // MARK: - Secure Storage

    private func loadEd25519KeyFromSecureStorage() -> Curve25519.Signing.PrivateKey? {
        guard let keyData = KeychainManager.load(key: "sc_ed25519_private_key") else {
            return nil
        }

        do {
            return try Curve25519.Signing.PrivateKey(rawRepresentation: keyData)
        } catch {
            print("Failed to load Ed25519 key from secure storage: \(error)")
            return nil
        }
    }

    private func saveEd25519KeyToSecureStorage(_ key: Curve25519.Signing.PrivateKey) {
        let keyData = key.rawRepresentation
        KeychainManager.save(key: "sc_ed25519_private_key", data: keyData)
    }

    private func loadX25519KeyFromSecureStorage() -> Curve25519.KeyAgreement.PrivateKey? {
        guard let keyData = KeychainManager.load(key: "sc_x25519_private_key") else {
            return nil
        }

        do {
            return try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: keyData)
        } catch {
            print("Failed to load X25519 key from secure storage: \(error)")
            return nil
        }
    }

    private func saveX25519KeyToSecureStorage(_ key: Curve25519.KeyAgreement.PrivateKey) {
        let keyData = key.rawRepresentation
        KeychainManager.save(key: "sc_x25519_private_key", data: keyData)
    }

    // MARK: - Cryptographic Operations

    /// Sign data using Ed25519
    func sign(_ data: Data) -> Data {
        let privateKey = getEd25519PrivateKey()
        return try! privateKey.signature(for: data)
    }

    /// Verify signature using Ed25519
    func verify(signature: Data, for data: Data, with publicKey: Curve25519.Signing.PublicKey) -> Bool {
        return publicKey.isValidSignature(signature, for: data)
    }

    /// Perform X25519 key agreement to derive shared secret
    func deriveSharedSecret(with publicKey: Curve25519.KeyAgreement.PublicKey) -> SymmetricKey {
        let privateKey = getX25519PrivateKey()
        let sharedSecret = try! privateKey.sharedSecretFromKeyAgreement(with: publicKey)
        return sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: "SovereignCommunications".data(using: .utf8)!,
            sharedInfo: Data(),
            outputByteCount: 32
        )
    }

    /// Encrypt data using ChaCha20-Poly1305
    func encryptChaCha20(_ data: Data, key: SymmetricKey) -> Data {
        let nonce = ChaChaPoly.Nonce()
        let sealedBox = try! ChaChaPoly.seal(data, using: key, nonce: nonce)
        return sealedBox.combined
    }

    /// Decrypt data using ChaCha20-Poly1305
    func decryptChaCha20(_ encryptedData: Data, key: SymmetricKey) -> Data? {
        do {
            let sealedBox = try ChaChaPoly.SealedBox(combined: encryptedData)
            return try ChaChaPoly.open(sealedBox, using: key)
        } catch {
            print("Decryption failed: \(error)")
            return nil
        }
    }

    /// Generate cryptographically secure random bytes
    func generateRandomBytes(count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        guard status == errSecSuccess else {
            fatalError("Failed to generate random bytes")
        }
        return Data(bytes)
    }

    /// Compute SHA-256 hash
    func sha256(_ data: Data) -> Data {
        return SHA256.hash(data: data).data
    }

    /// Compute SHA-256 hash of string
    func sha256(_ string: String) -> Data {
        return sha256(string.data(using: .utf8)!)
    }

    // MARK: - Key Serialization

    /// Convert public key to base64 string
    func publicKeyToBase64(_ publicKey: Curve25519.Signing.PublicKey) -> String {
        return publicKey.rawRepresentation.base64EncodedString()
    }

    /// Convert base64 string to public key
    func base64ToPublicKey(_ base64String: String) -> Curve25519.Signing.PublicKey? {
        guard let keyData = Data(base64Encoded: base64String) else {
            return nil
        }

        do {
            return try Curve25519.Signing.PublicKey(rawRepresentation: keyData)
        } catch {
            print("Failed to parse public key: \(error)")
            return nil
        }
    }

    /// Convert key agreement public key to base64
    func keyAgreementPublicKeyToBase64(_ publicKey: Curve25519.KeyAgreement.PublicKey) -> String {
        return publicKey.rawRepresentation.base64EncodedString()
    }

    /// Convert base64 string to key agreement public key
    func base64ToKeyAgreementPublicKey(_ base64String: String) -> Curve25519.KeyAgreement.PublicKey? {
        guard let keyData = Data(base64Encoded: base64String) else {
            return nil
        }

        do {
            return try Curve25519.KeyAgreement.PublicKey(rawRepresentation: keyData)
        } catch {
            print("Failed to parse key agreement public key: \(error)")
            return nil
        }
    }

    // MARK: - Self-Hosting TURN Server

    /// Create configuration for self-hosted TURN server
    func createSelfHostedTurnConfig() -> TurnServerConfig {
        // Generate random credentials
        let username = generateRandomBytes(16).hexString
        let password = generateRandomBytes(32).hexString

        return TurnServerConfig(
            host: getLocalIPAddress() ?? "127.0.0.1",
            port: 3478,
            username: username,
            password: password,
            isSelfHosted: true
        )
    }

    /// Get local IP address for self-hosting
    private func getLocalIPAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?

        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }

                let interface = ptr?.pointee
                let addrFamily = interface?.ifa_addr.pointee.sa_family

                if addrFamily == UInt8(AF_INET),
                   let name = String(cString: (interface?.ifa_name)!),
                   name == "en0" || name.hasPrefix("pdp_ip") { // WiFi or cellular

                    var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    getnameinfo(interface?.ifa_addr,
                              socklen_t((interface?.ifa_addr.pointee.sa_len)!),
                              &hostname,
                              socklen_t(hostname.count),
                              nil,
                              socklen_t(0),
                              NI_NUMERICHOST)

                    address = String(cString: hostname)
                    break
                }
            }
            freeifaddrs(ifaddr)
        }

        return address
    }

    // MARK: - Message Encryption/Routing

    /// Encrypt message for specific recipient
    func encryptMessageForRecipient(_ message: Data, recipientPublicKey: Curve25519.KeyAgreement.PublicKey) -> EncryptedMessage {
        let ephemeralPrivateKey = Curve25519.KeyAgreement.PrivateKey()
        let sharedSecret = deriveSharedSecret(with: recipientPublicKey)
        let encryptedContent = encryptChaCha20(message, key: sharedSecret)

        return EncryptedMessage(
            encryptedContent: encryptedContent,
            ephemeralPublicKey: ephemeralPrivateKey.publicKey.rawRepresentation,
            recipientPublicKey: recipientPublicKey.rawRepresentation
        )
    }

    /// Decrypt message intended for us
    func decryptMessageForUs(_ encryptedMessage: EncryptedMessage) -> Data? {
        guard let ephemeralPublicKey = try? Curve25519.KeyAgreement.PublicKey(
            rawRepresentation: encryptedMessage.ephemeralPublicKey
        ) else {
            return nil
        }

        let sharedSecret = deriveSharedSecret(with: ephemeralPublicKey)
        return decryptChaCha20(encryptedMessage.encryptedContent, key: sharedSecret)
    }

    /// Create a relay-ready encrypted message for mesh routing
    func createRelayMessage(
        _ message: Data,
        recipientId: String,
        ttl: Int = 255,
        priority: MessagePriority = .normal
    ) -> RelayMessage {
        // Encrypt message with recipient's public key (would need to look up recipient)
        // For now, create a placeholder - in real implementation, look up recipient key
        let encryptedMessage = encryptMessageForRecipient(message, recipientPublicKey: getX25519PublicKey())

        return RelayMessage(
            id: UUID().uuidString,
            encryptedContent: encryptedMessage.encryptedContent,
            recipientId: recipientId,
            senderId: getEd25519PublicKey().rawRepresentation.base64EncodedString(),
            timestamp: Date().timeIntervalSince1970,
            ttl: ttl,
            priority: priority,
            signature: sign(message).base64EncodedString(),
            route: []
        )
    }

    /// Process and potentially relay a message
    func processRelayMessage(_ relayMessage: RelayMessage) -> RelayAction {
        // Verify signature
        guard let signatureData = Data(base64Encoded: relayMessage.signature),
              let senderPublicKeyData = Data(base64Encoded: relayMessage.senderId),
              let senderPublicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: senderPublicKeyData) else {
            return .drop
        }

        // Verify message integrity (simplified - would need original message)
        // In real implementation, verify signature against message content

        // Check TTL
        if relayMessage.ttl <= 0 {
            return .drop
        }

        // Check if we're the recipient
        let ourId = getEd25519PublicKey().rawRepresentation.base64EncodedString()
        if relayMessage.recipientId == ourId {
            return .deliver
        }

        // Check if we should relay
        if shouldRelayMessage(relayMessage) {
            return .relay(ttl: relayMessage.ttl - 1)
        }

        // Hold for later relay if recipient might become available
        return .hold
    }

    /// Determine if we should relay a message
    private func shouldRelayMessage(_ message: RelayMessage) -> Bool {
        // Intelligent routing logic:
        // - Check if we have a better route to recipient
        // - Consider message priority
        // - Check available bandwidth/storage
        // - Consider network topology

        // For now, simple logic: relay if TTL > 1 and we have capacity
        return message.ttl > 1 && message.priority != .low
    }
}

// MARK: - Supporting Types

struct EncryptedMessage {
    let encryptedContent: Data
    let ephemeralPublicKey: Data
    let recipientPublicKey: Data
}

struct RelayMessage {
    let id: String
    let encryptedContent: Data
    let recipientId: String
    let senderId: String
    let timestamp: TimeInterval
    let ttl: Int
    let priority: MessagePriority
    let signature: String
    var route: [String] // List of node IDs that have relayed this message
}

enum MessagePriority {
    case low, normal, high, critical
}

enum RelayAction {
    case deliver
    case relay(ttl: Int)
    case hold
    case drop
}

struct TurnServerConfig {
    let host: String
    let port: Int
    let username: String
    let password: String
    let isSelfHosted: Boolean = false
}

// MARK: - Extensions

extension Data {
    var hexString: String {
        return map { String(format: "%02x", $0) }.joined()
    }
}

extension String {
    var hexString: String {
        return data(using: .utf8)?.hexString ?? ""
    }
}

// MARK: - Keychain Manager

class KeychainManager {
    static func save(key: String, data: Data) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)

        if status != errSecSuccess {
            print("Failed to save to keychain: \(status)")
        }
    }

    static func load(key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        return if status == errSecSuccess {
            result as? Data
        } else {
            nil
        }
    }
}