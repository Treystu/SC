package com.sovereign.communications.util

import java.util.concurrent.ConcurrentHashMap

class RateLimiter(private val messagesPerMinute: Int, private val messagesPerHour: Int) {
    private val timestamps = ConcurrentHashMap<String, MutableList<Long>>()

    fun tryAcquire(userId: String): Boolean {
        val now = System.currentTimeMillis()
        val userTimestamps = timestamps.computeIfAbsent(userId) { mutableListOf() }

        userTimestamps.removeAll { now - it > 3600000 } // Remove old timestamps

        val lastMinute = userTimestamps.filter { now - it < 60000 }
        if (lastMinute.size >= messagesPerMinute) {
            return false
        }

        if (userTimestamps.size >= messagesPerHour) {
            return false
        }

        userTimestamps.add(now)
        return true
    }
}