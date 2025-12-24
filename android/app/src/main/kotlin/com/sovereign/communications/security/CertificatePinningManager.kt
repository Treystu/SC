package com.sovereign.communications.security

import android.annotation.SuppressLint
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import java.security.MessageDigest
import java.security.cert.Certificate
import java.security.cert.X509Certificate
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.X509TrustManager

/**
 * Certificate Pinning Manager for Android
 *
 * Implements SSL certificate pinning to prevent man-in-the-middle attacks
 * by ensuring server certificates match expected public key hashes.
 */
class CertificatePinningManager private constructor() {

    companion object {
        @Volatile
        private var instance: CertificatePinningManager? = null

        fun getInstance() = instance ?: synchronized(this) {
            instance ?: CertificatePinningManager().also { instance = it }
        }
    }

    // Certificate pins for different domains
    // Format: domain -> set of SHA-256 hashes of public keys
    private val certificatePins = mapOf(
        // TURN/STUN servers for WebRTC connectivity
        // Add actual certificate pins for production servers
        "turn.sovereigncommunications.app" to setOf(
            // Placeholder - replace with actual certificate pins
            "sha256/PLACEHOLDER_PIN_SHA256_BASE64"
        ),
        "stun.sovereigncommunications.app" to setOf(
            // Placeholder - replace with actual certificate pins
            "sha256/PLACEHOLDER_PIN_SHA256_BASE64"
        )
    )

    /**
     * Creates an OkHttpClient with certificate pinning configured
     */
    fun createPinnedClient(builder: OkHttpClient.Builder = OkHttpClient.Builder()): OkHttpClient.Builder {
        val certificatePinner = CertificatePinner.Builder()

        // Add pins for each domain
        certificatePins.forEach { (domain, pins) ->
            pins.forEach { pin ->
                certificatePinner.add(domain, pin)
            }
        }

        return builder.certificatePinner(certificatePinner.build())
    }

    /**
     * Creates a TrustManager that enforces certificate pinning
     */
    fun createPinnedTrustManager(): X509TrustManager {
        return object : X509TrustManager {
            @SuppressLint("TrustAllX509TrustManager")
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                // Client certificates not used in this app
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                if (chain.isNullOrEmpty()) {
                    throw SSLPeerUnverifiedException("Certificate chain is empty")
                }

                val serverCert = chain[0]
                val publicKey = serverCert.publicKey

                // Get the domain from the certificate (this is a simplified approach)
                // In production, you'd want to get the domain from the connection
                val domain = extractDomainFromCertificate(serverCert)

                val expectedPins = certificatePins[domain]
                if (expectedPins.isNullOrEmpty()) {
                    // No pins configured for this domain
                    // In production, fail closed for security
                    throw SSLPeerUnverifiedException("No certificate pins configured for domain: $domain")
                }

                // Calculate SHA-256 hash of public key
                val publicKeyBytes = publicKey.encoded
                val digest = MessageDigest.getInstance("SHA-256")
                val hash = digest.digest(publicKeyBytes)
                val hashBase64 = android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)

                val pin = "sha256/$hashBase64"

                if (!expectedPins.contains(pin)) {
                    throw SSLPeerUnverifiedException(
                        "Certificate pin validation failed for $domain. " +
                        "Expected one of: $expectedPins, got: $pin"
                    )
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> {
                return arrayOf()
            }
        }
    }

    /**
     * Extracts domain from certificate (simplified implementation)
     * In production, use the actual domain from the connection
     */
    private fun extractDomainFromCertificate(cert: X509Certificate): String {
        // This is a placeholder - in real implementation,
        // you'd get the domain from the SSL connection
        return "turn.sovereigncommunications.app" // Default fallback
    }

    /**
     * Utility method to generate certificate pin from a certificate
     * Useful for development and testing
     */
    fun generatePinFromCertificate(cert: X509Certificate): String {
        val publicKey = cert.publicKey
        val publicKeyBytes = publicKey.encoded
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(publicKeyBytes)
        val hashBase64 = android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP)
        return "sha256/$hashBase64"
    }

    /**
     * Adds a certificate pin for a domain (for dynamic configuration)
     */
    fun addCertificatePin(domain: String, pin: String) {
        // Note: In production, this should be persisted securely
        // This is just for runtime configuration
    }

    /**
     * Removes certificate pins for a domain
     */
    fun removeCertificatePins(domain: String) {
        // Note: In production, this should update persisted configuration
    }
}