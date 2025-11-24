package com.sovereign.communications.sharing

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.sovereign.communications.sharing.models.Invite
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * APKExtractor - Handles APK extraction and sharing
 * Allows sharing the SC app APK file directly with embedded invite data
 */
class APKExtractor(private val context: Context) {
    
    companion object {
        private const val TAG = "APKExtractor"
        private const val APK_CACHE_NAME = "SC.apk"
    }
    
    /**
     * Get URI for the installed APK file
     * Uses FileProvider for secure file access
     */
    fun getAPKUri(): Uri {
        val apkFile = File(context.applicationInfo.sourceDir)
        val cacheDir = context.externalCacheDir ?: context.cacheDir
        val outputFile = File(cacheDir, APK_CACHE_NAME)
        
        // Copy APK to cache directory for sharing
        apkFile.copyTo(outputFile, overwrite = true)
        
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            outputFile
        )
    }
    
    /**
     * Get cached APK URI if the file already exists, otherwise extract and cache it
     * This avoids repeated file copy operations
     */
    fun getCachedAPKUri(): Uri {
        val cacheDir = context.externalCacheDir ?: context.cacheDir
        val outputFile = File(cacheDir, APK_CACHE_NAME)
        
        // Only copy if the cached file doesn't exist
        if (!outputFile.exists()) {
            val apkFile = File(context.applicationInfo.sourceDir)
            apkFile.copyTo(outputFile, overwrite = false)
        }
        
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            outputFile
        )
    }
    
    /**
     * Create a shareable APK with embedded invite data
     * Note: This creates a modified APK which will have a different signature
     * For production, consider alternative methods like embedding data in assets
     */
    fun createShareableAPK(invite: Invite): File {
        val apkFile = File(context.applicationInfo.sourceDir)
        val cacheDir = context.externalCacheDir ?: context.cacheDir
        val outputDir = File(cacheDir, "share")
        outputDir.mkdirs()
        
        val outputFile = File(outputDir, "SC-${invite.code.take(6)}.apk")
        
        try {
            // For simplicity, just copy the APK
            // Embedding data would require APK signing which is complex
            apkFile.copyTo(outputFile, overwrite = true)
            
            // Optionally create a companion invite file
            createInviteFile(outputDir, invite)
            
        } catch (e: Exception) {
            e.printStackTrace()
            throw Exception("Failed to create shareable APK: ${e.message}")
        }
        
        return outputFile
    }
    
    /**
     * Create a companion invite JSON file to accompany the APK
     */
    private fun createInviteFile(directory: File, invite: Invite) {
        val inviteFile = File(directory, "invite.json")
        val json = Json.encodeToString(invite)
        inviteFile.writeText(json)
    }
    
    /**
     * Extract invite data from a companion file
     * Used when receiving a shared APK with invite data
     */
    fun extractInviteFromFile(directory: File): Invite? {
        val inviteFile = File(directory, "invite.json")
        if (!inviteFile.exists()) {
            return null
        }
        
        return try {
            val json = inviteFile.readText()
            Json.decodeFromString<Invite>(json)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
    
    /**
     * Get the size of the APK file in bytes
     */
    fun getAPKSize(): Long {
        val apkFile = File(context.applicationInfo.sourceDir)
        return apkFile.length()
    }
    
    /**
     * Get the size of the APK file in human-readable format
     */
    fun getAPKSizeFormatted(): String {
        val bytes = getAPKSize()
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${bytes / 1024} KB"
            else -> String.format("%.2f MB", bytes / (1024.0 * 1024.0))
        }
    }
    
    /**
     * Clean up cached APK files
     */
    fun cleanupCache() {
        val cacheDir = context.externalCacheDir ?: context.cacheDir
        val apkFile = File(cacheDir, APK_CACHE_NAME)
        val shareDir = File(cacheDir, "share")
        
        apkFile.delete()
        shareDir.deleteRecursively()
    }
    
    /**
     * Check if APK extraction is available
     * Some devices may restrict access to the APK file
     */
    fun isAPKExtractionAvailable(): Boolean {
        return try {
            val apkFile = File(context.applicationInfo.sourceDir)
            apkFile.exists() && apkFile.canRead()
        } catch (e: Exception) {
            false
        }
    }
}
