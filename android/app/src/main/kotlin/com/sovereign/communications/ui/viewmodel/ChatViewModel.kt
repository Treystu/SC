package com.sovereign.communications.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    private val contactId: String
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
                // Load messages from Room database
                val loadedMessages = messageDao.getMessagesForConversation(contactId)
                _messages.value = loadedMessages
            } catch (e: Exception) {
                // Handle error
                e.printStackTrace()
            } finally {
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
                val message = MessageEntity(
                    id = UUID.randomUUID().toString(),
                    conversationId = contactId,
                    content = content,
                    timestamp = System.currentTimeMillis(),
                    isSent = true,
                    status = "pending"
                )
                
                // Save to database
                messageDao.insert(message)
                
                // TODO: Send via MeshNetworkService
                // val service = getMeshNetworkService()
                // service.sendMessage(contactId, content)
                
                // Reload messages to show new message
                loadMessages()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    /**
     * Called when a new message is received from MeshNetworkService
     */
    fun onMessageReceived(message: MessageEntity) {
        viewModelScope.launch {
            try {
                // Save received message to database
                messageDao.insert(message)
                
                // Reload messages
                loadMessages()
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
                messageDao.markConversationAsRead(contactId)
                loadMessages()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
