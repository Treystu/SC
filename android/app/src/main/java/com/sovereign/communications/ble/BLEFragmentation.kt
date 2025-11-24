package com.sovereign.communications.ble

import java.nio.ByteBuffer
import java.util.UUID
import java.util.zip.CRC32

/**
 * BLE packet fragmentation for MTU-aware message transmission - Task 37 Enhanced
 * Handles splitting large messages into MTU-sized chunks with dynamic MTU negotiation
 */
class BLEFragmentation(private var mtu: Int = 512) {
    
    // Fragmentation metrics
    private var totalFragmentsSent = 0L
    private var totalBytesSent = 0L
    private var fragmentationErrors = 0L
    
    companion object {
        private const val HEADER_SIZE = 13 // 1 (flags) + 4 (messageId) + 2 (index) + 2 (total) + 4 (CRC32)
        private const val FLAG_FIRST = 0x01
        private const val FLAG_LAST = 0x02
        private const val FLAG_MIDDLE = 0x00
        
        // MTU bounds
        private const val MIN_MTU = 23  // BLE minimum
        private const val MAX_MTU = 517 // BLE maximum
        private const val DEFAULT_MTU = 185 // Conservative default
    }
    
    /**
     * Dynamic MTU negotiation - Task 37
     */
    fun negotiateMtu(requestedMtu: Int): Int {
        val negotiatedMtu = requestedMtu.coerceIn(MIN_MTU, MAX_MTU)
        if (negotiatedMtu != mtu) {
            mtu = negotiatedMtu
        }
        return mtu
    }
    
    /**
     * Get optimal fragment size based on current MTU
     */
    fun getOptimalFragmentSize(): Int {
        // Account for ATT overhead (3 bytes) and our header
        return (mtu - 3 - HEADER_SIZE).coerceAtLeast(1)
    }

    /**
     * Fragment a message into MTU-sized packets with error handling
     */
    fun fragment(messageId: Int, data: ByteArray): FragmentResult {
        return try {
            val maxPayloadSize = getOptimalFragmentSize()
            
            if (maxPayloadSize <= 0) {
                return FragmentResult.Error("Invalid MTU: $mtu, payload size: $maxPayloadSize")
            }
            
            if (data.isEmpty()) {
                return FragmentResult.Error("Cannot fragment empty data")
            }
            
            val totalFragments = (data.size + maxPayloadSize - 1) / maxPayloadSize
            
            if (totalFragments > 65535) {
                return FragmentResult.Error("Message too large: would require $totalFragments fragments")
            }
            
            val fragments = mutableListOf<ByteArray>()
            
            // Calculate CRC32 for entire message
            val crc = calculateCRC32(data)
            
            for (i in 0 until totalFragments) {
                val start = i * maxPayloadSize
                val end = minOf(start + maxPayloadSize, data.size)
                val payload = data.copyOfRange(start, end)
                
                val flag = when {
                    totalFragments == 1 -> FLAG_FIRST or FLAG_LAST
                    i == 0 -> FLAG_FIRST
                    i == totalFragments - 1 -> FLAG_LAST
                    else -> FLAG_MIDDLE
                }
                
                val packet = ByteBuffer.allocate(HEADER_SIZE + payload.size).apply {
                    put(flag.toByte())
                    putInt(messageId)
                    putShort(i.toShort())
                    putShort(totalFragments.toShort())
                    putInt(crc.toInt())
                    put(payload)
                }.array()
                
                fragments.add(packet)
            }
            
            // Update metrics
            totalFragmentsSent += fragments.size
            totalBytesSent += data.size
            
            FragmentResult.Success(fragments, FragmentationMetrics(
                fragmentCount = fragments.size,
                payloadSize = data.size,
                averageFragmentSize = fragments.map { it.size }.average().toInt(),
                overhead = (fragments.sumOf { it.size } - data.size).toFloat() / data.size
            ))
        } catch (e: Exception) {
            fragmentationErrors++
            FragmentResult.Error("Fragmentation failed: ${e.message}")
        }
    }
    
    /**
     * Calculate CRC32 checksum
     */
    private fun calculateCRC32(data: ByteArray): Long {
        val crc32 = CRC32()
        crc32.update(data)
        return crc32.value
    }

    /**
     * Parse fragment header
     */
    data class FragmentHeader(
        val isFirst: Boolean,
        val isLast: Boolean,
        val messageId: Int,
        val index: Int,
        val total: Int,
        val crc32: Long,
        val payload: ByteArray
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false
            other as FragmentHeader
            return messageId == other.messageId && index == other.index
        }

        override fun hashCode(): Int {
            var result = messageId
            result = 31 * result + index
            return result
        }
    }
    
    /**
     * Fragmentation metrics - Task 37
     */
    data class FragmentationMetrics(
        val fragmentCount: Int,
        val payloadSize: Int,
        val averageFragmentSize: Int,
        val overhead: Float
    )
    
    /**
     * Fragment result with error handling
     */
    sealed class FragmentResult {
        data class Success(
            val fragments: List<ByteArray>,
            val metrics: FragmentationMetrics
        ) : FragmentResult()
        
        data class Error(val message: String) : FragmentResult()
    }

    /**
     * Parse a fragment packet with error handling - Task 37
     */
    fun parseFragment(packet: ByteArray): ParseResult {
        return try {
            if (packet.size < HEADER_SIZE) {
                return ParseResult.Error("Packet too small: ${packet.size} bytes")
            }
            
            val buffer = ByteBuffer.wrap(packet)
            
            val flag = buffer.get().toInt()
            val messageId = buffer.getInt()
            val index = buffer.getShort().toInt()
            val total = buffer.getShort().toInt()
            val crc32 = buffer.getInt().toLong() and 0xFFFFFFFF
            
            if (index < 0 || index >= total) {
                return ParseResult.Error("Invalid fragment index: $index/$total")
            }
            
            val payloadSize = packet.size - HEADER_SIZE
            if (payloadSize < 0) {
                return ParseResult.Error("Invalid payload size: $payloadSize")
            }
            
            val payload = ByteArray(payloadSize)
            buffer.get(payload)
            
            ParseResult.Success(FragmentHeader(
                isFirst = (flag and FLAG_FIRST) != 0,
                isLast = (flag and FLAG_LAST) != 0,
                messageId = messageId,
                index = index,
                total = total,
                crc32 = crc32,
                payload = payload
            ))
        } catch (e: Exception) {
            fragmentationErrors++
            ParseResult.Error("Parse failed: ${e.message}")
        }
    }
    
    /**
     * Parse result with error handling
     */
    sealed class ParseResult {
        data class Success(val header: FragmentHeader) : ParseResult()
        data class Error(val message: String) : ParseResult()
    }
    
    /**
     * Get fragmentation statistics - Task 37
     */
    fun getMetrics(): Map<String, Any> {
        return mapOf(
            "mtu" to mtu,
            "optimalFragmentSize" to getOptimalFragmentSize(),
            "totalFragmentsSent" to totalFragmentsSent,
            "totalBytesSent" to totalBytesSent,
            "fragmentationErrors" to fragmentationErrors,
            "averageFragmentsPerMessage" to if (totalFragmentsSent > 0) 
                totalFragmentsSent.toFloat() / (totalBytesSent / getOptimalFragmentSize().coerceAtLeast(1))
                else 0f
        )
    }
    
    /**
     * Reset metrics
     */
    fun resetMetrics() {
        totalFragmentsSent = 0
        totalBytesSent = 0
        fragmentationErrors = 0
    }
}
