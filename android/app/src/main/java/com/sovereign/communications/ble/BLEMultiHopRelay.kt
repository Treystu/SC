package com.sovereign.communications.ble

import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Multi-Hop Relay
 * Enables messages to traverse multiple hops through the mesh network
 */
class BLEMultiHopRelay {
    
    data class RouteInfo(
        val nextHop: String,
        val hopCount: Int,
        val lastUpdated: Long
    )

    private val routingTable = ConcurrentHashMap<String, RouteInfo>()
    private val recentMessages = ConcurrentHashMap<String, Long>()
    private val maxHops = 5
    private val routeExpiryMs = 300000L // 5 minutes
    private val deduplicationWindowMs = 60000L // 1 minute

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
        }
    }

    /**
     * Get next hop for a destination
     */
    fun getNextHop(destinationId: String): String? {
        val route = routingTable[destinationId] ?: return null
        
        // Check if route is expired
        val age = System.currentTimeMillis() - route.lastUpdated
        if (age > routeExpiryMs) {
            routingTable.remove(destinationId)
            return null
        }
        
        return route.nextHop
    }

    /**
     * Check if message should be relayed (deduplication)
     */
    fun shouldRelay(messageId: String, currentHopCount: Int): Boolean {
        // Check hop limit
        if (currentHopCount >= maxHops) {
            return false
        }

        // Check if we've seen this message recently
        val lastSeen = recentMessages[messageId]
        val now = System.currentTimeMillis()
        
        if (lastSeen != null && (now - lastSeen) < deduplicationWindowMs) {
            return false // Already relayed recently
        }

        // Record this message
        recentMessages[messageId] = now
        
        return true
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
            "$dest:${route.hopCount + 1}" // Increment hop count
        }.joinToString(";")

        val updateMessage = "ROUTE_UPDATE:$myId:$routes".toByteArray()
        
        // Send to all neighbors
        neighbors.forEach { neighborId ->
            try {
                sendUpdate(neighborId, updateMessage)
            } catch (e: Exception) {
                // Log error but continue
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
            
            // Parse routes
            routes.split(";").forEach { routeStr ->
                val routeParts = routeStr.split(":")
                if (routeParts.size == 2) {
                    val destId = routeParts[0]
                    val hopCount = routeParts[1].toIntOrNull() ?: return@forEach
                    
                    // Update route through sender
                    updateRoute(destId, senderId, hopCount)
                }
            }
            
            // Add direct route to sender
            updateRoute(senderId, senderId, 1)
        } catch (e: Exception) {
            // Log error
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
    }

    /**
     * Get routing table statistics
     */
    fun getRoutingStats(): Map<String, Any> {
        return mapOf(
            "routeCount" to routingTable.size,
            "recentMessageCount" to recentMessages.size,
            "hopDistribution" to routingTable.values
                .groupBy { it.hopCount }
                .mapValues { it.value.size }
        )
    }
}
