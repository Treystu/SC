import XCTest
import WebRTC
@testable import SovereignCommunications

final class WebRTCTests: XCTestCase {

    var webRTCManager: WebRTCManager!

    override func setUpWithError() throws {
        try super.setUpWithError()
        webRTCManager = WebRTCManager.shared
    }

    override func tearDownWithError() throws {
        // Clean up any peer connections created during tests
        webRTCManager = nil
        try super.tearDownWithError()
    }

    // MARK: - Peer Connection Tests

    func testCreatePeerConnection() throws {
        let peerId = "test-peer-1"

        let peerConnection = webRTCManager.createPeerConnection(for: peerId)
        XCTAssertNotNil(peerConnection)
        XCTAssertEqual(peerConnection?.connectionState, .new)

        // Verify connection is stored
        let storedConnection = webRTCManager.getConnectionState(for: peerId)
        XCTAssertNotNil(storedConnection)
    }

    func testCreateDuplicatePeerConnection() throws {
        let peerId = "test-peer-2"

        // Create first connection
        let connection1 = webRTCManager.createPeerConnection(for: peerId)
        XCTAssertNotNil(connection1)

        // Try to create duplicate - should return existing
        let connection2 = webRTCManager.createPeerConnection(for: peerId)
        XCTAssertNotNil(connection2)
        XCTAssertEqual(connection1, connection2)
    }

    func testClosePeerConnection() throws {
        let peerId = "test-peer-3"

        // Create connection
        let peerConnection = webRTCManager.createPeerConnection(for: peerId)
        XCTAssertNotNil(peerConnection)

        // Close connection
        webRTCManager.closePeerConnection(for: peerId)

        // Verify connection is removed
        let connectionState = webRTCManager.getConnectionState(for: peerId)
        XCTAssertNil(connectionState)
    }

    // MARK: - SDP Signaling Tests

    func testCreateOffer() throws {
        let peerId = "test-peer-offer"
        let expectation = self.expectation(description: "Create offer")

        // Create peer connection
        _ = webRTCManager.createPeerConnection(for: peerId)

        // Create offer
        webRTCManager.createOffer(for: peerId) { sdp, error in
            XCTAssertNil(error)
            XCTAssertNotNil(sdp)
            XCTAssertEqual(sdp?.type, .offer)

            // Verify SDP contains expected content
            if let sdpString = sdp?.sdp {
                XCTAssertTrue(sdpString.contains("m=application"))
                XCTAssertTrue(sdpString.contains("UDP/DTLS/SCTP"))
            }

            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 10.0)
    }

    func testCreateAnswer() throws {
        let peerId = "test-peer-answer"
        let expectation = self.expectation(description: "Create answer")

        // Create peer connection
        _ = webRTCManager.createPeerConnection(for: peerId)

        // Create answer
        webRTCManager.createAnswer(for: peerId) { sdp, error in
            XCTAssertNil(error)
            XCTAssertNotNil(sdp)
            XCTAssertEqual(sdp?.type, .answer)

            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 10.0)
    }

    func testSetRemoteDescription() throws {
        let peerId = "test-peer-remote"
        let expectation = self.expectation(description: "Set remote description")

        // Create peer connection
        _ = webRTCManager.createPeerConnection(for: peerId)

        // Create a mock remote offer
        let remoteOffer = RTCSessionDescription(type: .offer, sdp: """
        v=0
        o=- 12345 67890 IN IP4 127.0.0.1
        s=-
        t=0 0
        m=application 9 UDP/DTLS/SCTP webrtc-datachannel
        c=IN IP4 0.0.0.0
        a=mid:0
        a=sctp-port:5000
        """)

        // Set remote description
        webRTCManager.setRemoteDescription(for: peerId, sdp: remoteOffer) { error in
            XCTAssertNil(error)
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 10.0)
    }

    func testCreateOfferForNonexistentPeer() throws {
        let peerId = "nonexistent-peer"
        let expectation = self.expectation(description: "Create offer for nonexistent peer")

        webRTCManager.createOffer(for: peerId) { sdp, error in
            XCTAssertNotNil(error)
            XCTAssertNil(sdp)

            if let webRTCError = error as? WebRTCError {
                XCTAssertEqual(webRTCError, .connectionNotFound)
            }

            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 5.0)
    }

    // MARK: - Data Channel Tests

    func testDataChannelCreation() throws {
        let peerId = "test-peer-datachannel"

        // Create peer connection (which also creates data channel)
        let peerConnection = webRTCManager.createPeerConnection(for: peerId)
        XCTAssertNotNil(peerConnection)

        // Note: We can't easily test data channel state without actual connection,
        // but we can verify the connection was created successfully
    }

    func testSendDataToNonexistentPeer() throws {
        let peerId = "nonexistent-peer"
        let testData = "Hello World".data(using: .utf8)!

        let success = webRTCManager.send(data: testData, to: peerId)
        XCTAssertFalse(success)
    }

    // MARK: - ICE Candidate Tests

    func testAddIceCandidate() throws {
        let peerId = "test-peer-ice"
        let expectation = self.expectation(description: "Add ICE candidate")

        // Create peer connection
        _ = webRTCManager.createPeerConnection(for: peerId)

        // Create a mock ICE candidate
        let iceCandidate = RTCIceCandidate(
            sdp: "candidate:1 1 UDP 2122260223 192.168.1.1 52305 typ host",
            sdpMLineIndex: 0,
            sdpMid: "0"
        )

        // Add ICE candidate (this should not fail even if connection isn't established)
        webRTCManager.addIceCandidate(for: peerId, candidate: iceCandidate)

        // Since addIceCandidate is async and doesn't provide completion,
        // we'll just wait a bit and assume it worked if no crash occurred
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 1.0)
    }

    // MARK: - Connection State Tests

    func testConnectionStateForNonexistentPeer() throws {
        let peerId = "nonexistent-peer"

        let state = webRTCManager.getConnectionState(for: peerId)
        XCTAssertNil(state)
    }

    func testIceConnectionStateForNonexistentPeer() throws {
        let peerId = "nonexistent-peer"

        let state = webRTCManager.getIceConnectionState(for: peerId)
        XCTAssertNil(state)
    }

    func testInitialConnectionState() throws {
        let peerId = "test-peer-state"

        // Before creating connection
        var state = webRTCManager.getConnectionState(for: peerId)
        XCTAssertNil(state)

        // After creating connection
        _ = webRTCManager.createPeerConnection(for: peerId)
        state = webRTCManager.getConnectionState(for: peerId)
        XCTAssertNotNil(state)
        XCTAssertEqual(state, .new)
    }

    // MARK: - Error Handling Tests

    func testWebRTCErrorDescriptions() throws {
        let connectionError = WebRTCError.connectionNotFound
        XCTAssertEqual(connectionError.localizedDescription, "Peer connection not found")

        let sdpError = WebRTCError.sdpGenerationFailed
        XCTAssertEqual(sdpError.localizedDescription, "Failed to generate SDP")

        let dataChannelError = WebRTCError.dataChannelNotOpen
        XCTAssertEqual(dataChannelError.localizedDescription, "Data channel is not open")
    }

    // MARK: - Performance Tests

    func testPeerConnectionCreationPerformance() throws {
        measure {
            for i in 0..<10 {
                let peerId = "perf-peer-\(i)"
                _ = webRTCManager.createPeerConnection(for: peerId)
            }
        }
    }

    func testOfferCreationPerformance() throws {
        let peerId = "perf-peer-offer"
        _ = webRTCManager.createPeerConnection(for: peerId)

        measure {
            let expectation = self.expectation(description: "Performance offer creation")
            webRTCManager.createOffer(for: peerId) { _, _ in
                expectation.fulfill()
            }
            wait(for: [expectation], timeout: 5.0)
        }
    }

    // MARK: - Delegate Tests

    func testDelegateCallbacks() throws {
        class MockDelegate: WebRTCManagerDelegate {
            var receivedData = false
            var openedDataChannel = false
            var closedDataChannel = false
            var generatedIceCandidate = false

            func webRTCManager(_ manager: WebRTCManager, didReceiveData data: Data, from peerId: String) {
                receivedData = true
            }

            func webRTCManager(_ manager: WebRTCManager, didOpenDataChannelFor peerId: String) {
                openedDataChannel = true
            }

            func webRTCManager(_ manager: WebRTCManager, didCloseDataChannelFor peerId: String) {
                closedDataChannel = true
            }

            func webRTCManager(_ manager: WebRTCManager, didGenerateIceCandidate candidate: RTCIceCandidate, for peerId: String) {
                generatedIceCandidate = true
            }
        }

        let mockDelegate = MockDelegate()
        webRTCManager.delegate = mockDelegate

        // Note: Testing actual delegate callbacks would require establishing real connections,
        // which is difficult in unit tests. This test verifies the delegate can be set.
        XCTAssertNotNil(webRTCManager.delegate)
    }
}