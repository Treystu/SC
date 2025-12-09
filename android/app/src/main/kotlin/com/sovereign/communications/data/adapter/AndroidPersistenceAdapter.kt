package com.sovereign.communications.data.adapter

import android.content.Context
import android.util.Base64
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import com.sovereign.communications.data.entity.MessageType
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Android implementation of PersistenceAdapter for @sc/core
 * Uses Room database for persistent storage of queued messages
 * 
 * This adapter bridges the gap between the core library's MessageRelay
 * and Android's Room database persistence layer.
 * 
 * Payload Storage Strategy:
 * - Raw message bytes stored as Base64 in metadata for security and size efficiency
 * - Content field stores human-readable preview for UI/debugging
 * - Sender ID extracted from message.header.senderId (Ed25519 public key)
 */
class AndroidPersistenceAdapter(
    private val context: Context,
    private val database: SCDatabase
) {
    // Cache for quick lookups
    private val messageCache = ConcurrentHashMap<String, CoreStoredMessage>()
    
    companion object {
        private const val TAG = "AndroidPersistenceAdapter"
        private const val DEFAULT_MESSAGE_EXPIRATION_MS = 86400000L // 24 hours
    }
    
    /**
     * Core library's StoredMessage structure
     * Contains the complete Message with header and binary payload
     */
    data class CoreStoredMessage(
        val message: CoreMessage,
        val destinationPeerId: String,
        val attempts: Int,
        val lastAttempt: Long,
        val expiresAt: Long
    )
    
    /**
     * Core Message structure (matches @sc/core)
     */
    data class CoreMessage(
        val header: MessageHeader,
        val payload: ByteArray
    )
    
    data class MessageHeader(
        val version: Int,
        val type: Int,
        val ttl: Int,
        val timestamp: Long,
        val senderId: ByteArray,
        val signature: ByteArray
    )
    
    /**
     * Save a message to persistent storage
     * Called by core library when message delivery fails
     */
    suspend fun saveMessage(id: String, message: CoreStoredMessage) {
        try {
            // Extract sender ID from message header (Ed25519 public key)
            val senderIdBase64 = Base64.encodeToString(
                message.message.header.senderId, 
                Base64.NO_WRAP
            )
            
            // Serialize the complete message for secure storage
            val messageBytes = serializeMessage(message.message)
            val messageBase64 = Base64.encodeToString(messageBytes, Base64.NO_WRAP)
            
            // Create human-readable preview for UI (first 100 bytes of payload)
            val preview = try {
                val previewBytes = message.message.payload.take(100).toByteArray()
                String(previewBytes, Charsets.UTF_8).take(50) + "..."
            } catch (e: Exception) {
                "[Binary Data: ${message.message.payload.size} bytes]"
            }
            
            // Convert to Room entity
            val entity = MessageEntity(
                id = id,
                conversationId = message.destinationPeerId,
                content = preview, // Human-readable preview only
                senderId = senderIdBase64,
                recipientId = message.destinationPeerId,
                timestamp = message.message.header.timestamp,
                status = MessageStatus.QUEUED,
                type = MessageType.TEXT,
                metadata = JSONObject().apply {
                    put("attempts", message.attempts)
                    put("lastAttempt", message.lastAttempt)
                    put("expiresAt", message.expiresAt)
                    put("rawMessage", messageBase64) // Complete message in Base64
                    put("payloadSize", message.message.payload.size)
                }.toString()
            )
            
            database.messageDao().insert(entity)
            messageCache[id] = message
            
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to save message $id", e)
        }
    }
    
    /**
     * Retrieve a specific message by ID
     */
    suspend fun getMessage(id: String): CoreStoredMessage? {
        // Check cache first
        messageCache[id]?.let { return it }
        
        // Load from database
        return try {
            val entity = database.messageDao().getMessageById(id) ?: return null
            deserializeStoredMessage(entity)?.also {
                messageCache[id] = it
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to get message $id", e)
            null
        }
    }
    
    /**
     * Remove a message from storage
     * Called when message is successfully delivered or expires
     */
    suspend fun removeMessage(id: String) {
        try {
            database.messageDao().deleteById(id)
            messageCache.remove(id)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to remove message $id", e)
        }
    }
    
    /**
     * Get all stored messages for retry
     * Used by store-and-forward mechanism
     */
    suspend fun getAllMessages(): Map<String, CoreStoredMessage> {
        return try {
            val queuedMessages = database.messageDao().getMessagesByStatus(MessageStatus.QUEUED)
            
            queuedMessages.mapNotNull { entity ->
                deserializeStoredMessage(entity)?.let { entity.id to it }
            }.toMap().also { messages ->
                messageCache.putAll(messages)
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to get all messages", e)
            emptyMap()
        }
    }
    
    /**
     * Remove expired messages
     * Called periodically to clean up old queued messages
     */
    suspend fun pruneExpired(now: Long) {
        try {
            val allMessages = database.messageDao().getMessagesByStatus(MessageStatus.QUEUED)
            
            allMessages.forEach { entity ->
                val metadata = JSONObject(entity.metadata ?: "{}")
                val expiresAt = metadata.optLong("expiresAt", 0)
                
                if (expiresAt < now) {
                    database.messageDao().deleteById(entity.id)
                    messageCache.remove(entity.id)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to prune expired messages", e)
        }
    }
    
    /**
     * Get count of stored messages
     */
    suspend fun size(): Int {
        return try {
            database.messageDao().getMessagesByStatus(MessageStatus.QUEUED).size
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to get size", e)
            0
        }
    }
    
    /**
     * Update message metadata after delivery attempt
     */
    suspend fun updateMessage(id: String, attempts: Int, lastAttempt: Long, success: Boolean) {
        try {
            val entity = database.messageDao().getMessageById(id) ?: return
            
            val metadata = JSONObject(entity.metadata ?: "{}").apply {
                put("attempts", attempts)
                put("lastAttempt", lastAttempt)
            }
            
            val updatedEntity = entity.copy(
                status = if (success) MessageStatus.SENT else MessageStatus.QUEUED,
                metadata = metadata.toString()
            )
            
            database.messageDao().update(updatedEntity)
            
            if (success) {
                messageCache.remove(id)
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to update message $id", e)
        }
    }
    
    /**
     * Serialize a message to bytes (simple format for storage)
     */
    private fun serializeMessage(message: CoreMessage): ByteArray {
        // Simple serialization: header fields + payload
        val header = message.header
        val buffer = mutableListOf<Byte>()
        
        // Version (1 byte)
        buffer.add(header.version.toByte())
        // Type (1 byte)
        buffer.add(header.type.toByte())
        // TTL (1 byte)
        buffer.add(header.ttl.toByte())
        // Timestamp (8 bytes, big-endian)
        val timestampBytes = ByteArray(8)
        for (i in 0..7) {
            timestampBytes[i] = (header.timestamp shr (56 - i * 8)).toByte()
        }
        buffer.addAll(timestampBytes.toList())
        // SenderId (32 bytes)
        buffer.addAll(header.senderId.toList())
        // Signature (64 bytes)
        buffer.addAll(header.signature.toList())
        // Payload (variable)
        buffer.addAll(message.payload.toList())
        
        return buffer.toByteArray()
    }
    
    /**
     * Deserialize StoredMessage from database entity
     */
    private fun deserializeStoredMessage(entity: MessageEntity): CoreStoredMessage? {
        return try {
            val metadata = JSONObject(entity.metadata ?: "{}")
            val messageBase64 = metadata.optString("rawMessage", null) ?: return null
            val messageBytes = Base64.decode(messageBase64, Base64.NO_WRAP)
            
            // Deserialize message
            val message = deserializeMessage(messageBytes)
            
            CoreStoredMessage(
                message = message,
                destinationPeerId = entity.recipientId,
                attempts = metadata.optInt("attempts", 0),
                lastAttempt = metadata.optLong("lastAttempt", 0),
                expiresAt = metadata.optLong("expiresAt", System.currentTimeMillis() + DEFAULT_MESSAGE_EXPIRATION_MS)
            )
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to deserialize message ${entity.id}", e)
            null
        }
    }
    
    /**
     * Deserialize message from bytes
     */
    private fun deserializeMessage(bytes: ByteArray): CoreMessage {
        var offset = 0
        
        // Version (1 byte)
        val version = bytes[offset++].toInt() and 0xFF
        // Type (1 byte)
        val type = bytes[offset++].toInt() and 0xFF
        // TTL (1 byte)
        val ttl = bytes[offset++].toInt() and 0xFF
        // Timestamp (8 bytes)
        var timestamp = 0L
        for (i in 0..7) {
            timestamp = (timestamp shl 8) or (bytes[offset++].toLong() and 0xFF)
        }
        // SenderId (32 bytes)
        val senderId = bytes.copyOfRange(offset, offset + 32)
        offset += 32
        // Signature (64 bytes)
        val signature = bytes.copyOfRange(offset, offset + 64)
        offset += 64
        // Payload (rest)
        val payload = bytes.copyOfRange(offset, bytes.size)
        
        return CoreMessage(
            header = MessageHeader(
                version = version,
                type = type,
                ttl = ttl,
                timestamp = timestamp,
                senderId = senderId,
                signature = signature
            ),
            payload = payload
        )
    }
}
