package com.sovereign.communications.sharing

import android.content.Context
import android.util.Log
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import com.sovereign.communications.sharing.models.Invite
import com.sovereign.communications.sharing.models.SharePayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * NearbyShareManager - Handles Google Nearby Connections for offline device-to-device sharing
 * Allows discovering and connecting to nearby devices without internet
 */
class NearbyShareManager(private val context: Context) {
    
    private val connectionsClient: ConnectionsClient = Nearby.getConnectionsClient(context)
    
    private val _discoveredDevices = MutableStateFlow<List<DiscoveredDevice>>(emptyList())
    val discoveredDevices: StateFlow<List<DiscoveredDevice>> = _discoveredDevices.asStateFlow()
    
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Idle)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private var currentInvite: Invite? = null
    private var onInviteReceived: ((Invite) -> Unit)? = null
    
    companion object {
        private const val TAG = "NearbyShareManager"
        private const val SERVICE_ID = "com.sovereign.communications"
        private const val STRATEGY = Strategy.P2P_CLUSTER
    }
    
    data class DiscoveredDevice(
        val endpointId: String,
        val name: String,
        val distance: Int = 0
    )
    
    sealed class ConnectionState {
        object Idle : ConnectionState()
        object Advertising : ConnectionState()
        object Discovering : ConnectionState()
        data class Connected(val endpointId: String, val name: String) : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }
    
    /**
     * Start advertising this device for others to discover
     * Makes this device visible to nearby SC users
     */
    fun startAdvertising(invite: Invite, userName: String = "SC User") {
        currentInvite = invite
        
        val advertisingOptions = AdvertisingOptions.Builder()
            .setStrategy(STRATEGY)
            .build()
        
        connectionsClient.startAdvertising(
            userName,
            SERVICE_ID,
            connectionLifecycleCallback,
            advertisingOptions
        )
            .addOnSuccessListener {
                Log.d(TAG, "Advertising started")
                _connectionState.value = ConnectionState.Advertising
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to start advertising", e)
                _connectionState.value = ConnectionState.Error(e.message ?: "Failed to advertise")
            }
    }
    
    /**
     * Stop advertising this device
     */
    fun stopAdvertising() {
        connectionsClient.stopAdvertising()
        if (_connectionState.value is ConnectionState.Advertising) {
            _connectionState.value = ConnectionState.Idle
        }
    }
    
    /**
     * Start discovering nearby devices
     */
    fun startDiscovery(onInviteReceivedCallback: (Invite) -> Unit) {
        onInviteReceived = onInviteReceivedCallback
        
        val discoveryOptions = DiscoveryOptions.Builder()
            .setStrategy(STRATEGY)
            .build()
        
        connectionsClient.startDiscovery(
            SERVICE_ID,
            endpointDiscoveryCallback,
            discoveryOptions
        )
            .addOnSuccessListener {
                Log.d(TAG, "Discovery started")
                _connectionState.value = ConnectionState.Discovering
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to start discovery", e)
                _connectionState.value = ConnectionState.Error(e.message ?: "Failed to discover")
            }
    }
    
    /**
     * Stop discovering devices
     */
    fun stopDiscovery() {
        connectionsClient.stopDiscovery()
        _discoveredDevices.value = emptyList()
        if (_connectionState.value is ConnectionState.Discovering) {
            _connectionState.value = ConnectionState.Idle
        }
    }
    
    /**
     * Connect to a discovered device
     */
    fun connectToDevice(endpointId: String, deviceName: String) {
        connectionsClient.requestConnection(
            "SC User", // Could be user's display name
            endpointId,
            connectionLifecycleCallback
        )
            .addOnSuccessListener {
                Log.d(TAG, "Connection requested to $deviceName")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to request connection", e)
                _connectionState.value = ConnectionState.Error(e.message ?: "Connection failed")
            }
    }
    
    /**
     * Disconnect from all endpoints
     */
    fun disconnectAll() {
        connectionsClient.stopAllEndpoints()
        _connectionState.value = ConnectionState.Idle
        _discoveredDevices.value = emptyList()
    }
    
    /**
     * Callback for endpoint discovery
     */
    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            Log.d(TAG, "Endpoint found: ${info.endpointName}")
            
            val device = DiscoveredDevice(
                endpointId = endpointId,
                name = info.endpointName
            )
            
            val currentDevices = _discoveredDevices.value.toMutableList()
            currentDevices.add(device)
            _discoveredDevices.value = currentDevices
        }
        
        override fun onEndpointLost(endpointId: String) {
            Log.d(TAG, "Endpoint lost: $endpointId")
            
            _discoveredDevices.value = _discoveredDevices.value.filter { 
                it.endpointId != endpointId 
            }
        }
    }
    
    /**
     * Callback for connection lifecycle events
     */
    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            Log.d(TAG, "Connection initiated with ${info.endpointName}")
            
            // Auto-accept connections (could show dialog for user confirmation)
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }
        
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            when (result.status.statusCode) {
                ConnectionsStatusCodes.STATUS_OK -> {
                    Log.d(TAG, "Connection established with $endpointId")
                    _connectionState.value = ConnectionState.Connected(endpointId, "Device")
                    
                    // Send invite if we have one
                    currentInvite?.let { invite ->
                        sendInvite(endpointId, invite)
                    }
                }
                ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED -> {
                    Log.d(TAG, "Connection rejected")
                    _connectionState.value = ConnectionState.Error("Connection rejected")
                }
                else -> {
                    Log.d(TAG, "Connection failed")
                    _connectionState.value = ConnectionState.Error("Connection failed")
                }
            }
        }
        
        override fun onDisconnected(endpointId: String) {
            Log.d(TAG, "Disconnected from $endpointId")
            _connectionState.value = ConnectionState.Idle
        }
    }
    
    /**
     * Callback for receiving payloads
     */
    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            if (payload.type == Payload.Type.BYTES) {
                val bytes = payload.asBytes()
                if (bytes != null) {
                    try {
                        val json = String(bytes, Charsets.UTF_8)
                        val sharePayload = SharePayload.fromJsonString(json)
                        
                        if (sharePayload != null) {
                            // Convert SharePayload to Invite
                            val invite = Invite(
                                code = sharePayload.inviteCode,
                                inviterPeerId = sharePayload.inviterPeerId,
                                inviterPublicKey = ByteArray(0), // Will be fetched
                                createdAt = sharePayload.timestamp,
                                expiresAt = sharePayload.timestamp + (7 * 24 * 60 * 60 * 1000),
                                signature = sharePayload.signature,
                                bootstrapPeers = sharePayload.bootstrapPeers
                            )
                            
                            onInviteReceived?.invoke(invite)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse invite payload", e)
                    }
                }
            }
        }
        
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            // Handle transfer progress if needed
            if (update.status == PayloadTransferUpdate.Status.SUCCESS) {
                Log.d(TAG, "Payload transfer successful")
            }
        }
    }
    
    /**
     * Send invite to connected endpoint
     */
    private fun sendInvite(endpointId: String, invite: Invite) {
        val sharePayload = SharePayload(
            version = "0.1.0",
            inviteCode = invite.code,
            inviterPeerId = invite.inviterPeerId,
            signature = invite.signature,
            bootstrapPeers = invite.bootstrapPeers,
            timestamp = System.currentTimeMillis()
        )
        
        val json = sharePayload.toJsonString()
        val payload = Payload.fromBytes(json.toByteArray(Charsets.UTF_8))
        
        connectionsClient.sendPayload(endpointId, payload)
    }
}
