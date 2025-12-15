package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Connection Management - Task 39
 * Manages connection parameters, stability monitoring, and error handling
 */
class BLEConnectionManager(
    private val context: Context,
) {
    private val connections = ConcurrentHashMap<String, ConnectionInfo>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var monitoringJob: Job? = null

    companion object {
        private const val TAG = "BLEConnectionMgr"

        // Connection parameters - optimized for mesh networking
        const val CONNECTION_INTERVAL_MIN = 12 // 15ms (12 * 1.25ms)
        const val CONNECTION_INTERVAL_MAX = 24 // 30ms (24 * 1.25ms)
        const val SLAVE_LATENCY = 0
        const val SUPERVISION_TIMEOUT = 200 // 2000ms (200 * 10ms)

        // Stability thresholds
        private const val RSSI_THRESHOLD_WEAK = -85
        private const val RSSI_THRESHOLD_GOOD = -70
        private const val MAX_CONNECTION_ERRORS = 5
        private const val STABILITY_CHECK_INTERVAL_MS = 5000L
    }

    /**
     * Connection information and state
     */
    data class ConnectionInfo(
        val address: String,
        val gatt: BluetoothGatt,
        var state: ConnectionState,
        var rssi: Int = 0,
        var mtu: Int = 23,
        val errorCount: Int = 0,
        val connectTime: Long = System.currentTimeMillis(),
        var lastActivityTime: Long = System.currentTimeMillis(),
        var bytesTransferred: Long = 0,
        val connectionAttempts: Int = 0,
    ) {
        fun isStable(): Boolean =
            errorCount < MAX_CONNECTION_ERRORS &&
                rssi > RSSI_THRESHOLD_WEAK &&
                state == ConnectionState.CONNECTED

        fun getConnectionDuration(): Long = System.currentTimeMillis() - connectTime

        fun getSignalQuality(): SignalQuality =
            when {
                rssi > RSSI_THRESHOLD_GOOD -> SignalQuality.EXCELLENT
                rssi > RSSI_THRESHOLD_WEAK -> SignalQuality.GOOD
                else -> SignalQuality.WEAK
            }
    }

    enum class ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        DISCONNECTING,
        ERROR,
    }

    enum class SignalQuality {
        EXCELLENT,
        GOOD,
        WEAK,
        VERY_WEAK,
    }

    /**
     * Connection policy
     */
    data class ConnectionPolicy(
        val autoReconnect: Boolean = true,
        val maxReconnectAttempts: Int = 3,
        val reconnectDelayMs: Long = 1000,
        val enableConnectionMigration: Boolean = true,
        val preferredMtu: Int = 185,
    )

    private var policy = ConnectionPolicy()

    /**
     * Connect to device with optimized parameters
     */
    fun connect(
        device: BluetoothDevice,
        autoConnect: Boolean = false,
        policy: ConnectionPolicy = ConnectionPolicy(),
    ): Boolean {
        this.policy = policy

        val gatt =
            device.connectGatt(
                context,
                autoConnect,
                createGattCallback(device.address),
                BluetoothDevice.TRANSPORT_LE,
            )

        if (gatt == null) {
            Log.e(TAG, "Failed to create GATT connection to ${device.address}")
            return false
        }

        connections[device.address] =
            ConnectionInfo(
                address = device.address,
                gatt = gatt,
                state = ConnectionState.CONNECTING,
                connectionAttempts = (connections[device.address]?.connectionAttempts ?: 0) + 1,
            )

        Log.i(TAG, "Connecting to ${device.address}")
        return true
    }

    /**
     * Optimize connection parameters - Task 39
     */
    fun optimizeConnectionParameters(address: String): Boolean {
        val connection = connections[address] ?: return false

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            val priority =
                when (connection.getSignalQuality()) {
                    SignalQuality.EXCELLENT, SignalQuality.GOOD -> {
                        BluetoothGatt.CONNECTION_PRIORITY_HIGH
                    }

                    SignalQuality.WEAK -> {
                        BluetoothGatt.CONNECTION_PRIORITY_BALANCED
                    }

                    SignalQuality.VERY_WEAK -> {
                        BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER
                    }
                }

            val result = connection.gatt.requestConnectionPriority(priority)
            Log.i(TAG, "Connection priority set to $priority for $address: $result")
            return result
        }

        return false
    }

    /**
     * Request MTU change
     */
    fun requestMtu(
        address: String,
        mtu: Int = 185,
    ): Boolean {
        val connection = connections[address] ?: return false

        if (connection.state != ConnectionState.CONNECTED) {
            Log.w(TAG, "Cannot request MTU, not connected to $address")
            return false
        }

        val requestedMtu = mtu.coerceIn(23, 517)
        val result = connection.gatt.requestMtu(requestedMtu)
        Log.i(TAG, "MTU request ($requestedMtu) for $address: $result")
        return result
    }

    /**
     * Start connection stability monitoring - Task 39
     */
    fun startStabilityMonitoring() {
        monitoringJob?.cancel()
        monitoringJob =
            scope.launch {
                while (isActive) {
                    connections.values.forEach { connection ->
                        monitorConnectionStability(connection)
                    }
                    delay(STABILITY_CHECK_INTERVAL_MS)
                }
            }
        Log.i(TAG, "Connection stability monitoring started")
    }

    /**
     * Monitor individual connection stability
     */
    private suspend fun monitorConnectionStability(connection: ConnectionInfo) {
        if (connection.state != ConnectionState.CONNECTED) return

        // Read RSSI
        connection.gatt.readRemoteRssi()

        // Check for inactivity
        val inactiveTime = System.currentTimeMillis() - connection.lastActivityTime
        if (inactiveTime > 30000) { // 30 seconds
            Log.w(TAG, "Connection ${connection.address} inactive for ${inactiveTime}ms")
        }

        // Check connection quality
        if (!connection.isStable()) {
            Log.w(TAG, "Connection ${connection.address} unstable: errors=${connection.errorCount}, rssi=${connection.rssi}")

            // Attempt connection migration if enabled
            if (policy.enableConnectionMigration) {
                migrateConnection(connection)
            }
        }

        // Auto-reconnect if disconnected
        if (connection.state == ConnectionState.DISCONNECTED && policy.autoReconnect) {
            if (connection.connectionAttempts < policy.maxReconnectAttempts) {
                Log.i(TAG, "Auto-reconnecting to ${connection.address}")
                delay(policy.reconnectDelayMs)
                // Would trigger reconnection here
            }
        }
    }

    /**
     * Connection migration - Task 39
     */
    private fun migrateConnection(connection: ConnectionInfo) {
        Log.i(TAG, "Attempting connection migration for ${connection.address}")

        // Optimize connection parameters
        optimizeConnectionParameters(connection.address)

        // Could implement more sophisticated migration strategies here
        // such as switching to a different connection mode or route
    }

    /**
     * Disconnect from device
     */
    fun disconnect(address: String) {
        val connection = connections[address] ?: return

        connection.state = ConnectionState.DISCONNECTING
        connection.gatt.disconnect()
        Log.i(TAG, "Disconnecting from $address")
    }

    /**
     * Close connection and cleanup
     */
    fun close(address: String) {
        val connection = connections.remove(address) ?: return

        connection.gatt.close()
        Log.i(TAG, "Connection closed for $address")
    }

    /**
     * Get connection info
     */
    fun getConnectionInfo(address: String): ConnectionInfo? = connections[address]

    /**
     * Get all connections
     */
    fun getAllConnections(): List<ConnectionInfo> = connections.values.toList()

    /**
     * Create GATT callback
     */
    private fun createGattCallback(address: String) =
        object : BluetoothGattCallback() {
            override fun onConnectionStateChange(
                gatt: BluetoothGatt,
                status: Int,
                newState: Int,
            ) {
                val connection = connections[address] ?: return

                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> {
                        connection.state = ConnectionState.CONNECTED
                        connection.lastActivityTime = System.currentTimeMillis()
                        Log.i(TAG, "Connected to $address")

                        // Discover services
                        gatt.discoverServices()

                        // Optimize parameters
                        optimizeConnectionParameters(address)

                        // Request larger MTU
                        requestMtu(address, policy.preferredMtu)
                    }

                    BluetoothProfile.STATE_DISCONNECTED -> {
                        connection.state = ConnectionState.DISCONNECTED
                        Log.i(TAG, "Disconnected from $address")

                        if (status != BluetoothGatt.GATT_SUCCESS) {
                            handleConnectionError(connection, "Disconnected with error: $status")
                        }
                    }
                }
            }

            override fun onServicesDiscovered(
                gatt: BluetoothGatt,
                status: Int,
            ) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    Log.i(TAG, "Services discovered for $address")
                    connections[address]?.lastActivityTime = System.currentTimeMillis()
                }
            }

            override fun onReadRemoteRssi(
                gatt: BluetoothGatt,
                rssi: Int,
                status: Int,
            ) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    connections[address]?.rssi = rssi
                    Log.d(TAG, "RSSI for $address: $rssi dBm")
                }
            }

            override fun onMtuChanged(
                gatt: BluetoothGatt,
                mtu: Int,
                status: Int,
            ) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    connections[address]?.mtu = mtu
                    Log.i(TAG, "MTU changed to $mtu for $address")
                }
            }
        }

    /**
     * Handle connection error - Task 39
     */
    private fun handleConnectionError(
        connection: ConnectionInfo,
        error: String,
    ) {
        Log.e(TAG, "Connection error for ${connection.address}: $error")

        val updatedConnection =
            connection.copy(
                errorCount = connection.errorCount + 1,
                state = ConnectionState.ERROR,
            )
        connections[connection.address] = updatedConnection

        // Attempt recovery
        if (updatedConnection.errorCount >= MAX_CONNECTION_ERRORS) {
            Log.e(TAG, "Max errors reached for ${connection.address}, closing connection")
            close(connection.address)
        }
    }

    /**
     * Stop monitoring
     */
    fun stopStabilityMonitoring() {
        monitoringJob?.cancel()
        monitoringJob = null
        Log.i(TAG, "Connection stability monitoring stopped")
    }

    /**
     * Get connection statistics
     */
    fun getStats(): Map<String, Any> {
        val allConnections = getAllConnections()

        return mapOf<String, Any>(
            "totalConnections" to allConnections.size,
            "connectedCount" to allConnections.count { it.state == ConnectionState.CONNECTED },
            "averageRssi" to (allConnections.mapNotNull { if (it.rssi != 0) it.rssi else null }.average().takeIf { !it.isNaN() } ?: 0),
            "averageMtu" to allConnections.map { it.mtu }.average(),
            "totalBytesTransferred" to allConnections.sumOf { it.bytesTransferred },
            "errorCount" to allConnections.sumOf { it.errorCount },
            "signalQuality" to
                allConnections
                    .groupBy { it.getSignalQuality() }
                    .mapValues { it.value.size } as Any,
        )
    }

    /**
     * Cleanup all connections
     */
    fun cleanup() {
        stopStabilityMonitoring()
        connections.keys.forEach { address ->
            disconnect(address)
            close(address)
        }
        scope.cancel()
    }
}
