package com.sovereign.communications.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.sovereign.communications.data.entity.ConversationEntity
import java.text.SimpleDateFormat
import java.util.*

/**
 * Conversation list item with Material Design 3 and accessibility
 * Tasks 73-79: Material Design 3 UI with accessibility features
 */
@Composable
fun ConversationItem(
    conversation: ConversationEntity,
    contactName: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    val dateFormat = SimpleDateFormat("MMM dd", Locale.getDefault())
    
    val timeString = conversation.lastMessageTimestamp?.let { timestamp ->
        val now = System.currentTimeMillis()
        val isToday = (now - timestamp) < 24 * 60 * 60 * 1000
        if (isToday) {
            timeFormat.format(Date(timestamp))
        } else {
            dateFormat.format(Date(timestamp))
        }
    } ?: ""
    
    // Accessibility description
    val unreadText = if (conversation.unreadCount > 0) {
        "${conversation.unreadCount} unread messages"
    } else {
        "No unread messages"
    }
    val accessibilityDescription = "Conversation with $contactName, last message: " +
        "${conversation.lastMessageContent ?: "No messages"}, at $timeString, $unreadText"
    
    ListItem(
        headlineContent = {
            Text(
                text = contactName,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        supportingContent = {
            Text(
                text = conversation.lastMessageContent ?: "No messages yet",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        },
        trailingContent = {
            Column(
                horizontalAlignment = Alignment.End
            ) {
                Text(
                    text = timeString,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                if (conversation.unreadCount > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Badge {
                        Text(
                            text = conversation.unreadCount.toString(),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        },
        modifier = modifier
            .clickable(onClick = onClick)
            .semantics { contentDescription = accessibilityDescription }
    )
}
