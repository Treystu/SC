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

        fun getInstance() =
            instance ?: synchronized(this) {
                instance ?: CertificatePinningManager().also { instance = it }
            }
    }

    // Certificate pins for different domains
    // Format: domain -> set of SHA-256 hashes of public keys
    // For a fully decentralized mesh, certificate pinning is not required unless using custom relay (TURN/STUN) infrastructure.
    // If you operate your own relays, add their pins here. Otherwise, leave empty.
    private val certificatePins = mutableMapOf<String, Set<String>>()

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
    fun addCertificatePin(
        domain: String,
        pin: String,
    ) {
        val currentPins = certificatePins[domain]?.toMutableSet() ?: mutableSetOf()
        currentPins.add(pin)
        certificatePins[domain] = currentPins
    }

    /**
     * Removes certificate pins for a domain
     */
    fun removeCertificatePins(domain: String) {
        certificatePins.remove(domain)
    }
}
