package com.sovereign.communications.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.text.DecimalFormat

/**
 * File Transfer Progress Screen (Task 87)
 *
 * Displays active and completed file transfers with progress bars,
 * speed indicators, and pause/resume/cancel controls.
 */

data class FileTransferItem(
    val id: String,
    val fileName: String,
    val fileSize: Long,
    val transferredBytes: Long,
    val status: TransferStatus,
    val speed: Long, // bytes per second
    val peerId: String,
    val direction: TransferDirection,
)

enum class TransferStatus {
    PENDING,
    ACTIVE,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED,
}

enum class TransferDirection {
    UPLOAD,
    DOWNLOAD,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileTransferProgressScreen(onNavigateBack: () -> Unit) {
    val transfers =
        remember {
            mutableStateListOf(
                FileTransferItem(
                    id = "1",
                    fileName = "document.pdf",
                    fileSize = 5_242_880, // 5 MB
                    transferredBytes = 2_621_440,
                    status = TransferStatus.ACTIVE,
                    speed = 524_288, // 512 KB/s
                    peerId = "peer123",
                    direction = TransferDirection.DOWNLOAD,
                ),
                FileTransferItem(
                    id = "2",
                    fileName = "photo.jpg",
                    fileSize = 2_097_152, // 2 MB
                    transferredBytes = 2_097_152,
                    status = TransferStatus.COMPLETED,
                    speed = 0,
                    peerId = "peer456",
                    direction = TransferDirection.UPLOAD,
                ),
            )
        }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("File Transfers") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(transfers) { transfer ->
                FileTransferCard(
                    transfer = transfer,
                    onPause = { /* Handle pause */ },
                    onResume = { /* Handle resume */ },
                    onCancel = { /* Handle cancel */ },
                )
            }

            if (transfers.isEmpty()) {
                item {
                    Box(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "No active transfers",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun FileTransferCard(
    transfer: FileTransferItem,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onCancel: () -> Unit,
) {
    val progress = transfer.transferredBytes.toFloat() / transfer.fileSize.toFloat()

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // File info
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector =
                            if (transfer.direction == TransferDirection.DOWNLOAD) {
                                Icons.Default.Download
                            } else {
                                Icons.Default.Upload
                            },
                        contentDescription = transfer.direction.name,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Column {
                        Text(
                            text = transfer.fileName,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            text = "${formatFileSize(transfer.transferredBytes)} / ${formatFileSize(transfer.fileSize)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                StatusChip(status = transfer.status)
            }

            // Progress bar
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                LinearProgressIndicator(
                    progress = progress,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(8.dp),
                    color =
                        when (transfer.status) {
                            TransferStatus.COMPLETED -> MaterialTheme.colorScheme.primary
                            TransferStatus.FAILED -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.primary
                        },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "${(progress * 100).toInt()}%",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (transfer.status == TransferStatus.ACTIVE) {
                        Text(
                            text = "${formatFileSize(transfer.speed)}/s",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Controls
            if (transfer.status == TransferStatus.ACTIVE || transfer.status == TransferStatus.PAUSED) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    if (transfer.status == TransferStatus.ACTIVE) {
                        TextButton(onClick = onPause) {
                            Icon(Icons.Default.Pause, "Pause")
                            Spacer(Modifier.width(4.dp))
                            Text("Pause")
                        }
                    } else {
                        TextButton(onClick = onResume) {
                            Icon(Icons.Default.PlayArrow, "Resume")
                            Spacer(Modifier.width(4.dp))
                            Text("Resume")
                        }
                    }
                    TextButton(onClick = onCancel) {
                        Icon(Icons.Default.Close, "Cancel")
                        Spacer(Modifier.width(4.dp))
                        Text("Cancel")
                    }
                }
            }
        }
    }
}

@Composable
fun StatusChip(status: TransferStatus) {
    val (text, color) =
        when (status) {
            TransferStatus.PENDING -> "Pending" to MaterialTheme.colorScheme.tertiary
            TransferStatus.ACTIVE -> "Active" to MaterialTheme.colorScheme.primary
            TransferStatus.PAUSED -> "Paused" to MaterialTheme.colorScheme.secondary
            TransferStatus.COMPLETED -> "Complete" to MaterialTheme.colorScheme.primary
            TransferStatus.FAILED -> "Failed" to MaterialTheme.colorScheme.error
            TransferStatus.CANCELLED -> "Cancelled" to MaterialTheme.colorScheme.onSurfaceVariant
        }

    Surface(
        color = color.copy(alpha = 0.1f),
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

fun formatFileSize(bytes: Long): String {
    val df = DecimalFormat("#.##")
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${df.format(bytes / 1024.0)} KB"
        bytes < 1024 * 1024 * 1024 -> "${df.format(bytes / (1024.0 * 1024.0))} MB"
        else -> "${df.format(bytes / (1024.0 * 1024.0 * 1024.0))} GB"
    }
}
