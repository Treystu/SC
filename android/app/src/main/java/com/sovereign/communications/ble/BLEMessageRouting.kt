package com.sovereign.communications.ble

import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.PriorityBlockingQueue

/**
 * BLE Message Routing - Task 41
 * BLE-specific routing with route discovery, optimization, and metrics
 */
class BLEMessageRouting {
    
    private val routingTable = ConcurrentHashMap<String, RouteEntry>()
    private val routeDiscoveryQueue = PriorityBlockingQueue<RouteDiscoveryRequest>()
    private val recentMessages = ConcurrentHashMap<String, Long>()
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var discoveryJob: Job? = null
    
    // Routing metrics
    private var totalMessagesRouted = 0L
    private var routingFailures = 0L
    private var routeDiscoveries = 0L
    private var routeUpdates = 0L
    
    companion object {
        private const val TAG = "BLEMessageRouting"
        
        // Routing parameters
        private const val MAX_HOPS = 5
        private const val ROUTE_EXPIRY_MS = 300000L        // 5 minutes
        private const val ROUTE_DISCOVERY_TIMEOUT_MS = 10000L // 10 seconds
        private const val MESSAGE_DEDUP_WINDOW_MS = 60000L  // 1 minute
        
        // Route quality weights
        private const val WEIGHT_HOP_COUNT = 0.4
        private const val WEIGHT_RSSI = 0.3
        private const val WEIGHT_RELIABILITY = 0.2
        private const val WEIGHT_LATENCY = 0.1
    }
    
    /**
     * Route entry in routing table
     */
    data class RouteEntry(
        val destinationId: String,
        val nextHop: String,
        val hopCount: Int,
        val rssi: Int,
        val reliability: Double,
        val avgLatencyMs: Long,
        val lastUpdated: Long = System.currentTimeMillis(),
        val lastUsed: Long = 0,
        val successCount: Int = 0,
        val failureCount: Int = 0
    ) {
        /**
         * Calculate route quality score (0-100)
         */
        fun getQualityScore(): Double {
            val hopScore = (MAX_HOPS - hopCount).toDouble() / MAX_HOPS * 100
            val rssiScore = (rssi + 100).toDouble() / 100 * 100
            val reliabilityScore = reliability * 100
            val latencyScore = (1000 - avgLatencyMs.coerceAtMost(1000)).toDouble() / 1000 * 100
            
            return (hopScore * WEIGHT_HOP_COUNT +
                    rssiScore * WEIGHT_RSSI +
                    reliabilityScore * WEIGHT_RELIABILITY +
                    latencyScore * WEIGHT_LATENCY)
        }
        
        fun isExpired(currentTime: Long): Boolean {
            return (currentTime - lastUpdated) > ROUTE_EXPIRY_MS
        }
        
        fun isReliable(): Boolean {
            val totalAttempts = successCount + failureCount
            return totalAttempts == 0 || reliability > 0.7
        }
    }
    
    /**
     * Route discovery request
     */
    data class RouteDiscoveryRequest(
        val destinationId: String,
        val requestTime: Long = System.currentTimeMillis(),
        val timeout: Long = ROUTE_DISCOVERY_TIMEOUT_MS,
        val priority: Int = 5
    ) : Comparable<RouteDiscoveryRequest> {
        override fun compareTo(other: RouteDiscoveryRequest): Int {
            return other.priority - this.priority // Higher priority first
        }
        
        fun isExpired(currentTime: Long): Boolean {
            return (currentTime - requestTime) > timeout
        }
    }
    
    /**
     * Routing protocol message types
     */
    enum class RoutingMessageType {
        ROUTE_REQUEST,
        ROUTE_REPLY,
        ROUTE_UPDATE,
        ROUTE_ERROR
    }
    
    /**
     * Get route to destination
     */
    fun getRoute(destinationId: String): RouteEntry? {
        cleanupExpiredRoutes()
        
        val route = routingTable[destinationId]
        
        if (route == null || route.isExpired(System.currentTimeMillis())) {
            // Trigger route discovery
            initiateRouteDiscovery(destinationId)
            return null
        }
        
        return route
    }
    
    /**
     * Get best route from multiple options - Task 41
     */
    fun getBestRoute(destinationId: String): RouteEntry? {
        val routes = routingTable.values.filter { 
            it.destinationId == destinationId && 
            !it.isExpired(System.currentTimeMillis()) &&
            it.isReliable()
        }
        
        return routes.maxByOrNull { it.getQualityScore() }
    }
    
    /**
     * Update route in routing table - Task 41
     */
    fun updateRoute(
        destinationId: String,
        nextHop: String,
        hopCount: Int,
        rssi: Int = -70,
        reliability: Double = 1.0,
        latencyMs: Long = 0
    ) {
        val existing = routingTable[destinationId]
        val currentTime = System.currentTimeMillis()
        
        // Only update if new route is better or existing is expired
        val shouldUpdate = existing == null ||
                existing.isExpired(currentTime) ||
                hopCount < existing.hopCount ||
                (hopCount == existing.hopCount && rssi > existing.rssi)
        
        if (shouldUpdate) {
            val newRoute = RouteEntry(
                destinationId = destinationId,
                nextHop = nextHop,
                hopCount = hopCount,
                rssi = rssi,
                reliability = reliability,
                avgLatencyMs = latencyMs,
                successCount = existing?.successCount ?: 0,
                failureCount = existing?.failureCount ?: 0
            )
            
            routingTable[destinationId] = newRoute
            routeUpdates++
            
            Log.d(TAG, "Route updated: $destinationId via $nextHop, hops: $hopCount, quality: %.2f".format(newRoute.getQualityScore()))
        }
    }
    
    /**
     * Update route metrics after message transmission
     */
    fun updateRouteMetrics(destinationId: String, success: Boolean, latencyMs: Long = 0) {
        val route = routingTable[destinationId] ?: return
        
        val newSuccessCount = if (success) route.successCount + 1 else route.successCount
        val newFailureCount = if (!success) route.failureCount + 1 else route.failureCount
        val totalAttempts = newSuccessCount + newFailureCount
        val newReliability = if (totalAttempts > 0) {
            newSuccessCount.toDouble() / totalAttempts
        } else {
            1.0
        }
        
        // Exponential moving average for latency
        val newLatency = if (route.avgLatencyMs > 0) {
            (route.avgLatencyMs * 0.7 + latencyMs * 0.3).toLong()
        } else {
            latencyMs
        }
        
        routingTable[destinationId] = route.copy(
            successCount = newSuccessCount,
            failureCount = newFailureCount,
            reliability = newReliability,
            avgLatencyMs = newLatency,
            lastUsed = System.currentTimeMillis()
        )
        
        if (success) {
            totalMessagesRouted++
        } else {
            routingFailures++
        }
    }
    
    /**
     * Initiate route discovery - Task 41
     */
    fun initiateRouteDiscovery(destinationId: String, priority: Int = 5) {
        val request = RouteDiscoveryRequest(
            destinationId = destinationId,
            priority = priority
        )
        
        routeDiscoveryQueue.offer(request)
        routeDiscoveries++
        
        Log.i(TAG, "Route discovery initiated for $destinationId")
        
        // Start discovery worker if not running
        if (discoveryJob == null || !discoveryJob!!.isActive) {
            startRouteDiscovery()
        }
    }
    
    /**
     * Start route discovery worker
     */
    private fun startRouteDiscovery() {
        discoveryJob = scope.launch {
            while (isActive) {
                val request = routeDiscoveryQueue.poll(1, java.util.concurrent.TimeUnit.SECONDS)
                
                if (request != null) {
                    if (request.isExpired(System.currentTimeMillis())) {
                        Log.w(TAG, "Route discovery timeout for ${request.destinationId}")
                        continue
                    }
                    
                    // Broadcast route request
                    Log.d(TAG, "Broadcasting route request for ${request.destinationId}")
                    
                    // Construct a Route Request packet
                    // Format: [Type: ROUTE_REQUEST][DestinationID]
                    val packet = ByteArray(1 + request.destinationId.length)
                    packet[0] = RoutingMessageType.ROUTE_REQUEST.ordinal.toByte()
                    System.arraycopy(request.destinationId.toByteArray(), 0, packet, 1, request.destinationId.length)
                    
                    // Send via BLEConnectionService (using broadcast for now, ideally direct call)
                    // In a real app, we would use a proper event bus or dependency injection
                    // For now, we assume the BLE layer is listening for this intent or we use a callback
                    
                    // Placeholder for actual transmission logic
                    // BLEConnectionService.broadcastMessage(packet)
                }
            }
        }
    }
    
    /**
     * Process route discovery message - Task 41
     */
    fun processRouteMessage(
        messageType: RoutingMessageType,
        senderId: String,
        destinationId: String,
        hopCount: Int,
        rssi: Int
    ) {
        when (messageType) {
            RoutingMessageType.ROUTE_REQUEST -> {
                // Forward if we're not the destination
                // Update reverse route to sender
                updateRoute(senderId, senderId, hopCount, rssi)
            }
            
            RoutingMessageType.ROUTE_REPLY -> {
                // Update route to destination
                updateRoute(destinationId, senderId, hopCount, rssi)
            }
            
            RoutingMessageType.ROUTE_UPDATE -> {
                // Update existing route
                updateRoute(destinationId, senderId, hopCount, rssi)
            }
            
            RoutingMessageType.ROUTE_ERROR -> {
                // Invalidate route
                routingTable.remove(destinationId)
                // Trigger rediscovery if needed
                initiateRouteDiscovery(destinationId)
            }
        }
    }
    
    /**
     * Check if message should be routed (deduplication)
     */
    fun shouldRoute(messageId: String): Boolean {
        val now = System.currentTimeMillis()
        val lastSeen = recentMessages[messageId]
        
        if (lastSeen != null && (now - lastSeen) < MESSAGE_DEDUP_WINDOW_MS) {
            return false // Already routed recently
        }
        
        recentMessages[messageId] = now
        return true
    }
    
    /**
     * Get all routes to destination (for multi-path routing)
     */
    fun getAllRoutes(destinationId: String): List<RouteEntry> {
        cleanupExpiredRoutes()
        
        return routingTable.values
            .filter { 
                it.destinationId == destinationId &&
                !it.isExpired(System.currentTimeMillis())
            }
            .sortedByDescending { it.getQualityScore() }
    }
    
    /**
     * Cleanup expired routes
     */
    private fun cleanupExpiredRoutes() {
        val now = System.currentTimeMillis()
        
        routingTable.entries.removeAll { (_, route) ->
            route.isExpired(now)
        }
        
        // Cleanup old message records
        recentMessages.entries.removeAll { (_, timestamp) ->
            (now - timestamp) > MESSAGE_DEDUP_WINDOW_MS
        }
    }
    
    /**
     * Get routing statistics - Task 41
     */
    fun getStats(): Map<String, Any> {
        cleanupExpiredRoutes()
        
        val routes = routingTable.values.toList()
        
        return mapOf(
            "routeCount" to routes.size,
            "totalMessagesRouted" to totalMessagesRouted,
            "routingFailures" to routingFailures,
            "routeDiscoveries" to routeDiscoveries,
            "routeUpdates" to routeUpdates,
            "averageHopCount" to if (routes.isNotEmpty())
                routes.map { it.hopCount }.average() else 0.0,
            "averageReliability" to if (routes.isNotEmpty())
                routes.map { it.reliability }.average() else 0.0,
            "averageQuality" to if (routes.isNotEmpty())
                routes.map { it.getQualityScore() }.average() else 0.0,
            "hopDistribution" to routes
                .groupBy { it.hopCount }
                .mapValues { it.value.size },
            "pendingDiscoveries" to routeDiscoveryQueue.size
        )
    }
    
    /**
     * Clear routing table
     */
    fun clear() {
        routingTable.clear()
        recentMessages.clear()
        routeDiscoveryQueue.clear()
    }
    
    /**
     * Cleanup resources
     */
    fun cleanup() {
        discoveryJob?.cancel()
        clear()
        scope.cancel()
    }
}
