package com.sovereign.communications.permissions

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * Manages runtime permissions with proper request flow
 * Tasks 67-68: Implement runtime permission handling
 */
class PermissionManager(private val activity: ComponentActivity) {
    
    private var permissionLauncher: ActivityResultLauncher<Array<String>>? = null
    private var permissionCallback: ((Map<String, Boolean>) -> Unit)? = null
    
    init {
        setupPermissionLauncher()
    }
    
    private fun setupPermissionLauncher() {
        permissionLauncher = activity.registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->
            permissionCallback?.invoke(permissions)
            permissionCallback = null
        }
    }
    
    /**
     * Check if all required permissions are granted
     */
    fun hasRequiredPermissions(): Boolean {
        return REQUIRED_PERMISSIONS.all { permission ->
            checkPermission(permission)
        }
    }
    
    /**
     * Request all required permissions
     */
    fun requestRequiredPermissions(callback: (Boolean) -> Unit) {
        val permissions = REQUIRED_PERMISSIONS.filter { permission ->
            !checkPermission(permission)
        }.toTypedArray()
        
        if (permissions.isEmpty()) {
            callback(true)
            return
        }
        
        permissionCallback = { results ->
            val allGranted = results.values.all { it }
            callback(allGranted)
        }
        
        permissionLauncher?.launch(permissions)
    }
    
    /**
     * Request specific permission group
     */
    fun requestPermissions(
        permissions: Array<String>,
        callback: (Map<String, Boolean>) -> Unit
    ) {
        val ungrantedPermissions = permissions.filter { permission ->
            !checkPermission(permission)
        }.toTypedArray()
        
        if (ungrantedPermissions.isEmpty()) {
            callback(permissions.associateWith { true })
            return
        }
        
        permissionCallback = callback
        permissionLauncher?.launch(ungrantedPermissions)
    }
    
    /**
     * Check if a specific permission is granted
     */
    private fun checkPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(
            activity,
            permission
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    /**
     * Check if Bluetooth permissions are granted
     */
    fun hasBluetoothPermissions(): Boolean {
        return BLUETOOTH_PERMISSIONS.all { checkPermission(it) }
    }
    
    /**
     * Request Bluetooth permissions
     */
    fun requestBluetoothPermissions(callback: (Boolean) -> Unit) {
        requestPermissions(BLUETOOTH_PERMISSIONS) { results ->
            callback(results.values.all { it })
        }
    }
    
    /**
     * Check if location permissions are granted (required for BLE)
     */
    fun hasLocationPermissions(): Boolean {
        return LOCATION_PERMISSIONS.all { checkPermission(it) }
    }
    
    /**
     * Request location permissions
     */
    fun requestLocationPermissions(callback: (Boolean) -> Unit) {
        requestPermissions(LOCATION_PERMISSIONS) { results ->
            callback(results.values.all { it })
        }
    }
    
    /**
     * Check if notification permissions are granted (Android 13+)
     */
    fun hasNotificationPermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            checkPermission(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            true // Not required on older Android versions
        }
    }
    
    /**
     * Request notification permissions
     */
    fun requestNotificationPermissions(callback: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { results ->
                callback(results.values.all { it })
            }
        } else {
            callback(true)
        }
    }
    
    /**
     * Check if camera permissions are granted
     */
    fun hasCameraPermissions(): Boolean {
        return checkPermission(Manifest.permission.CAMERA)
    }
    
    /**
     * Request camera permissions (for QR codes)
     */
    fun requestCameraPermissions(callback: (Boolean) -> Unit) {
        requestPermissions(arrayOf(Manifest.permission.CAMERA)) { results ->
            callback(results.values.all { it })
        }
    }
    
    /**
     * Check if audio recording permissions are granted
     */
    fun hasAudioPermissions(): Boolean {
        return checkPermission(Manifest.permission.RECORD_AUDIO)
    }
    
    /**
     * Request audio recording permissions (for voice messages)
     */
    fun requestAudioPermissions(callback: (Boolean) -> Unit) {
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO)) { results ->
            callback(results.values.all { it })
        }
    }
    
    companion object {
        /**
         * Required permissions for basic app functionality
         */
        private val REQUIRED_PERMISSIONS = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(
                Manifest.permission.POST_NOTIFICATIONS,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.ACCESS_FINE_LOCATION
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.ACCESS_FINE_LOCATION
            )
        } else {
            arrayOf(
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION
            )
        }
        
        /**
         * Bluetooth-specific permissions
         */
        private val BLUETOOTH_PERMISSIONS = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE
            )
        } else {
            arrayOf(
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN
            )
        }
        
        /**
         * Location permissions (required for BLE scanning)
         */
        private val LOCATION_PERMISSIONS = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    }
}
