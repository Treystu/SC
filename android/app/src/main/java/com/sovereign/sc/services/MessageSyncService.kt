package com.sovereign.sc.services

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Message Sync Service - Background message synchronization
 * Task 224: Message sync service with background processing
 */
class MessageSyncService : Service() {
    private val TAG = "MessageSyncService"
    private val binder = LocalBinder()
    
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val pendingMessages = ConcurrentLinkedQueue<PendingMessage>()
    private var syncJob: Job? = null
    
    data class PendingMessage(
        val id: String,
        val recipientId: String,
        val content: ByteArray,
        val timestamp: Long,
        val retryCount: Int = 0
    )
    
    inner class LocalBinder : Binder() {
        fun getService(): MessageSyncService = this@MessageSyncService
    }
    
    override fun onBind(intent: Intent?): IBinder {
        return binder
    }
    
    override fun onCreate() {
        super.onCreate()
        startSyncLoop()
        Log.d(TAG, "Message Sync Service created")
    }
    
    /**
     * Start continuous sync loop
     */
    private fun startSyncLoop() {
        syncJob = serviceScope.launch {
            while (isActive) {
                try {
                    processPendingMessages()
                    delay(5000) // Sync every 5 seconds
                } catch (e: Exception) {
                    Log.e(TAG, "Error in sync loop", e)
                }
            }
        }
    }
    
    /**
     * Queue a message for synchronization
     */
    fun queueMessage(recipientId: String, content: ByteArray): String {
        val messageId = generateMessageId()
        val pendingMsg = PendingMessage(
            id = messageId,
            recipientId = recipientId,
            content = content,
            timestamp = System.currentTimeMillis()
        )
        
        pendingMessages.offer(pendingMsg)
        Log.d(TAG, "Queued message $messageId for $recipientId")
        
        // Trigger immediate sync attempt
        serviceScope.launch {
            processPendingMessages()
        }
        
        return messageId
    }
    
    /**
     * Process pending messages in queue
     */
    private suspend fun processPendingMessages() {
        val iterator = pendingMessages.iterator()
        val failed = mutableListOf<PendingMessage>()
        
        while (iterator.hasNext()) {
            val msg = iterator.next()
            
            if (attemptSend(msg)) {
                // Successfully sent, remove from queue
                iterator.remove()
                Log.d(TAG, "Successfully synced message ${msg.id}")
            } else {
                // Failed to send
                if (msg.retryCount < MAX_RETRIES) {
                    // Retry with backoff
                    failed.add(msg.copy(retryCount = msg.retryCount + 1))
                    iterator.remove()
                } else {
                    // Max retries exceeded, mark as failed
                    Log.e(TAG, "Message ${msg.id} failed after $MAX_RETRIES retries")
                    iterator.remove()
                    handleFailedMessage(msg)
                }
            }
        }
        
        // Re-queue failed messages with updated retry count
        failed.forEach { pendingMessages.offer(it) }
    }
    
    /**
     * Attempt to send a message
     */
    private suspend fun attemptSend(msg: PendingMessage): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                // TODO: Integrate with mesh network to send message
                Log.d(TAG, "Attempting to send message ${msg.id} to ${msg.recipientId}")
                
                // Simulate network delay
                delay(100)
                
                // For now, return success (will integrate with actual mesh network)
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send message ${msg.id}", e)
                false
            }
        }
    }
    
    /**
     * Handle a message that failed after max retries
     */
    private fun handleFailedMessage(msg: PendingMessage) {
        // TODO: Update database to mark message as failed
        // TODO: Notify user of failed delivery
        Log.w(TAG, "Message ${msg.id} permanently failed")
    }
    
    /**
     * Get count of pending messages
     */
    fun getPendingCount(): Int {
        return pendingMessages.size
    }
    
    /**
     * Get pending messages for a specific recipient
     */
    fun getPendingForRecipient(recipientId: String): List<PendingMessage> {
        return pendingMessages.filter { it.recipientId == recipientId }
    }
    
    /**
     * Cancel a pending message
     */
    fun cancelMessage(messageId: String): Boolean {
        val iterator = pendingMessages.iterator()
        while (iterator.hasNext()) {
            if (iterator.next().id == messageId) {
                iterator.remove()
                Log.d(TAG, "Cancelled message $messageId")
                return true
            }
        }
        return false
    }
    
    /**
     * Clear all pending messages
     */
    fun clearPending() {
        val count = pendingMessages.size
        pendingMessages.clear()
        Log.d(TAG, "Cleared $count pending messages")
    }
    
    private fun generateMessageId(): String {
        return "msg_${System.currentTimeMillis()}_${(Math.random() * 1000000).toInt()}"
    }
    
    override fun onDestroy() {
        super.onDestroy()
        syncJob?.cancel()
        serviceScope.cancel()
        Log.d(TAG, "Message Sync Service destroyed")
    }
    
    companion object {
        private const val MAX_RETRIES = 5
    }
}
