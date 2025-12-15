package com.sovereign.communications.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sovereign.communications.SCApplication
import com.sovereign.communications.data.dao.ConversationDao
import com.sovereign.communications.data.dao.MessageDao
import com.sovereign.communications.data.entity.ConversationEntity
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * ViewModel for conversation screen with proper state management
 * Tasks 76-78: Implement proper ViewModel architecture with StateFlow
 */
class ConversationViewModel(
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val conversationId: String,
) : ViewModel() {
    // UI State using StateFlow
    private val _uiState = MutableStateFlow(ConversationUiState())
    val uiState: StateFlow<ConversationUiState> = _uiState.asStateFlow()

    init {
        loadConversation()
        loadMessages()
    }

    private fun loadConversation() {
        viewModelScope.launch {
            try {
                val conversation = conversationDao.getConversation(conversationId)
                _uiState.update { it.copy(conversation = conversation) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    private fun loadMessages() {
        viewModelScope.launch {
            messageDao
                .getMessages(conversationId, 100)
                .catch { e ->
                    _uiState.update { it.copy(error = e.message) }
                }.collect { messages ->
                    _uiState.update {
                        it.copy(
                            messages = messages,
                            isLoading = false,
                        )
                    }
                }
        }
    }

    fun sendMessage(content: String) {
        viewModelScope.launch {
            try {
                val message =
                    MessageEntity(
                        id = generateMessageId(),
                        conversationId = conversationId,
                        content = content,
                        senderId = getCurrentUserId(),
                        recipientId = getRecipientId(),
                        timestamp = System.currentTimeMillis(),
                        status = MessageStatus.PENDING,
                        type = com.sovereign.communications.data.entity.MessageType.TEXT,
                    )

                messageDao.insert(message)

                // Send via mesh network
                try {
                    val meshManager = SCApplication.instance.meshNetworkManager
                    val success =
                        meshManager.sendMessage(
                            recipientId = message.recipientId,
                            message = message.content,
                        )

                    // Update message status based on send result
                    if (success) {
                        messageDao.updateStatus(message.id, MessageStatus.SENT)
                    } else {
                        // Message will be queued for retry by store-and-forward
                        messageDao.updateStatus(message.id, MessageStatus.QUEUED)
                    }
                } catch (e: Exception) {
                    // If mesh network fails, mark as queued for retry
                    messageDao.updateStatus(message.id, MessageStatus.QUEUED)
                }

                _uiState.update { it.copy(sendingMessage = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        error = e.message,
                        sendingMessage = false,
                    )
                }
            }
        }
    }

    fun markAsRead() {
        viewModelScope.launch {
            try {
                val currentUserId = getCurrentUserId()
                _uiState.value.messages.forEach { message ->
                    if (message.senderId != currentUserId && message.status != MessageStatus.READ) {
                        messageDao.updateStatus(message.id, MessageStatus.READ)
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    // Helper methods
    private fun generateMessageId(): String = "msg_${System.currentTimeMillis()}_${(Math.random() * 1000).toInt()}"

    private fun getCurrentUserId(): String {
        // Get from identity manager (SCApplication)
        return SCApplication.instance.localPeerId ?: "unknown-user"
    }

    private fun getRecipientId(): String {
        // Get from conversation
        return _uiState.value.conversation?.contactId ?: "unknown"
    }
}

/**
 * UI State for conversation screen
 */
data class ConversationUiState(
    val conversation: ConversationEntity? = null,
    val messages: List<MessageEntity> = emptyList(),
    val isLoading: Boolean = true,
    val sendingMessage: Boolean = false,
    val error: String? = null,
)
