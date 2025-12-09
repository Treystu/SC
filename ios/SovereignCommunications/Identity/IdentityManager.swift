//
//  IdentityManager.swift
//  SovereignCommunications
//
//  Created by SC Platform Team on 2025-12-09.
//  Purpose: Unified Identity Manager for iOS
//

import Foundation
import Security
import os.log

/**
 * Unified Identity Manager for iOS
 * 
 * Stores Ed25519 keypair securely using iOS Keychain
 * Compatible with Web (IndexedDB) and Android (Keystore) implementations
 * 
 * Storage Strategy:
 * - Private key: Keychain (most secure, accessible even if device is locked)
 * - Public key: UserDefaults (for quick access)
 * - Display name: UserDefaults
 * - Fingerprint: SHA-256 of public key, stored in UserDefaults
 */
class IdentityManager {
    
    static let shared = IdentityManager()
    
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "IdentityManager")
    private let userDefaults = UserDefaults.standard
    
    // Keychain keys
    private static let keychainService = "com.sovereign.communications"
    private static let privateKeyAccount = "identity_private_key"
    private static let publicKeyAccount = "identity_public_key"
    
    // UserDefaults keys
    private static let keyPublicKey = "identity_public_key"
    private static let keyDisplayName = "identity_display_name"
    private static let keyFingerprint = "identity_fingerprint"
    private static let keyCreatedAt = "identity_created_at"
    private static let keyIsPrimary = "identity_is_primary"
    
    /**
     * Identity structure matching core interface
     */
    struct Identity {
        let publicKey: Data
        let privateKey: Data
        let fingerprint: String
        let displayName: String?
        let createdAt: Date
        let isPrimary: Bool
        
        init(publicKey: Data,
             privateKey: Data,
             fingerprint: String,
             displayName: String? = nil,
             createdAt: Date = Date(),
             isPrimary: Bool = true) {
            self.publicKey = publicKey
            self.privateKey = privateKey
            self.fingerprint = fingerprint
            self.displayName = displayName
            self.createdAt = createdAt
            self.isPrimary = isPrimary
        }
    }
    
    private init() {}
    
    /**
     * Check if an identity exists
     */
    func hasIdentity() -> Bool {
        return userDefaults.string(forKey: Self.keyPublicKey) != nil &&
               getPrivateKeyFromKeychain() != nil
    }
    
    /**
     * Get the primary identity (loads from secure storage)
     */
    func getIdentity() -> Identity? {
        guard let publicKeyBase64 = userDefaults.string(forKey: Self.keyPublicKey),
              let publicKey = Data(base64Encoded: publicKeyBase64),
              let privateKey = getPrivateKeyFromKeychain(),
              let fingerprint = userDefaults.string(forKey: Self.keyFingerprint) else {
            return nil
        }
        
        let displayName = userDefaults.string(forKey: Self.keyDisplayName)
        let createdAtTimestamp = userDefaults.double(forKey: Self.keyCreatedAt)
        let createdAt = createdAtTimestamp > 0 ? Date(timeIntervalSince1970: createdAtTimestamp) : Date()
        let isPrimary = userDefaults.bool(forKey: Self.keyIsPrimary)
        
        return Identity(
            publicKey: publicKey,
            privateKey: privateKey,
            fingerprint: fingerprint,
            displayName: displayName,
            createdAt: createdAt,
            isPrimary: isPrimary
        )
    }
    
    /**
     * Save an identity securely
     */
    func saveIdentity(_ identity: Identity) throws {
        // Save private key to Keychain
        try savePrivateKeyToKeychain(identity.privateKey)
        
        // Save public data to UserDefaults
        userDefaults.set(identity.publicKey.base64EncodedString(), forKey: Self.keyPublicKey)
        userDefaults.set(identity.fingerprint, forKey: Self.keyFingerprint)
        userDefaults.set(identity.displayName, forKey: Self.keyDisplayName)
        userDefaults.set(identity.createdAt.timeIntervalSince1970, forKey: Self.keyCreatedAt)
        userDefaults.set(identity.isPrimary, forKey: Self.keyIsPrimary)
        
        logger.info("Identity saved successfully")
    }
    
    /**
     * Update display name only
     */
    func updateDisplayName(_ displayName: String) {
        userDefaults.set(displayName, forKey: Self.keyDisplayName)
    }
    
    /**
     * Get public key ID (Base64 for consistency across platforms)
     */
    func getPublicKeyId() -> String? {
        return userDefaults.string(forKey: Self.keyPublicKey)
    }
    
    /**
     * Get fingerprint
     */
    func getFingerprint() -> String? {
        return userDefaults.string(forKey: Self.keyFingerprint)
    }
    
    /**
     * Delete identity (for testing or reset)
     */
    func deleteIdentity() {
        // Remove from UserDefaults
        userDefaults.removeObject(forKey: Self.keyPublicKey)
        userDefaults.removeObject(forKey: Self.keyDisplayName)
        userDefaults.removeObject(forKey: Self.keyFingerprint)
        userDefaults.removeObject(forKey: Self.keyCreatedAt)
        userDefaults.removeObject(forKey: Self.keyIsPrimary)
        
        // Remove from Keychain
        deletePrivateKeyFromKeychain()
        
        logger.info("Identity deleted")
    }
    
    // MARK: - Keychain Operations
    
    /**
     * Save private key to iOS Keychain
     */
    private func savePrivateKeyToKeychain(_ privateKey: Data) throws {
        // Delete existing key if present
        deletePrivateKeyFromKeychain()
        
        // Create query
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.privateKeyAccount,
            kSecValueData as String: privateKey,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        guard status == errSecSuccess else {
            logger.error("Failed to save private key to Keychain: \(status)")
            throw KeychainError.saveFailed(status: status)
        }
    }
    
    /**
     * Get private key from iOS Keychain
     */
    private func getPrivateKeyFromKeychain() -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.privateKeyAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess, let data = result as? Data else {
            if status != errSecItemNotFound {
                logger.error("Failed to retrieve private key from Keychain: \(status)")
            }
            return nil
        }
        
        return data
    }
    
    /**
     * Delete private key from iOS Keychain
     */
    private func deletePrivateKeyFromKeychain() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.keychainService,
            kSecAttrAccount as String: Self.privateKeyAccount
        ]
        
        SecItemDelete(query as CFDictionary)
    }
    
    // MARK: - Error Types
    
    enum KeychainError: Error {
        case saveFailed(status: OSStatus)
        case loadFailed(status: OSStatus)
        case deleteFailed(status: OSStatus)
        
        var localizedDescription: String {
            switch self {
            case .saveFailed(let status):
                return "Failed to save to Keychain: \(status)"
            case .loadFailed(let status):
                return "Failed to load from Keychain: \(status)"
            case .deleteFailed(let status):
                return "Failed to delete from Keychain: \(status)"
            }
        }
    }
}
