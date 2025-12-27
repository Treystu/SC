import XCTest
import CryptoKit
@testable import SovereignCommunications

final class CryptoTests: XCTestCase {

    var cryptoManager: NativeCryptoManager!

    override func setUpWithError() throws {
        try super.setUpWithError()
        cryptoManager = NativeCryptoManager.shared
    }

    override func tearDownWithError() throws {
        cryptoManager = nil
        try super.tearDownWithError()
    }

    // MARK: - Ed25519 Key Generation Tests

    func testEd25519KeyGeneration() throws {
        let privateKey = cryptoManager.getEd25519PrivateKey()
        let publicKey = cryptoManager.getEd25519PublicKey()

        XCTAssertNotNil(privateKey)
        XCTAssertNotNil(publicKey)
        XCTAssertEqual(privateKey.publicKey.rawRepresentation, publicKey.rawRepresentation)
        XCTAssertEqual(privateKey.rawRepresentation.count, 32) // Ed25519 private key size
        XCTAssertEqual(publicKey.rawRepresentation.count, 32)  // Ed25519 public key size
    }

    func testEd25519KeyPersistence() throws {
        // Generate and save keys
        let privateKey1 = cryptoManager.getEd25519PrivateKey()
        let publicKey1 = cryptoManager.getEd25519PublicKey()

        // Create new instance and verify keys are loaded
        let newCryptoManager = NativeCryptoManager()
        let privateKey2 = newCryptoManager.getEd25519PrivateKey()
        let publicKey2 = newCryptoManager.getEd25519PublicKey()

        XCTAssertEqual(privateKey1.rawRepresentation, privateKey2.rawRepresentation)
        XCTAssertEqual(publicKey1.rawRepresentation, publicKey2.rawRepresentation)
    }

    // MARK: - Ed25519 Signing Tests

    func testEd25519SignatureVerification() throws {
        let message = "Test message for signing".data(using: .utf8)!
        let signature = cryptoManager.sign(message)
        let publicKey = cryptoManager.getEd25519PublicKey()

        XCTAssertEqual(signature.count, 64) // Ed25519 signature size

        let isValid = cryptoManager.verify(signature: signature, for: message, with: publicKey)
        XCTAssertTrue(isValid)
    }

    func testEd25519SignatureVerificationWithWrongMessage() throws {
        let message = "Test message".data(using: .utf8)!
        let wrongMessage = "Wrong message".data(using: .utf8)!
        let signature = cryptoManager.sign(message)
        let publicKey = cryptoManager.getEd25519PublicKey()

        let isValid = cryptoManager.verify(signature: signature, for: wrongMessage, with: publicKey)
        XCTAssertFalse(isValid)
    }

    func testEd25519SignatureVerificationWithWrongKey() throws {
        let message = "Test message".data(using: .utf8)!
        let signature = cryptoManager.sign(message)

        // Generate different key pair
        let wrongPrivateKey = Curve25519.Signing.PrivateKey()
        let wrongPublicKey = wrongPrivateKey.publicKey

        let isValid = cryptoManager.verify(signature: signature, for: message, with: wrongPublicKey)
        XCTAssertFalse(isValid)
    }

    // MARK: - X25519 Key Exchange Tests

    func testX25519KeyGeneration() throws {
        let privateKey = cryptoManager.getX25519PrivateKey()
        let publicKey = cryptoManager.getX25519PublicKey()

        XCTAssertNotNil(privateKey)
        XCTAssertNotNil(publicKey)
        XCTAssertEqual(privateKey.publicKey.rawRepresentation, publicKey.rawRepresentation)
        XCTAssertEqual(privateKey.rawRepresentation.count, 32) // X25519 private key size
        XCTAssertEqual(publicKey.rawRepresentation.count, 32)  // X25519 public key size
    }

    func testX25519KeyAgreement() throws {
        // Simulate key exchange between two parties
        let aliceCrypto = NativeCryptoManager()
        let bobCrypto = NativeCryptoManager()

        let alicePublicKey = aliceCrypto.getX25519PublicKey()
        let bobPublicKey = bobCrypto.getX25519PublicKey()

        let aliceSharedSecret = aliceCrypto.deriveSharedSecret(with: bobPublicKey)
        let bobSharedSecret = bobCrypto.deriveSharedSecret(with: alicePublicKey)

        XCTAssertEqual(aliceSharedSecret, bobSharedSecret)
    }

    // MARK: - ChaCha20-Poly1305 Encryption Tests

    func testChaCha20EncryptionDecryption() throws {
        let message = "Secret message to encrypt".data(using: .utf8)!
        let aliceCrypto = NativeCryptoManager()
        let bobCrypto = NativeCryptoManager()

        // Establish shared secret
        let alicePublicKey = aliceCrypto.getX25519PublicKey()
        let sharedSecret = bobCrypto.deriveSharedSecret(with: alicePublicKey)

        // Encrypt
        let encryptedData = aliceCrypto.encryptChaCha20(message, key: sharedSecret)
        XCTAssertNotEqual(encryptedData, message)
        XCTAssertTrue(encryptedData.count > message.count) // Should include nonce and tag

        // Decrypt
        let decryptedData = bobCrypto.decryptChaCha20(encryptedData, key: sharedSecret)
        XCTAssertNotNil(decryptedData)
        XCTAssertEqual(decryptedData, message)
    }

    func testChaCha20DecryptionWithWrongKey() throws {
        let message = "Secret message".data(using: .utf8)!
        let aliceCrypto = NativeCryptoManager()
        let bobCrypto = NativeCryptoManager()
        let eveCrypto = NativeCryptoManager()

        // Establish shared secret between Alice and Bob
        let alicePublicKey = aliceCrypto.getX25519PublicKey()
        let sharedSecret = bobCrypto.deriveSharedSecret(with: alicePublicKey)

        // Encrypt with Alice-Bob shared secret
        let encryptedData = aliceCrypto.encryptChaCha20(message, key: sharedSecret)

        // Try to decrypt with Eve's different key
        let eveSharedSecret = eveCrypto.deriveSharedSecret(with: alicePublicKey)
        let decryptedData = eveCrypto.decryptChaCha20(encryptedData, key: eveSharedSecret)

        XCTAssertNil(decryptedData) // Should fail to decrypt
    }

    // MARK: - Edge Cases

    func testEmptyMessageSigning() throws {
        let emptyMessage = Data()
        let signature = cryptoManager.sign(emptyMessage)
        let publicKey = cryptoManager.getEd25519PublicKey()

        XCTAssertEqual(signature.count, 64)

        let isValid = cryptoManager.verify(signature: signature, for: emptyMessage, with: publicKey)
        XCTAssertTrue(isValid)
    }

    func testLargeMessageEncryption() throws {
        let largeMessage = Data(repeating: 0x41, count: 1024 * 1024) // 1MB
        let aliceCrypto = NativeCryptoManager()
        let bobCrypto = NativeCryptoManager()

        let alicePublicKey = aliceCrypto.getX25519PublicKey()
        let sharedSecret = bobCrypto.deriveSharedSecret(with: alicePublicKey)

        let encryptedData = aliceCrypto.encryptChaCha20(largeMessage, key: sharedSecret)
        let decryptedData = bobCrypto.decryptChaCha20(encryptedData, key: sharedSecret)

        XCTAssertEqual(decryptedData, largeMessage)
    }

    // MARK: - Performance Tests

    func testEd25519SigningPerformance() throws {
        let message = "Performance test message".data(using: .utf8)!

        measure {
            for _ in 0..<100 {
                _ = cryptoManager.sign(message)
            }
        }
    }

    func testChaCha20EncryptionPerformance() throws {
        let message = Data(repeating: 0x42, count: 1024) // 1KB
        let aliceCrypto = NativeCryptoManager()
        let bobCrypto = NativeCryptoManager()

        let alicePublicKey = aliceCrypto.getX25519PublicKey()
        let sharedSecret = bobCrypto.deriveSharedSecret(with: alicePublicKey)

        measure {
            for _ in 0..<100 {
                _ = aliceCrypto.encryptChaCha20(message, key: sharedSecret)
            }
        }
    }
}