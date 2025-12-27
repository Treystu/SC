package com.sovereign.communications.ble

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * BLE Message Routing - Handles message forwarding in the mesh network
 */
class BLEMessageRouting(
    private val gattServer: BLEGATTServer,
    private val gattClient: BLEGATTClient
) {
    private val messageHistory = mutableSetOf<String>() // SHA-256 hashes to prevent loops
    private val scope = CoroutineScope(Dispatchers.IO)

    companion object {
        private const val TAG = "BLEMessageRouting"
        private const val MAX_HOPS = 5
    }

    /**
     * Route a message through the BLE mesh network
     */
    fun routeMessage(message: ByteArray, ttl: Int = MAX_HOPS) {
        if (ttl <= 0) {
            Log.d(TAG, "TTL expired, dropping message")
            return
        }

        val messageHash = message.contentHashCode().toString()
        if (messageHistory.contains(messageHash)) {
            Log.d(TAG, "Message already seen, dropping to prevent loop")
            return
        }

        messageHistory.add(messageHash)

        // Clean up old messages periodically
        if (messageHistory.size > 1000) {
            messageHistory.clear()
        }

        scope.launch {
            // Broadcast to all connected BLE devices
            val broadcastSuccess = gattServer.broadcastMessage(message)
            if (broadcastSuccess) {
                Log.d(TAG, "Message broadcasted to ${gattServer.getConnectedDevicesCount()} BLE devices")
            }

            // TODO: Implement multi-hop routing through connected clients
            // This would require maintaining a routing table of known peers
        }
    }

    /**
     * Handle incoming message from BLE
     */
    fun handleIncomingMessage(message: ByteArray) {
        Log.d(TAG, "Handling incoming BLE message: ${message.size} bytes")
        // Process the message (decrypt, validate, etc.)
        // Then potentially re-route it
        routeMessage(message, MAX_HOPS - 1)
    }

    /**
     * Clear message history (for cleanup)
     */
    fun clearHistory() {
        messageHistory.clear()
    }
}