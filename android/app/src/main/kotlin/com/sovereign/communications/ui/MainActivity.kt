package com.sovereign.communications.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.sovereign.communications.notifications.NotificationManager
import com.sovereign.communications.permissions.PermissionManager
import com.sovereign.communications.service.MeshNetworkService
import com.sovereign.communications.ui.screen.MainScreen
import com.sovereign.communications.ui.theme.SCTheme

/**
 * Main activity with proper permission handling and lifecycle management
 * Tasks 73-74: Create main activity with proper architecture
 */
class MainActivity : ComponentActivity() {
    
    private lateinit var permissionManager: PermissionManager
    private lateinit var notificationManager: NotificationManager
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize managers
        permissionManager = PermissionManager(this)
        notificationManager = NotificationManager(this)
        
        // Create notification channels
        notificationManager.createNotificationChannels()
        
        // Request required permissions
        requestPermissions()
        
        setContent {
            SCTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen()
                }
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        // Check if service is running, if not and permissions granted, start it
        if (permissionManager.hasRequiredPermissions()) {
            MeshNetworkService.start(this)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Service will continue running in background
        // Only stop service when user explicitly quits from settings
    }
    
    /**
     * Request required permissions on first launch
     */
    private fun requestPermissions() {
        if (!permissionManager.hasRequiredPermissions()) {
            permissionManager.requestRequiredPermissions { granted ->
                if (granted) {
                    // Start mesh network service
                    MeshNetworkService.start(this)
                } else {
                    // Show dialog explaining why permissions are needed
                    showPermissionRationaleDialog()
                }
            }
        }
    }
    
    /**
     * Show dialog explaining permission requirements
     */
    private fun showPermissionRationaleDialog() {
        // TODO: Implement permission rationale dialog
        // This should explain why each permission is needed for mesh networking
    }
    
    /**
     * Get permission manager instance
     */
    fun getPermissionManager(): PermissionManager = permissionManager
    
    /**
     * Get notification manager instance
     */
    fun getNotificationManager(): NotificationManager = notificationManager
}
