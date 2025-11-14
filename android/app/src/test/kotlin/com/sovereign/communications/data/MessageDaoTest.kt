package com.sovereign.communications.data

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import com.sovereign.communications.data.entity.MessageType
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Unit tests for MessageDao
 * Task 61: Comprehensive database tests
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class MessageDaoTest {
    
    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()
    
    private lateinit var database: SCDatabase
    private lateinit var messageDao: com.sovereign.communications.data.dao.MessageDao
    
    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            SCDatabase::class.java
        )
            .allowMainThreadQueries()
            .build()
        
        messageDao = database.messageDao()
    }
    
    @After
    fun tearDown() {
        database.close()
    }
    
    @Test
    fun `insert and retrieve message`() = runTest {
        val message = createTestMessage()
        
        messageDao.insert(message)
        val retrieved = messageDao.getMessage(message.id)
        
        assertNotNull(retrieved)
        assertEquals(message.id, retrieved.id)
        assertEquals(message.content, retrieved.content)
    }
    
    @Test
    fun `get messages for conversation`() = runTest {
        val conversationId = "conv1"
        val messages = listOf(
            createTestMessage(id = "msg1", conversationId = conversationId, timestamp = 1000),
            createTestMessage(id = "msg2", conversationId = conversationId, timestamp = 2000),
            createTestMessage(id = "msg3", conversationId = "conv2", timestamp = 3000)
        )
        
        messageDao.insertAll(messages)
        val retrieved = messageDao.getMessages(conversationId, 100).first()
        
        assertEquals(2, retrieved.size)
        // Should be ordered by timestamp DESC
        assertEquals("msg2", retrieved[0].id)
        assertEquals("msg1", retrieved[1].id)
    }
    
    @Test
    fun `update message status`() = runTest {
        val message = createTestMessage(status = MessageStatus.PENDING)
        messageDao.insert(message)
        
        messageDao.updateStatus(message.id, MessageStatus.DELIVERED)
        val updated = messageDao.getMessage(message.id)
        
        assertEquals(MessageStatus.DELIVERED, updated?.status)
    }
    
    @Test
    fun `delete messages by conversation`() = runTest {
        val conversationId = "conv1"
        val messages = listOf(
            createTestMessage(id = "msg1", conversationId = conversationId),
            createTestMessage(id = "msg2", conversationId = conversationId),
            createTestMessage(id = "msg3", conversationId = "conv2")
        )
        
        messageDao.insertAll(messages)
        messageDao.deleteByConversation(conversationId)
        
        val remaining = messageDao.getMessage("msg1")
        val otherConv = messageDao.getMessage("msg3")
        
        assertNull(remaining)
        assertNotNull(otherConv)
    }
    
    @Test
    fun `get pending messages`() = runTest {
        val messages = listOf(
            createTestMessage(id = "msg1", status = MessageStatus.PENDING),
            createTestMessage(id = "msg2", status = MessageStatus.SENT),
            createTestMessage(id = "msg3", status = MessageStatus.FAILED)
        )
        
        messageDao.insertAll(messages)
        val pending = messageDao.getPendingMessages()
        
        assertEquals(2, pending.size)
        assert(pending.any { it.status == MessageStatus.PENDING })
        assert(pending.any { it.status == MessageStatus.FAILED })
    }
    
    @Test
    fun `test message indices performance`() = runTest {
        // Insert many messages to test index performance
        val conversationId = "conv1"
        val messages = (1..1000).map { i ->
            createTestMessage(
                id = "msg$i",
                conversationId = if (i % 2 == 0) conversationId else "conv2",
                timestamp = i.toLong(),
                status = if (i % 3 == 0) MessageStatus.READ else MessageStatus.SENT
            )
        }
        
        messageDao.insertAll(messages)
        
        // Query should be fast due to indices
        val retrieved = messageDao.getMessages(conversationId, 100).first()
        assertEquals(100, retrieved.size)
        
        val pending = messageDao.getPendingMessages()
        assertEquals(0, pending.size)
    }
    
    private fun createTestMessage(
        id: String = "test-message-id",
        conversationId: String = "test-conversation",
        content: String = "Test message content",
        senderId: String = "sender-id",
        recipientId: String = "recipient-id",
        timestamp: Long = System.currentTimeMillis(),
        status: MessageStatus = MessageStatus.SENT,
        type: MessageType = MessageType.TEXT
    ): MessageEntity {
        return MessageEntity(
            id = id,
            conversationId = conversationId,
            content = content,
            senderId = senderId,
            recipientId = recipientId,
            timestamp = timestamp,
            status = status,
            type = type
        )
    }
}
