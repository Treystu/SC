package com.sovereign.communications.service

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import com.sovereign.communications.ble.BLEDeviceDiscovery
import com.sovereign.communications.ble.BLEGATTClient
import com.sovereign.communications.ble.BLEGATTServer
import com.sovereign.communications.ble.BLEMultiHopRelay
import com.sovereign.communications.ble.BLEStoreAndForward
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.adapter.AndroidPersistenceAdapter
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
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages the mesh network, including peer connections, message routing, and data persistence.
 *
 * Unified with @sc/core architecture:
 * - Uses AndroidPersistenceAdapter for message queue persistence
 * - Consistent with Web and iOS implementations
 * - Binary-safe message handling
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

    // Unified persistence adapter (matches Web/iOS)
    private val persistenceAdapter = AndroidPersistenceAdapter(context, database)

    private val connectedClients = ConcurrentHashMap<String, BLEGATTClient>() // peerId -> Client
    private val connectedDevices = ConcurrentHashMap<String, BluetoothDevice>() // peerId -> Device
    private val connectedLocalPeers = ConcurrentHashMap<String, Boolean>() // peerId -> Connected
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val rateLimiter = RateLimiter(60, 1000) // 60 messages per minute, 1000 per hour

    private val jsBridge = JSBridge(context)

    private val localDiscovery =
        LocalDiscoveryManager(
            context,
            scope,
            onPeerConnected = { peerId ->
                connectedLocalPeers[peerId] = true
                Log.d(TAG, "Local peer connected: $peerId")
            },
            onMessageReceived = { peerId, data ->
                jsBridge.handleIncomingPacket(data, peerId)
            },
        )

    companion object {
        private const val TAG = "MeshNetworkManager"
    }

    /**
     * Starts the mesh network.
     */
    fun start() {
        Log.d(TAG, "Starting MeshNetworkManager")

        // Start GATT Server for incoming connections
        gattServer.start()

        // Start Local Discovery
        localDiscovery.start()

        // Start WebRTC Manager
        webRTCManager.initialize()
        webRTCManager.onMessageReceived = { peerId, data ->
            jsBridge.handleIncomingPacket(data, peerId)
        }

        // Setup JS Bridge hooks
        jsBridge.outboundCallback = { peerId, data ->
            sendDirectly(peerId, data)
        }

        jsBridge.applicationMessageCallback = { jsonString ->
            processApplicationMessage(jsonString)
        }

        // Start device discovery
        deviceDiscovery.startScanning { device ->
            onPeerConnected(device.address, device)
        }

        Log.d(TAG, "MeshNetworkManager started")
    }

    /**
     * Stops the mesh network.
     */
    fun stop() {
        Log.d(TAG, "Stopping MeshNetworkManager")

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
    ) {
        jsBridge.sendMessage(recipientId, message)
    }

    private fun isPeerConnected(peerId: String): Boolean =
        connectedClients.containsKey(peerId) ||
            webRTCManager.connectionStates.value[peerId] == org.webrtc.PeerConnection.PeerConnectionState.CONNECTED ||
            connectedLocalPeers.containsKey(peerId)

    private fun sendDirectly(
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
            // Async send, assume success
            return true
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
            Log.w(TAG, "No transport available for $peerId")
            false
        }
    }

    private fun processApplicationMessage(jsonString: String) {
        // Parse message content from JS Core
        try {
            // In a real impl, parse JSON from JS Core
            // For now assume simple structure
            // val jsonObj = JSONObject(jsonString)
            // val content = jsonObj.getString("payload")
            // val sender = jsonObj.getString("senderId") // embedded in header?

            // Since JSBridge is mocking checks, we can't fully implement this without the JSON library behaving
            Log.d(TAG, "Received application message from Core: $jsonString")

            // Store to DB (simplified)
            // ... DB logic ...
        } catch (e: Exception) {
            Log.e(TAG, "Failed to process app message", e)
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

            // Inform JS Bridge?
            // In a full impl, we might want to tell JS Core "New neighbor found"
        }
    }

    fun onPeerDisconnected(peerId: String) {
        connectedClients.remove(peerId)?.disconnect()
        connectedDevices.remove(peerId)
        Log.d(TAG, "Peer disconnected: $peerId")
    }
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

                    if (peerId == null) {
                        // First packet - extract Header to identify Peer
                        if (buffer.size >= 43) {
                            val peerIdBytes = buffer.copyOfRange(11, 43)
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
