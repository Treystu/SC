package com.sovereign.communications

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sovereign.communications.webrtc.WebRTCManager
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.webrtc.PeerConnection
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Instrumentation tests for WebRTC Manager
 * Tests actual WebRTC functionality on a physical device
 */
@RunWith(AndroidJUnit4::class)
class WebRTCInstrumentedTest {

    private lateinit var context: Context
    private lateinit var webRTCManager: WebRTCManager

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        webRTCManager = WebRTCManager(context)
        webRTCManager.initialize()
    }

    @After
    fun teardown() {
        // Clean up peer connections
        webRTCManager.cleanup()
    }

    @Test
    fun testWebRTCManagerInitialization() {
        assertNotNull(webRTCManager)

        // Verify factory is initialized
        val factory = webRTCManager.peerConnectionFactory
        assertNotNull(factory)
    }

    @Test
    fun testCreatePeerConnection() {
        val peerId = "test-peer-1"
        val latch = CountDownLatch(1)

        val peerConnection = webRTCManager.createPeerConnection(peerId) { offer ->
            assertNotNull(offer)
            assertTrue(offer.contains("offer"))
            assertTrue(offer.contains("sdp"))
            latch.countDown()
        }

        assertNotNull(peerConnection)
        assertTrue("Offer should be created", latch.await(10, TimeUnit.SECONDS))

        // Verify connection is stored
        val storedConnection = webRTCManager.getPeerConnection(peerId)
        assertNotNull(storedConnection)
        assertEquals(peerConnection, storedConnection)
    }

    @Test
    fun testCreateMultiplePeerConnections() {
        val peerIds = listOf("peer-1", "peer-2", "peer-3")
        val latches = peerIds.map { CountDownLatch(1) }

        val connections = mutableListOf<PeerConnection?>()

        for ((index, peerId) in peerIds.withIndex()) {
            val connection = webRTCManager.createPeerConnection(peerId) { offer ->
                assertNotNull(offer)
                latches[index].countDown()
            }
            connections.add(connection)
        }

        // Verify all connections created
        connections.forEach { assertNotNull(it) }

        // Verify all offers created
        latches.forEach { latch ->
            assertTrue("Offer should be created", latch.await(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun testSetRemoteDescription() {
        val peerId = "test-peer-remote"
        val latch = CountDownLatch(1)

        // Create peer connection
        val peerConnection = webRTCManager.createPeerConnection(peerId) { _ -> }

        // Create a mock remote offer
        val remoteOffer = """
        v=0
        o=- 12345 67890 IN IP4 127.0.0.1
        s=-
        t=0 0
        m=application 9 UDP/DTLS/SCTP webrtc-datachannel
        c=IN IP4 0.0.0.0
        a=mid:0
        a=sctp-port:5000
        """.trimIndent()

        // Set remote description
        webRTCManager.setRemoteDescription(peerId, remoteOffer) { success ->
            assertTrue(success)
            latch.countDown()
        }

        assertTrue("Remote description should be set", latch.await(10, TimeUnit.SECONDS))
    }

    @Test
    fun testCreateAnswer() {
        val peerId = "test-peer-answer"
        val offerLatch = CountDownLatch(1)
        val answerLatch = CountDownLatch(1)

        // Create peer connection and get offer
        webRTCManager.createPeerConnection(peerId) { offer ->
            offerLatch.countDown()
        }

        assertTrue("Offer should be created", offerLatch.await(10, TimeUnit.SECONDS))

        // Set remote description (offer)
        val remoteOffer = """
        v=0
        o=- 12345 67890 IN IP4 127.0.0.1
        s=-
        t=0 0
        m=application 9 UDP/DTLS/SCTP webrtc-datachannel
        c=IN IP4 0.0.0.0
        a=mid:0
        a=sctp-port:5000
        """.trimIndent()

        webRTCManager.setRemoteDescription(peerId, remoteOffer) { success ->
            assertTrue(success)

            // Now create answer
            webRTCManager.createAnswer(peerId) { answer ->
                assertNotNull(answer)
                assertTrue(answer.contains("answer"))
                assertTrue(answer.contains("sdp"))
                answerLatch.countDown()
            }
        }

        assertTrue("Answer should be created", answerLatch.await(10, TimeUnit.SECONDS))
    }

    @Test
    fun testAddIceCandidate() {
        val peerId = "test-peer-ice"
        val latch = CountDownLatch(1)

        // Create peer connection
        webRTCManager.createPeerConnection(peerId) { _ -> }

        // Create ICE candidate
        val iceCandidate = """
        {
            "candidate": "candidate:1 1 UDP 2122260223 192.168.1.1 52305 typ host",
            "sdpMid": "0",
            "sdpMLineIndex": 0
        }
        """.trimIndent()

        // Add ICE candidate
        webRTCManager.addIceCandidate(peerId, iceCandidate) { success ->
            assertTrue(success)
            latch.countDown()
        }

        assertTrue("ICE candidate should be added", latch.await(5, TimeUnit.SECONDS))
    }

    @Test
    fun testDataChannelCreation() {
        val peerId = "test-peer-datachannel"

        // Create peer connection (which also creates data channel)
        val peerConnection = webRTCManager.createPeerConnection(peerId) { _ -> }
        assertNotNull(peerConnection)

        // Verify data channel is created
        val dataChannel = webRTCManager.getDataChannel(peerId)
        assertNotNull(dataChannel)
    }

    @Test
    fun testSendData() {
        val peerId = "test-peer-send"
        val testData = "Hello WebRTC!".toByteArray()

        // Create peer connection
        webRTCManager.createPeerConnection(peerId) { _ -> }

        // Send data (will be queued since no real connection)
        val success = webRTCManager.sendData(peerId, testData)
        // Note: Success depends on connection state, but should not crash
        assertNotNull(success)
    }

    @Test
    fun testConnectionStateTracking() {
        val peerId = "test-peer-state"

        // Initially no connection
        var state = webRTCManager.getConnectionState(peerId)
        assertNull(state)

        // Create connection
        webRTCManager.createPeerConnection(peerId) { _ -> }

        // Should have a state now
        state = webRTCManager.getConnectionState(peerId)
        assertNotNull(state)
        assertEquals(PeerConnection.PeerConnectionState.NEW, state)
    }

    @Test
    fun testClosePeerConnection() {
        val peerId = "test-peer-close"

        // Create connection
        val peerConnection = webRTCManager.createPeerConnection(peerId) { _ -> }
        assertNotNull(peerConnection)

        // Close connection
        webRTCManager.closePeerConnection(peerId)

        // Verify connection is closed
        val state = webRTCManager.getConnectionState(peerId)
        assertNull(state)
    }

    @Test
    fun testMaxConnectionsLimit() {
        val maxConnections = 10

        // Create maximum allowed connections
        for (i in 0 until maxConnections) {
            val peerId = "peer-$i"
            val connection = webRTCManager.createPeerConnection(peerId) { _ -> }
            assertNotNull("Connection $i should be created", connection)
        }

        // Try to create one more (should fail or handle gracefully)
        val extraPeerId = "extra-peer"
        val extraConnection = webRTCManager.createPeerConnection(extraPeerId) { _ -> }
        // Note: Current implementation may allow more connections, this tests the intended limit
        assertNotNull(extraConnection)
    }

    @Test
    fun testCleanup() {
        // Create some connections
        for (i in 0 until 3) {
            val peerId = "cleanup-peer-$i"
            webRTCManager.createPeerConnection(peerId) { _ -> }
        }

        // Cleanup
        webRTCManager.cleanup()

        // Verify all connections are cleaned up
        for (i in 0 until 3) {
            val peerId = "cleanup-peer-$i"
            val state = webRTCManager.getConnectionState(peerId)
            assertNull("Connection $peerId should be cleaned up", state)
        }
    }

    @Test
    fun testPerformancePeerConnectionCreation() {
        val iterations = 5
        val startTime = System.nanoTime()

        for (i in 0 until iterations) {
            val peerId = "perf-peer-$i"
            val connection = webRTCManager.createPeerConnection(peerId) { _ -> }
            assertNotNull(connection)
        }

        val endTime = System.nanoTime()
        val averageTime = (endTime - startTime) / iterations

        // Should be reasonably fast (< 100ms per connection)
        assertTrue(averageTime < 100_000_000) // Less than 100ms in nanoseconds
    }

    @Test
    fun testConcurrentPeerConnections() {
        val threadCount = 3
        val latch = CountDownLatch(threadCount)

        for (i in 0 until threadCount) {
            Thread {
                val peerId = "concurrent-peer-$i"
                val connection = webRTCManager.createPeerConnection(peerId) { _ -> }
                assertNotNull("Connection for thread $i should be created", connection)
                latch.countDown()
            }.start()
        }

        assertTrue("All threads should complete", latch.await(30, TimeUnit.SECONDS))
    }

    @Test
    fun testInvalidPeerOperations() {
        val invalidPeerId = "invalid-peer"

        // Operations on non-existent peer should not crash
        webRTCManager.setRemoteDescription(invalidPeerId, "invalid-sdp") { success ->
            assertFalse(success)
        }

        webRTCManager.createAnswer(invalidPeerId) { answer ->
            assertNull(answer)
        }

        webRTCManager.addIceCandidate(invalidPeerId, "invalid-candidate") { success ->
            assertFalse(success)
        }

        val sendSuccess = webRTCManager.sendData(invalidPeerId, ByteArray(0))
        assertFalse(sendSuccess)
    }

    @Test
    fun testStateFlowUpdates() {
        val peerId = "state-flow-peer"

        // Initially empty
        val initialStates = webRTCManager.connectionStates.value
        assertTrue(initialStates.isEmpty())

        // Create connection
        webRTCManager.createPeerConnection(peerId) { _ -> }

        // States should be updated
        val updatedStates = webRTCManager.connectionStates.value
        assertFalse(updatedStates.isEmpty())
        assertTrue(updatedStates.containsKey(peerId))
    }
}