package com.sc.services

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Message Sync Service
 * Handles background message synchronization and processing
 */
class MessageSyncService : Service() {
    
    private val TAG = "MessageSyncService"
    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private val outgoingQueue = ConcurrentLinkedQueue<PendingMessage>()
    private val incomingQueue = ConcurrentLinkedQueue<ReceivedMessage>()
    
    private var isSyncing = false
    private var lastSyncTime = 0L
    private val SYNC_INTERVAL_MS = 30000L
    
    data class PendingMessage(
        val id: String,
        val recipientId: String,
        val encryptedPayload: ByteArray,
        val timestamp: Long,
        val retryCount: Int = 0
    )
    
    data class ReceivedMessage(
        val id: String,
        val senderId: String,
        val encryptedPayload: ByteArray,
        val timestamp: Long
    )
    
    inner class LocalBinder : Binder() {
        fun getService(): MessageSyncService = this@MessageSyncService
    }
    
    override fun onBind(intent: Intent): IBinder = binder
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Message Sync Service created")
        startSyncLoop()
    }
    
    private fun startSyncLoop() {
        serviceScope.launch {
            while (isActive) {
                try {
                    performSync()
                    delay(SYNC_INTERVAL_MS)
                } catch (e: Exception) {
                    Log.e(TAG, "Sync error: ${e.message}", e)
                    delay(5000)
                }
            }
        }
    }
    
    private suspend fun performSync() {
        if (isSyncing) return
        
        isSyncing = true
        Log.d(TAG, "Starting sync cycle")
        
        try {
            processOutgoingMessages()
            processIncomingMessages()
            lastSyncTime = System.currentTimeMillis()
            Log.d(TAG, "Sync cycle completed")
        } finally {
            isSyncing = false
        }
    }
    
    private suspend fun processOutgoingMessages() {
        val messagesToProcess = mutableListOf<PendingMessage>()
        while (outgoingQueue.isNotEmpty()) {
            outgoingQueue.poll()?.let { messagesToProcess.add(it) }
        }
        
        if (messagesToProcess.isEmpty()) return
        
        Log.d(TAG, "Processing ${messagesToProcess.size} outgoing messages")
        
        messagesToProcess.forEach { message ->
            try {
                val sent = sendMessageToPeer(message)
                
                if (!sent && message.retryCount < 3) {
                    outgoingQueue.offer(message.copy(retryCount = message.retryCount + 1))
                    Log.d(TAG, "Re-queued message ${message.id} (retry ${message.retryCount + 1})")
                } else if (sent) {
                    Log.d(TAG, "Successfully sent message ${message.id}")
                } else {
                    Log.w(TAG, "Failed to send message ${message.id} after max retries")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending message ${message.id}: ${e.message}", e)
            }
        }
    }
    
    private suspend fun processIncomingMessages() {
        val messagesToProcess = mutableListOf<ReceivedMessage>()
        while (incomingQueue.isNotEmpty()) {
            incomingQueue.poll()?.let { messagesToProcess.add(it) }
        }
        
        if (messagesToProcess.isEmpty()) return
        
        Log.d(TAG, "Processing ${messagesToProcess.size} incoming messages")
        
        messagesToProcess.forEach { message ->
            try {
                val decrypted = decryptMessage(message)
                if (decrypted != null) {
                    storeMessage(message, decrypted)
                    Log.d(TAG, "Successfully processed incoming message ${message.id}")
                } else {
                    Log.w(TAG, "Failed to decrypt message ${message.id}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing message ${message.id}: ${e.message}", e)
            }
        }
    }
    
    private suspend fun sendMessageToPeer(message: PendingMessage): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                delay(100)
                true
            } catch (e: Exception) {
                false
            }
        }
    }
    
    private suspend fun decryptMessage(message: ReceivedMessage): String? {
        return withContext(Dispatchers.Default) {
            try {
                "Decrypted: ${message.id}"
            } catch (e: Exception) {
                null
            }
        }
    }
    
    private suspend fun storeMessage(message: ReceivedMessage, decryptedContent: String) {
        withContext(Dispatchers.IO) {
            Log.d(TAG, "Storing message ${message.id} in database")
        }
    }
    
    fun queueOutgoingMessage(recipientId: String, encryptedPayload: ByteArray): String {
        val messageId = UUID.randomUUID().toString()
        val message = PendingMessage(
            id = messageId,
            recipientId = recipientId,
            encryptedPayload = encryptedPayload,
            timestamp = System.currentTimeMillis()
        )
        
        outgoingQueue.offer(message)
        Log.d(TAG, "Queued outgoing message $messageId")
        
        if (!isSyncing) {
            serviceScope.launch { performSync() }
        }
        
        return messageId
    }
    
    fun queueIncomingMessage(senderId: String, encryptedPayload: ByteArray) {
        val messageId = UUID.randomUUID().toString()
        val message = ReceivedMessage(
            id = messageId,
            senderId = senderId,
            encryptedPayload = encryptedPayload,
            timestamp = System.currentTimeMillis()
        )
        
        incomingQueue.offer(message)
        Log.d(TAG, "Queued incoming message $messageId")
        
        if (!isSyncing) {
            serviceScope.launch { performSync() }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        outgoingQueue.clear()
        incomingQueue.clear()
        Log.d(TAG, "Message Sync Service destroyed")
    }
}
