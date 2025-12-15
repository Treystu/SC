package com.sovereign.communications.ui.component

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.StateFlow

data class FileTransfer(
    val id: String,
    val fileName: String,
    val fileSize: Long,
    val progress: Float, // 0.0 - 1.0
    val status: TransferStatus,
    val speed: Long = 0, // bytes per second
)

enum class TransferStatus {
    PENDING,
    TRANSFERRING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED,
}

@Composable
fun FileTransferProgressItem(
    transfer: FileTransfer,
    onCancel: (String) -> Unit,
    onRetry: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = transfer.fileName,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = formatFileSize(transfer.fileSize),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                when (transfer.status) {
                    TransferStatus.TRANSFERRING -> {
                        IconButton(onClick = { onCancel(transfer.id) }) {
                            Icon(Icons.Default.Close, "Cancel")
                        }
                    }

                    TransferStatus.FAILED -> {
                        TextButton(onClick = { onRetry(transfer.id) }) {
                            Text("Retry")
                        }
                    }

                    TransferStatus.COMPLETED -> {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = "Completed",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }

                    else -> {}
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            when (transfer.status) {
                TransferStatus.TRANSFERRING -> {
                    LinearProgressIndicator(
                        progress = transfer.progress,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "${(transfer.progress * 100).toInt()}%",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            text = "${formatSpeed(transfer.speed)}/s",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                TransferStatus.PENDING -> {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                TransferStatus.FAILED -> {
                    Text(
                        text = "Transfer failed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                TransferStatus.CANCELLED -> {
                    Text(
                        text = "Cancelled",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                else -> {}
            }
        }
    }
}

@Composable
fun FileTransferProgressList(
    transfers: List<FileTransfer>,
    onCancel: (String) -> Unit,
    onRetry: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = "File Transfers",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(16.dp),
        )

        if (transfers.isEmpty()) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "No active transfers",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            transfers.forEach { transfer ->
                FileTransferProgressItem(
                    transfer = transfer,
                    onCancel = onCancel,
                    onRetry = onRetry,
                )
            }
        }
    }
}

private fun formatFileSize(bytes: Long): String =
    when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        bytes < 1024 * 1024 * 1024 -> "${bytes / (1024 * 1024)} MB"
        else -> "${bytes / (1024 * 1024 * 1024)} GB"
    }

private fun formatSpeed(bytesPerSecond: Long): String = formatFileSize(bytesPerSecond)
