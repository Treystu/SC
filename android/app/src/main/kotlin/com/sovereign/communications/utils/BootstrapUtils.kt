package com.sovereign.communications.utils

import android.util.Base64

/**
 * Bootstrap utility functions for peer list transfer
 * Matches the implementation in web/src/utils/peerBootstrap.ts
 */
object BootstrapUtils {
    
    /**
     * Decode base64url encoded string to regular string
     * 
     * Base64url uses:
     * - minus (-) instead of plus (+)
     * - underscore (_) instead of slash (/)
     * - no padding (=)
     * 
     * @param encoded Base64url encoded string
     * @return Decoded string or null if decoding fails
     */
    fun decodeBase64Url(encoded: String): String? {
        return try {
            // Convert base64url to standard base64
            var base64 = encoded.replace('-', '+').replace('_', '/')
            
            // Add padding if needed
            val padding = (4 - (base64.length % 4)) % 4
            base64 += "=".repeat(padding)
            
            // Decode and convert to string
            val decoded = Base64.decode(base64, Base64.DEFAULT)
            String(decoded)
        } catch (e: Exception) {
            android.util.Log.e("BootstrapUtils", "Failed to decode base64url", e)
            null
        }
    }
    
    /**
     * Encode string to base64url
     * 
     * @param data String to encode
     * @return Base64url encoded string
     */
    fun encodeBase64Url(data: String): String {
        val base64 = Base64.encodeToString(data.toByteArray(), Base64.NO_WRAP)
        return base64.replace('+', '-').replace('/', '_').replace("=", "")
    }
}
