package com.sovereign.communications.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageStatus
import java.text.SimpleDateFormat
import java.util.*

/**
 * Message bubble component with Material Design 3 and accessibility
 * Tasks 73-79: Material Design 3 UI with accessibility features
 */
@Composable
fun MessageBubble(
    message: MessageEntity,
    isFromCurrentUser: Boolean,
    modifier: Modifier = Modifier,
) {
    val alignment = if (isFromCurrentUser) Alignment.End else Alignment.Start
    val backgroundColor =
        if (isFromCurrentUser) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.secondaryContainer
        }
    val contentColor =
        if (isFromCurrentUser) {
            MaterialTheme.colorScheme.onPrimaryContainer
        } else {
            MaterialTheme.colorScheme.onSecondaryContainer
        }

    // Format timestamp
    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    val timeString = timeFormat.format(Date(message.timestamp))

    // Create accessible content description
    val statusText =
        when (message.status) {
            MessageStatus.PENDING -> "Sending"
            MessageStatus.QUEUED -> "Queued"
            MessageStatus.SENT -> "Sent"
            MessageStatus.DELIVERED -> "Delivered"
            MessageStatus.READ -> "Read"
            MessageStatus.FAILED -> "Failed to send"
        }

    val accessibilityDescription =
        if (isFromCurrentUser) {
            "You sent: ${message.content}, at $timeString, $statusText"
        } else {
            "Received: ${message.content}, at $timeString"
        }

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp)
                .semantics { contentDescription = accessibilityDescription },
        horizontalAlignment = alignment,
    ) {
        Surface(
            shape =
                RoundedCornerShape(
                    topStart = 16.dp,
                    topEnd = 16.dp,
                    bottomStart = if (isFromCurrentUser) 16.dp else 4.dp,
                    bottomEnd = if (isFromCurrentUser) 4.dp else 16.dp,
                ),
            color = backgroundColor,
            tonalElevation = 1.dp,
            modifier = Modifier.widthIn(max = 280.dp),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
            ) {
                // Message content
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyLarge,
                    color = contentColor,
                )

                Spacer(modifier = Modifier.height(4.dp))

                // Timestamp and status
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = timeString,
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.7f),
                    )

                    if (isFromCurrentUser) {
                        Spacer(modifier = Modifier.width(4.dp))
                        MessageStatusIndicator(
                            status = message.status,
                            tint = contentColor.copy(alpha = 0.7f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MessageStatusIndicator(
    status: MessageStatus,
    tint: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    val icon =
        when (status) {
            MessageStatus.PENDING -> "⏱"
            MessageStatus.QUEUED -> "..."
            MessageStatus.SENT -> "✓"
            MessageStatus.DELIVERED -> "✓✓"
            MessageStatus.READ -> "✓✓"
            MessageStatus.FAILED -> "✗"
        }

    Text(
        text = icon,
        style = MaterialTheme.typography.labelSmall,
        color =
            if (status == MessageStatus.READ) {
                MaterialTheme.colorScheme.primary
            } else {
                tint
            },
        modifier = modifier,
    )
}
