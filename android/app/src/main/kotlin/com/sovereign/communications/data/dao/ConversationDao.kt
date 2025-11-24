package com.sovereign.communications.data.dao

import androidx.room.*
import com.sovereign.communications.data.entity.ConversationEntity
import kotlinx.coroutines.flow.Flow

/**
 * Conversation Data Access Object
 * Task 61: Create conversation persistence
 */
@Dao
interface ConversationDao {
    
    @Query("SELECT * FROM conversations ORDER BY isPinned DESC, lastMessageTimestamp DESC")
    fun getAllConversations(): Flow<List<ConversationEntity>>
    
    @Query("SELECT * FROM conversations WHERE id = :conversationId")
    suspend fun getConversation(conversationId: String): ConversationEntity?
    
    @Query("SELECT * FROM conversations WHERE contactId = :contactId")
    suspend fun getConversationByContact(contactId: String): ConversationEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(conversation: ConversationEntity)
    
    @Update
    suspend fun update(conversation: ConversationEntity)
    
    @Delete
    suspend fun delete(conversation: ConversationEntity)
    
    @Query("UPDATE conversations SET unreadCount = 0 WHERE id = :conversationId")
    suspend fun markAsRead(conversationId: String)
    
    @Query("UPDATE conversations SET unreadCount = unreadCount + 1 WHERE id = :conversationId")
    suspend fun incrementUnreadCount(conversationId: String)
    
    @Query("UPDATE conversations SET isPinned = :pinned WHERE id = :conversationId")
    suspend fun setPinned(conversationId: String, pinned: Boolean)
    
    @Query("UPDATE conversations SET lastMessageId = :messageId, lastMessageContent = :content, lastMessageTimestamp = :timestamp, updatedAt = :timestamp WHERE id = :conversationId")
    suspend fun updateLastMessage(conversationId: String, messageId: String, content: String, timestamp: Long)
}
