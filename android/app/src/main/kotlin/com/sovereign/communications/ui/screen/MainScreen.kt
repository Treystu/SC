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
fun MainScreen() {
    var selectedTab by remember { mutableStateOf(0) }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sovereign Communications") },
                actions = {
                    ConnectionStatusBadge()
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Message, "Conversations") },
                    label = { Text("Chats") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.People, "Contacts") },
                    label = { Text("Contacts") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Settings, "Settings") },
                    label = { Text("Settings") }
                )
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            when (selectedTab) {
                0 -> ConversationListScreen()
                1 -> ContactListScreen()
                2 -> SettingsScreen()
            }
        }
    }
}
