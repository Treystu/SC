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
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Manages Ed25519 identity keys for Sovereign Communications.
 * 
 * Keys are stored encrypted using Android Keystore-backed AES-256-GCM.
 * Uses BouncyCastle for Ed25519 key generation, signing, and verification.
 */
class IdentityManager(private val context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context, PREFS_NAME, masterKey,
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
        
        // Ed25519 key sizes
        private const val ED25519_PUBLIC_KEY_SIZE = 32
        private const val ED25519_PRIVATE_KEY_SIZE = 32
        private const val ED25519_SIGNATURE_SIZE = 64
    }

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
            return publicKey.contentEquals(other.publicKey) && privateKey.contentEquals(other.privateKey)
        }
        override fun hashCode(): Int = publicKey.contentHashCode() * 31 + privateKey.contentHashCode()
    }

    fun hasIdentity(): Boolean = sharedPrefs.contains(KEY_PUBLIC_KEY) && sharedPrefs.contains(KEY_PRIVATE_KEY_ENCRYPTED)

    fun getIdentity(): Identity? {
        try {
            val publicKeyBase64 = sharedPrefs.getString(KEY_PUBLIC_KEY, null) ?: return null
            val privateKeyEncrypted = sharedPrefs.getString(KEY_PRIVATE_KEY_ENCRYPTED, null) ?: return null
            val fingerprint = sharedPrefs.getString(KEY_FINGERPRINT, null) ?: return null
            val displayName = sharedPrefs.getString(KEY_DISPLAY_NAME, null)
            val createdAt = sharedPrefs.getLong(KEY_CREATED_AT, System.currentTimeMillis())
            val isPrimary = sharedPrefs.getBoolean(KEY_IS_PRIMARY, true)
            return Identity(
                Base64.decode(publicKeyBase64, Base64.NO_WRAP),
                decryptPrivateKey(privateKeyEncrypted),
                fingerprint, displayName, createdAt, isPrimary
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load identity", e)
            return null
        }
    }

    fun saveIdentity(identity: Identity) {
        sharedPrefs.edit().apply {
            putString(KEY_PUBLIC_KEY, Base64.encodeToString(identity.publicKey, Base64.NO_WRAP))
            putString(KEY_PRIVATE_KEY_ENCRYPTED, encryptPrivateKey(identity.privateKey))
            putString(KEY_FINGERPRINT, identity.fingerprint)
            putString(KEY_DISPLAY_NAME, identity.displayName)
            putLong(KEY_CREATED_AT, identity.createdAt)
            putBoolean(KEY_IS_PRIMARY, identity.isPrimary)
            apply()
        }
    }

    fun updateDisplayName(displayName: String) {
        sharedPrefs.edit().putString(KEY_DISPLAY_NAME, displayName).apply()
    }

    fun getPublicKeyId(): String? = sharedPrefs.getString(KEY_PUBLIC_KEY, null)
    fun getFingerprint(): String? = sharedPrefs.getString(KEY_FINGERPRINT, null)

    fun deleteIdentity() {
        sharedPrefs.edit().clear().apply()
        try {
            KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null); deleteEntry(KEYSTORE_ALIAS) }
        } catch (e: Exception) { Log.w(TAG, "Failed to delete keystore entry", e) }
    }

    private fun encryptPrivateKey(privateKey: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val encrypted = cipher.doFinal(privateKey)
        val combined = cipher.iv + encrypted
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decryptPrivateKey(encryptedData: String): ByteArray {
        val combined = Base64.decode(encryptedData, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, 12)
        val encrypted = combined.copyOfRange(12, combined.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(128, iv))
        return cipher.doFinal(encrypted)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
            return keyStore.getKey(KEYSTORE_ALIAS, null) as SecretKey
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER).apply {
            init(KeyGenParameterSpec.Builder(KEYSTORE_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
        }.generateKey()
    }

    /**
     * Generate a new Ed25519 identity using BouncyCastle.
     * The private key (seed) is stored encrypted, public key is stored in base64.
     */
    fun generateNewIdentity(displayName: String? = null): Identity {
        // Generate Ed25519 key pair using BouncyCastle
        val keyPairGenerator = Ed25519KeyPairGenerator()
        keyPairGenerator.init(Ed25519KeyGenerationParameters(SecureRandom()))
        val keyPair = keyPairGenerator.generateKeyPair()
        
        val privateKeyParams = keyPair.private as Ed25519PrivateKeyParameters
        val publicKeyParams = keyPair.public as Ed25519PublicKeyParameters
        
        val privateKey = privateKeyParams.encoded  // 32-byte seed
        val publicKey = publicKeyParams.encoded    // 32-byte public key
        
        // Generate fingerprint from SHA-256 of public key
        val fingerprint = Base64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(publicKey), 
            Base64.NO_WRAP
        )
        
        val identity = Identity(publicKey, privateKey, fingerprint, displayName)
        saveIdentity(identity)
        
        Log.d(TAG, "Generated new Ed25519 identity with fingerprint: $fingerprint")
        return identity
    }

    /**
     * Sign data using the stored Ed25519 private key.
     * Returns a 64-byte Ed25519 signature.
     */
    fun sign(data: ByteArray): ByteArray {
        val identity = getIdentity() ?: throw IllegalStateException("No identity found")
        
        // Reconstruct Ed25519 private key from stored seed
        val privateKeyParams = Ed25519PrivateKeyParameters(identity.privateKey, 0)
        
        // Sign using Ed25519Signer
        val signer = Ed25519Signer()
        signer.init(true, privateKeyParams)
        signer.update(data, 0, data.size)
        
        val signature = signer.generateSignature()
        
        require(signature.size == ED25519_SIGNATURE_SIZE) {
            "Invalid signature size: ${signature.size}, expected $ED25519_SIGNATURE_SIZE"
        }
        
        return signature
    }

    /**
     * Verify an Ed25519 signature against data and public key.
     * 
     * @param data The data that was signed
     * @param signature 64-byte Ed25519 signature
     * @param publicKey 32-byte Ed25519 public key
     * @return true if signature is valid
     */
    fun verify(data: ByteArray, signature: ByteArray, publicKey: ByteArray): Boolean {
        return try {
            // Validate input sizes
            if (signature.size != ED25519_SIGNATURE_SIZE) {
                Log.w(TAG, "Invalid signature size: ${signature.size}")
                return false
            }
            if (publicKey.size != ED25519_PUBLIC_KEY_SIZE) {
                Log.w(TAG, "Invalid public key size: ${publicKey.size}")
                return false
            }
            
            // Reconstruct public key from bytes
            val publicKeyParams = Ed25519PublicKeyParameters(publicKey, 0)
            
            // Verify using Ed25519Signer
            val verifier = Ed25519Signer()
            verifier.init(false, publicKeyParams)
            verifier.update(data, 0, data.size)
            
            verifier.verifySignature(signature)
        } catch (e: Exception) {
            Log.e(TAG, "Signature verification failed", e)
            false
        }
    }
    
    /**
     * Sign data and return signature along with public key for verification.
     * Convenience method for message signing.
     */
    fun signWithPublicKey(data: ByteArray): Pair<ByteArray, ByteArray> {
        val identity = getIdentity() ?: throw IllegalStateException("No identity found")
        val signature = sign(data)
        return Pair(signature, identity.publicKey)
    }
}
