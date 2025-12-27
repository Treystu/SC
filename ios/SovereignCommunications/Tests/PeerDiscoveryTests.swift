import XCTest
import CoreBluetooth
import Network
@testable import SovereignCommunications

final class PeerDiscoveryTests: XCTestCase {

    var localNetworkManager: LocalNetworkManager!
    var bluetoothMeshManager: BluetoothMeshManager!

    override func setUpWithError() throws {
        try super.setUpWithError()
        localNetworkManager = LocalNetworkManager.shared
        bluetoothMeshManager = BluetoothMeshManager.shared
    }

    override func tearDownWithError() throws {
        localNetworkManager = nil
        bluetoothMeshManager = nil
        try super.tearDownWithError()
    }

    // MARK: - Local Network Manager Tests

    func testLocalNetworkManagerSingleton() throws {
        let instance1 = LocalNetworkManager.shared
        let instance2 = LocalNetworkManager.shared
        XCTAssertEqual(instance1, instance2)
    }

    func testLocalNetworkManagerStartStop() throws {
        // Test that start/stop don't crash
        localNetworkManager.start()
        localNetworkManager.stop()

        // Should be able to call multiple times without issues
        localNetworkManager.start()
        localNetworkManager.start()
        localNetworkManager.stop()
        localNetworkManager.stop()
    }

    func testLocalNetworkServiceType() throws {
        // Test that the service type is correct for mDNS discovery
        let serviceType = "_sc._tcp"
        XCTAssertEqual(localNetworkManager.serviceType, serviceType)
    }

    func testSendDataToNonexistentPeer() throws {
        let testData = "Hello World".data(using: .utf8)!
        let peerId = "nonexistent-peer"

        // Should not crash
        localNetworkManager.send(data: testData, to: peerId)
    }

    // MARK: - Bluetooth Mesh Manager Tests

    func testBluetoothMeshManagerSingleton() throws {
        let instance1 = BluetoothMeshManager.shared
        let instance2 = BluetoothMeshManager.shared
        XCTAssertEqual(instance1, instance2)
    }

    func testBluetoothServiceUUID() throws {
        // Test that the service UUID is properly defined
        let expectedUUID = CBUUID(string: "00001820-0000-1000-8000-00805f9b34fb")
        XCTAssertEqual(bluetoothMeshManager.serviceUUID, expectedUUID)
    }

    func testBluetoothCharacteristicUUID() throws {
        // Test that the characteristic UUID is properly defined
        let expectedUUID = CBUUID(string: "00002a0f-0000-1000-8000-00805f9b34fb")
        XCTAssertEqual(bluetoothMeshManager.characteristicUUID, expectedUUID)
    }

    func testDataFragmentation() throws {
        let testData = Data(repeating: 0x41, count: 100) // 100 bytes
        let fragments = bluetoothMeshManager.fragment(data: testData)

        // Should create multiple fragments due to MTU limit
        XCTAssertGreaterThan(fragments.count, 1)

        // Each fragment should be <= 20 bytes (MTU - 3)
        for fragment in fragments {
            XCTAssertLessThanOrEqual(fragment.count, 20)
        }

        // Reassembled data should match original
        let reassembled = fragments.reduce(Data()) { $0 + $1 }
        XCTAssertEqual(reassembled, testData)
    }

    func testDataFragmentationSmallData() throws {
        let testData = Data(repeating: 0x42, count: 10) // 10 bytes
        let fragments = bluetoothMeshManager.fragment(data: testData)

        // Should create single fragment for small data
        XCTAssertEqual(fragments.count, 1)
        XCTAssertEqual(fragments.first, testData)
    }

    func testDataReassembly() throws {
        let peripheral = CBPeripheral()
        let testData = Data(repeating: 0x43, count: 50)

        // Fragment the data
        let fragments = bluetoothMeshManager.fragment(data: testData)

        // Reassemble fragments
        var reassembledData: Data?
        for (index, fragment) in fragments.enumerated() {
            if index == fragments.count - 1 {
                // Add delimiter to last fragment
                var fragmentWithDelimiter = fragment
                fragmentWithDelimiter.append(0x00)
                reassembledData = bluetoothMeshManager.reassemble(data: fragmentWithDelimiter, from: peripheral)
            } else {
                bluetoothMeshManager.reassemble(data: fragment, from: peripheral)
            }
        }

        XCTAssertNotNil(reassembledData)
        XCTAssertEqual(reassembledData!.dropLast(), testData) // Remove delimiter
    }

    func testSendDataToPeripheral() throws {
        // Create mock peripheral
        let mockPeripheral = CBPeripheral()

        // Create test data
        let testData = "Test message".data(using: .utf8)!

        // Should not crash even without proper setup
        bluetoothMeshManager.send(data: testData, to: mockPeripheral)
    }

    // MARK: - Mesh Network Manager Peer Discovery Tests

    func testMeshNetworkManagerDiscoveredPeersProperty() throws {
        let meshManager = MeshNetworkManager.shared

        // Initially should be empty
        XCTAssertTrue(meshManager.discoveredPeers.isEmpty)
    }

    func testMeshNetworkManagerConnectToPeer() throws {
        let meshManager = MeshNetworkManager.shared

        // Create mock peripheral
        let mockPeripheral = CBPeripheral()

        // Should not crash
        meshManager.connect(to: mockPeripheral)
    }

    func testMeshNetworkManagerGetConnectedPeers() throws {
        let meshManager = MeshNetworkManager.shared

        let peers = meshManager.getConnectedPeers()
        XCTAssertTrue(peers.isEmpty) // Initially empty
    }

    // MARK: - Peer Info Tests

    func testPeerInfoQRCodeSerialization() throws {
        let peerInfo = PeerInfo(id: "test-peer-123", publicKey: "test-public-key", endpoints: ["endpoint1", "endpoint2"])

        let qrString = peerInfo.toQRString()
        XCTAssertFalse(qrString.isEmpty)

        let restoredPeerInfo = PeerInfo.fromQRString(qrString)
        XCTAssertNotNil(restoredPeerInfo)
        XCTAssertEqual(restoredPeerInfo?.id, peerInfo.id)
        XCTAssertEqual(restoredPeerInfo?.publicKey, peerInfo.publicKey)
        XCTAssertEqual(restoredPeerInfo?.endpoints, peerInfo.endpoints)
    }

    func testPeerInfoInvalidQRString() throws {
        let invalidStrings = ["", "invalid-json", "{invalid}", "null"]

        for invalidString in invalidStrings {
            let peerInfo = PeerInfo.fromQRString(invalidString)
            XCTAssertNil(peerInfo)
        }
    }

    func testPeerInfoEquality() throws {
        let peer1 = PeerInfo(id: "peer1", publicKey: "key1", endpoints: ["ep1"])
        let peer2 = PeerInfo(id: "peer1", publicKey: "key1", endpoints: ["ep1"])
        let peer3 = PeerInfo(id: "peer2", publicKey: "key2", endpoints: ["ep2"])

        // Test equality based on ID (assuming ID is the primary identifier)
        XCTAssertEqual(peer1.id, peer2.id)
        XCTAssertNotEqual(peer1.id, peer3.id)
    }

    // MARK: - Performance Tests

    func testLocalNetworkManagerPerformance() throws {
        measure {
            for i in 0..<100 {
                let testData = "Performance test \(i)".data(using: .utf8)!
                localNetworkManager.send(data: testData, to: "perf-peer-\(i)")
            }
        }
    }

    func testBluetoothFragmentationPerformance() throws {
        let largeData = Data(repeating: 0x44, count: 1024 * 10) // 10KB

        measure {
            for _ in 0..<10 {
                _ = bluetoothMeshManager.fragment(data: largeData)
            }
        }
    }

    // MARK: - Delegate Tests

    func testLocalNetworkManagerDelegate() throws {
        class MockDelegate: LocalNetworkManagerDelegate {
            var receivedData = false
            var connectedPeers: [String] = []
            var disconnectedPeers: [String] = []

            func didReceiveData(_ data: Data, from peerId: String) {
                receivedData = true
            }

            func didConnect(peerId: String) {
                connectedPeers.append(peerId)
            }

            func didDisconnect(peerId: String) {
                disconnectedPeers.append(peerId)
            }
        }

        let mockDelegate = MockDelegate()
        localNetworkManager.delegate = mockDelegate

        // Verify delegate is set
        XCTAssertNotNil(localNetworkManager.delegate)
    }

    func testBluetoothMeshManagerDelegate() throws {
        class MockDelegate: BluetoothMeshManagerDelegate {
            var receivedMessages = false
            var connectedPeers: [String] = []
            var disconnectedPeers: [String] = []

            func bluetoothMeshManager(_ manager: BluetoothMeshManager, didReceiveMessage data: Data, from peerId: String) {
                receivedMessages = true
            }

            func bluetoothMeshManager(_ manager: BluetoothMeshManager, didConnectToPeer peerId: String) {
                connectedPeers.append(peerId)
            }

            func bluetoothMeshManager(_ manager: BluetoothMeshManager, didDisconnectFromPeer peerId: String) {
                disconnectedPeers.append(peerId)
            }
        }

        let mockDelegate = MockDelegate()
        bluetoothMeshManager.delegate = mockDelegate

        // Verify delegate is set
        XCTAssertNotNil(bluetoothMeshManager.delegate)
    }
}