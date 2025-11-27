package com.sovereign.communications

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.security.KeystoreManager
import com.sovereign.communications.security.EncryptedData
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
    
    // Identity storage
    private lateinit var identityPrefs: SharedPreferences
    
    // Local peer ID (loaded from identity)
    var localPeerId: String? = null
        private set
    
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
            // Continue with app startup even if crypto init fails
            // This allows the app to run in degraded mode
        }
    }
    
    /**
     * Load user identity from secure storage.
     * If no identity exists, generate a new one.
     */
    private fun loadIdentity() {
        identityPrefs = getSharedPreferences("identity", Context.MODE_PRIVATE)
        
        try {
            // Try to load existing peer ID
            localPeerId = identityPrefs.getString("peer_id", null)
            
            if (localPeerId == null) {
                // Generate new identity
                Log.d(TAG, "No existing identity found, generating new one")
                generateNewIdentity()
            } else {
                Log.d(TAG, "Loaded existing identity: $localPeerId")
            }
            
            // Load encrypted passphrase if it exists
            val encryptedPassphraseB64 = identityPrefs.getString("encrypted_passphrase", null)
            if (encryptedPassphraseB64 != null) {
                try {
                    val encryptedData = EncryptedData.fromBase64(encryptedPassphraseB64)
                    val passphrase = KeystoreManager.decrypt("database_passphrase", encryptedData)
                    Log.d(TAG, "Successfully decrypted database passphrase")
                    // Passphrase can be used for database encryption if needed
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decrypt passphrase", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load identity", e)
            // Generate new identity as fallback
            generateNewIdentity()
        }
    }
    
    /**
     * Generate a new identity and save it to secure storage.
     */
    private fun generateNewIdentity() {
        try {
            // Generate a unique peer ID (in production, this would be derived from public key)
            localPeerId = java.util.UUID.randomUUID().toString()
            
            // Save to SharedPreferences
            identityPrefs.edit()
                .putString("peer_id", localPeerId)
                .putLong("created_at", System.currentTimeMillis())
                .apply()
            
            Log.d(TAG, "Generated new identity: $localPeerId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate new identity", e)
            // Use a temporary ID as last resort
            localPeerId = "temp_${System.currentTimeMillis()}"
        }
    }
    
    /**
     * Store encrypted passphrase in SharedPreferences.
     */
    private fun storeEncryptedPassphrase(passphrase: ByteArray) {
        try {
            val encrypted = KeystoreManager.encrypt("database_passphrase", passphrase)
            identityPrefs.edit()
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
