package com.sovereign.communications.service

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.sovereign.communications.ble.BLEDeviceDiscovery
import com.sovereign.communications.ble.BLEGATTClient
import com.sovereign.communications.ble.BLEGATTServer
import com.sovereign.communications.ble.BLEMessageRouting
import com.sovereign.communications.ble.BLEMultiHopRelay
import com.sovereign.communications.ble.BLEStoreAndForward
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.adapter.AndroidPersistenceAdapter
import com.sovereign.communications.data.network.RoomClient
import com.sovereign.communications.util.RateLimiter
import com.sovereign.communications.webrtc.WebRTCManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages the mesh network, including peer connections, message routing, and data persistence.
 *
 * Unified with @sc/core architecture:
 * - Uses AndroidPersistenceAdapter for message queue persistence
 * - Consistent with Web and iOS implementations
 * - Binary-safe message handling
 * - Unified Peer ID (32-byte Hex String)
 */
class MeshNetworkManager(
    private val context: Context,
    private val database: SCDatabase,
) {
    private val gattServer = BLEGATTServer(context)
    private val storeAndForward = BLEStoreAndForward(context)
    private val deviceDiscovery = BLEDeviceDiscovery(context)
    private val multiHopRelay = BLEMultiHopRelay()
    private val webRTCManager = WebRTCManager(context)
    private val roomClient = RoomClient()

    // Unified persistence adapter (matches Web/iOS)
    private val persistenceAdapter = AndroidPersistenceAdapter(context, database)

    private val messageRouting = BLEMessageRouting()

    private val connectedClients = ConcurrentHashMap<String, BLEGATTClient>() // peerId -> Client
    private val connectedDevices = ConcurrentHashMap<String, BluetoothDevice>() // peerId -> Device
    private val connectedLocalPeers = ConcurrentHashMap<String, Boolean>() // peerId -> Connected
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val rateLimiter = RateLimiter(60, 1000) // 60 messages per minute, 1000 per hour

    // Unified ID: Get from Application (Identity Layer)
    private val localPeerId: String
        get() =
            com.sovereign.communications.SCApplication.instance.localPeerId
                ?: throw IllegalStateException("Local Peer ID not initialized")

    private val coreBridge =
        com.sovereign.communications.core.CoreBridge
            .getInstance(context)

    private val localDiscovery =
        LocalDiscoveryManager(
            context,
            scope,
            onPeerConnected = { peerId ->
                connectedLocalPeers[peerId] = true
                Log.d(TAG, "Local peer connected: $peerId")
            },
            onMessageReceived = { peerId, data ->
                scope.launch {
                    coreBridge.handleIncomingPacket(peerId, data)
                }
            },
        )

    private var signalingJob: kotlinx.coroutines.Job? = null

    companion object {
        private const val TAG = "MeshNetworkManager"

        // Helper for hex conversion
        fun bytesToHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * Starts the mesh network.
     */
    fun start() {
        Log.d(TAG, "Starting MeshNetworkManager with ID: $localPeerId")

        // Setup Routing Callbacks
        messageRouting.onBroadcast = { packet ->
            connectedClients.values.forEach { client ->
                try {
                    client.sendData(packet)
                } catch (e: Exception) {
                    Log.e(TAG, "Broadcast failed", e)
                }
            }
        }

        messageRouting.onSendDirect = { nextHop, packet ->
            val client = connectedClients[nextHop]
            if (client != null) {
                try {
                    client.sendData(packet)
                    true
                } catch (e: Exception) {
                    false
                }
            } else {
                false
            }
        }

        // Start GATT Server for incoming connections
        gattServer.start()

        // Start Local Discovery
        localDiscovery.start()

        // Initialize CoreBridge
        scope.launch {
            coreBridge.initialize().getOrThrow()
            coreBridge.initMeshNetwork(localPeerId).getOrThrow()

            // Setup CoreBridge hooks
            coreBridge.outboundTransportCallback = { peerId, data ->
                sendDirectly(peerId, data)
            }
        }

        // Start WebRTC Manager
        webRTCManager.initialize()
        webRTCManager.onMessageReceived = { peerId, data ->
            scope.launch {
                coreBridge.handleIncomingPacket(peerId, data)
            }
        }

        // Start device discovery
        deviceDiscovery.startScanning { device ->
            onPeerConnected(device.address, device)
        }

        // Start Signaling Loop (Global Bootstrap)
        startSignalingLoop()

        // Connect to Bootstrap Peers
        connectToBootstrapPeers()

        Log.d(TAG, "MeshNetworkManager started")
    }

    /**
     * Stops the mesh network.
     */
    fun stop() {
        Log.d(TAG, "Stopping MeshNetworkManager")

        signalingJob?.cancel()
        gattServer.stop()
        localDiscovery.stop()
        connectedLocalPeers.clear()
        storeAndForward.stopForwarding()
        webRTCManager.cleanup()

        connectedClients.values.forEach { it.disconnect() }
        connectedClients.clear()
        connectedDevices.clear()

        Log.d(TAG, "MeshNetworkManager stopped")
    }

    private fun startSignalingLoop() {
        signalingJob =
            scope.launch {
                // Initial join
                roomClient.join(localPeerId)

                while (kotlinx.coroutines.isActive) {
                    try {
                        val (signals, peers) = roomClient.poll(localPeerId)

                        // Handle Signals
                        signals.forEach { signal ->
                            handleSignal(signal)
                        }

                        // Handle discovered peers (opportunistic connection)
                        peers.forEach { peer ->
                            if (peer.id != localPeerId && !isPeerConnected(peer.id)) {
                                // Limit automatic outbound connections to avoid flooding
                                // For bootstrap, we try to connect to everyone in the room that we don't have a connection to
                                if (!webRTCManager.connectionStates.value.containsKey(peer.id)) {
                                    initiateWebRTCConnection(peer.id)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Signaling poll failed", e)
                    }

                    // Poll interval (adaptable, e.g. 5s)
                    kotlinx.coroutines.delay(5000)
                }
            }
    }

    private fun handleSignal(signal: com.sovereign.communications.data.network.RoomClient.Signal) {
        scope.launch {
            Log.d(TAG, "Received signal from ${signal.from}: ${signal.type}")
            when (signal.type) {
                "offer" -> {
                    webRTCManager.handleRemoteOffer(signal.from, signal.payload) { answerSdp ->
                        scope.launch {
                            roomClient.sendSignal(localPeerId, signal.from, "answer", answerSdp)
                        }
                    }
                }

                "answer" -> {
                    webRTCManager.handleRemoteAnswer(signal.from, signal.payload)
                }

                "candidate" -> {
                    try {
                        val json = org.json.JSONObject(signal.payload)
                        val candidate =
                            org.webrtc.IceCandidate(
                                json.getString("sdpMid"),
                                json.getInt("sdpMLineIndex"),
                                json.getString("candidate"),
                            )
                        webRTCManager.addIceCandidate(signal.from, candidate)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse candidate", e)
                    }
                }
            }
        }
    }

    private fun initiateWebRTCConnection(peerId: String) {
        Log.d(TAG, "Initiating WebRTC connection to $peerId")
        webRTCManager.createPeerConnection(peerId) { offerSdp ->
            // Send Offer via Signaling
            scope.launch {
                roomClient.sendSignal(localPeerId, peerId, "offer", offerSdp)
            }
        }
    }

    private fun connectToBootstrapPeers() {
        val prefs = context.getSharedPreferences("mesh_bootstrap", Context.MODE_PRIVATE)
        val jsonStr = prefs.getString("bootstrap_peers", null) ?: return

        try {
            val json = org.json.JSONObject(jsonStr)
            val peers = json.optJSONArray("p") ?: return

            Log.d(TAG, "Found ${peers.length()} bootstrap peers")
            for (i in 0 until peers.length()) {
                val p = peers.getJSONObject(i)
                val peerId = p.getString("i")

                if (peerId != localPeerId) {
                    initiateWebRTCConnection(peerId)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse bootstrap peers", e)
        }
    }

    /**
     * Returns the current number of connected peers.
     */
    fun getConnectedPeerCount(): Int =
        connectedClients.size +
            webRTCManager.connectionStates.value.count {
                it.value == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED
            } + connectedLocalPeers.size

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
        return (blePeers + webRTCPeers + connectedLocalPeers.keys().toList()).distinct()
    }

    /**
     * Sends a message to a recipient in the mesh network.
     */
    fun sendMessage(
        recipientId: String,
        message: String,
    ): Boolean {
        scope.launch {
            coreBridge.sendTextMessage(recipientId, message)
        }
        return true
    }

    private fun isPeerConnected(peerId: String): Boolean =
        connectedClients.containsKey(peerId) ||
            webRTCManager.connectionStates.value[peerId] == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED ||
            connectedLocalPeers.containsKey(peerId)

    fun sendDirectly(
        peerId: String,
        payload: ByteArray,
    ): Boolean {
        // Try WebRTC first (higher bandwidth)
        if (webRTCManager.connectionStates.value[peerId] == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED) {
            val success = webRTCManager.sendData(peerId, payload)
            if (success) return true
        }

        // Try Local Network
        if (connectedLocalPeers.containsKey(peerId)) {
            localDiscovery.send(peerId, payload)
            return true
        }

        // Try Direct BLE
        val client = connectedClients[peerId]
        if (client != null) {
            try {
                client.sendData(payload)
                messageRouting.updateRouteMetrics(peerId, true)
                return true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send data to $peerId", e)
                messageRouting.updateRouteMetrics(peerId, false)
                return false
            }
        }

        // Try Multi-Hop Route
        val route = messageRouting.getRoute(peerId)
        if (route != null) {
            Log.d(TAG, "Routing message to $peerId via ${route.nextHop}")
            // Recursive call to send to next hop
            // Note: We send the original payload. The intermediate node must handle routing.
            // If the protocol requires wrapping, it should be done here.
            // Assuming sc-core handles message addressing in the payload.
            return sendDirectly(route.nextHop, payload)
        }

        Log.w(TAG, "No transport or route available for $peerId")
        return false
    }

    private fun processApplicationMessage(jsonString: String) {
        // Parse message content from JS Core
        scope.launch(Dispatchers.IO) {
            try {
                Log.d(TAG, "Received application message from Core: $jsonString")
                val json = org.json.JSONObject(jsonString)
                val id = json.getString("id")
                val senderId = json.getString("senderId")
                val content = json.getString("content")
                val timestamp = json.getLong("timestamp")

                val entity =
                    com.sovereign.communications.data.entity.MessageEntity(
                        id = id,
                        conversationId = senderId, // 1:1 map to sender
                        content = content,
                        senderId = senderId,
                        recipientId = localPeerId,
                        timestamp = timestamp,
                        status = com.sovereign.communications.data.entity.MessageStatus.DELIVERED,
                        type = com.sovereign.communications.data.entity.MessageType.TEXT,
                        timestampReceived = System.currentTimeMillis(),
                    )

                database.messageDao().insert(entity)
                Log.d(TAG, "Message saved: $id")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to process app message", e)
            }
        }
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
        }
    }

    fun onPeerDisconnected(peerId: String) {
        connectedClients.remove(peerId)?.disconnect()
        connectedDevices.remove(peerId)
        Log.d(TAG, "Peer disconnected: $peerId")
    }

    private fun bytesToHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
}

class LocalDiscoveryManager(
    private val context: Context,
    private val scope: CoroutineScope,
    private val onPeerConnected: (String) -> Unit,
    private val onMessageReceived: (String, ByteArray) -> Unit,
) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val serviceType = "_sc._tcp."
    private val serviceName = "SC_Node_${java.util.UUID.randomUUID().toString().substring(0, 6)}"

    private val serverSocket = ServerSocket(0)
    private val localPort = serverSocket.localPort

    private val connections = ConcurrentHashMap<String, Socket>()
    private var isRunning = false

    fun start() {
        if (isRunning) return
        isRunning = true
        startServer()
        registerService()
        discoverServices()
    }

    fun stop() {
        isRunning = false
        try {
            nsdManager.stopServiceDiscovery(discoveryListener)
            nsdManager.unregisterService(registrationListener)
            serverSocket.close()
            connections.values.forEach { it.close() }
            connections.clear()
        } catch (e: Exception) {
            Log.e("LocalDiscovery", "Error stopping", e)
        }
    }

    fun send(
        peerId: String,
        data: ByteArray,
    ) {
        val socket = connections[peerId] ?: return
        scope.launch(Dispatchers.IO) {
            try {
                val output = DataOutputStream(socket.getOutputStream())
                output.writeInt(data.size)
                output.write(data)
                output.flush()
            } catch (e: Exception) {
                Log.e("LocalDiscovery", "Send failed", e)
                socket.close()
                connections.remove(peerId)
            }
        }
    }

    private fun startServer() {
        scope.launch(Dispatchers.IO) {
            while (isRunning) {
                try {
                    val socket = serverSocket.accept()
                    handleSocket(socket)
                } catch (e: Exception) {
                    if (isRunning) Log.e("LocalDiscovery", "Server accept error", e)
                }
            }
        }
    }

    private fun handleSocket(socket: Socket) {
        scope.launch(Dispatchers.IO) {
            try {
                val input = DataInputStream(socket.getInputStream())
                var peerId: String? = null

                while (true) {
                    val length = input.readInt()
                    val buffer = ByteArray(length)
                    input.readFully(buffer)

                    // Unified ID Extraction: Offset 12, Length 32 (Ed25519 Public Key)
                    if (peerId == null) {
                        // Ensure buffer is large enough for version(1)+type(1)+ttl(1)+reserved(1)+timestamp(8)+senderId(32) = 44 bytes
                        if (buffer.size >= 44) {
                            val peerIdBytes = buffer.copyOfRange(12, 44) // Offset 12, length 32
                            peerId = bytesToHex(peerIdBytes)
                            connections[peerId] = socket
                            onPeerConnected(peerId)
                        }
                    }

                    peerId?.let { onMessageReceived(it, buffer) }
                }
            } catch (e: Exception) {
                // Socket closed
                socket.close()
            }
        }
    }

    private fun bytesToHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    private val registrationListener =
        object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(NsdServiceInfo: NsdServiceInfo) {
                Log.d("LocalDiscovery", "Service registered: ${NsdServiceInfo.serviceName}")
            }

            override fun onRegistrationFailed(
                serviceInfo: NsdServiceInfo,
                errorCode: Int,
            ) {}

            override fun onServiceUnregistered(arg0: NsdServiceInfo) {}

            override fun onUnregistrationFailed(
                serviceInfo: NsdServiceInfo,
                errorCode: Int,
            ) {}
        }

    private fun registerService() {
        val serviceInfo =
            NsdServiceInfo().apply {
                serviceName = this@LocalDiscoveryManager.serviceName
                serviceType = this@LocalDiscoveryManager.serviceType
                port = localPort
            }
        nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener)
    }

    private val discoveryListener =
        object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {}

            override fun onServiceFound(service: NsdServiceInfo) {
                if (service.serviceType == serviceType && !service.serviceName.contains(serviceName)) {
                    nsdManager.resolveService(
                        service,
                        object : NsdManager.ResolveListener {
                            override fun onResolveFailed(
                                serviceInfo: NsdServiceInfo,
                                errorCode: Int,
                            ) {}

                            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                                connectToService(serviceInfo)
                            }
                        },
                    )
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {}

            override fun onDiscoveryStopped(serviceType: String) {}

            override fun onStartDiscoveryFailed(
                serviceType: String,
                errorCode: Int,
            ) {}

            override fun onStopDiscoveryFailed(
                serviceType: String,
                errorCode: Int,
            ) {}
        }

    private fun discoverServices() {
        nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    private fun connectToService(serviceInfo: NsdServiceInfo) {
        scope.launch(Dispatchers.IO) {
            try {
                val socket = Socket(serviceInfo.host, serviceInfo.port)
                handleSocket(socket)
            } catch (e: Exception) {
                Log.e("LocalDiscovery", "Connect failed", e)
            }
        }
    }
}
