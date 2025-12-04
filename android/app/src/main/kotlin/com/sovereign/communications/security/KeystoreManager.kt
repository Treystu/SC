package com.sovereign.communications.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Manages cryptographic keys using Android Keystore for hardware-backed security.
 *
 * Security Features:
 * - Hardware-backed key storage (StrongBox when available)
 * - Biometric authentication requirement for key usage
 * - Automatic key invalidation on security changes
 * - AES-256-GCM encryption
 */
object KeystoreManager {
    private const val TAG = "KeystoreManager"
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS_PREFIX = "sc_key_"
    private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_LENGTH = 128

    /**
     * Generates or retrieves a key from Android Keystore.
     *
     * @param keyAlias Unique identifier for the key
     * @param requireBiometric Whether biometric authentication is required
     * @param authValidityDuration Duration in seconds that key is valid after authentication
     * @return The SecretKey from Keystore
     */
    fun generateOrGetKey(
        keyAlias: String,
        requireBiometric: Boolean = false,
        authValidityDuration: Int = 30,
    ): SecretKey {
        val fullAlias = KEY_ALIAS_PREFIX + keyAlias
        val keyStore = getKeyStore()

        // Check if key already exists
        if (keyStore.containsAlias(fullAlias)) {
            try {
                return keyStore.getKey(fullAlias, null) as SecretKey
            } catch (e: Exception) {
                Log.w(TAG, "Failed to retrieve existing key, generating new one", e)
                keyStore.deleteEntry(fullAlias)
            }
        }

        // Generate new key
        return generateKey(fullAlias, requireBiometric, authValidityDuration)
    }

    /**
     * Generate a new key in Android Keystore.
     */
    private fun generateKey(
        keyAlias: String,
        requireBiometric: Boolean,
        authValidityDuration: Int,
    ): SecretKey {
        val keyGenerator =
            KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEYSTORE_PROVIDER,
            )

        val builder =
            KeyGenParameterSpec
                .Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)

        // Add biometric requirement if requested
        if (requireBiometric) {
            builder.setUserAuthenticationRequired(true)
            builder.setUserAuthenticationValidityDurationSeconds(authValidityDuration)
            // Invalidate key if biometric enrollment changes
            builder.setInvalidatedByBiometricEnrollment(true)
        }

        // Use StrongBox if available (hardware security module)
        try {
            builder.setIsStrongBoxBacked(true)
            keyGenerator.init(builder.build())
            Log.d(TAG, "Key generated with StrongBox backing")
        } catch (e: Exception) {
            // StrongBox not available, use regular TEE
            builder.setIsStrongBoxBacked(false)
            keyGenerator.init(builder.build())
            Log.d(TAG, "Key generated with TEE backing (StrongBox unavailable)")
        }

        return keyGenerator.generateKey()
    }

    /**
     * Encrypt data using a key from Keystore.
     *
     * @param keyAlias The key to use
     * @param plaintext Data to encrypt
     * @return Encrypted data (IV + ciphertext + tag)
     */
    fun encrypt(
        keyAlias: String,
        plaintext: ByteArray,
    ): EncryptedData {
        val key = generateOrGetKey(keyAlias)
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)

        val ciphertext = cipher.doFinal(plaintext)
        val iv = cipher.iv

        return EncryptedData(
            ciphertext = ciphertext,
            iv = iv,
        )
    }

    /**
     * Decrypt data using a key from Keystore.
     *
     * @param keyAlias The key to use
     * @param encryptedData The encrypted data
     * @return Decrypted plaintext
     */
    fun decrypt(
        keyAlias: String,
        encryptedData: EncryptedData,
    ): ByteArray {
        val key = generateOrGetKey(keyAlias)
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        val spec = GCMParameterSpec(GCM_TAG_LENGTH, encryptedData.iv)
        cipher.init(Cipher.DECRYPT_MODE, key, spec)

        return cipher.doFinal(encryptedData.ciphertext)
    }

    /**
     * Delete a key from Keystore.
     */
    fun deleteKey(keyAlias: String) {
        val fullAlias = KEY_ALIAS_PREFIX + keyAlias
        try {
            getKeyStore().deleteEntry(fullAlias)
            Log.d(TAG, "Deleted key: $fullAlias")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete key: $fullAlias", e)
        }
    }

    /**
     * Check if a key exists in Keystore.
     */
    fun keyExists(keyAlias: String): Boolean {
        val fullAlias = KEY_ALIAS_PREFIX + keyAlias
        return try {
            getKeyStore().containsAlias(fullAlias)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking key existence", e)
            false
        }
    }

    /**
     * Get the Android Keystore instance.
     */
    private fun getKeyStore(): KeyStore =
        KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
            load(null)
        }

    /**
     * Generate a database encryption passphrase and store it securely.
     *
     * @return The passphrase as a ByteArray
     */
    fun generateDatabasePassphrase(): ByteArray {
        // Generate a secure random passphrase
        val passphrase = ByteArray(32)
        java.security.SecureRandom().nextBytes(passphrase)

        // Return the plaintext passphrase for the caller to encrypt and store
        // The caller (SCApplication) will encrypt this with the Keystore key
        // and persist it in SharedPreferences
        return passphrase
    }

    /**
     * Generate or retrieve an Asymmetric KeyPair (EC P-256) from Android Keystore.
     */
    fun generateAsymmetricKey(alias: String): KeyPair {
        val fullAlias = KEY_ALIAS_PREFIX + alias
        val keyStore = getKeyStore()

        try {
            if (keyStore.containsAlias(fullAlias)) {
                val privateKey = keyStore.getKey(fullAlias, null) as? PrivateKey
                val certificate = keyStore.getCertificate(fullAlias)
                val publicKey = certificate?.publicKey

                if (privateKey != null && publicKey != null) {
                    Log.d(TAG, "Retrieved existing asymmetric key pair: $fullAlias")
                    return KeyPair(publicKey, privateKey)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to retrieve existing key pair, generating new one", e)
        }

        Log.d(TAG, "Generating new asymmetric key pair: $fullAlias")
        val kpg: KeyPairGenerator =
            KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                KEYSTORE_PROVIDER,
            )
        val parameterSpec: KeyGenParameterSpec =
            KeyGenParameterSpec
                .Builder(
                    fullAlias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                ).run {
                    setDigests(KeyProperties.DIGEST_SHA256)
                    setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    build()
                }

        kpg.initialize(parameterSpec)
        return kpg.generateKeyPair()
    }

    /**
     * Sign data using a private key from Keystore.
     */
    fun signData(
        alias: String,
        data: ByteArray,
    ): ByteArray {
        val fullAlias = KEY_ALIAS_PREFIX + alias
        val keyStore = getKeyStore()

        // Check if key exists
        if (!keyStore.containsAlias(fullAlias)) {
            throw IllegalStateException("Key not found: $fullAlias")
        }

        val entry =
            keyStore.getEntry(fullAlias, null) as? KeyStore.PrivateKeyEntry
                ?: throw IllegalStateException("Key entry is not a PrivateKeyEntry")

        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(entry.privateKey)
        signature.update(data)
        return signature.sign()
    }

    /**
     * Verify signature using a public key.
     * Note: This uses standard Java crypto, not Keystore, as we verify external signatures.
     */
    fun verifyData(
        publicKey: PublicKey,
        data: ByteArray,
        signatureBytes: ByteArray,
    ): Boolean =
        try {
            val signature = Signature.getInstance("SHA256withECDSA")
            signature.initVerify(publicKey)
            signature.update(data)
            signature.verify(signatureBytes)
        } catch (e: Exception) {
            Log.e(TAG, "Verification failed", e)
            false
        }

    /**
     * Get Public Key for an alias
     */
    fun getPublicKey(alias: String): PublicKey? {
        val fullAlias = KEY_ALIAS_PREFIX + alias
        val keyStore = getKeyStore()
        return keyStore.getCertificate(fullAlias)?.publicKey
    }
}

/**
 * Data class for encrypted data with IV.
 */
data class EncryptedData(
    val ciphertext: ByteArray,
    val iv: ByteArray,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as EncryptedData

        if (!ciphertext.contentEquals(other.ciphertext)) return false
        if (!iv.contentEquals(other.iv)) return false

        return true
    }

    override fun hashCode(): Int {
        var result = ciphertext.contentHashCode()
        result = 31 * result + iv.contentHashCode()
        return result
    }

    /**
     * Encode to Base64 string for storage.
     */
    fun toBase64(): String {
        val combined = ByteArray(iv.size + ciphertext.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ciphertext, 0, combined, iv.size, ciphertext.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    companion object {
        /**
         * Decode from Base64 string.
         */
        fun fromBase64(
            encoded: String,
            ivSize: Int = 12,
        ): EncryptedData {
            val combined = Base64.decode(encoded, Base64.NO_WRAP)
            val iv = ByteArray(ivSize)
            val ciphertext = ByteArray(combined.size - ivSize)
            System.arraycopy(combined, 0, iv, 0, ivSize)
            System.arraycopy(combined, ivSize, ciphertext, 0, ciphertext.size)
            return EncryptedData(ciphertext, iv)
        }
    }
}
