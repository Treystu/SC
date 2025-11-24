package com.sovereign.communications.sharing

import android.content.Context
import com.sovereign.communications.sharing.models.Invite
import com.sovereign.communications.sharing.models.SharePayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.SecureRandom
import kotlin.random.asKotlinRandom

/**
 * InviteManager - Manages invite lifecycle for Android
 * Coordinates with various sharing methods (QR, NFC, Nearby, etc.)
 */
class InviteManager(
    private val context: Context,
    private val peerId: String,
    private val publicKey: ByteArray,
    private val displayName: String? = null
) {
    private val invites = mutableMapOf<String, Invite>()
    private val random = SecureRandom().asKotlinRandom()
    
    private val _currentInvite = MutableStateFlow<Invite?>(null)
    val currentInvite: StateFlow<Invite?> = _currentInvite.asStateFlow()
    
    companion object {
        private const val DEFAULT_INVITE_TTL = 7 * 24 * 60 * 60 * 1000L // 7 days
        private const val INVITE_CODE_LENGTH = 32
    }
    
    /**
     * Create a new invite code
     */
    suspend fun createInvite(
        ttl: Long = DEFAULT_INVITE_TTL,
        metadata: Map<String, String>? = null
    ): Invite {
        val code = generateSecureCode()
        val createdAt = System.currentTimeMillis()
        val expiresAt = createdAt + ttl
        
        // Generate placeholder signature (in production, use actual signing)
        // WARNING: Using random bytes instead of Ed25519 signatures.
        // Ensure signature verification is implemented before production use.
        val signature = ByteArray(64).apply {
            random.nextBytes(this)
        }
        
        val invite = Invite(
            code = code,
            inviterPeerId = peerId,
            inviterPublicKey = publicKey,
            inviterName = displayName,
            createdAt = createdAt,
            expiresAt = expiresAt,
            signature = signature,
            bootstrapPeers = getBootstrapPeers(),
            metadata = metadata
        )
        
        invites[code] = invite
        _currentInvite.value = invite
        
        return invite
    }
    
    /**
     * Generate a cryptographically secure invite code
     */
    private fun generateSecureCode(): String {
        val bytes = ByteArray(INVITE_CODE_LENGTH)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Get bootstrap peers for helping invitees connect
     * In production, this would query the mesh network
     */
    private fun getBootstrapPeers(): List<String> {
        // Placeholder - would return actual peer IDs from mesh network
        return emptyList()
    }
    
    /**
     * Validate an invite code
     */
    fun validateInvite(code: String): ValidationResult {
        val invite = invites[code]
            ?: return ValidationResult(false, "Invalid invite code")
        
        if (invite.expiresAt <= System.currentTimeMillis()) {
            return ValidationResult(false, "Invite expired")
        }
        
        return ValidationResult(true, null, invite)
    }
    
    /**
     * Redeem an invite code
     */
    suspend fun redeemInvite(code: String, onSuccess: (Invite) -> Unit) {
        val validation = validateInvite(code)
        
        if (!validation.valid) {
            throw IllegalArgumentException(validation.error ?: "Invalid invite")
        }
        
        val invite = validation.invite!!
        
        // Mark invite as used
        invites.remove(code)
        
        // Callback with invite details
        onSuccess(invite)
    }
    
    /**
     * Get current active invite
     */
    fun getCurrentInvite(): Invite? {
        return _currentInvite.value
    }
    
    /**
     * Revoke an invite
     */
    fun revokeInvite(code: String): Boolean {
        val removed = invites.remove(code) != null
        if (_currentInvite.value?.code == code) {
            _currentInvite.value = null
        }
        return removed
    }
    
    /**
     * Clean up expired invites
     */
    fun cleanupExpiredInvites(): Int {
        val now = System.currentTimeMillis()
        val expired = invites.filter { it.value.expiresAt <= now }
        expired.keys.forEach { invites.remove(it) }
        
        if (_currentInvite.value?.expiresAt ?: Long.MAX_VALUE <= now) {
            _currentInvite.value = null
        }
        
        return expired.size
    }
    
    /**
     * Get all pending invites
     */
    fun getAllInvites(): List<Invite> {
        return invites.values.toList()
    }
    
    /**
     * Create a share payload from an invite
     */
    fun createSharePayload(invite: Invite): SharePayload {
        return SharePayload(
            version = "0.1.0",
            inviteCode = invite.code,
            inviterPeerId = invite.inviterPeerId,
            signature = invite.signature,
            bootstrapPeers = invite.bootstrapPeers,
            timestamp = System.currentTimeMillis()
        )
    }
    
    /**
     * Extract invite code from various formats
     * Handles deep links, QR codes, NFC data, etc.
     */
    fun extractInviteCode(data: String): String? {
        return when {
            // Deep link format: https://sc.app/join#CODE
            data.startsWith("https://sc.app/join#") -> {
                data.substringAfter("#")
            }
            // Direct code (64 hex characters)
            data.matches(Regex("^[0-9a-f]{64}$")) -> {
                data
            }
            // JSON payload
            data.startsWith("{") -> {
                try {
                    val payload = SharePayload.fromJsonString(data)
                    payload?.inviteCode
                } catch (e: Exception) {
                    null
                }
            }
            else -> null
        }
    }
    
    data class ValidationResult(
        val valid: Boolean,
        val error: String?,
        val invite: Invite? = null
    )
}
