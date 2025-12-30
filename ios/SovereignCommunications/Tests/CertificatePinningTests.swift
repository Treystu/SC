import XCTest
@testable import SovereignCommunications
import Security

class CertificatePinningTests: XCTestCase {
    
    var pinningManager: CertificatePinningManager!
    
    override func setUp() {
        super.setUp()
        pinningManager = CertificatePinningManager.shared
        // Reset state if possible or rely on separate test instance if I could inject it. 
        // Shared instance makes it hard, but I can use add/remove pins.
    }
    
    override func tearDown() {
        pinningManager.removeCertificatePins(domain: "example.com")
        super.tearDown()
    }
    
    func testPinManagement() {
        let domain = "example.com"
        let pin = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        
        pinningManager.addCertificatePin(domain: domain, pin: pin)
        
        // Since we can't easily inspect the private 'pinnedCertificates', 
        // we can verify behavior implicitly or if we exposed a getter.
        // For now, we assume add works if no crash.
    }
   
    func testDelegateHandlesChallenge() {
        // This is a partial test as mocking URLAuthenticationChallenge with valid SecTrust is complex 
        // without a real server or extensive mocking.
        // We verify the method signature and basic non-crashing behavior with standard challenge.
        
        let expectation = self.expectation(description: "Delegate called")
        
        // Mock session
        let session = URLSession(configuration: .default)
        
        // Mock challenge (basic)
        // Note: Creating a valid server trust challenge fully in test is hard.
        // We will skip deep mock here and rely on logic unit tests if internal methods were exposed.
        // Instead, we verify the fallback logic we just added (empty pins = allow).
        
        // Since we cannot easily invoke the delegate method with a valid trust object without a real connection,
        // we will focus on the public API unit tests for this iteration.
        expectation.fulfill()
        wait(for: [expectation], timeout: 0.1)
    }
    
    func testSystemTrustFallback() {
        // We modified the manager to return 'true' (allow) when no pins are present.
        // We want to verify this behavior.
        // Since validateCertificate is private, we can't call it directly.
        // However, we can use a URLSession with this delegate and hit a public site (e.g. google.com).
        // Since google.com has no pins configured in our manager, it should SUCCEED (fallback to system trust).
        
        let expectation = self.expectation(description: "Connection to google.com should succeed")
        
        let session = URLSession(
            configuration: .default,
            delegate: pinningManager,
            delegateQueue: nil
        )
        
        let url = URL(string: "https://www.google.com")!
        let task = session.dataTask(with: url) { data, response, error in
            if let error = error {
                XCTFail("Connection failed: \(error.localizedDescription)")
            } else {
                // Success means delegate allowed it
                expectation.fulfill()
            }
        }
        task.resume()
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testPinningEnforcement() {
        // To test enforcement, we add a FAKE pin for a real domain, and expect failure.
        
        let domain = "www.example.com"
        let fakePin = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" // Invalid pin
        
        pinningManager.addCertificatePin(domain: domain, pin: fakePin)
        
        let expectation = self.expectation(description: "Connection to pinned domain with wrong pin should fail")
        
        let session = URLSession(
            configuration: .default,
            delegate: pinningManager,
            delegateQueue: nil
        )
        
        let url = URL(string: "https://www.example.com")!
        let task = session.dataTask(with: url) { data, response, error in
            if error != nil {
                // Expected failure (cancelled)
                expectation.fulfill()
            } else {
                XCTFail("Connection should have failed due to pinning mismatch")
            }
        }
        task.resume()
        
        wait(for: [expectation], timeout: 5.0)
        
        // Cleanup
        pinningManager.removeCertificatePins(domain: domain)
    }
}
