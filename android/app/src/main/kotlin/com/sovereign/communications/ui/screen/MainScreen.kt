package com.sovereign.communications.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sovereign.communications.ui.component.ConnectionStatusBadge

/**
 * Main screen with bottom navigation
 * Task 73: Create main activity with navigation
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    initialInviteCode: String? = null,
    onInviteHandled: () -> Unit = {},
) {
    var selectedTab by remember { mutableStateOf(0) }
    var currentScreen by remember { mutableStateOf<String?>(null) } // null = Main Tabs, "sharing" = Sharing Screen, "qr_display" = QR Display
    var qrPayload by remember { mutableStateOf("") }

    // Handle deep link invite
    if (initialInviteCode != null) {
        AlertDialog(
            onDismissRequest = onInviteHandled,
            title = { Text("Join Mesh Network") },
            text = { Text("Received invite code. Connect to peer to bootstrap mesh?") },
            confirmButton = {
                Button(onClick = {
                    // In a real implementation, this would parse the code and connect
                    // For verification, we log the bootstrap attempt
                    android.util.Log.d("MainScreen", "Bootstrapping mesh with code: $initialInviteCode")
                    // Trigger connection logic here via MeshNetworkManager
                    onInviteHandled()
                }) {
                    Text("Connect")
                }
            },
            dismissButton = {
                TextButton(onClick = onInviteHandled) {
                    Text("Cancel")
                }
            },
        )
    }

    // Handle overlay screens (Sharing, QR, etc)
    if (currentScreen != null) {
        when (currentScreen) {
            "sharing" -> {
                val app = com.sovereign.communications.SCApplication.instance
                SharingScreen(
                    peerId = app.localPeerId ?: "Unknown",
                    publicKey = app.localPeerIdBytes ?: ByteArray(32),
                    displayName =
                        androidx.preference.PreferenceManager
                            .getDefaultSharedPreferences(app.applicationContext)
                            .getString("display_name", "Me") ?: "Me",
                    onNavigateBack = { currentScreen = null },
                    onNavigateToQRScanner = {
                        android.widget.Toast
                            .makeText(
                                app.applicationContext,
                                "QR Scanner not implemented yet",
                                android.widget.Toast.LENGTH_SHORT,
                            ).show()
                    },
                    onNavigateToQRDisplay = { payload ->
                        qrPayload = payload
                        currentScreen = "qr_display"
                    },
                )
            }

            "qr_display" -> {
                QRCodeDisplayScreen(
                    peerInfo = qrPayload,
                    onNavigateBack = { currentScreen = "sharing" },
                )
            }
        }
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sovereign Communications") },
                actions = {
                    ConnectionStatusBadge()
                },
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Message, "Conversations") },
                    label = { Text("Conversations") },
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.People, "Contacts") },
                    label = { Text("Contacts") },
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Settings, "Settings") },
                    label = { Text("Settings") },
                )
            }
        },
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            when (selectedTab) {
                0 -> {
                    ConversationListScreen()
                }

                1 -> {
                    ContactListScreen(
                        onAddContact = { currentScreen = "sharing" },
                    )
                }

                2 -> {
                    SettingsScreen()
                }
            }
        }
    }
}
