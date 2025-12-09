//
//  SCError.swift
//  SovereignCommunications
//
//  Created by SC Platform Team on 2025-12-09.
//  Purpose: Unified error handling for iOS
//

import Foundation

/**
 * Unified error handling for iOS
 * Consistent with Web (TypeScript) and Android (Kotlin) implementations
 */
enum SCError: Error, LocalizedError {
    
    enum Category {
        case network, crypto, protocol, storage, peer, permission, validation, unknown
    }
    
    enum Code: Int {
        // Network (1000-1999)
        case peerUnreachable = 1001
        case connectionFailed = 1002
        case connectionTimeout = 1003
        case sendFailed = 1004
        
        // Crypto (2000-2999)
        case keyGenerationFailed = 2001
        case encryptionFailed = 2002
        case decryptionFailed = 2003
        case signatureFailed = 2004
        case signatureVerificationFailed = 2005
        
        // Protocol (3000-3999)
        case invalidMessageFormat = 3001
        case invalidHeader = 3002
        case messageTooLarge = 3003
        case invalidPayload = 3004
        
        // Storage (4000-4999)
        case databaseError = 4001
        case fileNotFound = 4002
        case fileWriteError = 4003
        case fileReadError = 4004
        case storageFull = 4005
        
        // Peer (5000-5999)
        case peerNotFound = 5001
        case peerBlocked = 5002
        case peerNotVerified = 5003
        case invalidPeerId = 5004
        
        // Permission (6000-6999)
        case bluetoothPermissionDenied = 6001
        case locationPermissionDenied = 6002
        case notificationPermissionDenied = 6003
        case cameraPermissionDenied = 6004
        case microphonePermissionDenied = 6005
        
        // Validation (7000-7999)
        case invalidInput = 7001
        case invalidQRCode = 7002
        case invalidFileType = 7003
        case fileTooLarge = 7004
        
        case unknown = 9999
    }
    
    // Network Errors
    case peerUnreachable(peerId: String, underlying: Error? = nil)
    case connectionFailed(message: String, underlying: Error? = nil)
    case connectionTimeout(message: String)
    case sendFailed(message: String, underlying: Error? = nil)
    
    // Crypto Errors
    case keyGenerationFailed(message: String, underlying: Error? = nil)
    case encryptionFailed(message: String, underlying: Error? = nil)
    case decryptionFailed(message: String, underlying: Error? = nil)
    case signatureFailed(message: String, underlying: Error? = nil)
    case signatureVerificationFailed(message: String, underlying: Error? = nil)
    
    // Protocol Errors
    case invalidMessageFormat(message: String)
    case invalidHeader(message: String)
    case messageTooLarge(size: Int, maxSize: Int)
    case invalidPayload(message: String)
    
    // Storage Errors
    case databaseError(message: String, underlying: Error? = nil)
    case fileNotFound(path: String)
    case fileWriteError(path: String, underlying: Error? = nil)
    case fileReadError(path: String, underlying: Error? = nil)
    case storageFull(message: String)
    
    // Peer Errors
    case peerNotFound(peerId: String)
    case peerBlocked(peerId: String)
    case peerNotVerified(peerId: String)
    case invalidPeerId(peerId: String)
    
    // Permission Errors
    case bluetoothPermissionDenied
    case locationPermissionDenied
    case notificationPermissionDenied
    case cameraPermissionDenied
    case microphonePermissionDenied
    
    // Validation Errors
    case invalidInput(field: String, reason: String)
    case invalidQRCode(message: String)
    case invalidFileType(fileType: String, allowedTypes: String)
    case fileTooLarge(size: Int64, maxSize: Int64)
    
    // Unknown
    case unknown(message: String, underlying: Error? = nil)
    
    var category: Category {
        switch self {
        case .peerUnreachable, .connectionFailed, .connectionTimeout, .sendFailed:
            return .network
        case .keyGenerationFailed, .encryptionFailed, .decryptionFailed,
             .signatureFailed, .signatureVerificationFailed:
            return .crypto
        case .invalidMessageFormat, .invalidHeader, .messageTooLarge, .invalidPayload:
            return .protocol
        case .databaseError, .fileNotFound, .fileWriteError, .fileReadError, .storageFull:
            return .storage
        case .peerNotFound, .peerBlocked, .peerNotVerified, .invalidPeerId:
            return .peer
        case .bluetoothPermissionDenied, .locationPermissionDenied,
             .notificationPermissionDenied, .cameraPermissionDenied, .microphonePermissionDenied:
            return .permission
        case .invalidInput, .invalidQRCode, .invalidFileType, .fileTooLarge:
            return .validation
        case .unknown:
            return .unknown
        }
    }
    
    var code: Code {
        switch self {
        case .peerUnreachable: return .peerUnreachable
        case .connectionFailed: return .connectionFailed
        case .connectionTimeout: return .connectionTimeout
        case .sendFailed: return .sendFailed
        case .keyGenerationFailed: return .keyGenerationFailed
        case .encryptionFailed: return .encryptionFailed
        case .decryptionFailed: return .decryptionFailed
        case .signatureFailed: return .signatureFailed
        case .signatureVerificationFailed: return .signatureVerificationFailed
        case .invalidMessageFormat: return .invalidMessageFormat
        case .invalidHeader: return .invalidHeader
        case .messageTooLarge: return .messageTooLarge
        case .invalidPayload: return .invalidPayload
        case .databaseError: return .databaseError
        case .fileNotFound: return .fileNotFound
        case .fileWriteError: return .fileWriteError
        case .fileReadError: return .fileReadError
        case .storageFull: return .storageFull
        case .peerNotFound: return .peerNotFound
        case .peerBlocked: return .peerBlocked
        case .peerNotVerified: return .peerNotVerified
        case .invalidPeerId: return .invalidPeerId
        case .bluetoothPermissionDenied: return .bluetoothPermissionDenied
        case .locationPermissionDenied: return .locationPermissionDenied
        case .notificationPermissionDenied: return .notificationPermissionDenied
        case .cameraPermissionDenied: return .cameraPermissionDenied
        case .microphonePermissionDenied: return .microphonePermissionDenied
        case .invalidInput: return .invalidInput
        case .invalidQRCode: return .invalidQRCode
        case .invalidFileType: return .invalidFileType
        case .fileTooLarge: return .fileTooLarge
        case .unknown: return .unknown
        }
    }
    
    var errorDescription: String? {
        switch self {
        case .peerUnreachable(let peerId, _):
            return "Contact \(peerId) is unreachable"
        case .connectionFailed(let message, _):
            return message
        case .connectionTimeout(let message):
            return message
        case .sendFailed(let message, _):
            return message
        case .keyGenerationFailed(let message, _):
            return message
        case .encryptionFailed(let message, _):
            return message
        case .decryptionFailed(let message, _):
            return message
        case .signatureFailed(let message, _):
            return message
        case .signatureVerificationFailed(let message, _):
            return message
        case .invalidMessageFormat(let message):
            return message
        case .invalidHeader(let message):
            return message
        case .messageTooLarge(let size, let maxSize):
            return "Message size \(size) bytes exceeds maximum \(maxSize) bytes"
        case .invalidPayload(let message):
            return message
        case .databaseError(let message, _):
            return message
        case .fileNotFound(let path):
            return "File not found: \(path)"
        case .fileWriteError(let path, _):
            return "Failed to write file: \(path)"
        case .fileReadError(let path, _):
            return "Failed to read file: \(path)"
        case .storageFull(let message):
            return message
        case .peerNotFound(let peerId):
            return "Contact \(peerId) not found"
        case .peerBlocked(let peerId):
            return "Contact \(peerId) is blocked"
        case .peerNotVerified(let peerId):
            return "Contact \(peerId) is not verified"
        case .invalidPeerId(let peerId):
            return "Invalid contact ID: \(peerId)"
        case .bluetoothPermissionDenied:
            return "Bluetooth permission required"
        case .locationPermissionDenied:
            return "Location permission required"
        case .notificationPermissionDenied:
            return "Notification permission required"
        case .cameraPermissionDenied:
            return "Camera permission required"
        case .microphonePermissionDenied:
            return "Microphone permission required"
        case .invalidInput(let field, let reason):
            return "Invalid \(field): \(reason)"
        case .invalidQRCode(let message):
            return message
        case .invalidFileType(let fileType, let allowedTypes):
            return "File type \(fileType) not allowed. Allowed types: \(allowedTypes)"
        case .fileTooLarge(let size, let maxSize):
            return "File size \(size) bytes exceeds maximum \(maxSize) bytes"
        case .unknown(let message, _):
            return message
        }
    }
    
    var userMessage: String {
        switch code {
        case .peerUnreachable: return "Contact is currently unreachable"
        case .connectionFailed: return "Connection failed"
        case .connectionTimeout: return "Connection timed out"
        case .sendFailed: return "Failed to send message"
        case .encryptionFailed: return "Failed to encrypt message"
        case .decryptionFailed: return "Failed to decrypt message"
        case .databaseError: return "Database error"
        case .fileNotFound: return "File not found"
        case .peerNotFound: return "Contact not found"
        case .peerBlocked: return "This contact is blocked"
        case .bluetoothPermissionDenied: return "Bluetooth permission required"
        case .invalidQRCode: return "Invalid QR code"
        case .fileTooLarge: return "File is too large"
        default: return "An error occurred"
        }
    }
}
