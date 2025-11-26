import XCTest
@testable import SovereignCommunications

class MeshNetworkManagerTests: XCTestCase {

    var sut: MeshNetworkManager!

    override func setUpWithError() throws {
        try super.setUpWithError()
        sut = MeshNetworkManager.shared
    }

    override func tearDownWithError() throws {
        sut = nil
        try super.tearDownWithError()
    }

    func testSharedInstanceIsNotNil() {
        XCTAssertNotNil(sut)
    }
}
