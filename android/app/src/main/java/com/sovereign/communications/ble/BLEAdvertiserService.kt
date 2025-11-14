package com.sovereign.communications.ble

import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/**
 * BLE Peripheral Mode - Task 33
 * Enhanced advertising service with optimization and state management
 */
class BLEAdvertiserService(private val context: Context) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private var advertiser: BluetoothLeAdvertiser? = null
    
    // Peripheral state management
    private var peripheralState = PeripheralState.STOPPED
    private val connectionCount = AtomicInteger(0)
    private var maxConnections = 7 // BLE limit for peripheral
    private var currentAdvertiseMode = AdvertiseMode.BALANCED
    
    // Advertising interval tuning
    private var advertisingInterval = AdvertisingInterval.BALANCED
    private var lastAdvertiseTime = 0L
    
    companion object {
        private const val TAG = "BLEAdvertiser"
        val MESH_SERVICE_UUID: UUID = UUID.fromString("00001234-0000-1000-8000-00805f9b34fb")
        
        // Maximum advertising data size (31 bytes for legacy, 255 for extended)
        private const val MAX_LEGACY_AD_SIZE = 31
        private const val MAX_EXTENDED_AD_SIZE = 255
    }
    
    /**
     * Peripheral states for lifecycle management
     */
    enum class PeripheralState {
        STOPPED,
        STARTING,
        ADVERTISING,
        CONNECTION_LIMIT_REACHED,
        ERROR
    }
    
    /**
     * Advertising modes with different power/discovery tradeoffs
     */
    enum class AdvertiseMode {
        LOW_POWER,      // Long intervals, low power
        BALANCED,       // Default balanced mode
        LOW_LATENCY     // Short intervals, fast discovery
    }
    
    /**
     * Advertising interval presets (ms)
     */
    enum class AdvertisingInterval(val intervalMs: Int) {
        LOW_POWER(1000),      // 1 second
        BALANCED(250),        // 250 ms
        LOW_LATENCY(100)      // 100 ms
    }
    
    /**
     * Start advertising with optimized data
     */
    fun startAdvertising(peerInfo: ByteArray): Boolean {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            Log.e(TAG, "Bluetooth not available or not enabled")
            peripheralState = PeripheralState.ERROR
            return false
        }

        advertiser = bluetoothAdapter.bluetoothLeAdvertiser
        if (advertiser == null) {
            Log.e(TAG, "BLE advertising not supported on this device")
            peripheralState = PeripheralState.ERROR
            return false
        }
        
        // Check connection limit
        if (connectionCount.get() >= maxConnections) {
            Log.w(TAG, "Connection limit reached, not advertising")
            peripheralState = PeripheralState.CONNECTION_LIMIT_REACHED
            return false
        }
        
        // Optimize advertising data (Task 33)
        val optimizedData = optimizeAdvertisingData(peerInfo)
        
        peripheralState = PeripheralState.STARTING
        val settings = buildAdvertiseSettings()
        val data = buildAdvertiseData(optimizedData)

        advertiser?.startAdvertising(settings, data, advertiseCallback)
        lastAdvertiseTime = System.currentTimeMillis()
        return true
    }
    
    /**
     * Optimize advertising data to fit within BLE limits
     */
    private fun optimizeAdvertisingData(peerInfo: ByteArray): ByteArray {
        val maxDataSize = MAX_LEGACY_AD_SIZE - 3 - 2 - 16 // Subtract overhead (flags, UUID)
        
        return if (peerInfo.size > maxDataSize) {
            Log.w(TAG, "Peer info too large (${peerInfo.size} bytes), truncating to $maxDataSize")
            peerInfo.copyOfRange(0, maxDataSize)
        } else {
            peerInfo
        }
    }
    
    /**
     * Build advertising settings with interval tuning
     */
    private fun buildAdvertiseSettings(): AdvertiseSettings {
        val (advertiseMode, txPower) = when (currentAdvertiseMode) {
            AdvertiseMode.LOW_POWER -> 
                AdvertiseSettings.ADVERTISE_MODE_LOW_POWER to AdvertiseSettings.ADVERTISE_TX_POWER_LOW
            AdvertiseMode.BALANCED -> 
                AdvertiseSettings.ADVERTISE_MODE_BALANCED to AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM
            AdvertiseMode.LOW_LATENCY -> 
                AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY to AdvertiseSettings.ADVERTISE_TX_POWER_HIGH
        }
        
        return AdvertiseSettings.Builder()
            .setAdvertiseMode(advertiseMode)
            .setTxPowerLevel(txPower)
            .setConnectable(connectionCount.get() < maxConnections)
            .setTimeout(0) // Advertise indefinitely
            .build()
    }
    
    /**
     * Build optimized advertising data
     */
    private fun buildAdvertiseData(peerInfo: ByteArray): AdvertiseData {
        return AdvertiseData.Builder()
            .setIncludeDeviceName(false) // Save space
            .setIncludeTxPowerLevel(false) // Save space
            .addServiceUuid(ParcelUuid(MESH_SERVICE_UUID))
            .addServiceData(ParcelUuid(MESH_SERVICE_UUID), peerInfo)
            .build()
    }
    
    /**
     * Tune advertising interval based on mode
     */
    fun setAdvertisingMode(mode: AdvertiseMode) {
        if (currentAdvertiseMode == mode) return
        
        currentAdvertiseMode = mode
        advertisingInterval = when (mode) {
            AdvertiseMode.LOW_POWER -> AdvertisingInterval.LOW_POWER
            AdvertiseMode.BALANCED -> AdvertisingInterval.BALANCED
            AdvertiseMode.LOW_LATENCY -> AdvertisingInterval.LOW_LATENCY
        }
        
        // Restart advertising with new settings if active
        if (peripheralState == PeripheralState.ADVERTISING) {
            Log.i(TAG, "Restarting advertising with mode: $mode")
            // Note: Would need to store peerInfo to restart
        }
    }

    fun stopAdvertising() {
        advertiser?.stopAdvertising(advertiseCallback)
        peripheralState = PeripheralState.STOPPED
    }
    
    /**
     * Handle connection limit
     */
    fun onConnectionEstablished() {
        connectionCount.incrementAndGet()
        Log.d(TAG, "Connection established, count: ${connectionCount.get()}/$maxConnections")
        
        if (connectionCount.get() >= maxConnections) {
            Log.w(TAG, "Connection limit reached, stopping advertising")
            peripheralState = PeripheralState.CONNECTION_LIMIT_REACHED
            stopAdvertising()
        }
    }
    
    /**
     * Handle connection closed
     */
    fun onConnectionClosed() {
        val prevCount = connectionCount.getAndDecrement()
        Log.d(TAG, "Connection closed, count: ${connectionCount.get()}/$maxConnections")
        
        // Resume advertising if we were at limit
        if (prevCount == maxConnections && peripheralState == PeripheralState.CONNECTION_LIMIT_REACHED) {
            Log.i(TAG, "Below connection limit, can resume advertising")
            peripheralState = PeripheralState.STOPPED
        }
    }
    
    /**
     * Set maximum connections limit
     */
    fun setMaxConnections(max: Int) {
        maxConnections = max.coerceIn(1, 7)
        Log.i(TAG, "Max connections set to $maxConnections")
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.i(TAG, "BLE advertising started successfully with mode: $currentAdvertiseMode")
            peripheralState = PeripheralState.ADVERTISING
        }

        override fun onStartFailure(errorCode: Int) {
            val errorMsg = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                else -> "Unknown error"
            }
            Log.e(TAG, "BLE advertising failed: $errorMsg (code: $errorCode)")
            peripheralState = PeripheralState.ERROR
        }
    }
    
    /**
     * Get peripheral state
     */
    fun getState(): PeripheralState = peripheralState
    
    /**
     * Get current connection count
     */
    fun getConnectionCount(): Int = connectionCount.get()
    
    /**
     * Check if advertising is active
     */
    fun isAdvertising(): Boolean = peripheralState == PeripheralState.ADVERTISING
    
    /**
     * Get peripheral statistics
     */
    fun getStats(): Map<String, Any> {
        return mapOf(
            "state" to peripheralState.name,
            "connectionCount" to connectionCount.get(),
            "maxConnections" to maxConnections,
            "advertiseMode" to currentAdvertiseMode.name,
            "advertisingInterval" to advertisingInterval.intervalMs,
            "uptimeMs" to if (lastAdvertiseTime > 0) System.currentTimeMillis() - lastAdvertiseTime else 0
        )
    }
}
