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
}
