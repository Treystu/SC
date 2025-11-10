package com.sovereign.communications.ble

import java.util.concurrent.ConcurrentHashMap

/**
 * BLE packet reassembly
 * Handles reassembling fragmented messages
 */
class BLEReassembly(private val timeoutMs: Long = 30000) {
    
    private data class ReassemblyBuffer(
        val messageId: Int,
        val totalFragments: Int,
        val fragments: MutableMap<Int, ByteArray> = mutableMapOf(),
        val timestamp: Long = System.currentTimeMillis()
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
    }

    private val buffers = ConcurrentHashMap<Int, ReassemblyBuffer>()

    /**
     * Add a fragment and return complete message if ready
     */
    fun addFragment(header: BLEFragmentation.FragmentHeader): ByteArray? {
        cleanupExpired()
        
        val buffer = buffers.getOrPut(header.messageId) {
            ReassemblyBuffer(header.messageId, header.total)
        }
        
        // Verify consistency
        if (buffer.totalFragments != header.total) {
            buffers.remove(header.messageId)
            return null
        }
        
        // Add fragment
        buffer.fragments[header.index] = header.payload
        
        // Check if complete
        if (buffer.isComplete()) {
            buffers.remove(header.messageId)
            return buffer.reassemble()
        }
        
        return null
    }

    /**
     * Clean up expired buffers
     */
    private fun cleanupExpired() {
        val currentTime = System.currentTimeMillis()
        val expiredKeys = buffers.filterValues { it.isExpired(currentTime) }.keys
        expiredKeys.forEach { buffers.remove(it) }
    }

    /**
     * Get reassembly stats
     */
    fun getStats(): ReassemblyStats {
        cleanupExpired()
        return ReassemblyStats(
            activeBuffers = buffers.size,
            totalFragments = buffers.values.sumOf { it.fragments.size }
        )
    }

    data class ReassemblyStats(
        val activeBuffers: Int,
        val totalFragments: Int
    )
}
