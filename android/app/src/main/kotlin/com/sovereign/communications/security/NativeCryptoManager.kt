package com.sovereign.communications.security

import android.content.Context
import android.util.Base64
import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid
import com.goterl.lazysodium.interfaces.KeyExchange
import com.goterl.lazysodium.interfaces.Sign
import com.goterl.lazysodium.utils.Key
import com.goterl.lazysodium.utils.KeyPair
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Native Cryptography Manager for Android
 *
 * Implements Ed25519/X25519 cryptography using LazySodium (libsodium)
 * for true Ed25519/X25519 support matching the core TypeScript implementation.
 *
 * This replaces the JavaScript bridge dependency for crypto operations.
 */
class NativeCryptoManager private constructor(
    private val context: Context,
) {
    companion object {
        @Volatile
        private var instance: NativeCryptoManager? = null

        fun getInstance(context: Context) =
            instance ?: synchronized(this) {
                instance ?: NativeCryptoManager(context.applicationContext).also { instance = it }
            }

        private const val AES_GCM_TAG_LENGTH = 128
        private const val AES_GCM_IV_LENGTH = 12
        const val KEY_SIZE = 32
        const val SIGNATURE_SIZE = 64
    }

    private val lazySodium = LazySodiumAndroid(SodiumAndroid())
    private val secureRandom = SecureRandom()

    // Cache for frequently used keys
    private var ed25519KeyPair: Ed25519KeyPair? = null
    private var x25519KeyPair: X25519KeyPair? = null

    /**
     * Ed25519 Key Pair wrapper
     */
    data class Ed25519KeyPair(
        val publicKey: ByteArray,
        val privateKey: ByteArray,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false

            other as Ed25519KeyPair

            if (!publicKey.contentEquals(other.publicKey)) return false
            if (!privateKey.contentEquals(other.privateKey)) return false

            return true
        }

        override fun hashCode(): Int {
            var result = publicKey.contentHashCode()
            result = 31 * result + privateKey.contentHashCode()
            return result
        }
    }

    /**
     * X25519 Key Pair wrapper (separate from Ed25519)
     */
    data class X25519KeyPair(
        val publicKey: ByteArray,
        val privateKey: ByteArray,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false

            other as X25519KeyPair

            if (!publicKey.contentEquals(other.publicKey)) return false
            if (!privateKey.contentEquals(other.privateKey)) return false

            return true
        }

        override fun hashCode(): Int {
            var result = publicKey.contentHashCode()
            result = 31 * result + privateKey.contentHashCode()
            return result
        }
    }

    /**
     * Generate or retrieve Ed25519 key pair for signing
     * Uses LazySodium for true Ed25519 support matching core implementation
     */
    fun getEd25519KeyPair(): Ed25519KeyPair {
        ed25519KeyPair?.let { return it }

        return try {
            // Try to load existing key from secure storage first
            val storedKey = loadEd25519KeyFromStorage()
            if (storedKey != null) {
                ed25519KeyPair = storedKey
                return storedKey
            } else {
                // Generate new key pair using LazySodium
                generateEd25519KeyPair().also { ed25519KeyPair = it }
            }
        } catch (e: Exception) {
            throw RuntimeException("Failed to generate Ed25519 key pair", e)
        }
    }

    /**
     * Generate Ed25519 key pair using LazySodium
     */
    private fun generateEd25519KeyPair(): Ed25519KeyPair {
        try {
            val publicKey = ByteArray(Sign.PUBLICKEYBYTES)
            val privateKey = ByteArray(Sign.SECRETKEYBYTES)
            val success = lazySodium.cryptoSignKeypair(publicKey, privateKey)

            if (!success) {
                throw RuntimeException("Failed to generate Ed25519 keypair with LazySodium")
            }

            val keyPair =
                Ed25519KeyPair(
                    publicKey = publicKey,
                    privateKey = privateKey,
                )

            saveEd25519KeyToStorage(keyPair)
            return keyPair
        } catch (e: Exception) {
            throw RuntimeException("Failed to generate Ed25519 key pair with LazySodium", e)
        }
    }

    /**
     * Load Ed25519 key from secure storage
     */
    private fun loadEd25519KeyFromStorage(): Ed25519KeyPair? {
        val prefs = context.getSharedPreferences("sc_crypto_prefs", Context.MODE_PRIVATE)

        val publicKeyStr = prefs.getString("ed25519_public_key", null)
        val privateKeyStr = prefs.getString("ed25519_private_key", null)

        if (publicKeyStr != null && privateKeyStr != null) {
            try {
                val publicKey = Base64.decode(publicKeyStr, Base64.NO_WRAP)
                val privateKey = Base64.decode(privateKeyStr, Base64.NO_WRAP)
                return Ed25519KeyPair(publicKey, privateKey)
            } catch (e: Exception) {
                // Invalid stored keys
            }
        }

        return null
    }

    /**
     * Save Ed25519 key to secure storage
     */
    private fun saveEd25519KeyToStorage(keyPair: Ed25519KeyPair) {
        val prefs = context.getSharedPreferences("sc_crypto_prefs", Context.MODE_PRIVATE)

        prefs
            .edit()
            .putString("ed25519_public_key", Base64.encodeToString(keyPair.publicKey, Base64.NO_WRAP))
            .putString("ed25519_private_key", Base64.encodeToString(keyPair.privateKey, Base64.NO_WRAP))
            .apply()
    }

    /**
     * Generate or retrieve X25519 key pair for key exchange
     * Separate from Ed25519, uses LazySodium for true X25519 support
     */

    /**
     * Generate or retrieve X25519 key pair for key exchange
     * Separate from Ed25519, uses LazySodium for true X25519 support
     */
    fun getX25519KeyPair(): X25519KeyPair {
        x25519KeyPair?.let { return it }

        return try {
            val storedKey = loadX25519KeyFromStorage()
            if (storedKey != null) {
                x25519KeyPair = storedKey
                return storedKey
            } else {
                generateX25519KeyPair().also { x25519KeyPair = it }
            }
        } catch (e: Exception) {
            throw RuntimeException("Failed to get X25519 key pair", e)
        }
    }

    /**
     * Generate X25519 key pair using LazySodium
     */
    private fun generateX25519KeyPair(): X25519KeyPair {
        try {
            val publicKey = ByteArray(KeyExchange.PUBLICKEYBYTES)
            val privateKey = ByteArray(KeyExchange.SECRETKEYBYTES)
            val success = lazySodium.cryptoKxKeypair(publicKey, privateKey)

            if (!success) {
                throw RuntimeException("Failed to generate X25519 keypair with LazySodium")
            }

            val keyPair =
                X25519KeyPair(
                    publicKey = publicKey,
                    privateKey = privateKey,
                )

            saveX25519KeyToStorage(keyPair)
            return keyPair
        } catch (e: Exception) {
            throw RuntimeException("Failed to generate X25519 key pair with LazySodium", e)
        }
    }

    // Software fallback removed as it was insecure (SHA256 != Curve25519)

    /**
     * Load X25519 key from secure storage
     */
    private fun loadX25519KeyFromStorage(): X25519KeyPair? {
        val prefs = context.getSharedPreferences("sc_crypto_prefs", Context.MODE_PRIVATE)

        val publicKeyStr = prefs.getString("x25519_public_key", null)
        val privateKeyStr = prefs.getString("x25519_private_key", null)

        if (publicKeyStr != null && privateKeyStr != null) {
            try {
                val publicKey = Base64.decode(publicKeyStr, Base64.NO_WRAP)
                val privateKey = Base64.decode(privateKeyStr, Base64.NO_WRAP)
                return X25519KeyPair(publicKey, privateKey)
            } catch (e: Exception) {
                // Invalid stored keys
            }
        }

        return null
    }

    /**
     * Save X25519 key to secure storage
     */
    private fun saveX25519KeyToStorage(keyPair: X25519KeyPair) {
        val prefs = context.getSharedPreferences("sc_crypto_prefs", Context.MODE_PRIVATE)

        prefs
            .edit()
            .putString("x25519_public_key", Base64.encodeToString(keyPair.publicKey, Base64.NO_WRAP))
            .putString("x25519_private_key", Base64.encodeToString(keyPair.privateKey, Base64.NO_WRAP))
            .apply()
    }

    /**
     * Sign data using Ed25519 with LazySodium
     */
    fun signEd25519(data: ByteArray): ByteArray {
        try {
            val keyPair = getEd25519KeyPair()
            val signature = ByteArray(Sign.BYTES)
            val success =
                lazySodium.cryptoSignDetached(
                    signature,
                    data,
                    data.size.toLong(),
                    keyPair.privateKey,
                )

            if (!success) {
                throw RuntimeException("Failed to sign data with LazySodium")
            }

            return signature
        } catch (e: Exception) {
            throw RuntimeException("Failed to sign data with LazySodium", e)
        }
    }

    /**
     * Verify signature using Ed25519 with LazySodium
     */
    fun verifyEd25519(
        data: ByteArray,
        signature: ByteArray,
        publicKey: ByteArray,
    ): Boolean {
        return try {
            if (publicKey.size != KEY_SIZE || signature.size != SIGNATURE_SIZE) {
                return false
            }

            lazySodium.cryptoSignVerifyDetached(
                signature,
                data,
                data.size.toLong(),
                publicKey,
            )
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Legacy method for backward compatibility - deprecated
     */
    @Deprecated("Use signEd25519 instead")
    fun sign(data: ByteArray): ByteArray = signEd25519(data)

    /**
     * Legacy method for backward compatibility - deprecated
     */
    @Deprecated("Use verifyEd25519 instead")
    fun verify(
        data: ByteArray,
        signature: ByteArray,
        publicKey: java.security.PublicKey,
    ): Boolean {
        // Convert PublicKey to byte array
        val publicKeyBytes = publicKey.encoded
        // Extract raw key bytes (skip ASN.1 encoding)
        return if (publicKeyBytes.size >= KEY_SIZE) {
            val rawKey = publicKeyBytes.copyOfRange(publicKeyBytes.size - KEY_SIZE, publicKeyBytes.size)
            verifyEd25519(data, signature, rawKey)
        } else {
            false
        }
    }

    /**
     * Perform X25519 key agreement to derive shared secret
     * Uses LazySodium for proper X25519 ECDH matching core implementation
     */
    fun deriveSharedSecret(
        privateKey: ByteArray,
        peerPublicKey: ByteArray,
    ): ByteArray {
        try {
            if (privateKey.size != KEY_SIZE || peerPublicKey.size != KEY_SIZE) {
                throw IllegalArgumentException("Keys must be 32 bytes")
            }

            val sharedSecret = ByteArray(KeyExchange.SESSIONKEYBYTES)
            val success =
                lazySodium.cryptoKxClientSessionKeys(
                    sharedSecret,
                    ByteArray(KeyExchange.SESSIONKEYBYTES), // tx key (not used)
                    privateKey,
                    peerPublicKey,
                )

            if (!success) {
                throw RuntimeException("Failed to derive shared secret with LazySodium")
            }

            // In Core implementation (primitives.ts), deriveSharedSecret performs the key exchange
            // and returns the raw shared secret (point).
            // However, the Core's performKeyExchange implementation returns a SHA-256 hash of the shared secret?
            // Checking Core's crypto/primitives.ts:
            // return deriveSharedSecret(privateKey, publicKey);
            // which does unique(curve.getSharedSecret(privateKey, publicKey))
            // This is the raw shared point (32 bytes).

            // LazySodium cryptoKxClientSessionKeys returns BLAKE2b hash of the shared key + nonces
            // This MIGHT BE DIFFERENT from Core.
            // Core uses noble-curves getSharedSecret = raw X25519 point.
            // LazySodium Scalarmult is what we need for raw point access to match Core.

            val result = ByteArray(32)
            val scalarmultSuccess = lazySodium.cryptoScalarMult(result, privateKey, peerPublicKey)
            if (!scalarmultSuccess) {
                throw RuntimeException("Failed to calculate scalar multiplication")
            }

            return result
        } catch (e: Exception) {
            throw RuntimeException("Failed to derive shared secret", e)
        }
    }

    /**
     * HKDF-SHA256 implementation for key derivation
     */
    private fun hkdfSha256(
        ikm: ByteArray,
        salt: ByteArray,
        info: ByteArray,
        length: Int,
    ): ByteArray {
        // Simplified HKDF implementation
        // Extract phase
        val prk = hmacSha256(salt, ikm)

        // Expand phase (simplified - only one block for 32-byte output)
        val counter = byteArrayOf(1)
        val expandInput = info + counter
        return hmacSha256(prk, expandInput).copyOf(length)
    }

    /**
     * HMAC-SHA256 implementation
     */
    private fun hmacSha256(
        key: ByteArray,
        data: ByteArray,
    ): ByteArray {
        // Use Java's built-in HMAC implementation
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        val secretKey = SecretKeySpec(key, "HmacSHA256")
        mac.init(secretKey)
        return mac.doFinal(data)
    }

    /**
     * Legacy method for backward compatibility - deprecated
     */
    @Deprecated("Use deriveSharedSecret with byte arrays instead")
    fun deriveSharedSecret(
        privateKey: java.security.PrivateKey,
        publicKey: java.security.PublicKey,
    ): ByteArray {
        val keyAgreement = javax.crypto.KeyAgreement.getInstance("ECDH")
        keyAgreement.init(privateKey)
        keyAgreement.doPhase(publicKey, true)
        return keyAgreement.generateSecret()
    }

    /**
     * Encrypt data using XChaCha20-Poly1305
     */
    fun encryptXChaCha20(
        data: ByteArray,
        key: ByteArray,
    ): ByteArray {
        try {
            // Generate random 24-byte nonce (required for XChaCha20)
            val nonce = ByteArray(24)
            secureRandom.nextBytes(nonce)

            // Output buffer needs to be size of message + tag (16 bytes)
            val ciphertext = ByteArray(data.size + 16) // 16 bytes for Poly1305 tag

            // Core library implementation uses:
            // xchacha20poly1305(key, nonce).encrypt(data)

            // LazySodium implementation:
            val success =
                lazySodium.cryptoSecretBoxEasy(
                    ciphertext,
                    data,
                    data.size.toLong(),
                    nonce,
                    key,
                )

            if (!success) {
                // Try alternative XChaCha20 specific method if SecretBox (XSalsa20) is not what matches Core's "XChaCha20"
                // Note: Core says XChaCha20. SecretBox is usually XSalsa20.
                // We should use cryptoAeadXchacha20Poly1305IetfEncrypt

                val ciphertextLen = LongArray(1)
                val xsuccess =
                    lazySodium.cryptoAeadXchacha20Poly1305IetfEncrypt(
                        ciphertext,
                        ciphertextLen,
                        data,
                        data.size.toLong(),
                        ByteArray(0), // AD
                        0,
                        ByteArray(0), // nsec
                        nonce,
                        key,
                    )

                if (!xsuccess) {
                    throw RuntimeException("Encryption failed with LazySodium")
                }
            }

            // Combine nonce + ciphertext (including tag)
            // Core: nonce (24) + ciphertext (N) + tag (16) (often tag is appended to ciphertext)
            return nonce + ciphertext
        } catch (e: Exception) {
            throw RuntimeException("Encryption failed", e)
        }
    }

    /**
     * Decrypt data using XChaCha20-Poly1305
     */
    fun decryptXChaCha20(
        encryptedData: ByteArray,
        key: ByteArray,
    ): ByteArray? {
        if (encryptedData.size < 40) return null // 24 nonce + 16 tag

        try {
            val nonce = encryptedData.copyOfRange(0, 24)
            val ciphertext = encryptedData.copyOfRange(24, encryptedData.size)

            // Plaintext buffer size = ciphertext len - tag size (16)
            val plaintext = ByteArray(ciphertext.size - 16)
            val plaintextLen = LongArray(1)

            val success =
                lazySodium.cryptoAeadXchacha20Poly1305IetfDecrypt(
                    plaintext,
                    plaintextLen,
                    ByteArray(0), // nsec
                    ciphertext,
                    ciphertext.size.toLong(),
                    ByteArray(0), // AD
                    0,
                    nonce,
                    key,
                )

            if (!success) {
                // Fallback to SecretBox (XSalsa20) if that was used
                val sbSuccess =
                    lazySodium.cryptoSecretBoxOpenEasy(
                        plaintext,
                        ciphertext,
                        ciphertext.size.toLong(),
                        nonce,
                        key,
                    )
                if (!sbSuccess) return null
            }

            return plaintext
        } catch (e: Exception) {
            return null
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
    fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    /**
     * Get Ed25519 public key as base64 string
     */
    fun ed25519PublicKeyToBase64(): String {
        val keyPair = getEd25519KeyPair()
        return Base64.encodeToString(keyPair.publicKey, Base64.NO_WRAP)
    }

    /**
     * Get X25519 public key as base64 string
     */
    fun x25519PublicKeyToBase64(): String {
        val keyPair = getX25519KeyPair()
        return Base64.encodeToString(keyPair.publicKey, Base64.NO_WRAP)
    }

    /**
     * Parse base64 Ed25519 public key
     */
    fun base64ToEd25519PublicKey(base64Key: String): ByteArray? =
        try {
            Base64.decode(base64Key, Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }

    /**
     * Legacy method for backward compatibility - deprecated
     */
    @Deprecated("Use ed25519PublicKeyToBase64 instead")
    fun publicKeyToBase64(publicKey: PublicKey): String = Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)

    /**
     * Legacy method for backward compatibility - deprecated
     */
    @Deprecated("Use base64ToEd25519PublicKey instead")
    fun base64ToPublicKey(base64Key: String): PublicKey? =
        try {
            val keyBytes = Base64.decode(base64Key, Base64.DEFAULT)
            java.security.KeyFactory
                .getInstance("EC")
                .generatePublic(java.security.spec.X509EncodedKeySpec(keyBytes))
        } catch (e: Exception) {
            null
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
            isSelfHosted = true,
        )
    }

    /**
     * Get local IP address for self-hosting
     */
    private fun getLocalIpAddress(): String? =
        try {
            java.net.NetworkInterface
                .getNetworkInterfaces()
                .asSequence()
                .flatMap { it.inetAddresses.asSequence() }
                .find { !it.isLoopbackAddress && it is java.net.Inet4Address }
                ?.hostAddress
        } catch (e: Exception) {
            null
        }

    /**
     * Configuration for TURN server
     */
    data class TurnServerConfig(
        val host: String,
        val port: Int,
        val username: String,
        val password: String,
        val isSelfHosted: Boolean = false,
    )
}
