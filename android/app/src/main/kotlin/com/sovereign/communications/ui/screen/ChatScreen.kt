package com.sovereign.communications.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.*

data class Message(
    val id: String,
    val content: String,
    val timestamp: Long,
    val isSent: Boolean,
    val status: String // "pending", "sent", "delivered", "read"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    contactName: String,
    contactId: String,
    onNavigateBack: () -> Unit
) {
    var messageText by remember { mutableStateOf("") }
    
    // Demo messages showing the UI works
    // In production, this would be replaced with ViewModel collecting from Room DB
    val messages = remember {
        mutableStateListOf(
            Message("1", "Hey! How's it going?", System.currentTimeMillis() - 3600000, false, "read"),
            Message("2", "Pretty good! Just testing this new mesh network app", System.currentTimeMillis() - 3540000, true, "delivered"),
            Message("3", "That's cool! How does it work?", System.currentTimeMillis() - 3480000, false, "read"),
            Message("4", "It's completely decentralized - no servers needed. Everything is end-to-end encrypted with Ed25519 and ChaCha20.", System.currentTimeMillis() - 3420000, true, "sent"),
        )
    }
    val listState = rememberLazyListState()

    // Note: For full integration, inject ChatViewModel here:
    // val viewModel: ChatViewModel = viewModel(
    //     factory = ChatViewModelFactory(contactId, messageDao)
    // )
    // val messages by viewModel.messages.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(contactName) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Messages list
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                state = listState,
                reverseLayout = false,
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(messages) { message ->
                    MessageBubble(message = message)
                }
            }

            // Message input
            MessageInput(
                text = messageText,
                onTextChange = { messageText = it },
                onSend = {
                    if (messageText.isNotBlank()) {
                        // Add message to local list (demo)
                        messages.add(
                            Message(
                                id = UUID.randomUUID().toString(),
                                content = messageText,
                                timestamp = System.currentTimeMillis(),
                                isSent = true,
                                status = "pending"
                            )
                        )
                        
                        // For full integration: viewModel.sendMessage(messageText)
                        
                        messageText = ""
                        
                        // Auto-scroll to bottom
                        // Note: In production, use LaunchedEffect with messages.size
                    }
                }
            )
        }
    }
}
                        messageText = ""
                    }
                }
            )
        }
    }
}

@Composable
fun MessageBubble(message: Message) {
    val alignment = if (message.isSent) Alignment.End else Alignment.Start
    val bubbleColor = if (message.isSent) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.secondaryContainer
    }
    val textColor = if (message.isSent) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onSecondaryContainer
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = alignment
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = bubbleColor,
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                Text(
                    text = message.content,
                    color = textColor,
                    fontSize = 16.sp
                )
                
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = formatTimestamp(message.timestamp),
                        color = textColor.copy(alpha = 0.7f),
                        fontSize = 12.sp
                    )
                    
                    if (message.isSent) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = when (message.status) {
                                "pending" -> "⏱"
                                "sent" -> "✓"
                                "delivered" -> "✓✓"
                                "read" -> "✓✓" // Could be blue
                                else -> ""
                            },
                            fontSize = 12.sp,
                            color = if (message.status == "read") Color.Blue else textColor.copy(alpha = 0.7f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MessageInput(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Type a message...") },
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                ),
                shape = RoundedCornerShape(24.dp)
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            IconButton(
                onClick = onSend,
                enabled = text.isNotBlank(),
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        if (text.isNotBlank()) MaterialTheme.colorScheme.primary else Color.Gray,
                        RoundedCornerShape(24.dp)
                    )
            ) {
                Icon(
                    Icons.Default.Send,
                    contentDescription = "Send",
                    tint = Color.White
                )
            }
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    
    return when {
        diff < 60000 -> "Just now"
        diff < 3600000 -> "${diff / 60000}m ago"
        diff < 86400000 -> SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(timestamp))
        else -> SimpleDateFormat("MMM dd", Locale.getDefault()).format(Date(timestamp))
    }
}
