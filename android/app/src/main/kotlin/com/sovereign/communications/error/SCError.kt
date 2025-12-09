package com.sovereign.communications.error

/**
 * Unified error handling for Android
 * Consistent with Web (TypeScript) and iOS (Swift) implementations
 */
sealed class SCError(
    val category: ErrorCategory,
    val code: ErrorCode,
    override val message: String,
    override val cause: Throwable? = null
) : Exception(message, cause) {
    
    enum class ErrorCategory {
        NETWORK, CRYPTO, PROTOCOL, STORAGE, PEER, PERMISSION, VALIDATION, UNKNOWN
    }
    
    enum class ErrorCode(val value: Int) {
        // Network (1000-1999)
        PEER_UNREACHABLE(1001),
        CONNECTION_FAILED(1002),
        CONNECTION_TIMEOUT(1003),
        SEND_FAILED(1004),
        
        // Crypto (2000-2999)
        KEY_GENERATION_FAILED(2001),
        ENCRYPTION_FAILED(2002),
        DECRYPTION_FAILED(2003),
        SIGNATURE_FAILED(2004),
        SIGNATURE_VERIFICATION_FAILED(2005),
        
        // Protocol (3000-3999)
        INVALID_MESSAGE_FORMAT(3001),
        INVALID_HEADER(3002),
        MESSAGE_TOO_LARGE(3003),
        INVALID_PAYLOAD(3004),
        
        // Storage (4000-4999)
        DATABASE_ERROR(4001),
        FILE_NOT_FOUND(4002),
        FILE_WRITE_ERROR(4003),
        FILE_READ_ERROR(4004),
        STORAGE_FULL(4005),
        
        // Peer (5000-5999)
        PEER_NOT_FOUND(5001),
        PEER_BLOCKED(5002),
        PEER_NOT_VERIFIED(5003),
        INVALID_PEER_ID(5004),
        
        // Permission (6000-6999)
        BLUETOOTH_PERMISSION_DENIED(6001),
        LOCATION_PERMISSION_DENIED(6002),
        NOTIFICATION_PERMISSION_DENIED(6003),
        CAMERA_PERMISSION_DENIED(6004),
        MICROPHONE_PERMISSION_DENIED(6005),
        
        // Validation (7000-7999)
        INVALID_INPUT(7001),
        INVALID_QR_CODE(7002),
        INVALID_FILE_TYPE(7003),
        FILE_TOO_LARGE(7004),
        
        UNKNOWN(9999)
    }
    
    // Network Errors
    class PeerUnreachable(peerId: String, cause: Throwable? = null) :
        SCError(ErrorCategory.NETWORK, ErrorCode.PEER_UNREACHABLE, "Contact $peerId is unreachable", cause)
    
    class ConnectionFailed(msg: String, cause: Throwable? = null) :
        SCError(ErrorCategory.NETWORK, ErrorCode.CONNECTION_FAILED, msg, cause)
    
    class SendFailed(msg: String, cause: Throwable? = null) :
        SCError(ErrorCategory.NETWORK, ErrorCode.SEND_FAILED, msg, cause)
    
    // Crypto Errors
    class EncryptionFailed(msg: String, cause: Throwable? = null) :
        SCError(ErrorCategory.CRYPTO, ErrorCode.ENCRYPTION_FAILED, msg, cause)
    
    class DecryptionFailed(msg: String, cause: Throwable? = null) :
        SCError(ErrorCategory.CRYPTO, ErrorCode.DECRYPTION_FAILED, msg, cause)
    
    // Storage Errors
    class DatabaseError(msg: String, cause: Throwable? = null) :
        SCError(ErrorCategory.STORAGE, ErrorCode.DATABASE_ERROR, msg, cause)
    
    class FileNotFound(path: String) :
        SCError(ErrorCategory.STORAGE, ErrorCode.FILE_NOT_FOUND, "File not found: $path")
    
    // Peer Errors
    class PeerNotFound(peerId: String) :
        SCError(ErrorCategory.PEER, ErrorCode.PEER_NOT_FOUND, "Contact $peerId not found")
    
    // Permission Errors
    class BluetoothPermissionDenied :
        SCError(ErrorCategory.PERMISSION, ErrorCode.BLUETOOTH_PERMISSION_DENIED, 
            "Bluetooth permission required")
    
    // Validation Errors
    class InvalidQRCode(msg: String) :
        SCError(ErrorCategory.VALIDATION, ErrorCode.INVALID_QR_CODE, msg)
    
    class FileTooLarge(size: Long, maxSize: Long) :
        SCError(ErrorCategory.VALIDATION, ErrorCode.FILE_TOO_LARGE, 
            "File size $size bytes exceeds maximum $maxSize bytes")
    
    // Unknown
    class Unknown(msg: String, cause: Throwable? = null) :
        SCError(ErrorCategory.UNKNOWN, ErrorCode.UNKNOWN, msg, cause)
    
    fun toUserMessage(): String = when (code) {
        ErrorCode.PEER_UNREACHABLE -> "Contact is currently unreachable"
        ErrorCode.CONNECTION_FAILED -> "Connection failed"
        ErrorCode.SEND_FAILED -> "Failed to send message"
        ErrorCode.ENCRYPTION_FAILED -> "Failed to encrypt message"
        ErrorCode.DECRYPTION_FAILED -> "Failed to decrypt message"
        ErrorCode.DATABASE_ERROR -> "Database error"
        ErrorCode.FILE_NOT_FOUND -> "File not found"
        ErrorCode.PEER_NOT_FOUND -> "Contact not found"
        ErrorCode.BLUETOOTH_PERMISSION_DENIED -> "Bluetooth permission required"
        ErrorCode.INVALID_QR_CODE -> "Invalid QR code"
        ErrorCode.FILE_TOO_LARGE -> "File is too large"
        else -> "An error occurred"
    }
}
