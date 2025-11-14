package com.sovereign.communications.ble

import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import kotlinx.coroutines.*

/**
 * BLE Battery-Efficient Scanning - Task 46 Enhanced
 * Implements adaptive scan intervals, duty-cycle optimization, and battery monitoring
 */
class BLEBatteryEfficientScanning(private val context: Context) {
    private val scanScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentScanMode = ScanMode.BALANCED
    private var batteryLevel = 100
    private var isCharging = false
    
    // Duty cycle control - Task 46
    private var dutyCycle = DutyCycle.BALANCED
    private var adaptiveScanJob: Job? = null
    private var onScanCallback: (() -> Unit)? = null
    
    // Power consumption tracking - Task 46
    private var scanCount = 0L
    private var totalScanTimeMs = 0L
    private var lastScanStartTime = 0L
    private var powerSavingsEstimatePercent = 0.0
    
    companion object {
        private const val TAG = "BLEBatteryScanning"
        
        // Battery thresholds
        private const val BATTERY_CRITICAL = 15
        private const val BATTERY_LOW = 30
        private const val BATTERY_MEDIUM = 50
        private const val BATTERY_HIGH = 70
    }
    
    /**
     * Scan modes with different power profiles - Task 46
     */
    enum class ScanMode {
        LOW_POWER,      // Long intervals, minimal power
        BALANCED,       // Default balanced mode
        LOW_LATENCY,    // Short intervals, fast discovery
        ADAPTIVE        // Automatically adjust based on battery
    }
    
    /**
     * Duty cycle presets - Task 46
     */
    enum class DutyCycle(val scanDurationMs: Long, val pauseDurationMs: Long) {
        POWER_SAVER(3000, 57000),     // 5% duty cycle
        LOW_POWER(5000, 25000),       // 17% duty cycle
        BALANCED(10000, 10000),       // 50% duty cycle
        AGGRESSIVE(20000, 5000),      // 80% duty cycle
        CONTINUOUS(Long.MAX_VALUE, 0) // 100% duty cycle
    }
    
    init {
        monitorBatteryLevel()
        startBatteryMonitoring()
    }
    
    /**
     * Monitor battery level - Task 46
     */
    private fun monitorBatteryLevel() {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val batteryStatus = context.registerReceiver(null, filter)
        
        batteryStatus?.let {
            batteryLevel = it.getIntExtra(BatteryManager.EXTRA_LEVEL, 100)
            val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            batteryLevel = (batteryLevel * 100) / scale
            
            // Check if charging
            val status = it.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                        status == BatteryManager.BATTERY_STATUS_FULL
        }
        
        updateScanMode()
    }
    
    /**
     * Start continuous battery monitoring - Task 46
     */
    private fun startBatteryMonitoring() {
        val batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == Intent.ACTION_BATTERY_CHANGED) {
                    monitorBatteryLevel()
                }
            }
        }
        
        context.registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    }
    
    /**
     * Update scan mode based on battery level - Task 46
     */
    private fun updateScanMode() {
        val previousMode = currentScanMode
        
        currentScanMode = when {
            isCharging -> ScanMode.LOW_LATENCY
            batteryLevel <= BATTERY_CRITICAL -> ScanMode.LOW_POWER
            batteryLevel <= BATTERY_LOW -> ScanMode.LOW_POWER
            batteryLevel <= BATTERY_MEDIUM -> ScanMode.BALANCED
            else -> ScanMode.BALANCED
        }
        
        // Update duty cycle based on battery
        dutyCycle = when {
            isCharging -> DutyCycle.AGGRESSIVE
            batteryLevel <= BATTERY_CRITICAL -> DutyCycle.POWER_SAVER
            batteryLevel <= BATTERY_LOW -> DutyCycle.LOW_POWER
            batteryLevel <= BATTERY_MEDIUM -> DutyCycle.BALANCED
            else -> DutyCycle.BALANCED
        }
        
        if (previousMode != currentScanMode) {
            Log.i(TAG, "Scan mode changed: $previousMode -> $currentScanMode (battery: $batteryLevel%)")
            
            // Calculate power savings
            powerSavingsEstimatePercent = calculatePowerSavings(previousMode, currentScanMode)
        }
    }
    
    /**
     * Calculate estimated power savings - Task 46
     */
    private fun calculatePowerSavings(oldMode: ScanMode, newMode: ScanMode): Double {
        val oldPower = when (oldMode) {
            ScanMode.LOW_LATENCY -> 100.0
            ScanMode.BALANCED -> 60.0
            ScanMode.LOW_POWER -> 30.0
            ScanMode.ADAPTIVE -> 60.0
        }
        
        val newPower = when (newMode) {
            ScanMode.LOW_LATENCY -> 100.0
            ScanMode.BALANCED -> 60.0
            ScanMode.LOW_POWER -> 30.0
            ScanMode.ADAPTIVE -> 60.0
        }
        
        return ((oldPower - newPower) / oldPower) * 100
    }
    
    /**
     * Get scan settings based on mode - Task 46
     */
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
            
            ScanMode.LOW_LATENCY, ScanMode.ADAPTIVE -> ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setReportDelay(0)
                .build()
        }
    }
    
    /**
     * Get adaptive scan interval - Task 46
     */
    fun getAdaptiveScanInterval(): Long {
        return when (currentScanMode) {
            ScanMode.LOW_POWER -> 60000L // 60 seconds
            ScanMode.BALANCED -> 20000L // 20 seconds
            ScanMode.LOW_LATENCY -> 5000L // 5 seconds
            ScanMode.ADAPTIVE -> when {
                batteryLevel <= BATTERY_CRITICAL -> 90000L
                batteryLevel <= BATTERY_LOW -> 60000L
                batteryLevel <= BATTERY_MEDIUM -> 30000L
                else -> 10000L
            }
        }
    }
    
    /**
     * Start adaptive scanning with duty cycling - Task 46
     */
    fun startAdaptiveScanning(onScan: () -> Unit) {
        onScanCallback = onScan
        adaptiveScanJob?.cancel()
        
        adaptiveScanJob = scanScope.launch {
            while (isActive) {
                // Update battery level
                monitorBatteryLevel()
                
                // Scan phase
                lastScanStartTime = System.currentTimeMillis()
                onScan()
                scanCount++
                
                val scanDuration = dutyCycle.scanDurationMs.coerceAtMost(
                    if (dutyCycle == DutyCycle.CONTINUOUS) Long.MAX_VALUE else dutyCycle.scanDurationMs
                )
                delay(scanDuration)
                
                totalScanTimeMs += System.currentTimeMillis() - lastScanStartTime
                
                // Pause phase (duty cycle)
                if (dutyCycle.pauseDurationMs > 0) {
                    delay(dutyCycle.pauseDurationMs)
                }
            }
        }
        
        Log.i(TAG, "Adaptive scanning started with duty cycle: $dutyCycle")
    }
    
    /**
     * Set scan mode manually - Task 46
     */
    fun setScanMode(mode: ScanMode) {
        currentScanMode = mode
        Log.i(TAG, "Scan mode set to: $mode")
    }
    
    /**
     * Set duty cycle manually - Task 46
     */
    fun setDutyCycle(cycle: DutyCycle) {
        dutyCycle = cycle
        Log.i(TAG, "Duty cycle set to: $cycle")
    }
    
    /**
     * Get current battery level
     */
    fun getBatteryLevel(): Int = batteryLevel
    
    /**
     * Check if device is charging
     */
    fun isDeviceCharging(): Boolean = isCharging
    
    /**
     * Get power consumption metrics - Task 46
     */
    fun getPowerMetrics(): Map<String, Any> {
        val avgScanDuration = if (scanCount > 0) totalScanTimeMs / scanCount else 0L
        val currentDutyCyclePercent = if (dutyCycle == DutyCycle.CONTINUOUS) 100.0 else {
            (dutyCycle.scanDurationMs.toDouble() / (dutyCycle.scanDurationMs + dutyCycle.pauseDurationMs)) * 100
        }
        
        return mapOf(
            "batteryLevel" to batteryLevel,
            "isCharging" to isCharging,
            "currentScanMode" to currentScanMode.name,
            "currentDutyCycle" to dutyCycle.name,
            "scanCount" to scanCount,
            "totalScanTimeMs" to totalScanTimeMs,
            "totalScanTimeMinutes" to (totalScanTimeMs / 60000),
            "avgScanDurationMs" to avgScanDuration,
            "dutyCyclePercent" to currentDutyCyclePercent,
            "powerSavingsEstimate" to powerSavingsEstimatePercent,
            "recommendedInterval" to getAdaptiveScanInterval()
        )
    }
    
    /**
     * Cleanup resources - Task 46
     */
    fun cleanup() {
        adaptiveScanJob?.cancel()
        scanScope.cancel()
    }
}
