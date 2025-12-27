package com.sovereign.communications

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sovereign.communications.security.NativeCryptoManager
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.security.SecureRandom

/**
 * Instrumentation tests for Native Crypto Manager
 * Tests actual cryptographic operations on a physical device
 */
@RunWith(AndroidJUnit4::class)
class CryptoInstrumentedTest {

    private lateinit var context: Context
    private lateinit var cryptoManager: NativeCryptoManager

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        cryptoManager = NativeCryptoManager.getInstance(context)
    }

    @Test
    fun testEd25519KeyGeneration() {
        val keyPair = cryptoManager.generateEd25519KeyPair()

        assertNotNull(keyPair)
        assertNotNull(keyPair.publicKey)
        assertNotNull(keyPair.privateKey)
        assertEquals(NativeCryptoManager.KEY_SIZE, keyPair.publicKey.size)
        assertEquals(NativeCryptoManager.KEY_SIZE, keyPair.privateKey.size)
    }

    @Test
    fun testEd25519KeyPersistence() {
        // Generate and save keys
        val keyPair1 = cryptoManager.generateEd25519KeyPair()

        // Retrieve keys again
        val keyPair2 = cryptoManager.generateEd25519KeyPair()

        // Keys should be the same (persisted)
        assertArrayEquals(keyPair1.publicKey, keyPair2.publicKey)
        assertArrayEquals(keyPair1.privateKey, keyPair2.privateKey)
    }

    @Test
    fun testEd25519SigningAndVerification() {
        val keyPair = cryptoManager.generateEd25519KeyPair()
        val message = "Test message for signing".toByteArray()

        val signature = cryptoManager.signEd25519(message, keyPair.privateKey)
        assertNotNull(signature)
        assertEquals(NativeCryptoManager.SIGNATURE_SIZE, signature.size)

        val isValid = cryptoManager.verifyEd25519(message, signature, keyPair.publicKey)
        assertTrue(isValid)
    }

    @Test
    fun testEd25519SignatureVerificationFailure() {
        val keyPair = cryptoManager.generateEd25519KeyPair()
        val message = "Test message".toByteArray()
        val wrongMessage = "Wrong message".toByteArray()

        val signature = cryptoManager.signEd25519(message, keyPair.privateKey)

        // Wrong message
        val isValidWrongMessage = cryptoManager.verifyEd25519(wrongMessage, signature, keyPair.publicKey)
        assertFalse(isValidWrongMessage)

        // Wrong key
        val wrongKeyPair = cryptoManager.generateEd25519KeyPair()
        val isValidWrongKey = cryptoManager.verifyEd25519(message, signature, wrongKeyPair.publicKey)
        assertFalse(isValidWrongKey)
    }

    @Test
    fun testX25519KeyGeneration() {
        val keyPair = cryptoManager.generateX25519KeyPair()

        assertNotNull(keyPair)
        assertNotNull(keyPair.publicKey)
        assertNotNull(keyPair.privateKey)
        assertEquals(NativeCryptoManager.KEY_SIZE, keyPair.publicKey.size)
        assertEquals(NativeCryptoManager.KEY_SIZE, keyPair.privateKey.size)
    }

    @Test
    fun testX25519KeyExchange() {
        // Simulate key exchange between Alice and Bob
        val aliceKeyPair = cryptoManager.generateX25519KeyPair()
        val bobKeyPair = cryptoManager.generateX25519KeyPair()

        val aliceSharedSecret = cryptoManager.deriveSharedSecret(aliceKeyPair.privateKey, bobKeyPair.publicKey)
        val bobSharedSecret = cryptoManager.deriveSharedSecret(bobKeyPair.privateKey, aliceKeyPair.publicKey)

        assertNotNull(aliceSharedSecret)
        assertNotNull(bobSharedSecret)
        assertArrayEquals(aliceSharedSecret, bobSharedSecret)
    }

    @Test
    fun testAESGCMEncryptionDecryption() {
        val keyPair = cryptoManager.generateX25519KeyPair()
        val message = "Secret message to encrypt".toByteArray()

        // Generate shared secret
        val sharedSecret = cryptoManager.deriveSharedSecret(keyPair.privateKey, keyPair.publicKey)

        // Encrypt
        val (iv, ciphertext) = cryptoManager.encryptAESGCM(message, sharedSecret)
        assertNotNull(iv)
        assertNotNull(ciphertext)
        assertEquals(12, iv.size) // GCM IV length
        assertTrue(ciphertext.size > message.size) // Includes auth tag

        // Decrypt
        val decrypted = cryptoManager.decryptAESGCM(iv, ciphertext, sharedSecret)
        assertNotNull(decrypted)
        assertArrayEquals(message, decrypted)
    }

    @Test
    fun testAESGCMDecryptionWithWrongKey() {
        val keyPair1 = cryptoManager.generateX25519KeyPair()
        val keyPair2 = cryptoManager.generateX25519KeyPair()
        val message = "Secret message".toByteArray()

        // Encrypt with key pair 1
        val sharedSecret1 = cryptoManager.deriveSharedSecret(keyPair1.privateKey, keyPair1.publicKey)
        val (iv, ciphertext) = cryptoManager.encryptAESGCM(message, sharedSecret1)

        // Try to decrypt with key pair 2
        val sharedSecret2 = cryptoManager.deriveSharedSecret(keyPair2.privateKey, keyPair2.publicKey)
        val decrypted = cryptoManager.decryptAESGCM(iv, ciphertext, sharedSecret2)

        assertNull(decrypted) // Should fail
    }

    @Test
    fun testSecureDeletion() {
        val data = ByteArray(32).apply {
            SecureRandom().nextBytes(this)
        }
        val originalData = data.copyOf()

        cryptoManager.secureDelete(data)

        // Data should be zeroed out
        val allZeros = data.all { it == 0.toByte() }
        assertTrue(allZeros)

        // Should be different from original
        assertFalse(data.contentEquals(originalData))
    }

    @Test
    fun testEmptyMessageSigning() {
        val keyPair = cryptoManager.generateEd25519KeyPair()
        val emptyMessage = ByteArray(0)

        val signature = cryptoManager.signEd25519(emptyMessage, keyPair.privateKey)
        assertNotNull(signature)
        assertEquals(NativeCryptoManager.SIGNATURE_SIZE, signature.size)

        val isValid = cryptoManager.verifyEd25519(emptyMessage, signature, keyPair.publicKey)
        assertTrue(isValid)
    }

    @Test
    fun testLargeMessageEncryption() {
        val keyPair = cryptoManager.generateX25519KeyPair()
        val largeMessage = ByteArray(1024 * 1024).apply { // 1MB
            SecureRandom().nextBytes(this)
        }

        val sharedSecret = cryptoManager.deriveSharedSecret(keyPair.privateKey, keyPair.publicKey)

        val (iv, ciphertext) = cryptoManager.encryptAESGCM(largeMessage, sharedSecret)
        val decrypted = cryptoManager.decryptAESGCM(iv, ciphertext, sharedSecret)

        assertNotNull(decrypted)
        assertArrayEquals(largeMessage, decrypted)
    }

    @Test
    fun testKeyDerivation() {
        val keyPair = cryptoManager.generateX25519KeyPair()
        val peerKeyPair = cryptoManager.generateX25519KeyPair()

        val sharedSecret = cryptoManager.deriveSharedSecret(keyPair.privateKey, peerKeyPair.publicKey)

        // Shared secret should be 32 bytes (HKDF output)
        assertEquals(32, sharedSecret.size)

        // Should be deterministic for same inputs
        val sharedSecret2 = cryptoManager.deriveSharedSecret(keyPair.privateKey, peerKeyPair.publicKey)
        assertArrayEquals(sharedSecret, sharedSecret2)
    }

    @Test
    fun testPerformanceEd25519Signing() {
        val keyPair = cryptoManager.generateEd25519KeyPair()
        val message = "Performance test message".toByteArray()

        val iterations = 100
        val startTime = System.nanoTime()

        for (i in 0 until iterations) {
            cryptoManager.signEd25519(message, keyPair.privateKey)
        }

        val endTime = System.nanoTime()
        val averageTime = (endTime - startTime) / iterations

        // Should be reasonably fast (< 10ms per signature)
        assertTrue(averageTime < 10_000_000) // Less than 10ms in nanoseconds
    }

    @Test
    fun testPerformanceAESGCMEncryption() {
        val keyPair = cryptoManager.generateX25519KeyPair()
        val message = ByteArray(1024).apply { // 1KB
            SecureRandom().nextBytes(this)
        }
        val sharedSecret = cryptoManager.deriveSharedSecret(keyPair.privateKey, keyPair.publicKey)

        val iterations = 100
        val startTime = System.nanoTime()

        for (i in 0 until iterations) {
            cryptoManager.encryptAESGCM(message, sharedSecret)
        }

        val endTime = System.nanoTime()
        val averageTime = (endTime - startTime) / iterations

        // Should be fast (< 1ms per encryption)
        assertTrue(averageTime < 1_000_000) // Less than 1ms in nanoseconds
    }

    @Test
    fun testConcurrentCryptoOperations() {
        val threadCount = 5
        val operationsPerThread = 10
        val latch = java.util.concurrent.CountDownLatch(threadCount)

        for (i in 0 until threadCount) {
            Thread {
                for (j in 0 until operationsPerThread) {
                    val keyPair = cryptoManager.generateEd25519KeyPair()
                    val message = "Thread $i operation $j".toByteArray()
                    val signature = cryptoManager.signEd25519(message, keyPair.privateKey)
                    val isValid = cryptoManager.verifyEd25519(message, signature, keyPair.publicKey)
                    assertTrue(isValid)
                }
                latch.countDown()
            }.start()
        }

        assertTrue("All crypto operations should complete", latch.await(30, java.util.concurrent.TimeUnit.SECONDS))
    }
}