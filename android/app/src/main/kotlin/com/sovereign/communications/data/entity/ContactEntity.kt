package com.sovereign.communications.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Contact entity for Room database
 * Task 60: Implement contact persistence
 */
@Entity(tableName = "contacts")
data class ContactEntity(
    @PrimaryKey
    val id: String,
    val publicKey: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val lastSeen: Long? = null,
    val isVerified: Boolean = false,
    val isBlocked: Boolean = false,
    val fingerprint: String,
    val endpoints: String? = null, // JSON array of endpoints
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
