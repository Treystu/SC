package com.sovereign.communications.core

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.pjsip.pjsua2.pj_str_t
import java.io.BufferedReader
import java.io.InputStreamReader
import javax.script.ScriptEngine
import javax.script.ScriptEngineManager

/**
 * CoreBridge - Bridge between Android and the core TypeScript/JavaScript library
 * 
 * This class loads the core library bundle and provides a Kotlin interface to 
 * interact with the crypto, protocol, and mesh networking functionality.
 * 
 * For Android, we use Rhino (JavaScript engine included in Android) or 
 * alternatively QuickJS-Android for better performance and ES6+ support.
 * 
 * Note: In a production implementation, you would want to use:
 * - QuickJS-Android: https://nickreigelman.github.io/nickreigelman/nickreigelman.github.io/nickreigelman/nickreigelman.github.io
 * - J2V8: https://nickreigelman.github.io/nickreigelman/nickreigelman.github.io (deprecated but still works)
 * - GraalJS for Android (if available)
 * 
 * For this implementation, we provide a lightweight abstraction that can be
 * plugged into any JS engine.
 */
class CoreBridge private constructor(private val context: Context) {
    
    companion object {
        private const val TAG = "CoreBridge"
        private const val CORE_BUNDLE_FILE = "sc-core.bundle.js"
        
        @Volatile
        private var instance: CoreBridge? = null
        
        /**
         * Get singleton instance of CoreBridge
         */
        fun getInstance(context: Context): CoreBridge {
            return instance ?: synchronized(this) {
                instance ?: CoreBridge(context.applicationContext).also { instance = it }
            }
        }
    }
    
    // JavaScript engine abstraction
    private var jsEngine: JSEngine? = null
    private var isInitialized = false
    
    // Cached identity
    private var localIdentity: CoreIdentity? = null
    
    /**
     * Initialize the core library
     */
    suspend fun initialize(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            if (isInitialized) {
                return@withContext Result.success(Unit)
            }
            
            Log.i(TAG, "Initializing CoreBridge...")
            
            // Load the core bundle from assets
            val bundleCode = loadBundleFromAssets()
            
            // Initialize JavaScript engine
            jsEngine = createJSEngine()
            
            // Execute the bundle to load SCCore global
            jsEngine?.evaluate(bundleCode)
            
            // Verify SCCore is available
            val testResult = jsEngine?.evaluate("typeof SCCore !== 'undefined'")
            if (testResult != true && testResult != "true") {
                return@withContext Result.failure(Exception("Failed to load SCCore: global not defined"))
            }
            
            isInitialized = true
            Log.i(TAG, "CoreBridge initialized successfully")
            
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize CoreBridge", e)
            Result.failure(e)
        }
    }
    
    /**
     * Load the core bundle from assets
     */
    private fun loadBundleFromAssets(): String {
        val inputStream = context.assets.open(CORE_BUNDLE_FILE)
        val reader = BufferedReader(InputStreamReader(inputStream))
        return reader.use { it.readText() }
    }
    
    /**
     * Create a JavaScript engine instance
     * This is a platform-specific implementation
     */
    private fun createJSEngine(): JSEngine {
        // For now, we'll use a simple wrapper that can be replaced with
        // QuickJS, J2V8, or other engines as needed
        return RhinoJSEngine()
    }
    
    /**
     * Generate a new identity keypair
     */
    suspend fun generateIdentity(): Result<CoreIdentity> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var identity = SCCore.generateIdentity();
                    return JSON.stringify({
                        publicKey: Array.from(identity.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
                        privateKey: Array.from(identity.privateKey).map(b => b.toString(16).padStart(2, '0')).join('')
                    });
                })()
            """.trimIndent())
            
            val identity = Json.decodeFromString<CoreIdentity>(result.toString())
            localIdentity = identity
            
            Result.success(identity)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate identity", e)
            Result.failure(e)
        }
    }
    
    /**
     * Generate fingerprint for a public key
     */
    suspend fun generateFingerprint(publicKeyHex: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var publicKeyBytes = new Uint8Array('$publicKeyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    return SCCore.generateFingerprint(publicKeyBytes);
                })()
            """.trimIndent())
            
            Result.success(result.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate fingerprint", e)
            Result.failure(e)
        }
    }
    
    /**
     * Sign a message with the private key
     */
    suspend fun signMessage(message: ByteArray, privateKeyHex: String): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val messageHex = message.joinToString("") { "%02x".format(it) }
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var messageBytes = new Uint8Array('$messageHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var privateKeyBytes = new Uint8Array('$privateKeyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var signature = SCCore.signMessage(messageBytes, privateKeyBytes);
                    return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
                })()
            """.trimIndent())
            
            val signatureHex = result.toString()
            val signature = signatureHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            
            Result.success(signature)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sign message", e)
            Result.failure(e)
        }
    }
    
    /**
     * Verify a signature
     */
    suspend fun verifySignature(
        message: ByteArray,
        signature: ByteArray,
        publicKeyHex: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val messageHex = message.joinToString("") { "%02x".format(it) }
            val signatureHex = signature.joinToString("") { "%02x".format(it) }
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var messageBytes = new Uint8Array('$messageHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var signatureBytes = new Uint8Array('$signatureHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var publicKeyBytes = new Uint8Array('$publicKeyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    return SCCore.verifySignature(messageBytes, signatureBytes, publicKeyBytes);
                })()
            """.trimIndent())
            
            Result.success(result == true || result == "true")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to verify signature", e)
            Result.failure(e)
        }
    }
    
    /**
     * Encrypt a message
     */
    suspend fun encryptMessage(
        plaintext: ByteArray,
        key: ByteArray,
        nonce: ByteArray
    ): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val plaintextHex = plaintext.joinToString("") { "%02x".format(it) }
            val keyHex = key.joinToString("") { "%02x".format(it) }
            val nonceHex = nonce.joinToString("") { "%02x".format(it) }
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var plaintextBytes = new Uint8Array('$plaintextHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var keyBytes = new Uint8Array('$keyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var nonceBytes = new Uint8Array('$nonceHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var ciphertext = SCCore.encryptMessage(plaintextBytes, keyBytes, nonceBytes);
                    return Array.from(ciphertext).map(b => b.toString(16).padStart(2, '0')).join('');
                })()
            """.trimIndent())
            
            val ciphertextHex = result.toString()
            val ciphertext = ciphertextHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            
            Result.success(ciphertext)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encrypt message", e)
            Result.failure(e)
        }
    }
    
    /**
     * Decrypt a message
     */
    suspend fun decryptMessage(
        ciphertext: ByteArray,
        key: ByteArray,
        nonce: ByteArray
    ): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val ciphertextHex = ciphertext.joinToString("") { "%02x".format(it) }
            val keyHex = key.joinToString("") { "%02x".format(it) }
            val nonceHex = nonce.joinToString("") { "%02x".format(it) }
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var ciphertextBytes = new Uint8Array('$ciphertextHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var keyBytes = new Uint8Array('$keyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var nonceBytes = new Uint8Array('$nonceHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var plaintext = SCCore.decryptMessage(ciphertextBytes, keyBytes, nonceBytes);
                    return Array.from(plaintext).map(b => b.toString(16).padStart(2, '0')).join('');
                })()
            """.trimIndent())
            
            val plaintextHex = result.toString()
            val plaintext = plaintextHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            
            Result.success(plaintext)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decrypt message", e)
            Result.failure(e)
        }
    }
    
    /**
     * Encode a protocol message
     */
    suspend fun encodeMessage(
        type: Int,
        ttl: Int,
        senderId: ByteArray,
        payload: ByteArray
    ): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            
            val senderIdHex = senderId.joinToString("") { "%02x".format(it) }
            val payloadHex = payload.joinToString("") { "%02x".format(it) }
            
            val result = jsEngine?.evaluate("""
                (function() {
                    var senderIdBytes = new Uint8Array('$senderIdHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var payloadBytes = new Uint8Array('$payloadHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                    var message = {
                        header: {
                            version: 0x01,
                            type: $type,
                            ttl: $ttl,
                            timestamp: Date.now(),
                            senderId: senderIdBytes,
                            signature: new Uint8Array(65)
                        },
                        payload: payloadBytes
                    };
                    var encoded = SCCore.encodeMessage(message);
                    return Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join('');
                })()
            """.trimIndent())
            
            val encodedHex = result.toString()
            val encoded = encodedHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            
            Result.success(encoded)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encode message", e)
            Result.failure(e)
        }
    }
    
    /**
     * Get the core library version
     */
    suspend fun getVersion(): Result<String> = withContext(Dispatchers.IO) {
        try {
            ensureInitialized()
            val result = jsEngine?.evaluate("SCCore.VERSION")
            Result.success(result.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get version", e)
            Result.failure(e)
        }
    }
    
    /**
     * Ensure the bridge is initialized
     */
    private suspend fun ensureInitialized() {
        if (!isInitialized) {
            initialize().getOrThrow()
        }
    }
    
    /**
     * Clean up resources
     */
    fun cleanup() {
        jsEngine = null
        localIdentity = null
        isInitialized = false
    }
}

/**
 * Identity keypair from core library
 */
@Serializable
data class CoreIdentity(
    val publicKey: String,
    val privateKey: String
)

/**
 * Abstraction for JavaScript engine
 */
interface JSEngine {
    fun evaluate(script: String): Any?
}

/**
 * Simple Rhino-based JavaScript engine implementation
 * Note: Rhino is included in Android SDK but has limited ES6 support
 * For production, consider using QuickJS-Android
 */
class RhinoJSEngine : JSEngine {
    private val context: org.mozilla.javascript.Context
    private val scope: org.mozilla.javascript.Scriptable
    
    init {
        context = org.mozilla.javascript.Context.enter()
        context.optimizationLevel = -1 // Interpreted mode for Android
        scope = context.initStandardObjects()
    }
    
    override fun evaluate(script: String): Any? {
        return try {
            context.evaluateString(scope, script, "sc-core", 1, null)
        } catch (e: Exception) {
            Log.e("RhinoJSEngine", "Error evaluating script: ${e.message}")
            throw e
        }
    }
}
