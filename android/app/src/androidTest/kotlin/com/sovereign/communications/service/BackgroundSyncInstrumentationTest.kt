package com.sovereign.communications.service

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import com.sovereign.communications.data.entity.MessageType
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BackgroundSyncInstrumentationTest {
    private lateinit var context: Context
    private lateinit var database: SCDatabase
    private lateinit var meshNetworkManager: MeshNetworkManager
    
    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        database = SCDatabase.getDatabase(context)
        meshNetworkManager = MeshNetworkManager(context, database)
    }
    
    @After
    fun teardown() = runBlocking {
        database.messageDao().deleteAll()
        if (::meshNetworkManager.isInitialized) {
            meshNetworkManager.stop()
        }
    }
    
    @Test
    fun testMessagePersistence() = runBlocking {
        val message = MessageEntity(
            id = "test-msg-1",
            conversationId = "test-peer-1",
            content = "Test message",
            senderId = "me",
            recipientId = "test-peer-1",
            timestamp = System.currentTimeMillis(),
            status = MessageStatus.PENDING,
            type = MessageType.TEXT
        )
        database.messageDao().insert(message)
        val retrievedMessage = database.messageDao().getMessage(message.id)
        assertNotNull("Message should be persisted", retrievedMessage)
        assertEquals("Message content should match", message.content, retrievedMessage?.content)
    }
}
