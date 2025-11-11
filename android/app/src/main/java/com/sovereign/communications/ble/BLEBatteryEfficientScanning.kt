package com.sovereign.communications.ble

import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import kotlinx.coroutines.*

class BLEBatteryEfficientScanning(private val context: Context) {
    private val scanScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentScanMode = ScanMode.BALANCED
    private var batteryLevel = 100
    
    enum class ScanMode {
        LOW_POWER,
        BALANCED,
        LOW_LATENCY
    }
    
    init {
        monitorBatteryLevel()
    }
    
    private fun monitorBatteryLevel() {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = context.registerReceiver(null, filter)
        
        batteryStatus?.let {
            batteryLevel = it.getIntExtra(BatteryManager.EXTRA_LEVEL, 100)
            val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            batteryLevel = (batteryLevel * 100) / scale
        }
        
        updateScanMode()
    }
    
    private fun updateScanMode() {
        currentScanMode = when {
            batteryLevel > 50 -> ScanMode.BALANCED
            batteryLevel > 20 -> ScanMode.LOW_POWER
            else -> ScanMode.LOW_POWER
        }
    }
    
    fun getScanSettings(): ScanSettings {
        return when (currentScanMode) {
            ScanMode.LOW_POWER -> ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
                .setReportDelay(5000) // Batch results
                .build()
            
            ScanMode.BALANCED -> ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
                .setReportDelay(1000)
                .build()
            
            ScanMode.LOW_LATENCY -> ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setReportDelay(0)
                .build()
        }
    }
    
    fun getAdaptiveScanInterval(): Long {
        return when (currentScanMode) {
            ScanMode.LOW_POWER -> 30000L // 30 seconds
            ScanMode.BALANCED -> 10000L // 10 seconds
            ScanMode.LOW_LATENCY -> 5000L // 5 seconds
        }
    }
    
    fun startAdaptiveScanning(onScan: () -> Unit) {
        scanScope.launch {
            while (isActive) {
                onScan()
                delay(getAdaptiveScanInterval())
                monitorBatteryLevel()
            }
        }
    }
    
    fun cleanup() {
        scanScope.cancel()
    }
}
