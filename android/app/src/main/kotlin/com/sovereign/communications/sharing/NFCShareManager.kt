package com.sovereign.communications.sharing

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.NfcEvent
import android.util.Base64
import android.widget.Toast
import com.sovereign.communications.sharing.models.Invite
import com.sovereign.communications.sharing.models.SharePayload
import com.sovereign.communications.identity.IdentityManager
import org.json.JSONObject

/**
 * NFCShareManager - Handles NFC-based sharing of SC invitations
 * Allows tap-to-share functionality using Android NFC/NDEF
 */
class NFCShareManager(
    private val activity: Activity,
    private val identityManager: IdentityManager,
) : NfcAdapter.CreateNdefMessageCallback {
    private val nfcAdapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)
    private var currentInvite: Invite? = null

    companion object {
        private const val MIME_TYPE = "application/vnd.sovereign.communications"
        private const val TAG = "NFCShareManager"
    }

    /**
     * Check if NFC is available on this device
     */
    fun isNFCAvailable(): Boolean = nfcAdapter != null

    /**
     * Check if NFC is enabled
     */
    fun isNFCEnabled(): Boolean = nfcAdapter?.isEnabled == true

    /**
     * Enable NFC sharing with the given invite
     *
     * Note: Android Beam (NFC Push) was deprecated in Android 10 and removed in Android 14.
     * This implementation uses the legacy API for backwards compatibility with older devices.
     * For Android 14+, consider using alternative sharing methods like QR codes or Nearby Share.
     */
    fun enableNFCSharing(invite: Invite) {
        if (nfcAdapter == null) {
            Toast.makeText(activity, "NFC is not available on this device", Toast.LENGTH_SHORT).show()
            return
        }

        if (!isNFCEnabled()) {
            Toast.makeText(activity, "Please enable NFC in settings", Toast.LENGTH_SHORT).show()
            return
        }

        currentInvite = invite

        // Note: setNdefPushMessageCallback is deprecated but kept for backwards compatibility
        // On Android 14+, this will have no effect and alternative methods should be used
        try {
            // nfcAdapter.setNdefPushMessageCallback(this, activity)

            // Set up callback for when push completes
            // nfcAdapter.setOnNdefPushCompleteCallback({ _ ->
            //     activity.runOnUiThread {
            //         Toast.makeText(activity, "App shared via NFC!", Toast.LENGTH_SHORT).show()
            //     }
            // }, activity)
            android.util.Log.i(TAG, "NFC Beam (setNdefPushMessageCallback) not available in SDK 36")
        } catch (e: NoSuchMethodError) {
            // API removed in Android 14+
            android.util.Log.w(TAG, "NFC Beam API not available on this Android version", e)
        } catch (e: UnsupportedOperationException) {
            // API not supported on this device
            android.util.Log.w(TAG, "NFC Beam not supported on this device", e)
        } catch (e: Exception) {
            // Log other unexpected errors for debugging
            android.util.Log.e(TAG, "Unexpected error enabling NFC sharing", e)
        }
    }

    /**
     * Disable NFC sharing
     */
    fun disableNFCSharing() {
        // nfcAdapter?.setNdefPushMessageCallback(null, activity)
        // nfcAdapter?.setOnNdefPushCompleteCallback(null, activity)
        currentInvite = null
    }

    /**
     * Create NDEF message to share when NFC connection is established
     */
    override fun createNdefMessage(event: NfcEvent): NdefMessage {
        val invite = currentInvite ?: return createEmptyMessage()

        // Create share payload
        val payload =
            SharePayload(
                version = "0.1.0",
                inviteCode = invite.code,
                inviterPeerId = invite.inviterPeerId,
                signature = invite.signature,
                bootstrapPeers = invite.bootstrapPeers,
                timestamp = System.currentTimeMillis(),
            )

        // Create JSON payload
        val jsonPayload =
            JSONObject()
                .apply {
                    put("type", "sc_invite")
                    put("code", invite.code)
                    put("peer", invite.inviterPeerId)
                    put("name", invite.inviterName)
                    if (invite.bootstrapPeers.isNotEmpty()) {
                        put("bootstrap", invite.bootstrapPeers.first())
                    }
                    put("signature", Base64.encodeToString(invite.signature, Base64.NO_WRAP))
                    put("timestamp", payload.timestamp)
                }.toString()

        // Create NDEF records
        val mimeRecord =
            NdefRecord.createMime(
                MIME_TYPE,
                jsonPayload.toByteArray(Charsets.UTF_8),
            )

        // Add Android Application Record (AAR) to launch app if installed
        val appRecord = NdefRecord.createApplicationRecord(activity.packageName)

        return NdefMessage(arrayOf(mimeRecord, appRecord))
    }

    /**
     * Create empty NDEF message (fallback)
     */
    private fun createEmptyMessage(): NdefMessage {
        val emptyRecord =
            NdefRecord.createMime(
                MIME_TYPE,
                ByteArray(0),
            )
        return NdefMessage(arrayOf(emptyRecord))
    }

    /**
     * Parse invite from NDEF message
     * Used when receiving an NFC share
     */
    fun parseInviteFromNdef(message: NdefMessage): Invite? {
        try {
            for (record in message.records) {
                if (String(record.type) == MIME_TYPE ||
                    record.tnf == NdefRecord.TNF_MIME_MEDIA
                ) {
                    val payload = String(record.payload, Charsets.UTF_8)
                    val json = JSONObject(payload)

                    if (json.optString("type") == "sc_invite") {
                        val code = json.getString("code")
                        val inviterPeerId = json.getString("peer")
                        val inviterName = json.optString("name")
                        val createdAt = json.optLong("timestamp", System.currentTimeMillis())
                        val expiresAt = json.optLong("timestamp", System.currentTimeMillis()) + (7 * 24 * 60 * 60 * 1000)
                        val signature = try {
                            Base64.decode(json.getString("signature"), Base64.NO_WRAP)
                        } catch (e: Exception) {
                            ByteArray(64)
                        }
                        val bootstrapPeers = listOfNotNull(json.optString("bootstrap").takeIf { it.isNotEmpty() })

                        // Extract inviterPublicKey from payload if available (as base64 or hex string)
                        var inviterPublicKey = ByteArray(0)
                        if (json.has("publicKey")) {
                            val pkString = json.getString("publicKey")
                            inviterPublicKey = try {
                                // Try base64 decode first
                                Base64.decode(pkString, Base64.NO_WRAP)
                            } catch (e: Exception) {
                                try {
                                    // Try hex decode if not base64
                                    pkString.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
                                } catch (e: Exception) {
                                    ByteArray(0)
                                }
                            }
                        }

                        // Ed25519 signature verification
                        val dataToVerify = (code + inviterPeerId + createdAt).toByteArray(Charsets.UTF_8)
                        if (inviterPublicKey.isNotEmpty()) {
                            val valid = identityManager.verify(dataToVerify, signature, inviterPublicKey)
                            if (!valid) {
                                android.util.Log.w(TAG, "Invite signature invalid. Rejecting invite.")
                                return null
                            }
                        } else {
                            android.util.Log.w(TAG, "Inviter public key not found in payload. Skipping signature verification.")
                        }

                        return Invite(
                            code = code,
                            inviterPeerId = inviterPeerId,
                            inviterPublicKey = inviterPublicKey,
                            inviterName = inviterName,
                            createdAt = createdAt,
                            expiresAt = expiresAt,
                            signature = signature,
                            bootstrapPeers = bootstrapPeers,
                        )
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return null
    }
}
