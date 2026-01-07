package com.sovereign.communications.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.collect

/**
 * Conversation list screen
 * Task 74: Implement conversation list UI (RecyclerView/LazyColumn)
 */
@Composable
fun ConversationListScreen(
    onSelectConversation: (ConversationItem) -> Unit = {},
    onAddContact: () -> Unit = {}
) {
    var conversations by remember { mutableStateOf<List<ConversationItem>>(emptyList()) }
    
    // Load conversations from database
    val app = com.sovereign.communications.SCApplication.instance
    LaunchedEffect(Unit) {
        try {
            val dao = app.database.conversationDao()
            dao.getAllConversations().collect { convList ->
                conversations = convList.map { entity ->
                    ConversationItem(
                        id = entity.id,
                        displayName = entity.contactId.take(8),
                        lastMessage = entity.lastMessageContent ?: "Start a conversation",
                        timestamp = entity.lastMessageTimestamp ?: System.currentTimeMillis(),
                        unreadCount = entity.unreadCount
                    )
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("ConversationListScreen", "Failed to load conversations", e)
        }
    }
    
    Box(modifier = Modifier.fillMaxSize()) {
        if (conversations.isEmpty()) {
            EmptyConversationsPlaceholder()
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(conversations.size) { index ->
                    ConversationItemRow(
                        item = conversations[index],
                        onClick = { onSelectConversation(conversations[index]) }
                    )
                }
            }
        }
        
        FloatingActionButton(
            onClick = onAddContact,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
        ) {
            Icon(Icons.Default.Add, "New conversation")
        }
    }
}

@Composable
private fun EmptyConversationsPlaceholder() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "No conversations yet",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Add a contact to start messaging",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationItemRow(
    item: ConversationItem,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar placeholder
            Surface(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.primaryContainer
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = item.displayName.first().uppercase(),
                        style = MaterialTheme.typography.titleLarge
                    )
                }
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.displayName,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = item.lastMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    maxLines = 1
                )
            }
            
            if (item.unreadCount > 0) {
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.primary
                ) {
                    Text(
                        text = item.unreadCount.toString(),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                }
            }
        }
    }
}

data class ConversationItem(
    val id: String,
    val displayName: String,
    val lastMessage: String,
    val timestamp: Long,
    val unreadCount: Int = 0
)
