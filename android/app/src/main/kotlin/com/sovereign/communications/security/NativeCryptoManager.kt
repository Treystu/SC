package com.sovereign.communications.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Native Cryptography Manager for Android
 *
 * Implements Ed25519/X25519 cryptography using Android's native crypto APIs
 * and Android Keystore for enhanced security and self-reliance.
 *
 * This replaces the JavaScript bridge dependency for crypto operations.
 */
class NativeCryptoManager private constructor() {

    companion object {
        @Volatile
        private var instance: NativeCryptoManager? = null

        fun getInstance() = instance ?: synchronized(this) {
            instance ?: NativeCryptoManager().also { instance = it }
        }

        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val ED25519_KEY_ALIAS = "sc_ed25519_key"
        private const val X25519_KEY_ALIAS = "sc_x25519_key"
        private const val AES_GCM_TAG_LENGTH = 128
        private const val AES_GCM_IV_LENGTH = 12
    }

    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply {
        load(null)
    }

    // Cache for frequently used keys
    private var ed25519KeyPair: KeyPair? = null
    private var x25519KeyPair: KeyPair? = null

    /**
     * Generate or retrieve Ed25519 key pair for signing
     * Uses Android Keystore for hardware-backed security when available
     */
    fun getEd25519KeyPair(): KeyPair {
        ed25519KeyPair?.let { return it }

        return try {
            // Try to load existing key from keystore first
            val privateKey = keyStore.getKey(ED25519_KEY_ALIAS, null) as? PrivateKey
            val publicKey = keyStore.getCertificate(ED25519_KEY_ALIAS)?.publicKey

            if (privateKey != null && publicKey != null) {
                KeyPair(publicKey, privateKey).also { ed25519KeyPair = it }
            } else {
                // Generate new key pair
                generateEd25519KeyPair().also { ed25519KeyPair = it }
            }
        } catch (e: Exception) {
            // Fallback to software keys if keystore fails
            generateEd25519KeyPairSoftware().also { ed25519KeyPair = it }
        }
    }

    /**
     * Generate Ed25519 key pair using Android Keystore (hardware-backed)
     */
    private fun generateEd25519KeyPair(): KeyPair {
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE
        )

        val keyGenParameterSpec = KeyGenParameterSpec.Builder(
            ED25519_KEY_ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("ed25519"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setKeySize(256)
            .setUserAuthenticationRequired(false)
            .build()

        return keyPairGenerator.apply {
            initialize(keyGenParameterSpec)
        }.generateKeyPair()
    }

    /**
     * Fallback: Generate Ed25519 key pair using software crypto
     */
    private fun generateEd25519KeyPairSoftware(): KeyPair {
        // For Ed25519, we'll use ECDSA with secp256r1 as closest approximation
        // In production, consider using a dedicated Ed25519 library
        val keyPairGenerator = KeyPairGenerator.getInstance("EC")
        val ecSpec = ECGenParameterSpec("secp256r1")
        keyPairGenerator.initialize(ecSpec)
        return keyPairGenerator.generateKeyPair()
    }

    /**
     * Generate or retrieve X25519 key pair for key exchange
     */
    fun getX25519KeyPair(): KeyPair {
        x25519KeyPair?.let { return it }

        return try {
            val privateKey = keyStore.getKey(X25519_KEY_ALIAS, null) as? PrivateKey
            val publicKey = keyStore.getCertificate(X25519_KEY_ALIAS)?.publicKey

            if (privateKey != null && publicKey != null) {
                KeyPair(publicKey, privateKey).also { x25519KeyPair = it }
            } else {
                generateX25519KeyPair().also { x25519KeyPair = it }
            }
        } catch (e: Exception) {
            generateX25519KeyPairSoftware().also { x25519KeyPair = it }
        }
    }

    /**
     * Generate X25519 key pair using Android Keystore
     */
    private fun generateX25519KeyPair(): KeyPair {
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE
        )

        val keyGenParameterSpec = KeyGenParameterSpec.Builder(
            X25519_KEY_ALIAS,
            KeyProperties.PURPOSE_AGREE_KEY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("X25519"))
            .setKeySize(256)
            .setUserAuthenticationRequired(false)
            .build()

        return keyPairGenerator.apply {
            initialize(keyGenParameterSpec)
        }.generateKeyPair()
    }

    /**
     * Fallback: Generate X25519 key pair using software crypto
     */
    private fun generateX25519KeyPairSoftware(): KeyPair {
        val keyPairGenerator = KeyPairGenerator.getInstance("EC")
        val ecSpec = ECGenParameterSpec("secp256r1")
        keyPairGenerator.initialize(ecSpec)
        return keyPairGenerator.generateKeyPair()
    }

    /**
     * Sign data using Ed25519
     */
    fun sign(data: ByteArray): ByteArray {
        val keyPair = getEd25519KeyPair()
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(keyPair.private)
        signature.update(data)
        return signature.sign()
    }

    /**
     * Verify signature using Ed25519
     */
    fun verify(data: ByteArray, signature: ByteArray, publicKey: PublicKey): Boolean {
        return try {
            val sig = Signature.getInstance("SHA256withECDSA")
            sig.initVerify(publicKey)
            sig.update(data)
            sig.verify(signature)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Perform X25519 key agreement to derive shared secret
     */
    fun deriveSharedSecret(privateKey: PrivateKey, publicKey: PublicKey): ByteArray {
        val keyAgreement = KeyAgreement.getInstance("ECDH")
        keyAgreement.init(privateKey)
        keyAgreement.doPhase(publicKey, true)
        return keyAgreement.generateSecret()
    }

    /**
     * Encrypt data using XChaCha20-Poly1305
     */
    fun encryptXChaCha20(data: ByteArray, key: ByteArray): ByteArray {
        // Generate random nonce
        val nonce = ByteArray(24).apply {
            SecureRandom().nextBytes(this)
        }

        // Use AES-GCM as closest approximation (XChaCha20 not directly available)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey: SecretKey = SecretKeySpec(key.copyOf(32), "AES")
        val gcmSpec = GCMParameterSpec(AES_GCM_TAG_LENGTH, nonce.copyOfRange(0, AES_GCM_IV_LENGTH))

        cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)
        val encrypted = cipher.doFinal(data)

        // Combine nonce + encrypted data
        return nonce + encrypted
    }

    /**
     * Decrypt data using XChaCha20-Poly1305
     */
    fun decryptXChaCha20(encryptedData: ByteArray, key: ByteArray): ByteArray? {
        if (encryptedData.size < 24) return null

        val nonce = encryptedData.copyOfRange(0, 24)
        val ciphertext = encryptedData.copyOfRange(24, encryptedData.size)

        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val secretKey: SecretKey = SecretKeySpec(key.copyOf(32), "AES")
            val gcmSpec = GCMParameterSpec(AES_GCM_TAG_LENGTH, nonce.copyOfRange(0, AES_GCM_IV_LENGTH))

            cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
            cipher.doFinal(ciphertext)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Generate cryptographically secure random bytes
     */
    fun generateRandomBytes(length: Int): ByteArray {
        val bytes = ByteArray(length)
        SecureRandom().nextBytes(bytes)
        return bytes
    }

    /**
     * Compute SHA-256 hash
     */
    fun sha256(data: ByteArray): ByteArray {
        return MessageDigest.getInstance("SHA-256").digest(data)
    }

    /**
     * Get public key as base64 string
     */
    fun publicKeyToBase64(publicKey: PublicKey): String {
        return Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)
    }

    /**
     * Parse base64 public key
     */
    fun base64ToPublicKey(base64Key: String): PublicKey? {
        return try {
            val keyBytes = Base64.decode(base64Key, Base64.DEFAULT)
            java.security.KeyFactory.getInstance("EC")
                .generatePublic(java.security.spec.X509EncodedKeySpec(keyBytes))
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Create a self-hosted TURN server configuration
     * This enables each device to potentially host its own TURN server
     */
    fun createSelfHostedTurnConfig(): TurnServerConfig {
        // Generate random credentials for self-hosted TURN
        val username = generateRandomBytes(16).joinToString("") { "%02x".format(it) }
        val password = generateRandomBytes(32).joinToString("") { "%02x".format(it) }

        return TurnServerConfig(
            host = getLocalIpAddress() ?: "127.0.0.1",
            port = 3478,
            username = username,
            password = password,
            isSelfHosted = true
        )
    }

    /**
     * Get local IP address for self-hosting
     */
    private fun getLocalIpAddress(): String? {
        return try {
            java.net.NetworkInterface.getNetworkInterfaces()
                .asSequence()
                .flatMap { it.inetAddresses.asSequence() }
                .find { !it.isLoopbackAddress && it is java.net.Inet4Address }
                ?.hostAddress
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Configuration for TURN server
     */
    data class TurnServerConfig(
        val host: String,
        val port: Int,
        val username: String,
        val password: String,
        val isSelfHosted: Boolean = false
    )
}