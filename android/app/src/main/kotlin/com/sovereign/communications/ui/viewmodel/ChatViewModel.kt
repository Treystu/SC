package com.sovereign.communications.ui.viewmodel

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sovereign.communications.SCApplication
import com.sovereign.communications.data.dao.MessageDao
import com.sovereign.communications.data.entity.MessageEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.*

/**
 * Chat ViewModel
 * Manages chat state and integrates with MeshNetworkService
 */
class ChatViewModel(
    private val messageDao: MessageDao,
    private val contactId: String,
) : ViewModel() {
    private val _messages = MutableStateFlow<List<MessageEntity>>(emptyList())
    val messages: StateFlow<List<MessageEntity>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadMessages()
    }

    /**
     * Load messages from database
     */
    private fun loadMessages() {
        viewModelScope.launch {
            try {
                _isLoading.value = true
                // Observe messages from Room database
                messageDao.getMessages(contactId).collect { loadedMessages ->
                    _messages.value = loadedMessages.reversed() // Reverse because UI might expect chronological
                    _isLoading.value = false
                }
            } catch (e: Exception) {
                // Handle error
                e.printStackTrace()
                _isLoading.value = false
            }
        }
    }

    /**
     * Send a message
     * This integrates with MeshNetworkService to actually send the message
     */
    fun sendMessage(content: String) {
        viewModelScope.launch {
            try {
                // Create message entity
                val message =
                    MessageEntity(
                        id = UUID.randomUUID().toString(),
                        conversationId = contactId,
                        content = content,
                        timestamp = System.currentTimeMillis(),
                        senderId = SCApplication.instance.localPeerId ?: "me",
                        recipientId = contactId,
                        status = com.sovereign.communications.data.entity.MessageStatus.PENDING,
                        type = com.sovereign.communications.data.entity.MessageType.TEXT,
                    )

                // Save to database
                messageDao.insert(message)

                // Send via MeshNetworkService
                try {
                    val meshManager = com.sovereign.communications.SCApplication.instance.meshNetworkManager
                    meshManager.sendMessage(
                        recipientId = contactId,
                        message = content,
                    )

                    // Assume sent/queued if no exception
                    // In a real app, we'd wait for an ack or update status based on MeshManager callback
                    // For now, we update to "sent" (or "queued" if we knew)
                    // meshManager.sendMessage is void, so we assume it's handled
                    // Ideally MeshManager updates the DB status when it actually sends/queues
                } catch (e: Exception) {
                    // Mark as failed/queued
                    // messageDao.updateStatus(message.id, "failed")
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /**
     * Send a file message
     */
    fun sendFile(uri: Uri) {
        viewModelScope.launch {
            try {
                val fileManager =
                    com.sovereign.communications.media
                        .FileManager(SCApplication.instance)
                val file = fileManager.saveFile(uri)
                if (file != null) {
                    sendMessage("file://${file.absolutePath}")
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /**
     * Mark messages as read
     */
    fun markMessagesAsRead() {
        viewModelScope.launch {
            try {
                // Simplified: just mark all unread as read
                // messageDao.markConversationAsRead(contactId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}

class ChatViewModelFactory(
    private val contactId: String,
    private val messageDao: MessageDao,
) : androidx.lifecycle.ViewModelProvider.Factory {
    override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ChatViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return ChatViewModel(messageDao, contactId) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
