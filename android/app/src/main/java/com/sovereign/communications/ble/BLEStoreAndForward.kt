package com.sovereign.communications.ble

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.PriorityBlockingQueue

/**
 * BLE Store-and-Forward Queue - Task 42 Enhanced
 * Stores messages when destination is unreachable and forwards when available
 * Now with persistent queue support
 */
class BLEStoreAndForward(private val context: Context? = null) {
    
    data class QueuedMessage(
        val id: String,
        val destinationId: String,
        val payload: ByteArray,
        val priority: Int,
        val timestamp: Long,
        val ttl: Int,
        val retryCount: Int = 0
    ) : Comparable<QueuedMessage> {
        override fun compareTo(other: QueuedMessage): Int {
            // Higher priority first, then older messages
            return when {
                priority != other.priority -> other.priority - priority
                else -> timestamp.compareTo(other.timestamp)
            }
        }
        
        /**
         * Convert to JSON for persistence
         */
        fun toJson(): JSONObject {
            return JSONObject().apply {
                put("id", id)
                put("destinationId", destinationId)
                put("payload", android.util.Base64.encodeToString(payload, android.util.Base64.DEFAULT))
                put("priority", priority)
                put("timestamp", timestamp)
                put("ttl", ttl)
                put("retryCount", retryCount)
            }
        }
        
        companion object {
            /**
             * Create from JSON
             */
            fun fromJson(json: JSONObject): QueuedMessage {
                return QueuedMessage(
                    id = json.getString("id"),
                    destinationId = json.getString("destinationId"),
                    payload = android.util.Base64.decode(json.getString("payload"), android.util.Base64.DEFAULT),
                    priority = json.getInt("priority"),
                    timestamp = json.getLong("timestamp"),
                    ttl = json.getInt("ttl"),
                    retryCount = json.getInt("retryCount")
                )
            }
        }
        
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false
            other as QueuedMessage
            return id == other.id
        }

        override fun hashCode(): Int = id.hashCode()
    }

    private val messageQueue = PriorityBlockingQueue<QueuedMessage>()
    private val processingMessages = ConcurrentHashMap<String, QueuedMessage>()
    
    // Queue management - Task 42
    private var maxQueueSize = 1000
    private val maxRetries = 5
    private val retryDelayMs = 5000L
    
    // Persistence - Task 42
    private val persistenceEnabled = context != null
    private val persistenceFile = context?.let { File(it.filesDir, "ble_message_queue.json") }
    
    private var forwardingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Metrics
    private var totalStored = 0L
    private var totalForwarded = 0L
    private var totalDropped = 0L
    private var overflowDrops = 0L
    
    companion object {
        private const val TAG = "BLEStoreAndForward"
    }
    
    init {
        // Load persisted messages on startup
        if (persistenceEnabled) {
            loadPersistedMessages()
        }
    }

    /**
     * Store a message for later forwarding - Task 42 Enhanced
     */
    fun storeMessage(
        id: String,
        destinationId: String,
        payload: ByteArray,
        priority: Int,
        ttl: Int
    ): StoreResult {
        // Handle queue overflow - Task 42
        if (messageQueue.size >= maxQueueSize) {
            return handleQueueOverflow(id, destinationId, payload, priority, ttl)
        }

        val message = QueuedMessage(
            id = id,
            destinationId = destinationId,
            payload = payload,
            priority = priority,
            timestamp = System.currentTimeMillis(),
            ttl = ttl
        )

        val success = messageQueue.offer(message)
        if (success) {
            totalStored++
            
            // Persist if enabled
            if (persistenceEnabled) {
                persistQueue()
            }
            
            Log.d(TAG, "Message stored: $id, priority: $priority, queue size: ${messageQueue.size}")
            return StoreResult.Success(messageQueue.size)
        }
        
        totalDropped++
        return StoreResult.QueueFull
    }
    
    /**
     * Handle queue overflow - Task 42
     */
    private fun handleQueueOverflow(
        id: String,
        destinationId: String,
        payload: ByteArray,
        priority: Int,
        ttl: Int
    ): StoreResult {
        // Strategy: Remove oldest low-priority message
        val lowPriorityMessages = messageQueue.filter { it.priority < 5 }
        
        if (lowPriorityMessages.isNotEmpty()) {
            val toRemove = lowPriorityMessages.minByOrNull { it.timestamp }
            if (toRemove != null && messageQueue.remove(toRemove)) {
                overflowDrops++
                Log.w(TAG, "Dropped low-priority message ${toRemove.id} to make space")
                
                // Now try to add the new message
                return storeMessage(id, destinationId, payload, priority, ttl)
            }
        }
        
        // If new message has high priority, try to remove lowest priority
        if (priority >= 7) {
            val lowestPriority = messageQueue.minByOrNull { it.priority }
            if (lowestPriority != null && priority > lowestPriority.priority) {
                if (messageQueue.remove(lowestPriority)) {
                    overflowDrops++
                    Log.w(TAG, "Dropped message ${lowestPriority.id} for higher priority")
                    return storeMessage(id, destinationId, payload, priority, ttl)
                }
            }
        }
        
        totalDropped++
        overflowDrops++
        Log.e(TAG, "Queue full, cannot store message $id")
        return StoreResult.QueueFull
    }
    
    /**
     * Store result
     */
    sealed class StoreResult {
        data class Success(val queueSize: Int) : StoreResult()
        object QueueFull : StoreResult()
    }

    /**
     * Start forwarding messages when peers become available
     */
    fun startForwarding(
        isPeerReachable: (String) -> Boolean,
        sendMessage: suspend (QueuedMessage) -> Boolean
    ) {
        forwardingJob?.cancel()
        forwardingJob = scope.launch {
            while (isActive) {
                try {
                    // Process messages in priority order
                    val messagesToProcess = messageQueue.toList()
                    
                    for (message in messagesToProcess) {
                        if (!isActive) break
                        
                        // Check if message expired
                        val age = (System.currentTimeMillis() - message.timestamp) / 1000
                        if (age > message.ttl) {
                            messageQueue.remove(message)
                            continue
                        }

                        // Check if destination is reachable
                        if (isPeerReachable(message.destinationId)) {
                            messageQueue.remove(message)
                            processingMessages[message.id] = message
                            
                            // Attempt to send
                            val success = try {
                                sendMessage(message)
                            } catch (e: Exception) {
                                false
                            }

                            if (success) {
                                processingMessages.remove(message.id)
                                totalForwarded++
                            } else {
                                // Retry with backoff
                                processingMessages.remove(message.id)
                                if (message.retryCount < maxRetries) {
                                    val retryMessage = message.copy(
                                        retryCount = message.retryCount + 1
                                    )
                                    delay(retryDelayMs * (message.retryCount + 1))
                                    messageQueue.offer(retryMessage)
                                } else {
                                    totalDropped++
                                    Log.w(TAG, "Message ${message.id} exceeded max retries")
                                }
                            }
                        }
                    }

                    delay(1000) // Check queue every second
                } catch (e: Exception) {
                    Log.e(TAG, "Error in forwarding loop", e)
                    delay(1000)
                }
            }
        }
    }

    /**
     * Set maximum queue size - Task 42
     */
    fun setMaxQueueSize(size: Int) {
        maxQueueSize = size.coerceIn(100, 10000)
        Log.i(TAG, "Max queue size set to $maxQueueSize")
    }
    
    /**
     * Persist queue to disk - Task 42
     */
    private fun persistQueue() {
        if (!persistenceEnabled || persistenceFile == null) return
        
        scope.launch {
            try {
                val messages = messageQueue.toList()
                val jsonArray = JSONArray()
                
                messages.forEach { message ->
                    jsonArray.put(message.toJson())
                }
                
                persistenceFile.writeText(jsonArray.toString())
                Log.d(TAG, "Queue persisted: ${messages.size} messages")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to persist queue", e)
            }
        }
    }
    
    /**
     * Load persisted messages - Task 42
     */
    private fun loadPersistedMessages() {
        if (persistenceFile == null || !persistenceFile.exists()) return
        
        try {
            val jsonText = persistenceFile.readText()
            val jsonArray = JSONArray(jsonText)
            
            for (i in 0 until jsonArray.length()) {
                val message = QueuedMessage.fromJson(jsonArray.getJSONObject(i))
                
                // Check if message is still valid (not expired)
                val age = (System.currentTimeMillis() - message.timestamp) / 1000
                if (age < message.ttl) {
                    messageQueue.offer(message)
                }
            }
            
            Log.i(TAG, "Loaded ${messageQueue.size} persisted messages")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load persisted messages", e)
        }
    }

    /**
     * Stop forwarding
     */
    fun stopForwarding() {
        forwardingJob?.cancel()
        forwardingJob = null
    }

    /**
     * Get queue statistics - Task 42
     */
    fun getQueueStats(): Map<String, Any> {
        return mapOf(
            "queueSize" to messageQueue.size,
            "processingCount" to processingMessages.size,
            "maxQueueSize" to maxQueueSize,
            "totalStored" to totalStored,
            "totalForwarded" to totalForwarded,
            "totalDropped" to totalDropped,
            "overflowDrops" to overflowDrops,
            "utilizationPercent" to (messageQueue.size.toFloat() / maxQueueSize * 100),
            "priorityDistribution" to messageQueue
                .groupBy { it.priority }
                .mapValues { it.value.size },
            "persistenceEnabled" to persistenceEnabled
        )
    }

    /**
     * Clear expired messages - Task 42
     */
    fun clearExpiredMessages() {
        val now = System.currentTimeMillis()
        val expiredCount = messageQueue.count { message ->
            val age = (now - message.timestamp) / 1000
            age > message.ttl
        }
        
        messageQueue.removeAll { message ->
            val age = (now - message.timestamp) / 1000
            val expired = age > message.ttl
            if (expired) totalDropped++
            expired
        }
        
        if (expiredCount > 0) {
            Log.i(TAG, "Cleared $expiredCount expired messages")
            if (persistenceEnabled) {
                persistQueue()
            }
        }
    }

    /**
     * Cleanup resources - Task 42
     */
    fun cleanup() {
        stopForwarding()
        
        // Persist queue before cleanup
        if (persistenceEnabled) {
            persistQueue()
        }
        
        messageQueue.clear()
        processingMessages.clear()
        scope.cancel()
    }
}
