//
//  KeychainManager.swift
//  Sovereign Communications
//
//  Secure storage for cryptographic keys and sensitive data
//  Hardware-backed using Secure Enclave when available
//

import Foundation
import Security
import LocalAuthentication
import os.log

/// Manages secure storage of keys and credentials in the iOS Keychain
/// Supports hardware-backed key storage using Secure Enclave
class KeychainManager {
    static let shared = KeychainManager()
    
    private let service = "com.sovereign.communications"
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "KeychainManager")
    
    /// Check if Secure Enclave is available on this device
    var isSecureEnclaveAvailable: Bool {
        if #available(iOS 13.0, *) {
            var error: Unmanaged<CFError>?
            let accessControl = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                .privateKeyUsage,
                &error
            )
            return accessControl != nil && error == nil
        }
        return false
    }
    
    /// Track if encryption has been initialized
    private(set) var isEncryptionInitialized = false
    
    private init() {}
    
    // MARK: - Storage Operations
    
    /// Store data securely in the Keychain
    /// - Parameters:
    ///   - data: The data to store
    ///   - key: The key identifier
    ///   - accessible: When the data should be accessible (default: when unlocked)
    func store(_ data: Data, forKey key: String, accessible: CFString = kSecAttrAccessibleWhenUnlockedThisDeviceOnly) throws {
        // Delete existing item first
        try? delete(key: key)
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessible
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    /// Retrieve data from the Keychain
    /// - Parameter key: The key identifier
    /// - Returns: The stored data, or nil if not found
    func retrieve(key: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecItemNotFound {
            return nil
        }
        
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
        
        return result as? Data
    }
    
    /// Delete data from the Keychain
    /// - Parameter key: The key identifier
    func delete(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    /// Delete all items for this service
    func deleteAll() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    // MARK: - Convenience Methods for Keys
    
    /// Store a cryptographic key
    func storeKey(_ key: Data, identifier: String, backupEnabled: Bool = false) throws {
        let accessible: CFString = backupEnabled 
            ? kSecAttrAccessibleWhenUnlocked 
            : kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        
        try store(key, forKey: "key_\(identifier)", accessible: accessible)
    }
    
    /// Retrieve a cryptographic key
    func retrieveKey(identifier: String) throws -> Data? {
        return try retrieve(key: "key_\(identifier)")
    }
    
    /// Delete a cryptographic key
    func deleteKey(identifier: String) throws {
        try delete(key: "key_\(identifier)")
    }
    
    /// Store identity keypair (private key)
    func storeIdentityPrivateKey(_ privateKey: Data, backupEnabled: Bool = false) throws {
        try storeKey(privateKey, identifier: "identity_private", backupEnabled: backupEnabled)
    }
    
    /// Retrieve identity private key
    func retrieveIdentityPrivateKey() throws -> Data? {
        return try retrieveKey(identifier: "identity_private")
    }
    
    /// Store identity public key
    func storeIdentityPublicKey(_ publicKey: Data) throws {
        try storeKey(publicKey, identifier: "identity_public")
    }
    
    /// Retrieve identity public key
    func retrieveIdentityPublicKey() throws -> Data? {
        return try retrieveKey(identifier: "identity_public")
    }
    
    /// Delete identity keys
    func deleteIdentityKeys() throws {
        try deleteKey(identifier: "identity_private")
        try deleteKey(identifier: "identity_public")
    }
    
    // MARK: - Backup & Restore
    
    /// Check if an item exists in the Keychain
    func exists(key: String) -> Bool {
        return (try? retrieve(key: key)) != nil
    }
    
    /// Get all account identifiers for this service
    func getAllKeys() throws -> [String] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecItemNotFound {
            return []
        }
        
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
        
        guard let items = result as? [[String: Any]] else {
            return []
        }
        
        return items.compactMap { $0[kSecAttrAccount as String] as? String }
    }
    
    // MARK: - Hardware-Backed Key Operations (Secure Enclave)
    
    /// Initialize encryption by ensuring database encryption key exists
    /// This should be called at app startup
    func initializeEncryption() throws {
        logger.info("Initializing encryption...")
        
        // Check if database encryption key exists
        if try retrieveKey(identifier: "database_encryption") == nil {
            // Generate and store a new database encryption key
            try generateAndStoreDatabaseKey()
        }
        
        isEncryptionInitialized = true
        logger.info("Encryption initialized successfully")
    }
    
    /// Generate and store database encryption key using hardware backing if available
    private func generateAndStoreDatabaseKey() throws {
        // Generate a random 256-bit key
        var keyData = Data(count: 32)
        let result = keyData.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, 32, bytes.baseAddress!)
        }
        
        guard result == errSecSuccess else {
            logger.error("Failed to generate random bytes for database key")
            throw KeychainError.keyGenerationFailed
        }
        
        // Store with hardware-backed protection if available
        try storeKeyWithHardwareBacking(keyData, identifier: "database_encryption")
        logger.info("Database encryption key generated and stored")
    }
    
    /// Store a key with hardware backing (Secure Enclave protection) when available
    /// - Parameters:
    ///   - key: The key data to store
    ///   - identifier: Unique identifier for the key
    ///   - requireBiometric: Whether to require biometric authentication for access
    func storeKeyWithHardwareBacking(_ key: Data, identifier: String, requireBiometric: Bool = false) throws {
        let fullKey = "key_\(identifier)"
        
        // Delete existing key first
        try? delete(key: fullKey)
        
        // Create access control flags
        var accessControlFlags: SecAccessControlCreateFlags = []
        
        if isSecureEnclaveAvailable {
            accessControlFlags.insert(.privateKeyUsage)
        }
        
        if requireBiometric {
            // Require biometric (Face ID/Touch ID) or device passcode
            accessControlFlags.insert(.biometryAny)
        }
        
        var error: Unmanaged<CFError>?
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: fullKey,
            kSecValueData as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        // Add access control if we have flags
        if !accessControlFlags.isEmpty {
            if let accessControl = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                accessControlFlags,
                &error
            ) {
                query[kSecAttrAccessControl as String] = accessControl
                query.removeValue(forKey: kSecAttrAccessible as String)
                logger.debug("Using hardware-backed access control")
            } else {
                logger.warning("Failed to create access control, using standard keychain")
            }
        }
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        guard status == errSecSuccess else {
            logger.error("Failed to store key with hardware backing: \(status)")
            throw KeychainError.unhandledError(status: status)
        }
        
        logger.info("Key stored with hardware backing: \(identifier)")
    }
    
    /// Retrieve a key that may require biometric authentication
    /// - Parameters:
    ///   - identifier: The key identifier
    ///   - context: Optional LAContext for biometric authentication
    /// - Returns: The key data if found
    func retrieveKeyWithBiometric(identifier: String, context: LAContext? = nil) throws -> Data? {
        let fullKey = "key_\(identifier)"
        
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: fullKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        // Use provided LAContext for biometric authentication
        if let context = context {
            query[kSecUseAuthenticationContext as String] = context
        }
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecItemNotFound {
            return nil
        }
        
        if status == errSecUserCanceled || status == errSecAuthFailed {
            throw KeychainError.biometricAuthenticationFailed
        }
        
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
        
        return result as? Data
    }
    
    /// Get or create the database encryption key
    /// This is used by CoreData/SQLite for encrypted storage
    func getDatabaseEncryptionKey() throws -> Data {
        guard isEncryptionInitialized else {
            throw KeychainError.encryptionNotInitialized
        }
        
        guard let key = try retrieveKey(identifier: "database_encryption") else {
            // This shouldn't happen if initializeEncryption was called
            throw KeychainError.keyGenerationFailed
        }
        
        return key
    }
    
    /// Generate a Secure Enclave-backed key pair for signing
    /// The private key never leaves the Secure Enclave
    /// - Parameter tag: Unique tag for the key pair
    /// - Returns: The public key data (private key remains in Secure Enclave)
    @available(iOS 13.0, *)
    func generateSecureEnclaveKeyPair(tag: String) throws -> Data {
        guard isSecureEnclaveAvailable else {
            throw KeychainError.secureEnclaveNotAvailable
        }
        
        let fullTag = "\(service).\(tag)"
        
        // Delete any existing key with this tag
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: fullTag.data(using: .utf8)!
        ]
        SecItemDelete(deleteQuery as CFDictionary)
        
        // Create access control for Secure Enclave
        var error: Unmanaged<CFError>?
        guard let accessControl = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage],
            &error
        ) else {
            logger.error("Failed to create access control for Secure Enclave")
            throw KeychainError.secureEnclaveNotAvailable
        }
        
        // Generate key pair in Secure Enclave
        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: fullTag.data(using: .utf8)!,
                kSecAttrAccessControl as String: accessControl
            ] as [String: Any]
        ]
        
        var generateError: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &generateError) else {
            let errorDescription = generateError?.takeRetainedValue().localizedDescription ?? "Unknown error"
            logger.error("Failed to generate Secure Enclave key: \(errorDescription)")
            throw KeychainError.keyGenerationFailed
        }
        
        // Get public key
        guard let publicKey = SecKeyCopyPublicKey(privateKey) else {
            throw KeychainError.keyGenerationFailed
        }
        
        // Export public key data
        guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, &generateError) as Data? else {
            throw KeychainError.keyGenerationFailed
        }
        
        logger.info("Generated Secure Enclave key pair with tag: \(tag)")
        return publicKeyData
    }
    
    /// Sign data using a Secure Enclave-backed private key
    /// - Parameters:
    ///   - data: Data to sign
    ///   - tag: Tag of the key pair to use
    /// - Returns: Signature data
    @available(iOS 13.0, *)
    func signWithSecureEnclave(data: Data, tag: String) throws -> Data {
        let fullTag = "\(service).\(tag)"
        
        // Query for the private key
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: fullTag.data(using: .utf8)!,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true
        ]
        
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        
        guard status == errSecSuccess, let privateKey = item else {
            throw KeychainError.unhandledError(status: status)
        }
        
        // Sign the data
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            privateKey as! SecKey,
            .ecdsaSignatureMessageX962SHA256,
            data as CFData,
            &error
        ) as Data? else {
            let errorDescription = error?.takeRetainedValue().localizedDescription ?? "Unknown error"
            logger.error("Failed to sign data: \(errorDescription)")
            throw KeychainError.unhandledError(status: errSecInternalError)
        }
        
        return signature
    }
}

// MARK: - Errors

enum KeychainError: Error {
    case unhandledError(status: OSStatus)
    case unexpectedDataFormat
    case secureEnclaveNotAvailable
    case biometricAuthenticationFailed
    case keyGenerationFailed
    case encryptionNotInitialized
    
    var localizedDescription: String {
        switch self {
        case .unhandledError(let status):
            if let errorMessage = SecCopyErrorMessageString(status, nil) {
                return "Keychain error: \(errorMessage)"
            }
            return "Keychain error: \(status)"
        case .unexpectedDataFormat:
            return "Unexpected data format in Keychain"
        case .secureEnclaveNotAvailable:
            return "Secure Enclave is not available on this device"
        case .biometricAuthenticationFailed:
            return "Biometric authentication failed"
        case .keyGenerationFailed:
            return "Failed to generate encryption key"
        case .encryptionNotInitialized:
            return "Encryption has not been initialized"
        }
    }
}
