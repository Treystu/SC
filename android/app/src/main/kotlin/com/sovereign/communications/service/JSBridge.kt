package com.sovereign.communications.service

import android.content.Context
import android.util.Log
import com.eclipsesource.v8.V8
import com.eclipsesource.v8.V8Object
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Bridge to @sc/core Javascript runtime.
 * Hosting the V8 engine (via J2V8).
 */
class JSBridge(
    private val context: Context,
) {
    private val TAG = "JSBridge"
    private val scope = CoroutineScope(Dispatchers.Main)

    private var v8: V8? = null

    // Callback for outbound messages: (peerId, data) -> Unit
    var outboundCallback: ((String, ByteArray) -> Unit)? = null

    // Callback for application messages: (jsonString) -> Unit
    var applicationMessageCallback: ((String) -> Unit)? = null

    init {
        setupContext()
    }

    private fun setupContext() {
        Log.d(TAG, "Initializing JS Context...")
        try {
            v8 = V8.createV8Runtime()

            // Register NativeBridge callbacks
            val nativeBridge = V8Object(v8)
            v8?.add("NativeBridge", nativeBridge)

            nativeBridge.registerJavaMethod({ _, parameters ->
                val peerId = parameters.getString(0)
                val dataBase64 = parameters.getString(1)
                onOutboundMessage(peerId, dataBase64)
            }, "onOutboundMessage")

            nativeBridge.registerJavaMethod({ _, parameters ->
                val messageJson = parameters.getString(0)
                onApplicationMessage(messageJson)
            }, "onApplicationMessage")

            // Clean up V8Object handle
            nativeBridge.close()

            // Load sc-core.js from assets
            val jsContent =
                context.assets
                    .open("sc-core.bundle.js")
                    .bufferedReader()
                    .use { it.readText() }
            v8?.executeVoidScript(jsContent)

            // Initialize MeshNetwork
            val initScript = """
                const network = new SCCore.MeshNetwork();
                network.registerOutboundTransport((peerId, data) => {
                    // Bridge back to Java
                    const base64 = SCCore.utils.bytesToBase64(data);
                    NativeBridge.onOutboundMessage(peerId, base64);
                });
                network.onMessage((msg) => {
                    NativeBridge.onApplicationMessage(JSON.stringify(msg));
                });
                globalThis.meshNetwork = network;
            """
            v8?.executeVoidScript(initScript)

            Log.i(TAG, "JS Context setup complete")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize V8", e)
        }
    }

    /**
     * Pass incoming binary data from Native Transport (BLE/WebRTC) to JS Core
     */
    fun handleIncomingPacket(
        data: ByteArray,
        from: String,
    ) {
        try {
            val base64 = android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP)
            // Use safe script execution
            val script = "if (globalThis.meshNetwork) { meshNetwork.handleIncomingPacket('$from', SCCore.utils.base64ToBytes('$base64')); }"
            v8?.executeVoidScript(script)
            Log.v(TAG, "Passed incoming packet from $from to JS Core (${data.size} bytes)")
        } catch (e: Exception) {
            Log.e(TAG, "Error handling incoming packet", e)
        }
    }

    /**
     * Send message from UI (Application Layer) -> JS Core -> Mesh
     */
    fun sendMessage(
        recipientId: String,
        content: String,
    ) {
        try {
            // Escape content for JS string
            val safeContent = content.replace("'", "\\'").replace("\n", "\\n")
            val script = "if (globalThis.meshNetwork) { meshNetwork.sendTextMessage('$recipientId', '$safeContent'); }"
            v8?.executeVoidScript(script)
            Log.d(TAG, "Sent message to $recipientId via JS Core")
        } catch (e: Exception) {
            Log.e(TAG, "Error sending message", e)
        }
    }

    // Java Interface methods called by JS
    fun onOutboundMessage(
        peerId: String,
        dataBase64: String,
    ) {
        val data = android.util.Base64.decode(dataBase64, android.util.Base64.NO_WRAP)
        scope.launch {
            outboundCallback?.invoke(peerId, data)
        }
    }

    fun onApplicationMessage(messageJson: String) {
        scope.launch {
            applicationMessageCallback?.invoke(messageJson)
        }
    }

    fun close() {
        try {
            v8?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing V8", e)
        }
    }
}
