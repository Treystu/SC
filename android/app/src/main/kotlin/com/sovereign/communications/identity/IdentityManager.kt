package com.sovereign.communications.identity

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Unified Identity Manager for Android
 *
 * Stores Ed25519 keypair securely using Android Keystore
 * Compatible with Web (IndexedDB) and iOS (Keychain) implementations
 *
 * Storage Strategy:
 * - Private key: Encrypted in Android Keystore (most secure)
 * - Public key: Base64 in EncryptedSharedPreferences (for quick access)
 * - Display name: EncryptedSharedPreferences
 * - Fingerprint: SHA-256 of public key, stored in EncryptedSharedPreferences
 */
class IdentityManager(
    private val context: Context,
) {
    private val masterKey =
        MasterKey
            .Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

    private val sharedPrefs: SharedPreferences =
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    companion object {
        private const val TAG = "IdentityManager"
        private const val PREFS_NAME = "sc_identity_prefs"
        private const val KEY_PUBLIC_KEY = "identity_public_key"
        private const val KEY_PRIVATE_KEY_ENCRYPTED = "identity_private_key_encrypted"
        private const val KEY_DISPLAY_NAME = "identity_display_name"
        private const val KEY_FINGERPRINT = "identity_fingerprint"
        private const val KEY_CREATED_AT = "identity_created_at"
        private const val KEY_IS_PRIMARY = "identity_is_primary"

        private const val KEYSTORE_ALIAS = "sc_identity_key"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    }

    /**
     * Identity data class matching core interface
     */
    data class Identity(
        val publicKey: ByteArray,
        val privateKey: ByteArray,
        val fingerprint: String,
        val displayName: String? = null,
        val createdAt: Long = System.currentTimeMillis(),
        val isPrimary: Boolean = true,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false
            other as Identity
            if (!publicKey.contentEquals(other.publicKey)) return false
            if (!privateKey.contentEquals(other.privateKey)) return false
            if (fingerprint != other.fingerprint) return false
            return true
        }

        override fun hashCode(): Int {
            var result = publicKey.contentHashCode()
            result = 31 * result + privateKey.contentHashCode()
            result = 31 * result + fingerprint.hashCode()
            return result
        }
    }

    /**
     * Check if an identity exists
     */
    fun hasIdentity(): Boolean =
        sharedPrefs.contains(KEY_PUBLIC_KEY) &&
            sharedPrefs.contains(KEY_PRIVATE_KEY_ENCRYPTED)

    /**
     * Get the primary identity (loads from secure storage)
     */
    fun getIdentity(): Identity? {
        try {
            val publicKeyBase64 = sharedPrefs.getString(KEY_PUBLIC_KEY, null) ?: return null
            val privateKeyEncrypted = sharedPrefs.getString(KEY_PRIVATE_KEY_ENCRYPTED, null) ?: return null
            val fingerprint = sharedPrefs.getString(KEY_FINGERPRINT, null) ?: return null
            val displayName = sharedPrefs.getString(KEY_DISPLAY_NAME, null)
            val createdAt = sharedPrefs.getLong(KEY_CREATED_AT, System.currentTimeMillis())
            val isPrimary = sharedPrefs.getBoolean(KEY_IS_PRIMARY, true)

            val publicKey = Base64.decode(publicKeyBase64, Base64.NO_WRAP)
            val privateKey = decryptPrivateKey(privateKeyEncrypted)

            return Identity(
                publicKey = publicKey,
                privateKey = privateKey,
                fingerprint = fingerprint,
                displayName = displayName,
                createdAt = createdAt,
                isPrimary = isPrimary,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load identity", e)
            return null
        }
    }

    /**
     * Save an identity securely
     */
    fun saveIdentity(identity: Identity) {
        try {
            // Encrypt private key using Android Keystore
            val privateKeyEncrypted = encryptPrivateKey(identity.privateKey)

            // Store in EncryptedSharedPreferences
            sharedPrefs.edit().apply {
                putString(KEY_PUBLIC_KEY, Base64.encodeToString(identity.publicKey, Base64.NO_WRAP))
                putString(KEY_PRIVATE_KEY_ENCRYPTED, privateKeyEncrypted)
                putString(KEY_FINGERPRINT, identity.fingerprint)
                putString(KEY_DISPLAY_NAME, identity.displayName)
                putLong(KEY_CREATED_AT, identity.createdAt)
                putBoolean(KEY_IS_PRIMARY, identity.isPrimary)
                apply()
            }

            Log.d(TAG, "Identity saved successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save identity", e)
            throw e
        }
    }

    /**
     * Update display name only
     */
    fun updateDisplayName(displayName: String) {
        sharedPrefs.edit().putString(KEY_DISPLAY_NAME, displayName).apply()
    }

    /**
     * Get public key ID (Base64 for consistency across platforms)
     */
    fun getPublicKeyId(): String? = sharedPrefs.getString(KEY_PUBLIC_KEY, null)

    /**
     * Get fingerprint
     */
    fun getFingerprint(): String? = sharedPrefs.getString(KEY_FINGERPRINT, null)

    /**
     * Delete identity (for testing or reset)
     */
    fun deleteIdentity() {
        sharedPrefs.edit().clear().apply()

        // Also remove keystore key
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
            keyStore.load(null)
            keyStore.deleteEntry(KEYSTORE_ALIAS)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to delete keystore entry", e)
        }
    }

    /**
     * Encrypt private key using Android Keystore
     */
    private fun encryptPrivateKey(privateKey: ByteArray): String {
        val cipher = getCipher()
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())

        val encryptedBytes = cipher.doFinal(privateKey)
        val iv = cipher.iv

        // Combine IV and encrypted data
        val combined = ByteArray(iv.size + encryptedBytes.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(encryptedBytes, 0, combined, iv.size, encryptedBytes.size)

        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    /**
     * Decrypt private key using Android Keystore
     */
    private fun decryptPrivateKey(encryptedData: String): ByteArray {
        val combined = Base64.decode(encryptedData, Base64.NO_WRAP)

        // Extract IV and encrypted data
        val iv = ByteArray(12) // GCM standard IV size
        val encryptedBytes = ByteArray(combined.size - 12)
        System.arraycopy(combined, 0, iv, 0, 12)
        System.arraycopy(combined, 12, encryptedBytes, 0, encryptedBytes.size)

        val cipher = getCipher()
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))

        return cipher.doFinal(encryptedBytes)
    }

    /**
     * Get or create AES key in Android Keystore
     */
    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        keyStore.load(null)

        if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
            return keyStore.getKey(KEYSTORE_ALIAS, null) as SecretKey
        }

        // Generate new key
        val keyGenerator =
            KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEYSTORE_PROVIDER,
            )

        val keyGenParameterSpec =
            KeyGenParameterSpec
                .Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()

        keyGenerator.init(keyGenParameterSpec)
        return keyGenerator.generateKey()
    }

    /**
     * Generate a new Ed25519 identity using BouncyCastle
     */
    fun generateNewIdentity(displayName: String? = null): Identity {
        val random = SecureRandom()
        val keyPairGenerator = Ed25519KeyPairGenerator()
        keyPairGenerator.init(Ed25519KeyGenerationParameters(random))

        val keyPair = keyPairGenerator.generateKeyPair()
        val privateKeyParams = keyPair.private as Ed25519PrivateKeyParameters
        val publicKeyParams = keyPair.public as Ed25519PublicKeyParameters

        val privateKey = privateKeyParams.encoded
        val publicKey = publicKeyParams.encoded

        // Generate fingerprint (SHA-256 of public key)
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val fingerprintBytes = md.digest(publicKey)
        val fingerprint = Base64.encodeToString(fingerprintBytes, Base64.NO_WRAP)

        val identity =
            Identity(
                publicKey = publicKey,
                privateKey = privateKey,
                fingerprint = fingerprint,
                displayName = displayName,
            )

        saveIdentity(identity)
        return identity
    }

    /**
     * Sign data using the stored private key
     */
    fun sign(data: ByteArray): ByteArray {
        val identity = getIdentity() ?: throw IllegalStateException("No identity found")

        val signer = Ed25519Signer()
        val privateKeyParams = Ed25519PrivateKeyParameters(identity.privateKey, 0)
        signer.init(true, privateKeyParams)
        signer.update(data, 0, data.size)

        return signer.generateSignature()
    }

    /**
     * Verify signature using the public key
     */
    fun verify(
        data: ByteArray,
        signature: ByteArray,
        publicKey: ByteArray,
    ): Boolean {
        try {
            val verifier = Ed25519Signer()
            val publicKeyParams = Ed25519PublicKeyParameters(publicKey, 0)
            verifier.init(false, publicKeyParams)
            verifier.update(data, 0, data.size)
            return verifier.verifySignature(signature)
        } catch (e: Exception) {
            Log.e(TAG, "Signature verification failed", e)
            return false
        }
    }

    /**
     * Get cipher for encryption/decryption
     */
    private fun getCipher(): Cipher = Cipher.getInstance("AES/GCM/NoPadding")
}
