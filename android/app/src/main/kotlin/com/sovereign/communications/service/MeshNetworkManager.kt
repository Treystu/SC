package com.sovereign.communications.service

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.util.Log
import com.sovereign.communications.ble.BLEDeviceDiscovery
import com.sovereign.communications.ble.BLEGATTClient
import com.sovereign.communications.ble.BLEGATTServer
import com.sovereign.communications.ble.BLEMultiHopRelay
import com.sovereign.communications.ble.BLEStoreAndForward
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.util.RateLimiter
import com.sovereign.communications.webrtc.WebRTCManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages the mesh network, including peer connections, message routing, and data persistence.
 */
class MeshNetworkManager(
    private val context: Context,
    private val database: SCDatabase,
) {
    private val gattServer = BLEGATTServer(context)
    private val storeAndForward = BLEStoreAndForward(context)
    private val deviceDiscovery = BLEDeviceDiscovery()
    private val multiHopRelay = BLEMultiHopRelay()
    private val webRTCManager = WebRTCManager(context)

    private val connectedClients = ConcurrentHashMap<String, BLEGATTClient>() // peerId -> Client
    private val connectedDevices = ConcurrentHashMap<String, BluetoothDevice>() // peerId -> Device
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val rateLimiter = RateLimiter(60, 1000) // 60 messages per minute, 1000 per hour

    companion object {
        private const val TAG = "MeshNetworkManager"
    }

    /**
     * Starts the mesh network.
     * This includes initializing the identity, starting peer discovery (BLE, WebRTC),
     * and setting up message handlers.
     */
    fun start() {
        Log.d(TAG, "Starting MeshNetworkManager")

        // Start GATT Server for incoming connections
        gattServer.start()

        // Start WebRTC Manager
        webRTCManager.initialize()
        webRTCManager.onMessageReceived = { peerId, data ->
            handleIncomingMessage(peerId, data)
        }

        // Start Store-and-Forward service
        storeAndForward.startForwarding(
            isPeerReachable = { peerId -> isPeerConnected(peerId) },
            sendMessage = { queuedMessage ->
                sendDirectly(queuedMessage.destinationId, queuedMessage.payload)
            },
        )

        // Start device discovery
        deviceDiscovery.startScanning { device ->
            onPeerConnected(device.address, device)
        }

        Log.d(TAG, "MeshNetworkManager started")
    }

    /**
     * Stops the mesh network.
     * This includes closing all peer connections, stopping discovery services,
     * and saving any necessary state.
     */
    fun stop() {
        Log.d(TAG, "Stopping MeshNetworkManager")

        gattServer.stop()
        storeAndForward.stopForwarding()
        webRTCManager.cleanup()

        connectedClients.values.forEach { it.disconnect() }
        connectedClients.clear()
        connectedDevices.clear()

        Log.d(TAG, "MeshNetworkManager stopped")
    }

    /**
     * Returns the current number of connected peers.
     */
    fun getConnectedPeerCount(): Int =
        connectedClients.size +
            webRTCManager.connectionStates.value.count {
                it.value == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED
            }

    /**
     * Returns a list of connected peer IDs.
     */
    fun getConnectedPeers(): List<String> {
        val blePeers = connectedClients.keys().toList()
        val webRTCPeers =
            webRTCManager.connectionStates.value
                .filter { it.value == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED }
                .keys
                .toList()
        return (blePeers + webRTCPeers).distinct()
    }

    /**
     * Sends a message to a recipient in the mesh network.
     */
    fun sendMessage(
        recipientId: String,
        message: String,
    ) {
        if (!rateLimiter.tryAcquire(recipientId)) {
            Log.w(TAG, "Rate limit exceeded for $recipientId")
            return
        }

        scope.launch {
            val payload = message.toByteArray()

            if (isPeerConnected(recipientId)) {
                val success = sendDirectly(recipientId, payload)
                if (!success) {
                    // Fallback to store and forward if direct send fails
                    queueMessage(recipientId, payload)
                }
            } else {
                // Peer not connected, queue it
                queueMessage(recipientId, payload)
            }
        }
    }

    private fun isPeerConnected(peerId: String): Boolean =
        connectedClients.containsKey(peerId) ||
            webRTCManager.connectionStates.value[peerId] == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED

    private fun sendDirectly(
        peerId: String,
        payload: ByteArray,
    ): Boolean {
        // Try WebRTC first (higher bandwidth)
        if (webRTCManager.connectionStates.value[peerId] == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED) {
            val success = webRTCManager.sendData(peerId, payload)
            if (success) return true
        }

        // Fallback to BLE
        val client = connectedClients[peerId]
        return if (client != null) {
            try {
                client.sendData(payload)
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send data to $peerId", e)
                false
            }
        } else {
            // Try multi-hop relay via BLE
            multiHopRelay.relay(payload, peerId, connectedClients.values.toList())
            true // Assume relay will handle it
        }
    }

    private fun handleIncomingMessage(
        peerId: String,
        data: ByteArray,
    ) {
        // Process incoming message
        try {
            // Parse message content (assuming UTF-8 string for now)
            // In production, this would parse the binary protocol format
            val messageContent = String(data, Charsets.UTF_8)
            Log.d(TAG, "Received message from $peerId: $messageContent")
            
            // Store in database
            scope.launch {
                try {
                    val messageEntity = com.sovereign.communications.data.entity.MessageEntity(
                        id = java.util.UUID.randomUUID().toString(),
                        conversationId = peerId,
                        content = messageContent,
                        senderId = peerId,
                        recipientId = com.sovereign.communications.SCApplication.instance.localPeerId ?: "me",
                        timestamp = System.currentTimeMillis(),
                        status = com.sovereign.communications.data.entity.MessageStatus.RECEIVED,
                        type = com.sovereign.communications.data.entity.MessageType.TEXT
                    )
                    
                    database.messageDao().insert(messageEntity)
                    Log.d(TAG, "Message from $peerId saved to database")
                    
                    // Update conversation timestamp
                    val conversation = database.conversationDao().getConversation(peerId)
                    if (conversation != null) {
                        database.conversationDao().insert(
                            conversation.copy(
                                lastMessageTimestamp = System.currentTimeMillis(),
                                unreadCount = conversation.unreadCount + 1
                            )
                        )
                    } else {
                        // Create new conversation if it doesn't exist
                        database.conversationDao().insert(
                            com.sovereign.communications.data.entity.ConversationEntity(
                                id = peerId,
                                contactId = peerId,
                                lastMessageTimestamp = System.currentTimeMillis(),
                                unreadCount = 1,
                                createdAt = System.currentTimeMillis()
                            )
                        )
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to save incoming message to database", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to process incoming message", e)
        }
    }

    private fun queueMessage(
        recipientId: String,
        payload: ByteArray,
    ) {
        Log.d(TAG, "Queuing message for $recipientId")
        val id =
            java.util.UUID
                .randomUUID()
                .toString()
        storeAndForward.storeMessage(
            id = id,
            destinationId = recipientId,
            payload = payload,
            priority = 1, // Default priority
            ttl = 86400, // 24 hours TTL
        )
    }

    /**
     * Called when a new peer is discovered/connected via BLE
     */
    fun onPeerConnected(
        peerId: String,
        device: BluetoothDevice,
    ) {
        if (!connectedClients.containsKey(peerId)) {
            val client = BLEGATTClient(context)
            client.connect(device)
            connectedClients[peerId] = client
            connectedDevices[peerId] = device
            Log.d(TAG, "Peer connected: $peerId")

            // Trigger retry of queued messages for this peer
            // The StoreAndForward loop will pick this up automatically via isPeerReachable check

            // Initiate WebRTC upgrade if possible
            // webRTCManager.createPeerConnection(peerId) { offer -> ... }
        }
    }

    /**
     * Called when a peer disconnects
     */
    fun onPeerDisconnected(peerId: String) {
        connectedClients.remove(peerId)?.disconnect()
        connectedDevices.remove(peerId)
        Log.d(TAG, "Peer disconnected: $peerId")
    }
}
