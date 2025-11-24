//
//  CertificatePinningManager.swift
//  Sovereign Communications
//
//  Certificate pinning implementation for enhanced security
//  Prevents man-in-the-middle attacks by verifying server certificates
//

import Foundation
import Security

/// Manages SSL certificate pinning for network requests
/// 
/// Usage:
/// ```swift
/// let session = URLSession(
///     configuration: .default,
///     delegate: CertificatePinningManager.shared,
///     delegateQueue: nil
/// )
/// ```
class CertificatePinningManager: NSObject {
    static let shared = CertificatePinningManager()
    
    // MARK: - Configuration
    
    /// Dictionary of domain names to their pinned certificate hashes
    /// 
    /// To generate certificate pins:
    /// ```bash
    /// openssl s_client -servername api.example.com -connect api.example.com:443 | \
    ///   openssl x509 -pubkey -noout | \
    ///   openssl pkey -pubin -outform der | \
    ///   openssl dgst -sha256 -binary | \
    ///   openssl enc -base64
    /// ```
    ///
    /// IMPORTANT: Replace these placeholder pins with actual certificate pins before production
    private let pinnedCertificates: [String: Set<String>] = [
        // Example: API server (update with actual pins)
        // "api.sovereigncommunications.app": [
        //     "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // Primary cert
        //     "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="  // Backup cert
        // ],
        
        // Example: Update server (update with actual pins)
        // "updates.sovereigncommunications.app": [
        //     "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=", // Primary cert
        //     "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD="  // Backup cert
        // ]
    ]
    
    /// Whether to enforce certificate pinning
    /// Set to false for development/testing with self-signed certificates
    var isPinningEnabled: Bool = true
    
    private override init() {
        super.init()
    }
    
    // MARK: - Certificate Validation
    
    /// Validates the server certificate against pinned public keys
    /// - Parameters:
    ///   - challenge: The authentication challenge
    ///   - domain: The domain being accessed
    /// - Returns: true if certificate is valid and matches pin, false otherwise
    private func validateCertificate(for challenge: URLAuthenticationChallenge, domain: String) -> Bool {
        // Get pinned certificates for this domain
        guard let pinnedHashes = pinnedCertificates[domain], !pinnedHashes.isEmpty else {
            // No pins configured for this domain
            // In production, you might want to fail closed (return false)
            // For now, we'll allow connections to unpinned domains
            print("⚠️ No certificate pins configured for domain: \(domain)")
            return true
        }
        
        // Get the server trust from the challenge
        guard let serverTrust = challenge.protectionSpace.serverTrust else {
            print("❌ No server trust available")
            return false
        }
        
        // Validate the certificate chain
        var secresult = SecTrustResultType.invalid
        let status = SecTrustEvaluate(serverTrust, &secresult)
        
        guard status == errSecSuccess else {
            print("❌ Certificate evaluation failed with status: \(status)")
            return false
        }
        
        // Extract the server certificate
        guard let serverCertificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
            print("❌ Could not get server certificate")
            return false
        }
        
        // Get the public key from the certificate
        guard let serverPublicKey = SecCertificateCopyKey(serverCertificate) else {
            print("❌ Could not extract public key from certificate")
            return false
        }
        
        // Convert public key to data
        guard let serverPublicKeyData = SecKeyCopyExternalRepresentation(serverPublicKey, nil) as Data? else {
            print("❌ Could not get public key data")
            return false
        }
        
        // Calculate SHA-256 hash of the public key
        let hash = sha256(data: serverPublicKeyData)
        let hashBase64 = hash.base64EncodedString()
        
        // Check if the hash matches any of the pinned hashes
        let isValid = pinnedHashes.contains(hashBase64)
        
        if isValid {
            print("✅ Certificate pin validated for domain: \(domain)")
        } else {
            print("❌ Certificate pin validation failed for domain: \(domain)")
            print("   Expected one of: \(pinnedHashes)")
            print("   Got: \(hashBase64)")
        }
        
        return isValid
    }
    
    /// Calculate SHA-256 hash of data
    private func sha256(data: Data) -> Data {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
    }
}

// MARK: - URLSessionDelegate

extension CertificatePinningManager: URLSessionDelegate {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        // Only handle server trust authentication
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        
        // Check if pinning is enabled
        guard isPinningEnabled else {
            // Pinning disabled (for development)
            if let serverTrust = challenge.protectionSpace.serverTrust {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
            } else {
                completionHandler(.performDefaultHandling, nil)
            }
            return
        }
        
        let domain = challenge.protectionSpace.host
        
        // Validate the certificate
        if validateCertificate(for: challenge, domain: domain),
           let serverTrust = challenge.protectionSpace.serverTrust {
            // Certificate is valid, proceed with the connection
            let credential = URLCredential(trust: serverTrust)
            completionHandler(.useCredential, credential)
        } else {
            // Certificate validation failed, cancel the connection
            print("❌ Certificate pinning failed for \(domain). Connection cancelled.")
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}

// MARK: - Helper for SHA-256 (requires CommonCrypto)

import CommonCrypto

extension CertificatePinningManager {
    /// Calculate SHA-256 hash using CommonCrypto
    /// - Parameter data: Data to hash
    /// - Returns: SHA-256 hash as Data
    private func sha256CommonCrypto(data: Data) -> Data {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
    }
}

// MARK: - Usage Example

/*
 Usage in your app:
 
 // 1. Configure URLSession with pinning delegate
 let sessionConfig = URLSessionConfiguration.default
 let session = URLSession(
     configuration: sessionConfig,
     delegate: CertificatePinningManager.shared,
     delegateQueue: nil
 )
 
 // 2. Make requests as usual
 let url = URL(string: "https://api.sovereigncommunications.app/endpoint")!
 let task = session.dataTask(with: url) { data, response, error in
     // Handle response
 }
 task.resume()
 
 // 3. For development/testing, disable pinning:
 CertificatePinningManager.shared.isPinningEnabled = false
 
 // 4. Before production, add your certificate pins:
 // - Extract your production certificate
 // - Generate SHA-256 hash of the public key
 // - Add to pinnedCertificates dictionary
 // - Test thoroughly!
 */
