package com.sovereign.communications

import android.app.Application
import com.sovereign.communications.data.SCDatabase

/**
 * Application class for Sovereign Communications
 * Task 57: Set up Android project (Kotlin)
 */
class SCApplication : Application() {
    
    // Lazy initialization of database
    val database: SCDatabase by lazy {
        SCDatabase.getDatabase(this)
    }
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        
        // Initialize application-level components
        initializeServices()
    }
    
    private fun initializeServices() {
        // TODO: Initialize mesh network service
        // TODO: Initialize crypto components
        // TODO: Load identity from secure storage
    }
    
    companion object {
        lateinit var instance: SCApplication
            private set
    }
}
