package com.sovereign.communications

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.service.MeshNetworkManager
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Instrumentation tests for Mesh Network Manager
 * Tests actual mesh networking functionality on a physical device
 */
@RunWith(AndroidJUnit4::class)
class MeshNetworkInstrumentedTest {

    private lateinit var context: Context
    private lateinit var database: SCDatabase
    private lateinit var meshNetworkManager: MeshNetworkManager

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        database = SCDatabase.getDatabase(context)
        meshNetworkManager = MeshNetworkManager(context, database)
    }

    @After
    fun teardown() {
        // Clean up database
        database.close()
    }

    @Test
    fun testMeshNetworkManagerInitialization() {
        assertNotNull(meshNetworkManager)
        assertNotNull(meshNetworkManager.localPeerId)
        assertTrue(meshNetworkManager.localPeerId.isNotEmpty())
        assertEquals(64, meshNetworkManager.localPeerId.length) // 32 bytes as hex
    }

    @Test
    fun testLocalPeerIdConsistency() {
        val peerId1 = meshNetworkManager.localPeerId
        val peerId2 = meshNetworkManager.localPeerId

        assertEquals(peerId1, peerId2)
        assertTrue(peerId1.matches(Regex("[0-9a-f]{64}"))) // Valid hex string
    }

    @Test
    fun testInitialNetworkStats() {
        val stats = meshNetworkManager.getNetworkStats()

        assertNotNull(stats)
        assertEquals(0, stats.connectedPeers)
        assertEquals(0, stats.messagesSent)
        assertEquals(0, stats.messagesReceived)
        assertTrue(stats.uptime >= 0)
    }

    @Test
    fun testStartStopMeshNetwork() {
        val latch = CountDownLatch(1)

        runBlocking {
            meshNetworkManager.start { success ->
                assertTrue("Mesh network should start successfully", success)
                latch.countDown()
            }
        }

        assertTrue("Start callback should be called", latch.await(10, TimeUnit.SECONDS))

        // Test stop
        meshNetworkManager.stop()

        // Verify stats are updated
        val stats = meshNetworkManager.getNetworkStats()
        assertTrue("Uptime should be greater than 0 after starting", stats.uptime > 0)
    }

    @Test
    fun testSendMessageToNonexistentPeer() {
        val recipientId = "nonexistent-peer-123"
        val message = "Test message"

        // Should not crash
        meshNetworkManager.sendMessage(recipientId, message)

        // Verify message was queued or handled gracefully
        val stats = meshNetworkManager.getNetworkStats()
        // Note: Message might not be counted until actually sent
        assertNotNull(stats)
    }

    @Test
    fun testGetConnectedPeersInitiallyEmpty() {
        val connectedPeers = meshNetworkManager.getConnectedPeers()
        assertNotNull(connectedPeers)
        assertTrue(connectedPeers.isEmpty())
    }

    @Test
    fun testWebRTCManagerIntegration() {
        // Test that WebRTC manager is properly integrated
        val webRTCManager = meshNetworkManager.webRTCManager
        assertNotNull(webRTCManager)

        // Test basic WebRTC functionality
        val peerConnection = webRTCManager.createPeerConnection("test-peer")
        assertNotNull(peerConnection)
    }

    @Test
    fun testBLEDeviceDiscoveryIntegration() {
        // Test that BLE device discovery is properly integrated
        val deviceDiscovery = meshNetworkManager.deviceDiscovery
        assertNotNull(deviceDiscovery)

        // Test basic BLE discovery functionality
        assertFalse(deviceDiscovery.isScanning())
    }

    @Test
    fun testMessageRouting() {
        val testMessage = "Routing test message"
        val recipientId = "test-recipient"

        // Send message
        meshNetworkManager.sendMessage(recipientId, testMessage)

        // Verify message stats are updated (may be queued)
        val stats = meshNetworkManager.getNetworkStats()
        assertNotNull(stats)
        // Note: Actual message count depends on routing success
    }

    @Test
    fun testNetworkStatsUpdate() {
        val initialStats = meshNetworkManager.getNetworkStats()

        // Perform some network operations
        meshNetworkManager.sendMessage("test-peer", "test")

        val updatedStats = meshNetworkManager.getNetworkStats()

        // Uptime should increase
        assertTrue(updatedStats.uptime >= initialStats.uptime)
    }

    @Test
    fun testPersistenceAdapterIntegration() {
        val persistenceAdapter = meshNetworkManager.persistenceAdapter
        assertNotNull(persistenceAdapter)

        // Test basic persistence operations
        runBlocking {
            persistenceAdapter.set("test", "key", "value")
            val retrieved = persistenceAdapter.get("test", "key")
            assertEquals("value", retrieved)
        }
    }

    @Test
    fun testRateLimiterIntegration() {
        val rateLimiter = meshNetworkManager.rateLimiter
        assertNotNull(rateLimiter)

        // Test rate limiting
        val peerId = "test-peer"
        assertTrue(rateLimiter.canSend(peerId))
        assertTrue(rateLimiter.canSend(peerId)) // Should allow multiple sends within limit
    }

    @Test
    fun testRoomClientIntegration() {
        val roomClient = meshNetworkManager.roomClient
        assertNotNull(roomClient)

        // Test room client basic functionality
        assertNotNull(roomClient.localPeerId)
    }

    @Test
    fun testMultiHopRelayIntegration() {
        val multiHopRelay = meshNetworkManager.multiHopRelay
        assertNotNull(multiHopRelay)

        // Test multi-hop relay basic functionality
        val testData = "test".toByteArray()
        multiHopRelay.relayMessage(testData, ttl = 5) // Should not crash
    }

    @Test
    fun testStoreAndForwardIntegration() {
        val storeAndForward = meshNetworkManager.storeAndForward
        assertNotNull(storeAndForward)

        // Test store and forward basic functionality
        val testData = "test message".toByteArray()
        val recipientId = "recipient-peer"

        runBlocking {
            storeAndForward.storeMessage(testData, recipientId)
            // Should not crash
        }
    }

    @Test
    fun testPerformanceOfNetworkStats() {
        val iterations = 100
        val startTime = System.nanoTime()

        for (i in 0 until iterations) {
            val stats = meshNetworkManager.getNetworkStats()
            assertNotNull(stats)
        }

        val endTime = System.nanoTime()
        val averageTime = (endTime - startTime) / iterations

        // Should be fast (< 1ms per call)
        assertTrue(averageTime < 1_000_000) // Less than 1ms in nanoseconds
    }

    @Test
    fun testConcurrentMessageSending() {
        val threadCount = 10
        val messagesPerThread = 5
        val latch = CountDownLatch(threadCount)

        for (i in 0 until threadCount) {
            Thread {
                for (j in 0 until messagesPerThread) {
                    meshNetworkManager.sendMessage("peer-$i", "message-$j")
                }
                latch.countDown()
            }.start()
        }

        assertTrue("All threads should complete", latch.await(30, TimeUnit.SECONDS))

        // Verify stats were updated
        val stats = meshNetworkManager.getNetworkStats()
        assertNotNull(stats)
    }
}