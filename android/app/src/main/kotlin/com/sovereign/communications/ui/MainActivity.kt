package com.sovereign.communications.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.sovereign.communications.service.MeshNetworkService
import com.sovereign.communications.ui.screen.MainScreen
import com.sovereign.communications.ui.theme.SCTheme

/**
 * Main activity for Sovereign Communications
 * Task 73: Create main activity with navigation
 */
class MainActivity : ComponentActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Start mesh network service
        MeshNetworkService.start(this)
        
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
    
    override fun onDestroy() {
        super.onDestroy()
        // Service will continue running in background
    }
}
