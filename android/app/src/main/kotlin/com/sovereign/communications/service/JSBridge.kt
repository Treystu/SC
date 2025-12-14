package com.sovereign.communications.service

import android.content.Context
import android.util.Log
// import com.eclipsesource.v8.V8 // Uncomment when J2V8 is added
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Bridge to @sc/core Javascript runtime.
 * Hosting the V8 engine (via J2V8 or LiquidCore).
 */
class JSBridge(
    private val context: Context,
) {
    private val TAG = "JSBridge"
    private val scope = CoroutineScope(Dispatchers.Main)

    // Callback for outbound messages: (peerId, data) -> Unit
    var outboundCallback: ((String, ByteArray) -> Unit)? = null

    // Callback for application messages: (jsonString) -> Unit
    var applicationMessageCallback: ((String) -> Unit)? = null

    init {
        setupContext()
    }

    private fun setupContext() {
        Log.d(TAG, "Initializing JS Context...")
        // TODO: Initialize V8 runtime
        // val v8 = V8.createV8Runtime()

        // Load sc-core.js from assets
        // val jsContent = context.assets.open("sc-core.js").bufferedReader().use { it.readText() }
        // v8.executeVoidScript(jsContent)

        // Initialize MeshNetwork
        // val initScript = """
        //     const network = new SCCore.MeshNetwork();
        //     network.registerOutboundTransport((peerId, data) => {
        //         // Bridge back to Java
        //         const base64 = SCCore.utils.bytesToBase64(data);
        //         NativeBridge.onOutboundMessage(peerId, base64);
        //     });
        //     network.onMessage((msg) => {
        //         NativeBridge.onApplicationMessage(JSON.stringify(msg));
        //     });
        //     globalThis.meshNetwork = network;
        // """
        // v8.executeVoidScript(initScript)

        Log.i(TAG, "JS Context setup complete (Placeholder)")
    }

    /**
     * Pass incoming binary data from Native Transport (BLE/WebRTC) to JS Core
     */
    fun handleIncomingPacket(
        data: ByteArray,
        from: String,
    ) {
        // val base64 = android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP)
        // v8.executeVoidScript("meshNetwork.handleIncomingPacket('$from', SCCore.utils.base64ToBytes('$base64'));")
        Log.d(TAG, "Passing incoming packet from $from to JS Core (${data.size} bytes)")
    }

    /**
     * Send message from UI (Application Layer) -> JS Core -> Mesh
     */
    fun sendMessage(
        recipientId: String,
        content: String,
    ) {
        // v8.executeVoidScript("meshNetwork.sendTextMessage('$recipientId', '$content');")
        Log.d(TAG, "Sending message to $recipientId via JS Core: $content")

        // FAILSAFE: Simulate loopback for now since JS isn't running
        // In real impl, JS would call outboundCallback or applicationMessageCallback (if loopback)
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
}
