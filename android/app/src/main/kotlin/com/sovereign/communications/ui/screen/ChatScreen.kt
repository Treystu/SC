package com.sovereign.communications.ui.screen

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sovereign.communications.util.InputSanitizer
import java.text.SimpleDateFormat
import java.util.*

data class Message(
    val id: String,
    val content: String,
    val timestamp: Long,
    val isSent: Boolean,
    val status: String, // "pending", "sent", "delivered", "read"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    contactName: String,
    contactId: String,
    onNavigateBack: () -> Unit,
    viewModel: com.sovereign.communications.ui.viewmodel.ChatViewModel =
        androidx.lifecycle.viewmodel.compose.viewModel(
            factory =
                com.sovereign.communications.ui.viewmodel.ChatViewModelFactory(
                    contactId,
                    com.sovereign.communications.SCApplication.instance.database
                        .messageDao(),
                ),
        ),
) {
    var messageText by remember { mutableStateOf("") }

    val messages by viewModel.messages.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(contactName) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding),
        ) {
            // Messages list
            LazyColumn(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                state = listState,
                reverseLayout = false,
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
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
                        val sanitizedText = InputSanitizer.sanitize(messageText)
                        viewModel.sendMessage(sanitizedText)
                        messageText = ""
                    }
                },
                viewModel = viewModel,
            )
        }
    }
}

@Composable
fun MessageBubble(message: com.sovereign.communications.data.entity.MessageEntity) {
    val alignment = if (message.isSent) Alignment.End else Alignment.Start
    val bubbleColor =
        if (message.isSent) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.secondaryContainer
        }
    val textColor =
        if (message.isSent) {
            MaterialTheme.colorScheme.onPrimaryContainer
        } else {
            MaterialTheme.colorScheme.onSecondaryContainer
        }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = alignment,
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = bubbleColor,
            modifier = Modifier.widthIn(max = 280.dp),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
            ) {
                Text(
                    text = message.content,
                    color = textColor,
                    fontSize = 16.sp,
                )

                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = formatTimestamp(message.timestamp),
                        color = textColor.copy(alpha = 0.7f),
                        fontSize = 12.sp,
                    )

                    if (message.isSent) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text =
                                when (message.status) {
                                    "pending" -> "⏱"

                                    "sent" -> "✓"

                                    "delivered" -> "✓✓"

                                    "read" -> "✓✓"

                                    // Could be blue
                                    else -> ""
                                },
                            fontSize = 12.sp,
                            color = if (message.status == "read") Color.Blue else textColor.copy(alpha = 0.7f),
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
    onSend: () -> Unit,
    viewModel: com.sovereign.communications.ui.viewmodel.ChatViewModel,
) {
    val context = LocalContext.current
    val fileManager =
        com.sovereign.communications.media
            .FileManager(context)
    val launcher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.GetContent(),
        ) { uri: android.net.Uri? ->
            uri?.let {
                if (fileManager.validateFile(it)) {
                    viewModel.sendFile(it)
                } else {
                    Toast.makeText(context, "Invalid file type or size", Toast.LENGTH_SHORT).show()
                }
            }
        }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp,
    ) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { launcher.launch("*/*") },
            ) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = "Attach file",
                )
            }

            TextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Type a message...") },
                colors =
                    TextFieldDefaults.colors(
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                shape = RoundedCornerShape(24.dp),
            )

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(
                onClick = onSend,
                enabled = text.isNotBlank(),
                modifier =
                    Modifier
                        .size(48.dp)
                        .background(
                            if (text.isNotBlank()) MaterialTheme.colorScheme.primary else Color.Gray,
                            RoundedCornerShape(24.dp),
                        ),
            ) {
                Icon(
                    Icons.Default.Send,
                    contentDescription = "Send",
                    tint = Color.White,
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
