package com.sovereign.communications.ble

import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Neighbor Tracking
 * Tracks nearby BLE devices and their signal strength for optimal routing
 */
class BLENeighborTracking {
    
    data class Neighbor(
        val deviceId: String,
        val address: String,
        val rssi: Int,
        val lastSeen: Long,
        val avgRssi: Int,
        val reliabilityScore: Double
    )

    private val neighbors = ConcurrentHashMap<String, Neighbor>()
    private val rssiHistory = ConcurrentHashMap<String, MutableList<Int>>()
    private val neighborTimeoutMs = 30000L // 30 seconds
    private val rssiHistorySize = 10
    
    private var cleanupJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Update neighbor information
     */
    fun updateNeighbor(deviceId: String, address: String, rssi: Int) {
        val now = System.currentTimeMillis()
        
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
        
        // Update or create neighbor
        neighbors[deviceId] = Neighbor(
            deviceId = deviceId,
            address = address,
            rssi = rssi,
            lastSeen = now,
            avgRssi = avgRssi,
            reliabilityScore = reliabilityScore
        )
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
    }

    /**
     * Stop cleanup task
     */
    fun stopCleanup() {
        cleanupJob?.cancel()
        cleanupJob = null
    }

    /**
     * Remove stale neighbors
     */
    private fun cleanupStaleNeighbors() {
        val now = System.currentTimeMillis()
        
        neighbors.entries.removeAll { (deviceId, neighbor) ->
            val isStale = (now - neighbor.lastSeen) > neighborTimeoutMs
            if (isStale) {
                rssiHistory.remove(deviceId)
            }
            isStale
        }
    }

    /**
     * Get neighbor statistics
     */
    fun getNeighborStats(): Map<String, Any> {
        val activeNeighbors = getActiveNeighbors()
        
        return mapOf(
            "totalNeighbors" to activeNeighbors.size,
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
            "rssiDistribution" to activeNeighbors
                .groupBy { it.avgRssi / 10 * 10 } // Group by 10dBm buckets
                .mapKeys { "${it.key}dBm" }
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
    }
}
