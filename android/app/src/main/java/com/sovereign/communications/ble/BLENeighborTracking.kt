package com.sovereign.communications.ble

import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Neighbor Tracking - Task 44 Enhanced
 * Tracks nearby BLE devices and their signal strength for optimal routing
 * with event notifications and comprehensive metrics
 */
class BLENeighborTracking {
    
    data class Neighbor(
        val deviceId: String,
        val address: String,
        val rssi: Int,
        val lastSeen: Long,
        val avgRssi: Int,
        val reliabilityScore: Double,
        val firstSeen: Long = System.currentTimeMillis(),
        val packetsSeen: Int = 0,
        val packetsLost: Int = 0,
        val connectionQuality: ConnectionQuality = ConnectionQuality.UNKNOWN
    ) {
        fun getPacketLossRate(): Double {
            val total = packetsSeen + packetsLost
            return if (total > 0) packetsLost.toDouble() / total else 0.0
        }
        
        fun isStable(): Boolean {
            return reliabilityScore > 0.7 && getPacketLossRate() < 0.2
        }
    }
    
    enum class ConnectionQuality {
        EXCELLENT,
        GOOD,
        FAIR,
        POOR,
        UNKNOWN
    }
    
    /**
     * Neighbor event types - Task 44
     */
    enum class NeighborEvent {
        DISCOVERED,
        UPDATED,
        TIMEOUT,
        QUALITY_CHANGED,
        LOST
    }
    
    /**
     * Neighbor event callback - Task 44
     */
    interface NeighborEventCallback {
        fun onNeighborEvent(event: NeighborEvent, neighbor: Neighbor)
    }

    private val neighbors = ConcurrentHashMap<String, Neighbor>()
    private val rssiHistory = ConcurrentHashMap<String, MutableList<Int>>()
    private val eventCallbacks = mutableListOf<NeighborEventCallback>()
    
    private val neighborTimeoutMs = 30000L // 30 seconds
    private val rssiHistorySize = 10
    
    private var cleanupJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Metrics
    private var totalNeighborsDiscovered = 0L
    private var totalNeighborsLost = 0L
    private var qualityChanges = 0L
    
    companion object {
        private const val TAG = "BLENeighborTracking"
        
        // RSSI thresholds for quality
        private const val RSSI_EXCELLENT = -50
        private const val RSSI_GOOD = -70
        private const val RSSI_FAIR = -85
    }

    /**
     * Update neighbor information - Task 44 Enhanced
     */
    fun updateNeighbor(deviceId: String, address: String, rssi: Int, packetReceived: Boolean = true) {
        val now = System.currentTimeMillis()
        val existing = neighbors[deviceId]
        val isNew = existing == null
        
        // Update RSSI history
        val history = rssiHistory.getOrPut(deviceId) { mutableListOf() }
        history.add(rssi)
        if (history.size > rssiHistorySize) {
            history.removeAt(0)
        }
        
        // Calculate average RSSI
        val avgRssi = history.average().toInt()
        
        // Calculate reliability score based on RSSI stability
        val rssiVariance = if (history.size > 1) {
            val mean = history.average()
            history.map { (it - mean) * (it - mean) }.average()
        } else {
            0.0
        }
        val reliabilityScore = (100.0 - rssiVariance).coerceIn(0.0, 100.0) / 100.0
        
        // Determine connection quality
        val quality = when {
            avgRssi >= RSSI_EXCELLENT -> ConnectionQuality.EXCELLENT
            avgRssi >= RSSI_GOOD -> ConnectionQuality.GOOD
            avgRssi >= RSSI_FAIR -> ConnectionQuality.FAIR
            else -> ConnectionQuality.POOR
        }
        
        // Check for quality change
        val qualityChanged = existing?.connectionQuality != quality
        
        // Update or create neighbor
        val neighbor = Neighbor(
            deviceId = deviceId,
            address = address,
            rssi = rssi,
            lastSeen = now,
            avgRssi = avgRssi,
            reliabilityScore = reliabilityScore,
            firstSeen = existing?.firstSeen ?: now,
            packetsSeen = (existing?.packetsSeen ?: 0) + if (packetReceived) 1 else 0,
            packetsLost = (existing?.packetsLost ?: 0) + if (!packetReceived) 1 else 0,
            connectionQuality = quality
        )
        
        neighbors[deviceId] = neighbor
        
        // Notify event callbacks - Task 44
        if (isNew) {
            totalNeighborsDiscovered++
            notifyEvent(NeighborEvent.DISCOVERED, neighbor)
            Log.i(TAG, "Neighbor discovered: $deviceId, RSSI: $rssi")
        } else {
            notifyEvent(NeighborEvent.UPDATED, neighbor)
            
            if (qualityChanged) {
                qualityChanges++
                notifyEvent(NeighborEvent.QUALITY_CHANGED, neighbor)
                Log.i(TAG, "Neighbor quality changed: $deviceId, ${existing?.connectionQuality} -> $quality")
            }
        }
    }
    
    /**
     * Register event callback - Task 44
     */
    fun registerEventCallback(callback: NeighborEventCallback) {
        eventCallbacks.add(callback)
    }
    
    /**
     * Unregister event callback - Task 44
     */
    fun unregisterEventCallback(callback: NeighborEventCallback) {
        eventCallbacks.remove(callback)
    }
    
    /**
     * Notify event to all callbacks
     */
    private fun notifyEvent(event: NeighborEvent, neighbor: Neighbor) {
        eventCallbacks.forEach { callback ->
            try {
                callback.onNeighborEvent(event, neighbor)
            } catch (e: Exception) {
                Log.e(TAG, "Error in neighbor event callback", e)
            }
        }
    }

    /**
     * Get all active neighbors
     */
    fun getActiveNeighbors(): List<Neighbor> {
        val now = System.currentTimeMillis()
        return neighbors.values.filter { neighbor ->
            (now - neighbor.lastSeen) < neighborTimeoutMs
        }.sortedByDescending { it.avgRssi }
    }
    
    /**
     * Get neighbors by quality - Task 44
     */
    fun getNeighborsByQuality(quality: ConnectionQuality): List<Neighbor> {
        return getActiveNeighbors().filter { it.connectionQuality == quality }
    }
    
    /**
     * Get stable neighbors only - Task 44
     */
    fun getStableNeighbors(): List<Neighbor> {
        return getActiveNeighbors().filter { it.isStable() }
    }

    /**
     * Get best neighbor for routing (highest RSSI and reliability)
     */
    fun getBestNeighbor(excludeIds: Set<String> = emptySet()): Neighbor? {
        return getActiveNeighbors()
            .filter { it.deviceId !in excludeIds }
            .maxByOrNull { it.avgRssi * it.reliabilityScore }
    }

    /**
     * Get neighbor by device ID
     */
    fun getNeighbor(deviceId: String): Neighbor? {
        val neighbor = neighbors[deviceId] ?: return null
        val now = System.currentTimeMillis()
        
        // Check if neighbor is still active
        return if ((now - neighbor.lastSeen) < neighborTimeoutMs) {
            neighbor
        } else {
            null
        }
    }

    /**
     * Check if a device is a neighbor
     */
    fun isNeighbor(deviceId: String): Boolean {
        return getNeighbor(deviceId) != null
    }

    /**
     * Get neighbors within RSSI threshold
     */
    fun getNeighborsWithMinRssi(minRssi: Int): List<Neighbor> {
        return getActiveNeighbors().filter { it.avgRssi >= minRssi }
    }

    /**
     * Start periodic cleanup of stale neighbors
     */
    fun startCleanup() {
        cleanupJob?.cancel()
        cleanupJob = scope.launch {
            while (isActive) {
                delay(10000) // Clean every 10 seconds
                cleanupStaleNeighbors()
            }
        }
        Log.i(TAG, "Neighbor cleanup started")
    }

    /**
     * Stop cleanup task
     */
    fun stopCleanup() {
        cleanupJob?.cancel()
        cleanupJob = null
        Log.i(TAG, "Neighbor cleanup stopped")
    }

    /**
     * Remove stale neighbors with timeout notifications - Task 44
     */
    private fun cleanupStaleNeighbors() {
        val now = System.currentTimeMillis()
        
        neighbors.entries.removeAll { (deviceId, neighbor) ->
            val isStale = (now - neighbor.lastSeen) > neighborTimeoutMs
            if (isStale) {
                totalNeighborsLost++
                rssiHistory.remove(deviceId)
                
                // Notify timeout event - Task 44
                notifyEvent(NeighborEvent.TIMEOUT, neighbor)
                notifyEvent(NeighborEvent.LOST, neighbor)
                
                Log.d(TAG, "Neighbor lost: $deviceId, last seen ${now - neighbor.lastSeen}ms ago")
            }
            isStale
        }
    }

    /**
     * Get neighbor statistics - Task 44 Enhanced
     */
    fun getNeighborStats(): Map<String, Any> {
        val activeNeighbors = getActiveNeighbors()
        
        return mapOf(
            "totalNeighbors" to activeNeighbors.size,
            "totalDiscovered" to totalNeighborsDiscovered,
            "totalLost" to totalNeighborsLost,
            "qualityChanges" to qualityChanges,
            "avgRssi" to if (activeNeighbors.isNotEmpty()) {
                activeNeighbors.map { it.avgRssi }.average().toInt()
            } else {
                0
            },
            "avgReliability" to if (activeNeighbors.isNotEmpty()) {
                activeNeighbors.map { it.reliabilityScore }.average()
            } else {
                0.0
            },
            "avgPacketLoss" to if (activeNeighbors.isNotEmpty()) {
                activeNeighbors.map { it.getPacketLossRate() }.average()
            } else {
                0.0
            },
            "stableNeighbors" to activeNeighbors.count { it.isStable() },
            "rssiDistribution" to activeNeighbors
                .groupBy { it.avgRssi / 10 * 10 } // Group by 10dBm buckets
                .mapKeys { "${it.key}dBm" }
                .mapValues { it.value.size },
            "qualityDistribution" to activeNeighbors
                .groupBy { it.connectionQuality }
                .mapValues { it.value.size }
        )
    }

    /**
     * Cleanup resources
     */
    fun cleanup() {
        stopCleanup()
        neighbors.clear()
        rssiHistory.clear()
        eventCallbacks.clear()
        scope.cancel()
    }
}
