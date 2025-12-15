package com.sovereign.communications.core

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.BufferedReader
import java.io.InputStreamReader
import java.security.SecureRandom

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
 * - QuickJS-Android for better performance and ES6+ support
 * - J2V8 (deprecated but still works)
 * - GraalJS for Android (if available)
 *
 * For this implementation, we provide a lightweight abstraction that can be
 * plugged into any JS engine.
 */
class CoreBridge private constructor(
    private val context: Context,
) {
    companion object {
        private const val TAG = "CoreBridge"
        private const val CORE_BUNDLE_FILE = "sc-core.bundle.js"

        // Hex validation regex - only valid hex characters allowed
        private val HEX_PATTERN = Regex("^[0-9a-fA-F]*$")

        @Volatile
        private var instance: CoreBridge? = null

        /**
         * Get singleton instance of CoreBridge
         */
        fun getInstance(context: Context): CoreBridge =
            instance ?: synchronized(this) {
                instance ?: CoreBridge(context.applicationContext).also { instance = it }
            }

        /**
         * Validate that a string contains only valid hex characters
         * @throws IllegalArgumentException if the string contains invalid characters
         */
        private fun validateHex(
            hex: String,
            paramName: String,
        ) {
            if (!HEX_PATTERN.matches(hex)) {
                throw IllegalArgumentException("Invalid hex string for $paramName: contains non-hex characters")
            }
        }
    }

    // JavaScript engine abstraction
    private var jsEngine: JSEngine? = null
    private var isInitialized = false

    // Callbacks
    var outboundTransportCallback: ((String, ByteArray) -> Unit)? = null

    // Secure random number generator for crypto operations
    private val secureRandom = SecureRandom()

    // Cached identity
    private var localIdentity: CoreIdentity? = null

    /**
     * Generate cryptographically secure random bytes
     */
    private fun generateSecureRandomBytes(count: Int): ByteArray {
        val bytes = ByteArray(count)
        secureRandom.nextBytes(bytes)
        return bytes
    }

    /**
     * Initialize the core library
     */
    suspend fun initialize(): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                if (isInitialized) {
                    return@withContext Result.success(Unit)
                }

                Log.i(TAG, "Initializing CoreBridge...")

                // Load the core bundle from assets
                val bundleCode = loadBundleFromAssets()

                // Initialize JavaScript engine with secure random callback
                val engine = createJSEngine()
                jsEngine = engine

                // Register native secure random function
                if (engine is RhinoJSEngine) {
                    engine.registerSecureRandomCallback { count ->
                        generateSecureRandomBytes(count)
                    }

                    // Register outbound transport callback
                    engine.registerOutboundCallback { peerId, data ->
                        outboundTransportCallback?.invoke(peerId, data)
                    }
                }

                // Inject crypto polyfill for getRandomValues
                // Uses native Android SecureRandom for cryptographic security
                jsEngine?.evaluate(
                    """
                    if (typeof crypto === 'undefined') {
                        var crypto = {};
                    }
                    if (typeof crypto.getRandomValues === 'undefined') {
                        crypto.getRandomValues = function(arr) {
                            // Use native Android SecureRandom via bridge callback
                            var bytes = _nativeSecureRandomBytes(arr.length);
                            for (var i = 0; i < arr.length; i++) {
                                arr[i] = bytes[i];
                            }
                            return arr;
                        };
                    }
                    """.trimIndent(),
                )

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
     * Initialize the MeshNetwork in JS logic
     */
    suspend fun initMeshNetwork(peerId: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            if (typeof SCCore.MeshNetwork === 'undefined') {
                                return "Error: MeshNetwork not exported";
                            }
                            
                            if (globalThis.meshNetwork) {
                                return "Already initialized"; // Idempotent
                            }

                            // Initialize MeshNetwork with explicit peerId
                            globalThis.meshNetwork = new SCCore.MeshNetwork({
                                peerId: '$peerId'
                            });

                            // Register outbound transport
                            globalThis.meshNetwork.registerOutboundTransport((peerId, data) => {
                                 // Convert Uint8Array to Array for Java bridge
                                 _nativeOutboundTransport(peerId, Array.from(data));
                                 return Promise.resolve();
                            });
                            
                            return "success";
                        })()
                        """.trimIndent(),
                    )

                if (result.toString() == "success" || result.toString() == "Already initialized") {
                    Log.d(TAG, "MeshNetwork initialized in JS")
                    Result.success(Unit)
                } else {
                    Result.failure(Exception("MeshNetwork init failed: $result"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to init MeshNetwork", e)
                Result.failure(e)
            }
        }

    /**
     * Handle incoming packet from Native Transport -> JS MeshNetwork
     */
    suspend fun handleIncomingPacket(
        peerId: String,
        data: ByteArray,
    ): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()
                val dataHex = data.joinToString("") { "%02x".format(it) }

                jsEngine?.evaluate(
                    """
                    (function() {
                        if (globalThis.meshNetwork) {
                            var dataBytes = new Uint8Array('$dataHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            globalThis.meshNetwork.handleIncomingPacket('$peerId', dataBytes);
                        }
                    })()
                    """.trimIndent(),
                )
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle incoming packet", e)
                Result.failure(e)
            }
        }

    /**
     * Send text message via JS MeshNetwork
     */
    suspend fun sendTextMessage(
        recipientId: String,
        text: String,
    ): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()
                // Escape text for JS string safety (simplified)
                val safeText = text.replace("'", "\\'").replace("\n", "\\n")

                jsEngine?.evaluate(
                    """
                    (function() {
                        if (globalThis.meshNetwork) {
                            globalThis.meshNetwork.sendTextMessage('$recipientId', '$safeText');
                        }
                    })()
                    """.trimIndent(),
                )
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send text message", e)
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
    suspend fun generateIdentity(): Result<CoreIdentity> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            var identity = SCCore.generateIdentity();
                            return JSON.stringify({
                                publicKey: Array.from(identity.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
                                privateKey: Array.from(identity.privateKey).map(b => b.toString(16).padStart(2, '0')).join('')
                            });
                        })()
                        """.trimIndent(),
                    )

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
    suspend fun generateFingerprint(publicKeyHex: String): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()
                validateHex(publicKeyHex, "publicKeyHex")

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            var publicKeyBytes = new Uint8Array('$publicKeyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            return SCCore.generateFingerprint(publicKeyBytes);
                        })()
                        """.trimIndent(),
                    )

                Result.success(result.toString())
            } catch (e: Exception) {
                Log.e(TAG, "Failed to generate fingerprint", e)
                Result.failure(e)
            }
        }

    /**
     * Sign a message with the private key
     */
    suspend fun signMessage(
        message: ByteArray,
        privateKeyHex: String,
    ): Result<ByteArray> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()
                validateHex(privateKeyHex, "privateKeyHex")

                val messageHex = message.joinToString("") { "%02x".format(it) }

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            var messageBytes = new Uint8Array('$messageHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var privateKeyBytes = new Uint8Array('$privateKeyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var signature = SCCore.signMessage(messageBytes, privateKeyBytes);
                            return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
                        })()
                        """.trimIndent(),
                    )

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
        publicKeyHex: String,
    ): Result<Boolean> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()
                validateHex(publicKeyHex, "publicKeyHex")

                val messageHex = message.joinToString("") { "%02x".format(it) }
                val signatureHex = signature.joinToString("") { "%02x".format(it) }

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            var messageBytes = new Uint8Array('$messageHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var signatureBytes = new Uint8Array('$signatureHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var publicKeyBytes = new Uint8Array('$publicKeyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            return SCCore.verifySignature(messageBytes, signatureBytes, publicKeyBytes);
                        })()
                        """.trimIndent(),
                    )

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
        nonce: ByteArray,
    ): Result<ByteArray> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()

                val plaintextHex = plaintext.joinToString("") { "%02x".format(it) }
                val keyHex = key.joinToString("") { "%02x".format(it) }
                val nonceHex = nonce.joinToString("") { "%02x".format(it) }

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            var plaintextBytes = new Uint8Array('$plaintextHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var keyBytes = new Uint8Array('$keyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var nonceBytes = new Uint8Array('$nonceHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var ciphertext = SCCore.encryptMessage(plaintextBytes, keyBytes, nonceBytes);
                            return Array.from(ciphertext).map(b => b.toString(16).padStart(2, '0')).join('');
                        })()
                        """.trimIndent(),
                    )

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
        nonce: ByteArray,
    ): Result<ByteArray> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()

                val ciphertextHex = ciphertext.joinToString("") { "%02x".format(it) }
                val keyHex = key.joinToString("") { "%02x".format(it) }
                val nonceHex = nonce.joinToString("") { "%02x".format(it) }

                val result =
                    jsEngine?.evaluate(
                        """
                        (function() {
                            var ciphertextBytes = new Uint8Array('$ciphertextHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var keyBytes = new Uint8Array('$keyHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var nonceBytes = new Uint8Array('$nonceHex'.match(/.{2}/g).map(b => parseInt(b, 16)));
                            var plaintext = SCCore.decryptMessage(ciphertextBytes, keyBytes, nonceBytes);
                            return Array.from(plaintext).map(b => b.toString(16).padStart(2, '0')).join('');
                        })()
                        """.trimIndent(),
                    )

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
        payload: ByteArray,
    ): Result<ByteArray> =
        withContext(Dispatchers.IO) {
            try {
                ensureInitialized()

                val senderIdHex = senderId.joinToString("") { "%02x".format(it) }
                val payloadHex = payload.joinToString("") { "%02x".format(it) }

                val result =
                    jsEngine?.evaluate(
                        """
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
                        """.trimIndent(),
                    )

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
    suspend fun getVersion(): Result<String> =
        withContext(Dispatchers.IO) {
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
        (jsEngine as? RhinoJSEngine)?.close()
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
    val privateKey: String,
)

/**
 * Abstraction for JavaScript engine
 */
interface JSEngine {
    fun evaluate(script: String): Any?
}

/**
 * Callback type for secure random byte generation
 */
typealias SecureRandomCallback = (Int) -> ByteArray

/**
 * Simple Rhino-based JavaScript engine implementation
 * Note: Rhino is included in Android SDK but has limited ES6 support
 * For production, consider using QuickJS-Android
 */
class RhinoJSEngine : JSEngine {
    private val context: org.mozilla.javascript.Context
    private val scope: org.mozilla.javascript.Scriptable
    private var secureRandomCallback: SecureRandomCallback? = null
    private var outboundCallback: ((String, ByteArray) -> Unit)? = null

    init {
        context =
            org.mozilla.javascript.Context
                .enter()
        context.optimizationLevel = -1 // Interpreted mode for Android
        scope = context.initStandardObjects()
    }

    /**
     * Register a callback for generating secure random bytes
     * This is called from JavaScript via _nativeSecureRandomBytes(count)
     */
    fun registerSecureRandomCallback(callback: SecureRandomCallback) {
        secureRandomCallback = callback

        // Create a native function that JavaScript can call
        val nativeFunction =
            object : org.mozilla.javascript.BaseFunction() {
                override fun call(
                    cx: org.mozilla.javascript.Context?,
                    scope: org.mozilla.javascript.Scriptable?,
                    thisObj: org.mozilla.javascript.Scriptable?,
                    args: Array<out Any>?,
                ): Any {
                    val count = (args?.getOrNull(0) as? Number)?.toInt() ?: 0
                    val bytes = callback(count)
                    // Convert ByteArray to JavaScript array
                    // Note: Rhino doesn't provide bulk array initialization from ByteArray,
                    // so individual element setting is the standard approach
                    val jsArray = cx?.newArray(scope, bytes.size) ?: return org.mozilla.javascript.Undefined.instance
                    for (i in bytes.indices) {
                        org.mozilla.javascript.ScriptableObject
                            .putProperty(jsArray, i, (bytes[i].toInt() and 0xFF))
                    }
                    return jsArray
                }
            }

        org.mozilla.javascript.ScriptableObject
            .putProperty(scope, "_nativeSecureRandomBytes", nativeFunction)
    }

    /**
     * Register callback for outbound transport
     */
    fun registerOutboundCallback(callback: (String, ByteArray) -> Unit) {
        outboundCallback = callback

        val nativeFunction =
            object : org.mozilla.javascript.BaseFunction() {
                override fun call(
                    cx: org.mozilla.javascript.Context?,
                    scope: org.mozilla.javascript.Scriptable?,
                    thisObj: org.mozilla.javascript.Scriptable?,
                    args: Array<out Any>?,
                ): Any {
                    val peerId = args?.getOrNull(0)?.toString() ?: ""
                    // args[1] should be array of bytes
                    val dataObj = args?.getOrNull(1) as? org.mozilla.javascript.NativeArray
                    val dataBytes =
                        if (dataObj != null) {
                            val len = dataObj.length.toInt()
                            val bytes = ByteArray(len)
                            for (i in 0 until len) {
                                val byteVal = dataObj.get(i) as? Number
                                bytes[i] = byteVal?.toByte() ?: 0
                            }
                            bytes
                        } else {
                            ByteArray(0)
                        }

                    callback(peerId, dataBytes)
                    return org.mozilla.javascript.Undefined.instance
                }
            }

        org.mozilla.javascript.ScriptableObject
            .putProperty(scope, "_nativeOutboundTransport", nativeFunction)
    }

    override fun evaluate(script: String): Any? =
        try {
            context.evaluateString(scope, script, "sc-core", 1, null)
        } catch (e: Exception) {
            Log.e("RhinoJSEngine", "Error evaluating script: ${e.message}")
            throw e
        }

    /**
     * Release Rhino context resources
     * Must be called from the same thread that created the context
     */
    fun close() {
        try {
            org.mozilla.javascript.Context
                .exit()
        } catch (e: Exception) {
            Log.w("RhinoJSEngine", "Error closing Rhino context: ${e.message}")
        }
    }
}
