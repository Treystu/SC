package com.sovereign.communications.ble

import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Multi-Hop Relay - Task 43 Enhanced
 * Enables messages to traverse multiple hops through the mesh network
 * with path optimization and failure detection
 */
class BLEMultiHopRelay {
    
    data class RouteInfo(
        val nextHop: String,
        val hopCount: Int,
        val lastUpdated: Long,
        val reliability: Double = 1.0,
        val latencyMs: Long = 0,
        val pathQuality: Double = 1.0
    ) {
        fun isReliable(): Boolean = reliability > 0.7
        
        fun getScore(): Double {
            val hopScore = (maxHops - hopCount).toDouble() / maxHops
            val reliabilityScore = reliability
            val latencyScore = 1.0 - (latencyMs.coerceAtMost(1000) / 1000.0)
            
            return (hopScore * 0.5 + reliabilityScore * 0.3 + latencyScore * 0.2)
        }
    }
    
    /**
     * Relay path tracking - Task 43
     */
    data class RelayPath(
        val messageId: String,
        val path: List<String>,
        val hopCount: Int,
        val timestamp: Long,
        val failures: Int = 0
    ) {
        fun isExpired(currentTime: Long): Boolean {
            return (currentTime - timestamp) > 60000 // 1 minute
        }
    }
    
    /**
     * Relay metrics - Task 43
     */
    data class RelayMetrics(
        val messageId: String,
        val hops: Int,
        val relayTime: Long,
        val success: Boolean,
        val failureReason: String? = null
    )

    private val routingTable = ConcurrentHashMap<String, RouteInfo>()
    private val recentMessages = ConcurrentHashMap<String, Long>()
    private val relayPaths = ConcurrentHashMap<String, RelayPath>()
    private val relayMetrics = mutableListOf<RelayMetrics>()
    
    // Relay statistics
    private var totalRelayed = 0L
    private var relayFailures = 0L
    private var pathOptimizations = 0L
    
    companion object {
        private const val TAG = "BLEMultiHopRelay"
        const val maxHops = 5
        private const val routeExpiryMs = 300000L // 5 minutes
        private const val deduplicationWindowMs = 60000L // 1 minute
    }

    /**
     * Update routing table with new route information
     */
    fun updateRoute(destinationId: String, nextHop: String, hopCount: Int) {
        val existingRoute = routingTable[destinationId]
        
        // Update if new route or better route (fewer hops)
        if (existingRoute == null || hopCount < existingRoute.hopCount) {
            routingTable[destinationId] = RouteInfo(
                nextHop = nextHop,
                hopCount = hopCount,
                lastUpdated = System.currentTimeMillis()
            )
            Log.d(TAG, "Route updated: $destinationId via $nextHop, hops: $hopCount")
        }
    }
    
    /**
     * Update route with quality metrics - Task 43
     */
    fun updateRouteWithMetrics(
        destinationId: String,
        nextHop: String,
        hopCount: Int,
        reliability: Double,
        latencyMs: Long
    ) {
        val existing = routingTable[destinationId]
        val currentTime = System.currentTimeMillis()
        
        // Calculate path quality
        val pathQuality = calculatePathQuality(hopCount, reliability, latencyMs)
        
        // Update if better quality or expired
        val shouldUpdate = existing == null ||
                (currentTime - existing.lastUpdated) > routeExpiryMs ||
                pathQuality > existing.pathQuality
        
        if (shouldUpdate) {
            routingTable[destinationId] = RouteInfo(
                nextHop = nextHop,
                hopCount = hopCount,
                lastUpdated = currentTime,
                reliability = reliability,
                latencyMs = latencyMs,
                pathQuality = pathQuality
            )
            
            pathOptimizations++
            Log.i(TAG, "Route optimized: $destinationId via $nextHop, quality: %.2f".format(pathQuality))
        }
    }
    
    /**
     * Calculate path quality score - Task 43
     */
    private fun calculatePathQuality(hopCount: Int, reliability: Double, latencyMs: Long): Double {
        val hopScore = (maxHops - hopCount).toDouble() / maxHops
        val reliabilityScore = reliability
        val latencyScore = 1.0 - (latencyMs.coerceAtMost(1000) / 1000.0)
        
        return (hopScore * 0.5 + reliabilityScore * 0.3 + latencyScore * 0.2)
    }

    /**
     * Get next hop for a destination with path optimization - Task 43
     */
    fun getNextHop(destinationId: String): String? {
        val route = routingTable[destinationId] ?: return null
        
        // Check if route is expired
        val age = System.currentTimeMillis() - route.lastUpdated
        if (age > routeExpiryMs) {
            routingTable.remove(destinationId)
            return null
        }
        
        // Check reliability - Task 43
        if (!route.isReliable()) {
            Log.w(TAG, "Route to $destinationId unreliable (${route.reliability})")
            // Could trigger path optimization here
        }
        
        return route.nextHop
    }
    
    /**
     * Get best route from multiple paths - Task 43
     */
    fun getBestRoute(destinationId: String): RouteInfo? {
        return routingTable.values
            .filter { it.nextHop != destinationId }
            .maxByOrNull { it.getScore() }
    }

    /**
     * Check if message should be relayed (deduplication) - Task 43
     */
    fun shouldRelay(messageId: String, currentHopCount: Int): RelayDecision {
        // Check hop limit - Task 43
        if (currentHopCount >= maxHops) {
            return RelayDecision.Reject("Hop limit reached ($maxHops)")
        }

        // Check if we've seen this message recently
        val lastSeen = recentMessages[messageId]
        val now = System.currentTimeMillis()
        
        if (lastSeen != null && (now - lastSeen) < deduplicationWindowMs) {
            return RelayDecision.Reject("Already relayed recently")
        }

        // Record this message
        recentMessages[messageId] = now
        
        return RelayDecision.Accept
    }
    
    /**
     * Relay decision result
     */
    sealed class RelayDecision {
        object Accept : RelayDecision()
        data class Reject(val reason: String) : RelayDecision()
    }
    
    /**
     * Track relay path - Task 43
     */
    fun trackRelayPath(messageId: String, nodeId: String, hopCount: Int) {
        val existing = relayPaths[messageId]
        
        val updatedPath = if (existing != null) {
            existing.path.toMutableList().apply { add(nodeId) }
        } else {
            mutableListOf(nodeId)
        }
        
        relayPaths[messageId] = RelayPath(
            messageId = messageId,
            path = updatedPath,
            hopCount = hopCount,
            timestamp = System.currentTimeMillis()
        )
    }
    
    /**
     * Record relay success - Task 43
     */
    fun recordRelaySuccess(messageId: String, hopCount: Int, relayTimeMs: Long) {
        totalRelayed++
        
        relayMetrics.add(RelayMetrics(
            messageId = messageId,
            hops = hopCount,
            relayTime = relayTimeMs,
            success = true
        ))
        
        // Keep only recent metrics (last 1000)
        if (relayMetrics.size > 1000) {
            relayMetrics.removeAt(0)
        }
    }
    
    /**
     * Record relay failure - Task 43
     */
    fun recordRelayFailure(messageId: String, hopCount: Int, reason: String) {
        relayFailures++
        
        relayMetrics.add(RelayMetrics(
            messageId = messageId,
            hops = hopCount,
            relayTime = 0,
            success = false,
            failureReason = reason
        ))
        
        // Update path with failure
        val path = relayPaths[messageId]
        if (path != null) {
            relayPaths[messageId] = path.copy(failures = path.failures + 1)
        }
    }
    
    /**
     * Detect relay failure and optimize - Task 43
     */
    fun detectRelayFailure(messageId: String): Boolean {
        val path = relayPaths[messageId] ?: return false
        
        if (path.failures >= 3) {
            Log.w(TAG, "Relay failure detected for $messageId, failures: ${path.failures}")
            
            // Invalidate problematic routes in path
            path.path.forEach { nodeId ->
                val route = routingTable.values.find { it.nextHop == nodeId }
                if (route != null) {
                    // Decrease reliability
                    val updated = route.copy(
                        reliability = (route.reliability * 0.5).coerceAtLeast(0.0)
                    )
                    routingTable.entries.find { it.value == route }?.let {
                        routingTable[it.key] = updated
                    }
                }
            }
            
            relayPaths.remove(messageId)
            return true
        }
        
        return false
    }

    /**
     * Broadcast route update to neighbors
     */
    fun broadcastRouteUpdate(
        myId: String,
        neighbors: List<String>,
        sendUpdate: (String, ByteArray) -> Unit
    ) {
        // Create route advertisement
        val routes = routingTable.entries.map { (dest, route) ->
            "$dest:${route.hopCount + 1}:${route.reliability}:${route.latencyMs}" // Increment hop count
        }.joinToString(";")

        val updateMessage = "ROUTE_UPDATE:$myId:$routes".toByteArray()
        
        // Send to all neighbors
        neighbors.forEach { neighborId ->
            try {
                sendUpdate(neighborId, updateMessage)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send route update to $neighborId", e)
            }
        }
    }

    /**
     * Process received route update
     */
    fun processRouteUpdate(senderId: String, payload: ByteArray) {
        try {
            val message = String(payload)
            if (!message.startsWith("ROUTE_UPDATE:")) return
            
            val parts = message.removePrefix("ROUTE_UPDATE:").split(":")
            if (parts.size < 2) return
            
            val originId = parts[0]
            val routes = parts[1]
            
            if (routes.isEmpty()) return
            
            // Parse routes with metrics
            routes.split(";").forEach { routeStr ->
                val routeParts = routeStr.split(":")
                if (routeParts.size >= 4) {
                    val destId = routeParts[0]
                    val hopCount = routeParts[1].toIntOrNull() ?: return@forEach
                    val reliability = routeParts[2].toDoubleOrNull() ?: 1.0
                    val latencyMs = routeParts[3].toLongOrNull() ?: 0
                    
                    // Update route through sender with metrics
                    updateRouteWithMetrics(destId, senderId, hopCount, reliability, latencyMs)
                }
            }
            
            // Add direct route to sender
            updateRoute(senderId, senderId, 1)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing route update", e)
        }
    }

    /**
     * Clean up expired routes and old message records
     */
    fun cleanup() {
        val now = System.currentTimeMillis()
        
        // Remove expired routes
        routingTable.entries.removeAll { (_, route) ->
            (now - route.lastUpdated) > routeExpiryMs
        }
        
        // Remove old message records
        recentMessages.entries.removeAll { (_, timestamp) ->
            (now - timestamp) > deduplicationWindowMs
        }
        
        // Remove expired paths
        relayPaths.entries.removeAll { (_, path) ->
            path.isExpired(now)
        }
    }

    /**
     * Get routing table statistics - Task 43
     */
    fun getRoutingStats(): Map<String, Any> {
        cleanup()
        
        val routes = routingTable.values.toList()
        val successMetrics = relayMetrics.filter { it.success }
        
        return mapOf(
            "routeCount" to routingTable.size,
            "recentMessageCount" to recentMessages.size,
            "totalRelayed" to totalRelayed,
            "relayFailures" to relayFailures,
            "pathOptimizations" to pathOptimizations,
            "successRate" to if (relayMetrics.isNotEmpty()) 
                successMetrics.size.toDouble() / relayMetrics.size else 0.0,
            "averageHops" to if (successMetrics.isNotEmpty())
                successMetrics.map { it.hops }.average() else 0.0,
            "averageRelayTime" to if (successMetrics.isNotEmpty())
                successMetrics.map { it.relayTime }.average() else 0.0,
            "averageReliability" to if (routes.isNotEmpty())
                routes.map { it.reliability }.average() else 0.0,
            "hopDistribution" to routes
                .groupBy { it.hopCount }
                .mapValues { it.value.size },
            "activePaths" to relayPaths.size
        )
    }
}
