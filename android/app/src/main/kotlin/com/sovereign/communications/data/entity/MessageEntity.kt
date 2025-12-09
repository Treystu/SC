package com.sovereign.communications.data.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import androidx.room.TypeConverters

/**
 * Message entity for Room database
 * Task 59: Create message persistence with performance indices
 */
@Entity(
    tableName = "messages",
    indices = [
        Index(value = ["conversationId", "timestamp"], name = "index_messages_conversationId_timestamp"),
        Index(value = ["status"], name = "index_messages_status"),
        Index(value = ["senderId"], name = "index_messages_senderId")
    ]
)
@TypeConverters(MessageTypeConverters::class)
data class MessageEntity(
    @PrimaryKey
    val id: String,
    val conversationId: String,
    val content: String,
    val senderId: String,
    val recipientId: String,
    val timestamp: Long,
    val status: MessageStatus,
    val type: MessageType,
    val isEncrypted: Boolean = true,
    val signature: String? = null,
    val nonce: String? = null,
    val deliveredAt: Long? = null,
    val readAt: Long? = null,
    val editedAt: Long? = null,
    val hasAttachment: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val metadata: String? = null
)

enum class MessageStatus {
    PENDING,
    QUEUED,
    SENT,
    DELIVERED,
    READ,
    FAILED
}

enum class MessageType {
    TEXT,
    FILE,
    VOICE,
    IMAGE,
    CONTROL
}

class MessageTypeConverters {
    @TypeConverter
    fun fromMessageStatus(value: MessageStatus): String = value.name

    @TypeConverter
    fun toMessageStatus(value: String): MessageStatus = MessageStatus.valueOf(value)

    @TypeConverter
    fun fromMessageType(value: MessageType): String = value.name

    @TypeConverter
    fun toMessageType(value: String): MessageType = MessageType.valueOf(value)
}
