package com.sovereign.communications.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.pow

/**
 * BLE Device Discovery - Task 40
 * Implements RSSI-based filtering, device caching, timeouts, and ranking
 * FULL IMPLEMENTATION with BluetoothLeScanner
 */
class BLEDeviceDiscovery(
    private val context: Context,
) {
    private val discoveredDevices = ConcurrentHashMap<String, DiscoveredDevice>()
    private val discoveryCallbacks = mutableListOf<DiscoveryCallback>()
    private val deviceCallbacks = mutableListOf<(BluetoothDevice) -> Unit>()

    // Bluetooth components
    private val bluetoothManager: BluetoothManager by lazy {
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    }
    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        bluetoothManager.adapter
    }
    private val bluetoothLeScanner by lazy {
        bluetoothAdapter?.bluetoothLeScanner
    }

    private var isScanning = false
    private val deviceMap = ConcurrentHashMap<String, BluetoothDevice>() // address -> device

    companion object {
        private const val TAG = "BLEDeviceDiscovery"

        // RSSI thresholds for filtering
        private const val RSSI_THRESHOLD_IMMEDIATE = -50 // < 1m
        private const val RSSI_THRESHOLD_NEAR = -70 // 1-3m
        private const val RSSI_THRESHOLD_FAR = -85 // 3-10m
        private const val RSSI_THRESHOLD_MIN = -100 // Minimum detectable

        // Discovery parameters
        private const val DEVICE_TIMEOUT_MS = 30000L // 30 seconds
        private const val RSSI_SAMPLE_SIZE = 5 // Number of RSSI samples for averaging
        private const val DISCOVERY_TIMEOUT_MS = 60000L // 1 minute discovery timeout
    }

    /**
     * Discovered device information
     */
    data class DiscoveredDevice(
        val address: String,
        val name: String?,
        val rssi: Int,
        val rssiHistory: MutableList<Int> = mutableListOf(),
        val firstSeen: Long = System.currentTimeMillis(),
        val lastSeen: Long = System.currentTimeMillis(),
        val scanCount: Int = 1,
        val serviceUuids: List<String> = emptyList(),
        val manufacturerData: ByteArray? = null,
        val txPower: Int? = null,
    ) {
        /**
         * Get average RSSI from history
         */
        fun getAverageRssi(): Int =
            if (rssiHistory.isNotEmpty()) {
                rssiHistory.average().toInt()
            } else {
                rssi
            }

        /**
         * Get RSSI stability (lower is more stable)
         */
        fun getRssiStability(): Double {
            if (rssiHistory.size < 2) return 0.0

            val mean = rssiHistory.average()
            val variance = rssiHistory.map { (it - mean).pow(2) }.average()
            return kotlin.math.sqrt(variance)
        }

        /**
         * Get distance category
         */
        fun getDistanceCategory(): DistanceCategory {
            val avgRssi = getAverageRssi()
            return when {
                avgRssi >= RSSI_THRESHOLD_IMMEDIATE -> DistanceCategory.IMMEDIATE
                avgRssi >= RSSI_THRESHOLD_NEAR -> DistanceCategory.NEAR
                avgRssi >= RSSI_THRESHOLD_FAR -> DistanceCategory.FAR
                else -> DistanceCategory.VERY_FAR
            }
        }

        /**
         * Estimate distance in meters using path loss model
         */
        fun estimateDistance(): Double {
            val txPowerValue = txPower ?: -59 // Default TX power at 1m
            val avgRssi = getAverageRssi()

            // Path loss formula: distance = 10 ^ ((txPower - RSSI) / (10 * n))
            // where n is the path loss exponent (2.0 for free space, 2-4 for indoor)
            val n = 2.5 // Indoor environment
            return 10.0.pow((txPowerValue - avgRssi) / (10 * n))
        }

        /**
         * Calculate rank score (higher is better)
         */
        fun getRankScore(): Double {
            val rssiScore = (getAverageRssi() + 100) * 2.0 // Normalize RSSI
            val stabilityScore = (10.0 - getRssiStability()).coerceAtLeast(0.0)
            val recencyScore = if ((System.currentTimeMillis() - lastSeen) < 5000) 10.0 else 5.0
            val scanCountScore = scanCount.coerceAtMost(10).toDouble()

            return rssiScore + stabilityScore + recencyScore + scanCountScore
        }

        fun isExpired(currentTime: Long): Boolean = (currentTime - lastSeen) > DEVICE_TIMEOUT_MS

        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false
            other as DiscoveredDevice
            return address == other.address
        }

        override fun hashCode(): Int = address.hashCode()
    }

    enum class DistanceCategory {
        IMMEDIATE, // < 1m
        NEAR, // 1-3m
        FAR, // 3-10m
        VERY_FAR, // > 10m
    }

    /**
     * Discovery callback interface
     */
    interface DiscoveryCallback {
        fun onDeviceDiscovered(device: DiscoveredDevice)

        fun onDeviceUpdated(device: DiscoveredDevice)

        fun onDeviceLost(device: DiscoveredDevice)
    }

    /**
     * Discovery filter
     */
    data class DiscoveryFilter(
        val minRssi: Int = RSSI_THRESHOLD_MIN,
        val maxDistance: Double? = null,
        val requiredServiceUuid: String? = null,
        val namePattern: String? = null,
        val distanceCategory: DistanceCategory? = null,
    ) {
        fun matches(device: DiscoveredDevice): Boolean {
            if (device.getAverageRssi() < minRssi) return false

            maxDistance?.let {
                if (device.estimateDistance() > it) return false
            }

            requiredServiceUuid?.let {
                if (!device.serviceUuids.contains(it)) return false
            }

            namePattern?.let {
                if (device.name?.contains(it, ignoreCase = true) != true) return false
            }

            distanceCategory?.let {
                if (device.getDistanceCategory() != it) return false
            }

            return true
        }
    }

    /**
     * Process scan result - Task 40
     */
    fun onScanResult(result: ScanResult) {
        val address = result.device.address
        val currentTime = System.currentTimeMillis()

        val existingDevice = discoveredDevices[address]

        if (existingDevice == null) {
            // New device discovered
            val newDevice = createDiscoveredDevice(result)
            discoveredDevices[address] = newDevice

            discoveryCallbacks.forEach { it.onDeviceDiscovered(newDevice) }
            Log.d(TAG, "New device discovered: $address, RSSI: ${result.rssi}")
        } else {
            // Update existing device
            val updatedDevice = updateDiscoveredDevice(existingDevice, result)
            discoveredDevices[address] = updatedDevice

            discoveryCallbacks.forEach { it.onDeviceUpdated(updatedDevice) }
            Log.d(TAG, "Device updated: $address, RSSI: ${result.rssi}")
        }
    }

    /**
     * Create discovered device from scan result
     */
    private fun createDiscoveredDevice(result: ScanResult): DiscoveredDevice {
        val scanRecord = result.scanRecord

        return DiscoveredDevice(
            address = result.device.address,
            name = scanRecord?.deviceName,
            rssi = result.rssi,
            rssiHistory = mutableListOf(result.rssi),
            serviceUuids = scanRecord?.serviceUuids?.map { it.toString() } ?: emptyList(),
            manufacturerData = scanRecord?.getManufacturerSpecificData(0),
            txPower = scanRecord?.txPowerLevel,
        )
    }

    /**
     * Update discovered device with new scan result
     */
    private fun updateDiscoveredDevice(
        existing: DiscoveredDevice,
        result: ScanResult,
    ): DiscoveredDevice {
        val updatedHistory = existing.rssiHistory.toMutableList()
        updatedHistory.add(result.rssi)

        // Keep only recent samples
        if (updatedHistory.size > RSSI_SAMPLE_SIZE) {
            updatedHistory.removeAt(0)
        }

        return existing.copy(
            rssi = result.rssi,
            rssiHistory = updatedHistory,
            lastSeen = System.currentTimeMillis(),
            scanCount = existing.scanCount + 1,
        )
    }

    /**
     * Get devices with RSSI-based filtering - Task 40
     */
    fun getDevices(filter: DiscoveryFilter = DiscoveryFilter()): List<DiscoveredDevice> {
        cleanupExpiredDevices()

        return discoveredDevices.values
            .filter { filter.matches(it) }
            .sortedByDescending { it.getRankScore() }
    }

    /**
     * Get devices by distance category
     */
    fun getDevicesByDistance(category: DistanceCategory): List<DiscoveredDevice> = getDevices(DiscoveryFilter(distanceCategory = category))

    /**
     * Get closest device
     */
    fun getClosestDevice(filter: DiscoveryFilter = DiscoveryFilter()): DiscoveredDevice? =
        getDevices(filter).maxByOrNull { it.getAverageRssi() }

    /**
     * Get devices ranked by score - Task 40
     */
    fun getRankedDevices(
        limit: Int = 10,
        filter: DiscoveryFilter = DiscoveryFilter(),
    ): List<DiscoveredDevice> = getDevices(filter).take(limit)

    /**
     * Cleanup expired devices - Task 40
     */
    fun cleanupExpiredDevices() {
        val currentTime = System.currentTimeMillis()
        val expiredDevices = discoveredDevices.values.filter { it.isExpired(currentTime) }

        expiredDevices.forEach { device ->
            discoveredDevices.remove(device.address)
            discoveryCallbacks.forEach { it.onDeviceLost(device) }
            Log.d(TAG, "Device expired: ${device.address}")
        }
    }

    /**
     * Register discovery callback
     */
    fun registerCallback(callback: DiscoveryCallback) {
        discoveryCallbacks.add(callback)
    }

    /**
     * Unregister discovery callback
     */
    fun unregisterCallback(callback: DiscoveryCallback) {
        discoveryCallbacks.remove(callback)
    }

    /**
     * Clear all discovered devices
     */
    fun clear() {
        discoveredDevices.clear()
    }

    /**
     * Get discovery statistics
     */
    fun getStats(): Map<String, Any?> {
        cleanupExpiredDevices()

        val devices = discoveredDevices.values.toList()

        return mapOf(
            "totalDevices" to devices.size,
            "byDistanceCategory" to
                devices
                    .groupBy { it.getDistanceCategory() }
                    .mapValues { it.value.size },
            "averageRssi" to
                if (devices.isNotEmpty()) {
                    devices.map { it.getAverageRssi() }.average()
                } else {
                    0.0
                },
            "averageScans" to
                if (devices.isNotEmpty()) {
                    devices.map { it.scanCount }.average()
                } else {
                    0.0
                },
            "topDevice" to
                getClosestDevice()?.let {
                    mapOf(
                        "address" to it.address,
                        "name" to (it.name ?: "Unknown"),
                        "rssi" to it.getAverageRssi(),
                        "distance" to "%.2fm".format(it.estimateDistance()),
                    )
                },
        )
    }

    /**
     * Start scanning for BLE devices.
     * FULL IMPLEMENTATION using BluetoothLeScanner
     *
     * @param onDeviceFound Callback invoked when a device is discovered
     */
    fun startScanning(onDeviceFound: (BluetoothDevice) -> Unit) {
        if (isScanning) {
            Log.w(TAG, "BLE scanning already in progress")
            return
        }

        // Store callback
        deviceCallbacks.add(onDeviceFound)

        // Check Bluetooth availability
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth not supported on this device")
            return
        }

        if (bluetoothAdapter?.isEnabled != true) {
            Log.e(TAG, "Bluetooth is not enabled")
            return
        }

        val scanner = bluetoothLeScanner
        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner not available")
            return
        }

        // Configure scan settings for balanced power/performance
        val scanSettings =
            ScanSettings
                .Builder()
                .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
                .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
                .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
                .setNumOfMatches(ScanSettings.MATCH_NUM_MAX_ADVERTISEMENT)
                .setReportDelay(0) // Real-time reporting
                .build()

        // Configure scan filters for Sovereign Communications service
        val filters = mutableListOf<ScanFilter>()

        // V1.1: Define and use service UUID for efficient filtering
        val serviceUuid = ParcelUuid.fromString("12345678-1234-1234-1234-123456789abc")
        val filter = ScanFilter.Builder()
            .setServiceUuid(serviceUuid)
            .build()
        filters.add(filter)

        // Note: With UUID filtering, battery consumption is reduced
        // and scanning is more efficient

        try {
            // Start scanning
            scanner.startScan(filters.ifEmpty { null }, scanSettings, bleScanCallback)
            isScanning = true
            Log.i(TAG, "BLE scanning started successfully")

            // Register callback for discovered devices
            registerCallback(
                object : DiscoveryCallback {
                    override fun onDeviceDiscovered(device: DiscoveredDevice) {
                        // Get the actual BluetoothDevice from our map
                        val btDevice = deviceMap[device.address]
                        if (btDevice != null) {
                            deviceCallbacks.forEach { callback ->
                                try {
                                    callback(btDevice)
                                } catch (e: Exception) {
                                    Log.e(TAG, "Error in device callback", e)
                                }
                            }
                        }
                    }

                    override fun onDeviceUpdated(device: DiscoveredDevice) {
                        // Device RSSI or other properties updated
                    }

                    override fun onDeviceLost(device: DiscoveredDevice) {
                        Log.d(TAG, "Device lost: ${device.address}")
                        deviceMap.remove(device.address)
                    }
                },
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing Bluetooth permissions", e)
            isScanning = false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start BLE scanning", e)
            isScanning = false
        }
    }

    /**
     * BLE Scan Callback - handles scan results
     */
    private val bleScanCallback =
        object : ScanCallback() {
            override fun onScanResult(
                callbackType: Int,
                result: ScanResult,
            ) {
                super.onScanResult(callbackType, result)

                try {
                    // Store the BluetoothDevice reference
                    deviceMap[result.device.address] = result.device

                    // Process the scan result through our discovery logic
                    onScanResult(result)
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing scan result", e)
                }
            }

            override fun onBatchScanResults(results: List<ScanResult>) {
                super.onBatchScanResults(results)

                try {
                    results.forEach { result ->
                        deviceMap[result.device.address] = result.device
                        onScanResult(result)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing batch scan results", e)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                super.onScanFailed(errorCode)

                val errorMessage =
                    when (errorCode) {
                        SCAN_FAILED_ALREADY_STARTED -> "Scan already started"
                        SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "Application registration failed"
                        SCAN_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                        SCAN_FAILED_INTERNAL_ERROR -> "Internal error"
                        else -> "Unknown error code: $errorCode"
                    }

                Log.e(TAG, "BLE scan failed: $errorMessage")
                isScanning = false
            }
        }

    /**
     * Stop BLE scanning
     */
    fun stopScanning() {
        if (!isScanning) {
            Log.w(TAG, "BLE scanning is not active")
            return
        }

        try {
            bluetoothLeScanner?.stopScan(bleScanCallback)
            isScanning = false
            deviceCallbacks.clear()
            Log.i(TAG, "BLE scanning stopped")
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing Bluetooth permissions to stop scan", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop BLE scanning", e)
        }
    }

    /**
     * Check if currently scanning
     */
    fun isScanning(): Boolean = isScanning
}
