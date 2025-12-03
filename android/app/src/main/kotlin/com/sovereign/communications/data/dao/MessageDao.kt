package com.sovereign.communications.data.dao

import androidx.room.*
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import kotlinx.coroutines.flow.Flow

/**
 * Message Data Access Object
 * Task 59: Create message persistence
 */
@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY timestamp DESC LIMIT :limit")
    fun getMessages(
        conversationId: String,
        limit: Int = 100,
    ): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE id = :messageId")
    suspend fun getMessage(messageId: String): MessageEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(messages: List<MessageEntity>)

    @Update
    suspend fun update(message: MessageEntity)

    @Delete
    suspend fun delete(message: MessageEntity)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    suspend fun deleteByConversation(conversationId: String)

    @Query("UPDATE messages SET status = :status WHERE id = :messageId")
    suspend fun updateStatus(
        messageId: String,
        status: MessageStatus,
    )

    @Query("SELECT COUNT(*) FROM messages WHERE conversationId = :conversationId AND status != 'READ' AND senderId != :localUserId")
    fun getUnreadCount(
        conversationId: String,
        localUserId: String,
    ): Flow<Int>

    @Query("SELECT * FROM messages WHERE status = 'PENDING' OR status = 'FAILED'")
    suspend fun getPendingMessages(): List<MessageEntity>

    @Query("UPDATE messages SET status = 'READ' WHERE conversationId = :conversationId AND status != 'READ'")
    suspend fun markConversationAsRead(conversationId: String)
}
