package com.sovereign.communications.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import com.goterl.lazysodium.LazySodiumAndroid
import com.goterl.lazysodium.SodiumAndroid
import com.goterl.lazysodium.interfaces.Sign
import com.goterl.lazysodium.utils.Key
import com.goterl.lazysodium.utils.KeyPair

class KeyManager(
    context: Context,
) {
    private val prefs: SharedPreferences = context.getSharedPreferences("key_manager_prefs", Context.MODE_PRIVATE)
    private val sodium: LazySodiumAndroid = LazySodiumAndroid(SodiumAndroid())

    companion object {
        private const val PUBLIC_KEY_ALIAS = "public_key"
        private const val PRIVATE_KEY_ALIAS = "private_key"
    }

    fun getIdentityKeyPair(): KeyPair {
        val privateKeyB64 = prefs.getString(PRIVATE_KEY_ALIAS, null)
        val publicKeyB64 = prefs.getString(PUBLIC_KEY_ALIAS, null)

        return if (privateKeyB64 != null && publicKeyB64 != null) {
            val privateKey = Base64.decode(privateKeyB64, Base64.NO_WRAP)
            val publicKey = Base64.decode(publicKeyB64, Base64.NO_WRAP)
            KeyPair(Key.fromBytes(publicKey), Key.fromBytes(privateKey))
        } else {
            generateAndStoreKeyPair()
        }
    }

    private fun generateAndStoreKeyPair(): KeyPair {
        val keyPair = sodium.cryptoSignKeypair()
        val privateKeyB64 = Base64.encodeToString(keyPair.secretKey.asBytes, Base64.NO_WRAP)
        val publicKeyB64 = Base64.encodeToString(keyPair.publicKey.asBytes, Base64.NO_WRAP)

        prefs
            .edit()
            .putString(PRIVATE_KEY_ALIAS, privateKeyB64)
            .putString(PUBLIC_KEY_ALIAS, publicKeyB64)
            .apply()

        return keyPair
    }

    fun getPublicKey(): ByteArray = getIdentityKeyPair().publicKey.asBytes

    fun getPrivateKey(): ByteArray = getIdentityKeyPair().secretKey.asBytes
}
