package com.sovereign.communications.sharing.models

import kotlinx.serialization.Serializable

/**
 * Invite data class matching the TypeScript PendingInvite interface
 * Used for sharing SC app invitations across different methods
 */
@Serializable
data class Invite(
    val code: String,
    val inviterPeerId: String,
    val inviterPublicKey: ByteArray,
    val inviterName: String? = null,
    val createdAt: Long,
    val expiresAt: Long,
    val signature: ByteArray,
    val bootstrapPeers: List<String> = emptyList(),
    val metadata: Map<String, String>? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as Invite

        if (code != other.code) return false
        if (inviterPeerId != other.inviterPeerId) return false
        if (!inviterPublicKey.contentEquals(other.inviterPublicKey)) return false
        if (inviterName != other.inviterName) return false
        if (createdAt != other.createdAt) return false
        if (expiresAt != other.expiresAt) return false
        if (!signature.contentEquals(other.signature)) return false
        if (bootstrapPeers != other.bootstrapPeers) return false
        if (metadata != other.metadata) return false

        return true
    }

    override fun hashCode(): Int {
        var result = code.hashCode()
        result = 31 * result + inviterPeerId.hashCode()
        result = 31 * result + inviterPublicKey.contentHashCode()
        result = 31 * result + (inviterName?.hashCode() ?: 0)
        result = 31 * result + createdAt.hashCode()
        result = 31 * result + expiresAt.hashCode()
        result = 31 * result + signature.contentHashCode()
        result = 31 * result + bootstrapPeers.hashCode()
        result = 31 * result + (metadata?.hashCode() ?: 0)
        return result
    }
}

/**
 * Share payload for encoding in QR codes, NFC tags, etc.
 */
@Serializable
data class SharePayload(
    val version: String,
    val inviteCode: String,
    val inviterPeerId: String,
    val signature: ByteArray,
    val bootstrapPeers: List<String>,
    val timestamp: Long
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as SharePayload

        if (version != other.version) return false
        if (inviteCode != other.inviteCode) return false
        if (inviterPeerId != other.inviterPeerId) return false
        if (!signature.contentEquals(other.signature)) return false
        if (bootstrapPeers != other.bootstrapPeers) return false
        if (timestamp != other.timestamp) return false

        return true
    }

    override fun hashCode(): Int {
        var result = version.hashCode()
        result = 31 * result + inviteCode.hashCode()
        result = 31 * result + inviterPeerId.hashCode()
        result = 31 * result + signature.contentHashCode()
        result = 31 * result + bootstrapPeers.hashCode()
        result = 31 * result + timestamp.hashCode()
        return result
    }

    fun toJsonString(): String {
        return try {
            kotlinx.serialization.json.Json.encodeToString(this)
        } catch (e: Exception) {
            ""
        }
    }

    companion object {
        fun fromJsonString(json: String): SharePayload? {
            return try {
                kotlinx.serialization.json.Json.decodeFromString<SharePayload>(json)
            } catch (e: Exception) {
                null
            }
        }
    }
}
