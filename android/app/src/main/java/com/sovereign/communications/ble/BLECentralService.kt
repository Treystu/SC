package com.sovereign.communications.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Central Mode - Task 34
 * Enhanced scanning service with selective scanning and filtering
 */
class BLECentralService(private val context: Context) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private var scanner: BluetoothLeScanner? = null
    
    // Scan state management
    private var scanState = ScanState.STOPPED
    private var currentScanMode = ScanMode.BALANCED
    
    // Device cache and filtering
    private val deviceCache = ConcurrentHashMap<String, CachedDevice>()
    private val scanFilters = mutableListOf<DeviceFilter>()
    
    // Background scanning optimization
    private val handler = Handler(Looper.getMainLooper())
    private var scanDutyCycle = DutyCycle.BALANCED
    private var backgroundScanRunnable: Runnable? = null
    
    // Scan result callback
    private var onDeviceFoundCallback: ((ScanResult) -> Unit)? = null
    
    companion object {
        private const val TAG = "BLECentral"
        val MESH_SERVICE_UUID = ParcelUuid.fromString("00001234-0000-1000-8000-00805f9b34fb")
        
        private const val DEVICE_CACHE_TIMEOUT_MS = 30000L // 30 seconds
        private const val MIN_RSSI_THRESHOLD = -90 // dBm
    }
    
    /**
     * Scan states
     */
    enum class ScanState {
        STOPPED,
        STARTING,
        SCANNING,
        PAUSED,
        ERROR
    }
    
    /**
     * Scan modes with different power/discovery tradeoffs
     */
    enum class ScanMode {
        LOW_POWER,
        BALANCED,
        LOW_LATENCY
    }
    
    /**
     * Duty cycle for background scanning
     */
    enum class DutyCycle(val scanDurationMs: Long, val pauseDurationMs: Long) {
        LOW_POWER(5000, 25000),      // 5s scan, 25s pause
        BALANCED(10000, 10000),      // 10s scan, 10s pause
        AGGRESSIVE(20000, 5000)      // 20s scan, 5s pause
    }
    
    /**
     * Cached device information
     */
    data class CachedDevice(
        val address: String,
        val name: String?,
        val rssi: Int,
        val serviceUuids: List<ParcelUuid>,
        val lastSeen: Long,
        val firstSeen: Long,
        val scanCount: Int
    ) {
        fun isExpired(currentTime: Long): Boolean = 
            (currentTime - lastSeen) > DEVICE_CACHE_TIMEOUT_MS
    }
    
    /**
     * Device filter for selective scanning
     */
    data class DeviceFilter(
        val serviceUuid: ParcelUuid? = null,
        val deviceName: String? = null,
        val minRssi: Int = MIN_RSSI_THRESHOLD,
        val manufacturerId: Int? = null
    )
    
    /**
     * Start selective scanning with filters
     */
    fun startScanning(
        mode: ScanMode = ScanMode.BALANCED,
        filters: List<DeviceFilter> = emptyList(),
        onDeviceFound: (ScanResult) -> Unit
    ): Boolean {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            Log.e(TAG, "Bluetooth not available or not enabled")
            scanState = ScanState.ERROR
            return false
        }
        
        scanner = bluetoothAdapter.bluetoothLeScanner
        if (scanner == null) {
            Log.e(TAG, "BLE scanning not supported on this device")
            scanState = ScanState.ERROR
            return false
        }
        
        currentScanMode = mode
        scanFilters.clear()
        scanFilters.addAll(filters)
        onDeviceFoundCallback = onDeviceFound
        
        scanState = ScanState.STARTING
        
        val scanSettings = buildScanSettings(mode)
        val scanFilters = buildScanFilters()
        
        try {
            scanner?.startScan(scanFilters, scanSettings, scanCallback)
            Log.i(TAG, "BLE scanning started with mode: $mode")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start scanning", e)
            scanState = ScanState.ERROR
            return false
        }
    }
    
    /**
     * Build scan settings based on mode
     */
    private fun buildScanSettings(mode: ScanMode): ScanSettings {
        val (scanMode, reportDelay, callbackType) = when (mode) {
            ScanMode.LOW_POWER -> Triple(
                ScanSettings.SCAN_MODE_LOW_POWER,
                5000L, // Batch results for 5 seconds
                ScanSettings.CALLBACK_TYPE_ALL_MATCHES
            )
            ScanMode.BALANCED -> Triple(
                ScanSettings.SCAN_MODE_BALANCED,
                1000L,
                ScanSettings.CALLBACK_TYPE_ALL_MATCHES
            )
            ScanMode.LOW_LATENCY -> Triple(
                ScanSettings.SCAN_MODE_LOW_LATENCY,
                0L, // No batching
                ScanSettings.CALLBACK_TYPE_ALL_MATCHES or ScanSettings.CALLBACK_TYPE_FIRST_MATCH
            )
        }
        
        return ScanSettings.Builder()
            .setScanMode(scanMode)
            .setReportDelay(reportDelay)
            .setCallbackType(callbackType)
            .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
            .setNumOfMatches(ScanSettings.MATCH_NUM_MAX_ADVERTISEMENT)
            .build()
    }
    
    /**
     * Build scan filters for selective scanning
     */
    private fun buildScanFilters(): List<ScanFilter> {
        val filters = mutableListOf<ScanFilter>()
        
        // Always add mesh service filter
        filters.add(
            ScanFilter.Builder()
                .setServiceUuid(MESH_SERVICE_UUID)
                .build()
        )
        
        // Add custom filters
        scanFilters.forEach { filter ->
            val builder = ScanFilter.Builder()
            
            filter.serviceUuid?.let { builder.setServiceUuid(it) }
            filter.deviceName?.let { builder.setDeviceName(it) }
            filter.manufacturerId?.let { 
                builder.setManufacturerData(it, ByteArray(0))
            }
            
            filters.add(builder.build())
        }
        
        return filters
    }
    
    /**
     * Stop scanning
     */
    fun stopScanning() {
        try {
            scanner?.stopScan(scanCallback)
            stopBackgroundScanning()
            scanState = ScanState.STOPPED
            Log.i(TAG, "BLE scanning stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping scan", e)
        }
    }
    
    /**
     * Start background scanning with duty cycling
     */
    fun startBackgroundScanning(
        dutyCycle: DutyCycle = DutyCycle.BALANCED,
        onDeviceFound: (ScanResult) -> Unit
    ) {
        this.scanDutyCycle = dutyCycle
        this.onDeviceFoundCallback = onDeviceFound
        
        scheduleBackgroundScan()
        Log.i(TAG, "Background scanning started with duty cycle: $dutyCycle")
    }
    
    /**
     * Schedule next background scan cycle
     */
    private fun scheduleBackgroundScan() {
        backgroundScanRunnable?.let { handler.removeCallbacks(it) }
        
        backgroundScanRunnable = object : Runnable {
            override fun run() {
                if (scanState == ScanState.STOPPED || scanState == ScanState.PAUSED) {
                    // Start scan
                    startScanning(ScanMode.LOW_POWER, emptyList()) { result ->
                        onDeviceFoundCallback?.invoke(result)
                    }
                    
                    // Schedule stop after scan duration
                    handler.postDelayed({
                        stopScanning()
                        scanState = ScanState.PAUSED
                        
                        // Schedule next scan after pause
                        handler.postDelayed(this, scanDutyCycle.pauseDurationMs)
                    }, scanDutyCycle.scanDurationMs)
                }
            }
        }
        
        handler.post(backgroundScanRunnable!!)
    }
    
    /**
     * Stop background scanning
     */
    fun stopBackgroundScanning() {
        backgroundScanRunnable?.let { handler.removeCallbacks(it) }
        backgroundScanRunnable = null
    }
    
    /**
     * Apply RSSI-based filtering
     */
    private fun filterByScanResult(result: ScanResult): Boolean {
        // RSSI filter
        val minRssi = scanFilters.maxOfOrNull { it.minRssi } ?: MIN_RSSI_THRESHOLD
        if (result.rssi < minRssi) {
            return false
        }
        
        // Custom filters
        if (scanFilters.isNotEmpty()) {
            return scanFilters.any { filter ->
                (filter.serviceUuid == null || result.scanRecord?.serviceUuids?.contains(filter.serviceUuid) == true) &&
                (filter.deviceName == null || result.scanRecord?.deviceName == filter.deviceName) &&
                (result.rssi >= filter.minRssi)
            }
        }
        
        return true
    }
    
    /**
     * Cache device for deduplication
     */
    private fun cacheDevice(result: ScanResult) {
        val address = result.device.address
        val now = System.currentTimeMillis()
        
        val existing = deviceCache[address]
        
        deviceCache[address] = CachedDevice(
            address = address,
            name = result.scanRecord?.deviceName,
            rssi = result.rssi,
            serviceUuids = result.scanRecord?.serviceUuids ?: emptyList(),
            lastSeen = now,
            firstSeen = existing?.firstSeen ?: now,
            scanCount = (existing?.scanCount ?: 0) + 1
        )
    }
    
    /**
     * Clean up expired cached devices
     */
    fun cleanupDeviceCache() {
        val now = System.currentTimeMillis()
        deviceCache.entries.removeAll { (_, device) ->
            device.isExpired(now)
        }
    }
    
    /**
     * Get cached devices
     */
    fun getCachedDevices(): List<CachedDevice> {
        cleanupDeviceCache()
        return deviceCache.values.sortedByDescending { it.rssi }
    }
    
    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.let { handleScanResult(it) }
        }
        
        override fun onBatchScanResults(results: MutableList<ScanResult>?) {
            results?.forEach { handleScanResult(it) }
        }
        
        override fun onScanFailed(errorCode: Int) {
            val errorMsg = when (errorCode) {
                SCAN_FAILED_ALREADY_STARTED -> "Already started"
                SCAN_FAILED_APPLICATION_REGISTRATION_FAILED -> "App registration failed"
                SCAN_FAILED_INTERNAL_ERROR -> "Internal error"
                SCAN_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                else -> "Unknown error"
            }
            Log.e(TAG, "BLE scan failed: $errorMsg (code: $errorCode)")
            scanState = ScanState.ERROR
        }
    }
    
    /**
     * Handle individual scan result
     */
    private fun handleScanResult(result: ScanResult) {
        scanState = ScanState.SCANNING
        
        // Apply filters
        if (!filterByScanResult(result)) {
            return
        }
        
        // Cache device
        cacheDevice(result)
        
        // Notify callback
        onDeviceFoundCallback?.invoke(result)
        
        Log.d(TAG, "Device found: ${result.device.address}, RSSI: ${result.rssi}")
    }
    
    /**
     * Get scan state
     */
    fun getState(): ScanState = scanState
    
    /**
     * Get scan statistics
     */
    fun getStats(): Map<String, Any> {
        return mapOf(
            "state" to scanState.name,
            "scanMode" to currentScanMode.name,
            "cachedDeviceCount" to deviceCache.size,
            "dutyCycle" to scanDutyCycle.name,
            "filterCount" to scanFilters.size
        )
    }
}
