package com.sovereign.communications.data.adapter

import android.content.Context
import android.util.Base64
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import com.sovereign.communications.data.entity.MessageType
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Android implementation of PersistenceAdapter for @sc/core
 * Uses Room database for persistent storage of queued messages
 * 
 * This adapter bridges the gap between the core library's MessageRelay
 * and Android's Room database persistence layer.
 */
class AndroidPersistenceAdapter(
    private val context: Context,
    private val database: SCDatabase
) {
    // Cache for quick lookups
    private val messageCache = ConcurrentHashMap<String, StoredMessage>()
    
    companion object {
        private const val TAG = "AndroidPersistenceAdapter"
        private const val DEFAULT_MESSAGE_EXPIRATION_MS = 86400000L // 24 hours
    }
    
    /**
     * StoredMessage matches the core library's interface
     */
    data class StoredMessage(
        val destinationPeerId: String,
        val payload: ByteArray,
        val attempts: Int = 0,
        val lastAttempt: Long = 0,
        val expiresAt: Long,
        val priority: Int = 1,
        val messageId: String
    )
    
    /**
     * Save a message to persistent storage
     * Called by core library when message delivery fails
     */
    suspend fun saveMessage(id: String, message: StoredMessage) {
        try {
            // Encode senderId (Uint8Array) to Base64 for storage
            val senderIdBase64 = Base64.encodeToString(
                message.messageId.toByteArray(), 
                Base64.NO_WRAP
            )
            
            // Store raw payload as Base64 to preserve binary data
            val payloadBase64 = Base64.encodeToString(message.payload, Base64.NO_WRAP)
            
            // Convert to Room entity
            val entity = MessageEntity(
                id = id,
                conversationId = message.destinationPeerId,
                content = payloadBase64, // Store Base64-encoded payload
                senderId = senderIdBase64,
                recipientId = message.destinationPeerId,
                timestamp = System.currentTimeMillis(),
                status = MessageStatus.QUEUED,
                type = MessageType.TEXT,
                metadata = JSONObject().apply {
                    put("attempts", message.attempts)
                    put("lastAttempt", message.lastAttempt)
                    put("expiresAt", message.expiresAt)
                    put("priority", message.priority)
                    put("isBase64Encoded", true) // Flag to indicate Base64 encoding
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
    suspend fun getMessage(id: String): StoredMessage? {
        // Check cache first
        messageCache[id]?.let { return it }
        
        // Load from database
        return try {
            val entity = database.messageDao().getMessageById(id) ?: return null
            
            // Parse metadata
            val metadata = JSONObject(entity.metadata ?: "{}")
            
            StoredMessage(
                destinationPeerId = entity.recipientId,
                payload = entity.content.toByteArray(Charsets.UTF_8),
                attempts = metadata.optInt("attempts", 0),
                lastAttempt = metadata.optLong("lastAttempt", 0),
                expiresAt = metadata.optLong("expiresAt", System.currentTimeMillis() + 86400000),
                priority = metadata.optInt("priority", 1),
                messageId = id
            ).also {
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
    suspend fun getAllMessages(): Map<String, StoredMessage> {
        return try {
            val queuedMessages = database.messageDao().getMessagesByStatus(MessageStatus.QUEUED)
            
            queuedMessages.associate { entity ->
                val metadata = JSONObject(entity.metadata ?: "{}")
                
                entity.id to StoredMessage(
                    destinationPeerId = entity.recipientId,
                    payload = entity.content.toByteArray(Charsets.UTF_8),
                    attempts = metadata.optInt("attempts", 0),
                    lastAttempt = metadata.optLong("lastAttempt", 0),
                    expiresAt = metadata.optLong("expiresAt", System.currentTimeMillis() + 86400000),
                    priority = metadata.optInt("priority", 1),
                    messageId = entity.id
                )
            }.also { messages ->
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
}
