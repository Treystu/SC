package com.sovereign.communications.service

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import com.sovereign.communications.data.entity.MessageType
import com.sovereign.communications.service.BackgroundTaskScheduler
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class BackgroundSyncInstrumentationTest {
    private lateinit var context: Context
    private lateinit var database: SCDatabase
    private lateinit var meshNetworkManager: MeshNetworkManager
    private lateinit var backgroundTaskScheduler: BackgroundTaskScheduler
    private lateinit var workManager: WorkManager

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()

        // Initialize WorkManager for testing
        val config = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.DEBUG)
            .setExecutor(SynchronousExecutor())
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)

        workManager = WorkManager.getInstance(context)
        database = SCDatabase.getDatabase(context)
        meshNetworkManager = MeshNetworkManager(context, database)
        backgroundTaskScheduler = BackgroundTaskScheduler(context)
    }

    @After
    fun teardown() = runBlocking {
        database.messageDao().deleteAll()
        workManager.cancelAllWork()
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
        assertEquals("Message status should match", message.status, retrievedMessage?.status)
    }

    @Test
    fun testBulkMessagePersistence() = runBlocking {
        val messageCount = 100
        val messages = mutableListOf<MessageEntity>()

        for (i in 0 until messageCount) {
            val message = MessageEntity(
                id = "bulk-msg-$i",
                conversationId = "bulk-peer",
                content = "Bulk test message $i",
                senderId = "me",
                recipientId = "bulk-peer",
                timestamp = System.currentTimeMillis() + i,
                status = MessageStatus.PENDING,
                type = MessageType.TEXT
            )
            messages.add(message)
        }

        database.messageDao().insertAll(messages)

        val retrievedMessages = database.messageDao().getMessagesForConversation("bulk-peer")
        assertEquals("All messages should be persisted", messageCount, retrievedMessages.size)
    }

    @Test
    fun testMessageStatusUpdate() = runBlocking {
        val message = MessageEntity(
            id = "status-test-msg",
            conversationId = "status-peer",
            content = "Status test message",
            senderId = "me",
            recipientId = "status-peer",
            timestamp = System.currentTimeMillis(),
            status = MessageStatus.PENDING,
            type = MessageType.TEXT
        )

        database.messageDao().insert(message)

        // Update status to sent
        database.messageDao().updateMessageStatus(message.id, MessageStatus.SENT)

        val updatedMessage = database.messageDao().getMessage(message.id)
        assertEquals("Message status should be updated", MessageStatus.SENT, updatedMessage?.status)
    }

    @Test
    fun testBackgroundSyncWorkerScheduling() {
        val workRequest = backgroundTaskScheduler.scheduleSyncWork()

        assertNotNull("Work request should be created", workRequest)

        val workInfo = workManager.getWorkInfoById(workRequest.id).get()
        assertNotNull("Work should be scheduled", workInfo)
        assertEquals("Work should be enqueued", WorkInfo.State.ENQUEUED, workInfo.state)
    }

    @Test
    fun testBackgroundMessageProcessing() = runBlocking {
        // Insert pending messages
        val pendingMessages = listOf(
            MessageEntity(
                id = "pending-1",
                conversationId = "peer-1",
                content = "Pending message 1",
                senderId = "me",
                recipientId = "peer-1",
                timestamp = System.currentTimeMillis(),
                status = MessageStatus.PENDING,
                type = MessageType.TEXT
            ),
            MessageEntity(
                id = "pending-2",
                conversationId = "peer-2",
                content = "Pending message 2",
                senderId = "me",
                recipientId = "peer-2",
                timestamp = System.currentTimeMillis(),
                status = MessageStatus.PENDING,
                type = MessageType.TEXT
            )
        )

        database.messageDao().insertAll(pendingMessages)

        // Simulate background sync processing
        val syncWorkRequest = backgroundTaskScheduler.scheduleSyncWork()
        val workInfo = workManager.getWorkInfoById(syncWorkRequest.id).get(10, TimeUnit.SECONDS)

        // Work should complete (in test environment)
        assertTrue("Work should complete",
            workInfo.state == WorkInfo.State.SUCCEEDED || workInfo.state == WorkInfo.State.RUNNING)
    }

    @Test
    fun testMessageQueueProcessing() = runBlocking {
        // Insert messages with different statuses
        val messages = listOf(
            MessageEntity(
                id = "queue-1",
                conversationId = "queue-peer",
                content = "Queued message 1",
                senderId = "me",
                recipientId = "queue-peer",
                timestamp = System.currentTimeMillis(),
                status = MessageStatus.QUEUED,
                type = MessageType.TEXT
            ),
            MessageEntity(
                id = "queue-2",
                conversationId = "queue-peer",
                content = "Queued message 2",
                senderId = "me",
                recipientId = "queue-peer",
                timestamp = System.currentTimeMillis(),
                status = MessageStatus.QUEUED,
                type = MessageType.TEXT
            )
        )

        database.messageDao().insertAll(messages)

        // Get queued messages
        val queuedMessages = database.messageDao().getMessagesByStatus(MessageStatus.QUEUED)
        assertEquals("Should find queued messages", 2, queuedMessages.size)

        // Simulate processing one message
        database.messageDao().updateMessageStatus("queue-1", MessageStatus.SENDING)

        val sendingMessages = database.messageDao().getMessagesByStatus(MessageStatus.SENDING)
        assertEquals("Should have one sending message", 1, sendingMessages.size)
        assertEquals("Sending message should be correct", "queue-1", sendingMessages[0].id)
    }

    @Test
    fun testPeriodicSyncScheduling() {
        val periodicWorkRequest = backgroundTaskScheduler.schedulePeriodicSync()

        assertNotNull("Periodic work should be scheduled", periodicWorkRequest)

        val workInfos = workManager.getWorkInfosForUniqueWork("sync_work").get()
        assertFalse("Periodic work should be scheduled", workInfos.isEmpty())

        val workInfo = workInfos[0]
        assertTrue("Should be periodic work",
            workInfo.state == WorkInfo.State.ENQUEUED || workInfo.state == WorkInfo.State.RUNNING)
    }

    @Test
    fun testMessageCleanup() = runBlocking {
        // Insert old messages
        val oldTimestamp = System.currentTimeMillis() - (30 * 24 * 60 * 60 * 1000L) // 30 days ago
        val oldMessages = listOf(
            MessageEntity(
                id = "old-1",
                conversationId = "cleanup-peer",
                content = "Old message 1",
                senderId = "me",
                recipientId = "cleanup-peer",
                timestamp = oldTimestamp,
                status = MessageStatus.DELIVERED,
                type = MessageType.TEXT
            ),
            MessageEntity(
                id = "old-2",
                conversationId = "cleanup-peer",
                content = "Old message 2",
                senderId = "me",
                recipientId = "cleanup-peer",
                timestamp = oldTimestamp,
                status = MessageStatus.DELIVERED,
                type = MessageType.TEXT
            )
        )

        database.messageDao().insertAll(oldMessages)

        // Verify messages exist
        val allMessages = database.messageDao().getAllMessages()
        assertTrue("Old messages should exist", allMessages.size >= 2)

        // Simulate cleanup (in real app, this would be done by a maintenance task)
        val cutoffTime = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L) // 7 days ago
        database.messageDao().deleteMessagesOlderThan(cutoffTime)

        val remainingMessages = database.messageDao().getAllMessages()
        assertTrue("Old messages should be cleaned up", remainingMessages.size < allMessages.size)
    }

    @Test
    fun testConcurrentMessageOperations() = runBlocking {
        val threadCount = 5
        val messagesPerThread = 10
        val latch = CountDownLatch(threadCount)

        for (i in 0 until threadCount) {
            Thread {
                runBlocking {
                    for (j in 0 until messagesPerThread) {
                        val message = MessageEntity(
                            id = "concurrent-${i}-${j}",
                            conversationId = "concurrent-peer",
                            content = "Concurrent message ${i}-${j}",
                            senderId = "me",
                            recipientId = "concurrent-peer",
                            timestamp = System.currentTimeMillis(),
                            status = MessageStatus.PENDING,
                            type = MessageType.TEXT
                        )
                        database.messageDao().insert(message)
                    }
                    latch.countDown()
                }
            }.start()
        }

        assertTrue("All threads should complete", latch.await(30, TimeUnit.SECONDS))

        val totalMessages = database.messageDao().getMessagesForConversation("concurrent-peer")
        assertEquals("All messages should be persisted", threadCount * messagesPerThread, totalMessages.size)
    }

    @Test
    fun testWorkManagerConstraints() {
        val constrainedWorkRequest = backgroundTaskScheduler.scheduleConstrainedSyncWork()

        assertNotNull("Constrained work should be created", constrainedWorkRequest)

        val workInfo = workManager.getWorkInfoById(constrainedWorkRequest.id).get()
        assertNotNull("Constrained work should be scheduled", workInfo)

        // Verify work has constraints (network required)
        val constraints = workInfo.constraints
        assertTrue("Work should require network", constraints.requiredNetworkType != androidx.work.NetworkType.NOT_REQUIRED)
    }
}
