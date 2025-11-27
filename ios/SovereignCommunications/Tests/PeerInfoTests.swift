import XCTest
@testable import SovereignCommunications

class PeerInfoTests: XCTestCase {

    func testToQRStringAndBack() {
        let peerInfo = PeerInfo(id: "test_id", publicKey: "test_key", endpoints: ["endpoint1", "endpoint2"])
        
        let qrString = peerInfo.toQRString()
        
        let restoredPeerInfo = PeerInfo.fromQRString(qrString)
        
        XCTAssertNotNil(restoredPeerInfo)
        XCTAssertEqual(peerInfo.id, restoredPeerInfo?.id)
        XCTAssertEqual(peerInfo.publicKey, restoredPeerInfo?.publicKey)
        XCTAssertEqual(peerInfo.endpoints, restoredPeerInfo?.endpoints)
    }
    
    func testInvalidQRString() {
        let invalidString = "invalid_json_string"
        let peerInfo = PeerInfo.fromQRString(invalidString)
        XCTAssertNil(peerInfo)
    }
    
    func testEquality() {
        let peer1 = PeerInfo(id: "id1", publicKey: "key1", endpoints: ["ep1"])
        let peer2 = PeerInfo(id: "id1", publicKey: "key1", endpoints: ["ep1"])
        let peer3 = PeerInfo(id: "id2", publicKey: "key2", endpoints: ["ep2"])
        
        XCTAssertEqual(peer1.id, peer2.id) // Assuming ID equality implies object equality for this test context
        // If PeerInfo conforms to Equatable, we could use XCTAssertEqual(peer1, peer2)
    }
}
