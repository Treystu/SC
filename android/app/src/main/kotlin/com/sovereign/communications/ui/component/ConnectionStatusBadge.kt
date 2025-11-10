package com.sovereign.communications.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Connection status indicator badge
 */
@Composable
fun ConnectionStatusBadge() {
    var isConnected by remember { mutableStateOf(false) }
    var peerCount by remember { mutableStateOf(0) }
    
    Row(
        modifier = Modifier.padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(
                    color = if (isConnected) Color.Green else Color.Red,
                    shape = CircleShape
                )
        )
        Text(
            text = if (isConnected) "Connected ($peerCount)" else "Offline",
            style = MaterialTheme.typography.bodySmall
        )
    }
}
