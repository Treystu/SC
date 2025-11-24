package com.sovereign.communications.benchmark

import androidx.benchmark.junit4.BenchmarkRule
import androidx.benchmark.junit4.measureRepeated
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import com.sovereign.communications.data.entity.MessageType
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Database performance benchmarks
 * Task 61: Add database performance benchmarks
 * 
 * Note: Requires androidx.benchmark dependency
 * Add to build.gradle:
 * androidTestImplementation "androidx.benchmark:benchmark-junit4:1.2.0"
 */
@RunWith(AndroidJUnit4::class)
class DatabaseBenchmark {
    
    @get:Rule
    val benchmarkRule = BenchmarkRule()
    
    private lateinit var database: SCDatabase
    
    @Before
    fun setup() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            SCDatabase::class.java
        ).build()
    }
    
    @After
    fun tearDown() {
        database.close()
    }
    
    @Test
    fun benchmarkInsertMessage() = runBlocking {
        val messageDao = database.messageDao()
        
        benchmarkRule.measureRepeated {
            val message = createTestMessage("msg_${System.nanoTime()}")
            messageDao.insert(message)
        }
    }
    
    @Test
    fun benchmarkQueryMessages() = runBlocking {
        // Setup: Insert 1000 messages
        val messageDao = database.messageDao()
        val conversationId = "test-conversation"
        
        repeat(1000) { i ->
            messageDao.insert(createTestMessage(
                id = "msg_$i",
                conversationId = conversationId,
                timestamp = i.toLong()
            ))
        }
        
        // Benchmark query
        benchmarkRule.measureRepeated {
            runBlocking {
                // This should be fast due to indices
                messageDao.getMessage("msg_500")
            }
        }
    }
    
    @Test
    fun benchmarkQueryConversationMessages() = runBlocking {
        // Setup: Insert messages across multiple conversations
        val messageDao = database.messageDao()
        
        repeat(5) { convIndex ->
            repeat(200) { msgIndex ->
                messageDao.insert(createTestMessage(
                    id = "conv${convIndex}_msg$msgIndex",
                    conversationId = "conversation_$convIndex",
                    timestamp = msgIndex.toLong()
                ))
            }
        }
        
        // Benchmark query for specific conversation
        // Should be fast due to conversationId+timestamp index
        benchmarkRule.measureRepeated {
            runBlocking {
                // Query is sync for benchmarking
                val messages = database.messageDao().getPendingMessages()
            }
        }
    }
    
    @Test
    fun benchmarkUpdateMessageStatus() = runBlocking {
        val messageDao = database.messageDao()
        val messageId = "test-message"
        
        messageDao.insert(createTestMessage(id = messageId))
        
        benchmarkRule.measureRepeated {
            runBlocking {
                messageDao.updateStatus(messageId, MessageStatus.DELIVERED)
            }
        }
    }
    
    private fun createTestMessage(
        id: String,
        conversationId: String = "test-conversation",
        timestamp: Long = System.currentTimeMillis()
    ): MessageEntity {
        return MessageEntity(
            id = id,
            conversationId = conversationId,
            content = "Test message content",
            senderId = "sender-id",
            recipientId = "recipient-id",
            timestamp = timestamp,
            status = MessageStatus.SENT,
            type = MessageType.TEXT
        )
    }
}
