package com.sovereign.communications.ble

import java.util.concurrent.ConcurrentHashMap
import java.util.zip.CRC32

/**
 * BLE packet reassembly - Task 38 Enhanced
 * Handles reassembling fragmented messages with checksum validation and error recovery
 */
class BLEReassembly(private val timeoutMs: Long = 30000) {
    
    private data class ReassemblyBuffer(
        val messageId: Int,
        val totalFragments: Int,
        val expectedCrc32: Long,
        val fragments: MutableMap<Int, ByteArray> = mutableMapOf(),
        val timestamp: Long = System.currentTimeMillis(),
        var retryCount: Int = 0
    ) {
        fun isComplete(): Boolean = fragments.size == totalFragments
        
        fun isExpired(currentTime: Long): Boolean = 
            currentTime - timestamp > timeoutMs
        
        fun reassemble(): ByteArray {
            val sortedFragments = fragments.toSortedMap().values
            val totalSize = sortedFragments.sumOf { it.size }
            val result = ByteArray(totalSize)
            
            var offset = 0
            for (fragment in sortedFragments) {
                fragment.copyInto(result, offset)
                offset += fragment.size
            }
            
            return result
        }
        
        fun validateChecksum(data: ByteArray): Boolean {
            val crc32 = CRC32()
            crc32.update(data)
            return crc32.value == expectedCrc32
        }
    }

    private val buffers = ConcurrentHashMap<Int, ReassemblyBuffer>()
    
    // Reassembly metrics - Task 38
    private var totalMessagesReassembled = 0L
    private var totalFragmentsReceived = 0L
    private var checksumFailures = 0L
    private var timeoutFailures = 0L
    private var reassemblyErrors = 0L
    
    // Error recovery - Task 38
    private val maxRetries = 3
    private val failedMessages = ConcurrentHashMap<Int, FailureRecord>()
    
    data class FailureRecord(
        val messageId: Int,
        val reason: String,
        val timestamp: Long,
        val retryCount: Int
    )

    /**
     * Add a fragment and return complete message if ready - Task 38 Enhanced
     */
    fun addFragment(header: BLEFragmentation.FragmentHeader): ReassemblyResult {
        totalFragmentsReceived++
        cleanupExpired()
        
        try {
            val buffer = buffers.getOrPut(header.messageId) {
                ReassemblyBuffer(
                    header.messageId,
                    header.total,
                    header.crc32
                )
            }
            
            // Verify consistency
            if (buffer.totalFragments != header.total) {
                val error = "Fragment count mismatch: expected ${buffer.totalFragments}, got ${header.total}"
                recordFailure(header.messageId, error)
                buffers.remove(header.messageId)
                reassemblyErrors++
                return ReassemblyResult.Error(error)
            }
            
            if (buffer.expectedCrc32 != header.crc32) {
                val error = "CRC32 mismatch: expected ${buffer.expectedCrc32}, got ${header.crc32}"
                recordFailure(header.messageId, error)
                buffers.remove(header.messageId)
                checksumFailures++
                return ReassemblyResult.Error(error)
            }
            
            // Check for duplicate fragment
            if (buffer.fragments.containsKey(header.index)) {
                return ReassemblyResult.Duplicate(header.messageId, header.index)
            }
            
            // Add fragment
            buffer.fragments[header.index] = header.payload
            
            // Check if complete
            if (buffer.isComplete()) {
                buffers.remove(header.messageId)
                val reassembled = buffer.reassemble()
                
                // Validate checksum - Task 38
                if (!buffer.validateChecksum(reassembled)) {
                    val error = "Checksum validation failed after reassembly"
                    recordFailure(header.messageId, error)
                    checksumFailures++
                    
                    // Error recovery: allow retry
                    if (buffer.retryCount < maxRetries) {
                        return ReassemblyResult.RetryNeeded(
                            header.messageId,
                            buffer.retryCount + 1,
                            "Checksum validation failed, retry ${ buffer.retryCount + 1}/$maxRetries"
                        )
                    }
                    
                    return ReassemblyResult.Error(error)
                }
                
                totalMessagesReassembled++
                failedMessages.remove(header.messageId)
                return ReassemblyResult.Success(reassembled)
            }
            
            // Incomplete - return progress
            return ReassemblyResult.Progress(
                header.messageId,
                buffer.fragments.size,
                buffer.totalFragments
            )
        } catch (e: Exception) {
            val error = "Reassembly exception: ${e.message}"
            recordFailure(header.messageId, error)
            buffers.remove(header.messageId)
            reassemblyErrors++
            return ReassemblyResult.Error(error)
        }
    }
    
    /**
     * Record failure for error recovery
     */
    private fun recordFailure(messageId: Int, reason: String) {
        val existing = failedMessages[messageId]
        failedMessages[messageId] = FailureRecord(
            messageId = messageId,
            reason = reason,
            timestamp = System.currentTimeMillis(),
            retryCount = (existing?.retryCount ?: 0) + 1
        )
    }
    
    /**
     * Reassembly result with error handling
     */
    sealed class ReassemblyResult {
        data class Success(val data: ByteArray) : ReassemblyResult()
        data class Progress(val messageId: Int, val received: Int, val total: Int) : ReassemblyResult()
        data class Duplicate(val messageId: Int, val index: Int) : ReassemblyResult()
        data class RetryNeeded(val messageId: Int, val retryCount: Int, val reason: String) : ReassemblyResult()
        data class Error(val message: String) : ReassemblyResult()
    }

    /**
     * Clean up expired buffers - Task 38
     */
    private fun cleanupExpired() {
        val currentTime = System.currentTimeMillis()
        val expiredKeys = buffers.filterValues { it.isExpired(currentTime) }.keys
        
        expiredKeys.forEach { messageId ->
            timeoutFailures++
            recordFailure(messageId, "Reassembly timeout after ${timeoutMs}ms")
            buffers.remove(messageId)
        }
        
        // Clean old failure records (keep for 5 minutes)
        failedMessages.entries.removeAll { (_, record) ->
            (currentTime - record.timestamp) > 300000
        }
    }

    /**
     * Get reassembly stats - Task 38
     */
    fun getStats(): ReassemblyStats {
        cleanupExpired()
        return ReassemblyStats(
            activeBuffers = buffers.size,
            totalFragments = buffers.values.sumOf { it.fragments.size },
            totalMessagesReassembled = totalMessagesReassembled,
            totalFragmentsReceived = totalFragmentsReceived,
            checksumFailures = checksumFailures,
            timeoutFailures = timeoutFailures,
            reassemblyErrors = reassemblyErrors,
            failedMessageCount = failedMessages.size
        )
    }

    data class ReassemblyStats(
        val activeBuffers: Int,
        val totalFragments: Int,
        val totalMessagesReassembled: Long,
        val totalFragmentsReceived: Long,
        val checksumFailures: Long,
        val timeoutFailures: Long,
        val reassemblyErrors: Long,
        val failedMessageCount: Int
    )
    
    /**
     * Get failed messages for error recovery
     */
    fun getFailedMessages(): List<FailureRecord> {
        return failedMessages.values.toList()
    }
    
    /**
     * Reset a failed message for retry
     */
    fun retryFailedMessage(messageId: Int): Boolean {
        failedMessages.remove(messageId)
        buffers.remove(messageId)
        return true
    }
    
    /**
     * Clear all buffers and reset state
     */
    fun clear() {
        buffers.clear()
        failedMessages.clear()
    }
    
    /**
     * Reset metrics
     */
    fun resetMetrics() {
        totalMessagesReassembled = 0
        totalFragmentsReceived = 0
        checksumFailures = 0
        timeoutFailures = 0
        reassemblyErrors = 0
    }
}
