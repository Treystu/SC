package com.sovereign.communications.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Conversation entity for Room database
 * Task 61: Create conversation persistence with indices
 */
@Entity(
    tableName = "conversations",
    indices = [
        Index(value = ["lastMessageTimestamp"], name = "index_conversations_lastMessageTime")
    ]
)
data class ConversationEntity(
    @PrimaryKey
    val id: String,
    val contactId: String,
    val lastMessageId: String? = null,
    val lastMessageContent: String? = null,
    val lastMessageTimestamp: Long? = null,
    val unreadCount: Int = 0,
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
