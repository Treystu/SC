package com.sovereign.communications.ble

import java.nio.ByteBuffer
import java.util.UUID

/**
 * BLE packet fragmentation for MTU-aware message transmission
 * Handles splitting large messages into MTU-sized chunks
 */
class BLEFragmentation(private val mtu: Int = 512) {
    
    companion object {
        private const val HEADER_SIZE = 9 // 1 (flags) + 4 (messageId) + 2 (index) + 2 (total)
        private const val FLAG_FIRST = 0x01
        private const val FLAG_LAST = 0x02
        private const val FLAG_MIDDLE = 0x00
    }

    /**
     * Fragment a message into MTU-sized packets
     */
    fun fragment(messageId: Int, data: ByteArray): List<ByteArray> {
        val maxPayloadSize = mtu - HEADER_SIZE
        val totalFragments = (data.size + maxPayloadSize - 1) / maxPayloadSize
        
        val fragments = mutableListOf<ByteArray>()
        
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
                put(payload)
            }.array()
            
            fragments.add(packet)
        }
        
        return fragments
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
        val payload: ByteArray
    )

    /**
     * Parse a fragment packet
     */
    fun parseFragment(packet: ByteArray): FragmentHeader {
        val buffer = ByteBuffer.wrap(packet)
        
        val flag = buffer.get().toInt()
        val messageId = buffer.getInt()
        val index = buffer.getShort().toInt()
        val total = buffer.getShort().toInt()
        
        val payloadSize = packet.size - HEADER_SIZE
        val payload = ByteArray(payloadSize)
        buffer.get(payload)
        
        return FragmentHeader(
            isFirst = (flag and FLAG_FIRST) != 0,
            isLast = (flag and FLAG_LAST) != 0,
            messageId = messageId,
            index = index,
            total = total,
            payload = payload
        )
    }
}
