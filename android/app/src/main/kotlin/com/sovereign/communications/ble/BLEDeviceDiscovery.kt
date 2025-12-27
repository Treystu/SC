package com.sovereign.communications.ble

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * BLE Device Discovery - Scans for nearby Sovereign Communications peers
 */
class BLEDeviceDiscovery(
    private val context: Context
) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter = bluetoothManager.adapter
    private val bluetoothLeScanner = bluetoothAdapter.bluetoothLeScanner
    private val mainHandler = Handler(Looper.getMainLooper())

    private var scanCallback: ScanCallback? = null
    private var isScanning = false

    companion object {
        private const val TAG = "BLEDeviceDiscovery"
        private const val SCAN_PERIOD: Long = 10000 // 10 seconds
    }

    /**
     * Start BLE scanning for mesh peers
     */
    fun startScanning(onDeviceFound: (BluetoothDevice) -> Unit): Flow<BluetoothDevice> = callbackFlow {
        if (!hasScanPermission()) {
            Log.w(TAG, "Missing BLE scan permissions")
            close()
            return@callbackFlow
        }

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            Log.w(TAG, "Bluetooth not available or not enabled")
            close()
            return@callbackFlow
        }

        val scanFilter = ScanFilter.Builder()
            .setServiceUuid(MeshGATTServer.MESH_SERVICE_UUID)
            .build()

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
            .setNumOfMatches(ScanSettings.MATCH_NUM_MAX_ADVERTISEMENT)
            .setReportDelay(0L)
            .build()

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                Log.d(TAG, "Found BLE device: ${device.address}")
                onDeviceFound(device)
                trySend(device)
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>) {
                results.forEach { result ->
                    val device = result.device
                    Log.d(TAG, "Found BLE device in batch: ${device.address}")
                    onDeviceFound(device)
                    trySend(device)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "BLE scan failed with error: $errorCode")
                close(Exception("BLE scan failed: $errorCode"))
            }
        }

        isScanning = true
        bluetoothLeScanner.startScan(listOf(scanFilter), scanSettings, scanCallback)

        // Auto-stop scanning after SCAN_PERIOD
        mainHandler.postDelayed({
            stopScanning()
        }, SCAN_PERIOD)

        awaitClose {
            stopScanning()
        }
    }

    /**
     * Stop BLE scanning
     */
    fun stopScanning() {
        if (isScanning && scanCallback != null) {
            bluetoothLeScanner.stopScan(scanCallback)
            isScanning = false
            scanCallback = null
            Log.d(TAG, "BLE scanning stopped")
        }
    }

    /**
     * Check if we have BLE scan permissions
     */
    private fun hasScanPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.BLUETOOTH_SCAN
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Check if scanning is currently active
     */
    fun isScanning(): Boolean = isScanning
}