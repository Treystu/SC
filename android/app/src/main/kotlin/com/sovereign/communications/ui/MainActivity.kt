package com.sovereign.communications.ui

import android.content.Context
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
import com.sovereign.communications.ui.screen.OnboardingScreen
import com.sovereign.communications.ui.theme.SCTheme

/**
 * Main activity with proper permission handling and lifecycle management
 * Tasks 73-74: Create main activity with proper architecture
 */
class MainActivity : ComponentActivity() {
    private var inviteCode by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize managers
        permissionManager = PermissionManager(this)
        notificationManager = NotificationManager(this)

        // Create notification channels
        notificationManager.createNotificationChannels()

        // Request required permissions
        requestPermissions()

        // Handle deep link if present
        handleIntent(intent)

        setContent {
            SCTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppContent()
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: android.content.Intent) {
        if (intent.action == android.content.Intent.ACTION_VIEW) {
            val data = intent.data
            if (data != null) {
                // Check for "code" parameter in query (invite code)
                val code = data.getQueryParameter("code")
                if (code != null) {
                    inviteCode = code
                }
                
                // Check for "bootstrap" parameter (peer list from webapp)
                val bootstrap = data.getQueryParameter("bootstrap")
                if (bootstrap != null) {
                    handleBootstrapPeers(bootstrap)
                }
                
                // Check for "inviter" parameter
                val inviter = data.getQueryParameter("inviter")
                if (inviter != null) {
                    // Store inviter name for display
                    getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                        .edit()
                        .putString("pending_inviter", inviter)
                        .apply()
                }
            }
        }
    }
    
    private fun handleBootstrapPeers(encodedData: String) {
        try {
            // Decode base64url
            var base64 = encodedData.replace('-', '+').replace('_', '/')
            val padding = (4 - (base64.length % 4)) % 4
            base64 += "=".repeat(padding)
            
            val json = String(android.util.Base64.decode(base64, android.util.Base64.DEFAULT))
            val data = org.json.JSONObject(json)
            
            // Store bootstrap peers for auto-connect
            getSharedPreferences("mesh_bootstrap", Context.MODE_PRIVATE)
                .edit()
                .putString("bootstrap_peers", json)
                .putLong("bootstrap_timestamp", System.currentTimeMillis())
                .apply()
            
            android.util.Log.d("MainActivity", "Stored bootstrap peers for auto-connect")
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Failed to decode bootstrap peers", e)
        }
    }

    @Composable
    fun AppContent() {
        val prefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
        var showOnboarding by remember {
            mutableStateOf(!prefs.getBoolean("onboarding_complete", false))
        }

        if (showOnboarding) {
            OnboardingScreen(
                localPeerId = com.sovereign.communications.SCApplication.instance.localPeerId ?: "unknown",
                onComplete = {
                    prefs.edit().putBoolean("onboarding_complete", true).apply()
                    showOnboarding = false
                },
            )
        } else {
            MainScreen(
                initialInviteCode = inviteCode,
                onInviteHandled = { inviteCode = null },
            )
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
        androidx.appcompat.app.AlertDialog
            .Builder(this)
            .setTitle("Permissions Required")
            .setMessage(
                """
                Sovereign Communications needs the following permissions to enable secure mesh networking:
                
                📡 Bluetooth: Required to discover and connect to nearby devices for peer-to-peer messaging without internet.
                
                📍 Location: Android requires location permission for Bluetooth scanning (we don't track your location).
                
                🔔 Notifications: Alerts you when you receive new messages while the app is in the background.
                
                All permissions are essential for secure, offline mesh communication.
                """.trimIndent(),
            ).setPositiveButton("Grant Permissions") { _, _ ->
                permissionManager.requestAllPermissions(this)
            }.setNegativeButton("Cancel") { dialog, _ ->
                dialog.dismiss()
            }.setCancelable(false)
            .show()
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
