import Foundation
import CryptoKit

// MARK: - CryptoKit Helper for Passphrase Encryption
class CryptoKitHelper {
    
    // MARK: - Passphrase-based Encryption
    static func encryptWithPassphrase(_ data: Data, passphrase: String) throws -> (encryptedData: Data, salt: Data) {
        // Generate random salt
        let salt = generateRandomSalt()
        
        // Derive key from passphrase and salt
        let key = try deriveKey(from: passphrase, salt: salt)
        
        // Encrypt data using AES-GCM
        let sealedBox = try AES.GCM.seal(data, using: key)
        
        // Combine salt and encrypted data
        var result = Data()
        result.append(salt)
        result.append(sealedBox.ciphertext)
        result.append(sealedBox.tag)
        
        return (result, salt)
    }
    
    static func decryptWithPassphrase(_ encryptedData: Data, passphrase: String, salt: Data) throws -> Data {
        // Derive key from passphrase and salt
        let key = try deriveKey(from: passphrase, salt: salt)
        
        // Extract components
        let ciphertext = encryptedData.subdata(in: 16..<encryptedData.count - 16)
        let tag = encryptedData.subdata(in: encryptedData.count - 16..<encryptedData.count)
        
        // Create sealed box
        let sealedBox = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(), ciphertext: ciphertext, tag: tag)
        
        // Decrypt data
        let decryptedData = try AES.GCM.open(sealedBox, using: key)
        
        return decryptedData
    }
    
    // MARK: - Key Derivation
    private static func deriveKey(from passphrase: String, salt: Data) throws -> SymmetricKey {
        let passwordData = passphrase.data(using: .utf8)
        return try HKDF<SHA256>.deriveKey(
            bytes: 32, // 256-bit key for AES-256
            from: passwordData,
            salt: salt,
            info: "SovereignCommunications-Passphrase-Encryption".data(using: .utf8),
            output: SymmetricKey.self
        )
    }
    
    // MARK: - Random Salt Generation
    private static func generateRandomSalt() -> Data {
        var salt = Data(count: 16)
        let result = salt.withUnsafeMutableBytes { mutableBytes in
            SecRandomCopyBytes(kCCRandomDefault, mutableBytes.count, mutableBytes.baseAddress!)
        }
        return salt
    }
    
    // MARK: - Identity Export/Import Encryption
    static func encryptIdentityExport(_ identityData: Data, passphrase: String) throws -> Data {
        let (encryptedData, salt) = try encryptWithPassphrase(identityData, passphrase: passphrase)
        
        // Create export structure
        var exportData = Data()
        exportData.append(salt)
        exportData.append(encryptedData)
        
        return exportData
    }
    
    static func decryptIdentityExport(_ exportData: Data, passphrase: String) throws -> Data {
        guard exportData.count >= 16 else {
            throw CryptoKitHelperError.invalidExportFormat
        }
        
        let salt = exportData.subdata(in: 0..<16)
        let encryptedData = exportData.subdata(in: 16..<exportData.count)
        
        return try decryptWithPassphrase(encryptedData, passphrase: passphrase, salt: salt)
    }
}

// MARK: - Error Types
enum CryptoKitHelperError: Error, LocalizedError {
    case invalidExportFormat
    case encryptionFailed
    case decryptionFailed
    case keyDerivationFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidExportFormat:
            return "Invalid export format"
        case .encryptionFailed:
            return "Encryption failed"
        case .decryptionFailed:
            return "Decryption failed - invalid passphrase or corrupted data"
        case .keyDerivationFailed:
            return "Key derivation failed"
        }
    }
}
