//
//  KeychainManager.swift
//  Sovereign Communications
//
//  Secure storage for cryptographic keys and sensitive data
//

import Foundation
import Security

/// Manages secure storage of keys and credentials in the iOS Keychain
class KeychainManager {
    static let shared = KeychainManager()
    
    private let service = "com.sovereign.communications"
    
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
}

// MARK: - Errors

enum KeychainError: Error {
    case unhandledError(status: OSStatus)
    case unexpectedDataFormat
    
    var localizedDescription: String {
        switch self {
        case .unhandledError(let status):
            if let errorMessage = SecCopyErrorMessageString(status, nil) {
                return "Keychain error: \(errorMessage)"
            }
            return "Keychain error: \(status)"
        case .unexpectedDataFormat:
            return "Unexpected data format in Keychain"
        }
    }
}
