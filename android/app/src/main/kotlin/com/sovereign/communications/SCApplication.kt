package com.sovereign.communications

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.identity.IdentityManager
import com.sovereign.communications.security.EncryptedData
import com.sovereign.communications.security.KeystoreManager
import com.sovereign.communications.service.MeshNetworkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Application class for Sovereign Communications
 * Task 57: Set up Android project (Kotlin)
 */
class SCApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Lazy initialization of database
    val database: SCDatabase by lazy {
        SCDatabase.getDatabase(this)
    }

    // Mesh network manager instance
    lateinit var meshNetworkManager: MeshNetworkManager
        private set

    // Identity Manager
    lateinit var identityManager: IdentityManager
        private set

    // Legacy prefs for database passphrase
    private lateinit var appPrefs: SharedPreferences

    // Local peer ID (loaded from identity)
    var localPeerId: String? = null
        private set

    // Raw bytes of the peer ID
    val localPeerIdBytes: ByteArray?
        get() = identityManager.getIdentity()?.publicKey

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Initialize application-level components
        initializeServices()
    }

    private fun initializeServices() {
        Log.d(TAG, "Initializing application services")

        // Initialize crypto components
        initializeCrypto()

        // Load identity from secure storage
        loadIdentity()

        // Initialize mesh network service
        initializeMeshNetwork()

        Log.d(TAG, "Application services initialized successfully")
    }

    /**
     * Initialize cryptographic components and ensure keys are set up.
     */
    private fun initializeCrypto() {
        try {
            // Initialize IdentityManager
            identityManager = IdentityManager(this)

            // Generate or retrieve the database encryption key
            if (!KeystoreManager.keyExists("database_passphrase")) {
                Log.d(TAG, "Generating new database passphrase")
                val passphrase = KeystoreManager.generateDatabasePassphrase()
                // Store encrypted passphrase in SharedPreferences
                storeEncryptedPassphrase(passphrase)
            } else {
                Log.d(TAG, "Database passphrase already exists")
            }

            // Generate or retrieve identity signing key
            if (!KeystoreManager.keyExists("identity_key")) {
                Log.d(TAG, "Generating identity key")
                KeystoreManager.generateOrGetKey("identity_key", requireBiometric = false)
            }

            Log.d(TAG, "Crypto components initialized")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize crypto components", e)
        }
    }

    /**
     * Load user identity from secure storage.
     * If no identity exists, generate a new one.
     */
    private fun loadIdentity() {
        appPrefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)

        try {
            // Check IdentityManager
            if (identityManager.hasIdentity()) {
                val identity = identityManager.getIdentity()
                if (identity != null) {
                    localPeerId = formatPublicKeyToHex(identity.publicKey)
                    Log.d(TAG, "Loaded existing identity: $localPeerId")
                } else {
                    Log.e(TAG, "Identity exists but failed to load")
                    generateNewIdentity()
                }
            } else {
                Log.d(TAG, "No existing identity found, generating new one")
                generateNewIdentity()
            }

            // Load encrypted passphrase if it exists (legacy/migrated)
            val legacyPrefs = getSharedPreferences("identity", Context.MODE_PRIVATE)
            val encryptedPassphraseB64 =
                legacyPrefs.getString("encrypted_passphrase", null)
                    ?: appPrefs.getString("encrypted_passphrase", null)

            if (encryptedPassphraseB64 != null) {
                try {
                    val encryptedData = EncryptedData.fromBase64(encryptedPassphraseB64)
                    val passphrase = KeystoreManager.decrypt("database_passphrase", encryptedData)
                    Log.d(TAG, "Successfully decrypted database passphrase")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decrypt passphrase", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load identity", e)
            generateNewIdentity()
        }
    }

    /**
     * Generate a new identity and save it to secure storage.
     */
    private fun generateNewIdentity() {
        try {
            val identity = identityManager.generateNewIdentity()
            localPeerId = formatPublicKeyToHex(identity.publicKey)
            Log.d(TAG, "Generated new identity: $localPeerId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate new identity", e)
        }
    }

    private fun formatPublicKeyToHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    /**
     * Store encrypted passphrase in SharedPreferences.
     */
    private fun storeEncryptedPassphrase(passphrase: ByteArray) {
        try {
            val encrypted = KeystoreManager.encrypt("database_passphrase", passphrase)
            appPrefs
                .edit()
                .putString("encrypted_passphrase", encrypted.toBase64())
                .apply()
            Log.d(TAG, "Stored encrypted passphrase")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to store encrypted passphrase", e)
        }
    }

    /**
     * Initialize the mesh network manager.
     */
    private fun initializeMeshNetwork() {
        try {
            meshNetworkManager = MeshNetworkManager(this, database)

            // Start mesh network in background
            applicationScope.launch(Dispatchers.IO) {
                try {
                    meshNetworkManager.start()
                    Log.d(TAG, "Mesh network started successfully")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start mesh network", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize mesh network manager", e)
        }
    }

    override fun onTerminate() {
        super.onTerminate()
        // Stop mesh network
        try {
            if (::meshNetworkManager.isInitialized) {
                meshNetworkManager.stop()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping mesh network", e)
        }
    }

    companion object {
        private const val TAG = "SCApplication"

        lateinit var instance: SCApplication
            private set
    }
}
