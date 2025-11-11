package com.sovereign.communications.ble

import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.PriorityBlockingQueue

/**
 * BLE Store-and-Forward Queue
 * Stores messages when destination is unreachable and forwards when available
 */
class BLEStoreAndForward {
    
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
    }

    private val messageQueue = PriorityBlockingQueue<QueuedMessage>()
    private val processingMessages = ConcurrentHashMap<String, QueuedMessage>()
    private val maxQueueSize = 1000
    private val maxRetries = 5
    private val retryDelayMs = 5000L
    
    private var forwardingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Store a message for later forwarding
     */
    fun storeMessage(
        id: String,
        destinationId: String,
        payload: ByteArray,
        priority: Int,
        ttl: Int
    ): Boolean {
        if (messageQueue.size >= maxQueueSize) {
            // Remove oldest low-priority message
            val lowPriorityMessages = messageQueue.filter { it.priority < 5 }
            if (lowPriorityMessages.isNotEmpty()) {
                messageQueue.remove(lowPriorityMessages.minByOrNull { it.timestamp })
            } else {
                return false // Queue full
            }
        }

        val message = QueuedMessage(
            id = id,
            destinationId = destinationId,
            payload = payload,
            priority = priority,
            timestamp = System.currentTimeMillis(),
            ttl = ttl
        )

        return messageQueue.offer(message)
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
                            } else {
                                // Retry with backoff
                                processingMessages.remove(message.id)
                                if (message.retryCount < maxRetries) {
                                    val retryMessage = message.copy(
                                        retryCount = message.retryCount + 1
                                    )
                                    delay(retryDelayMs * (message.retryCount + 1))
                                    messageQueue.offer(retryMessage)
                                }
                            }
                        }
                    }

                    delay(1000) // Check queue every second
                } catch (e: Exception) {
                    // Log error and continue
                    delay(1000)
                }
            }
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
     * Get queue statistics
     */
    fun getQueueStats(): Map<String, Any> {
        return mapOf(
            "queueSize" to messageQueue.size,
            "processingCount" to processingMessages.size,
            "priorityDistribution" to messageQueue
                .groupBy { it.priority }
                .mapValues { it.value.size }
        )
    }

    /**
     * Clear expired messages
     */
    fun clearExpiredMessages() {
        val now = System.currentTimeMillis()
        messageQueue.removeAll { message ->
            val age = (now - message.timestamp) / 1000
            age > message.ttl
        }
    }

    /**
     * Cleanup resources
     */
    fun cleanup() {
        stopForwarding()
        messageQueue.clear()
        processingMessages.clear()
    }
}
