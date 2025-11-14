package com.sovereign.communications.media

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Efficient file handling with caching
 * Task 86: Implement efficient file handling
 */
class FileManager(private val context: Context) {
    
    companion object {
        private const val FILES_DIR = "files"
        private const val CACHE_DIR = "file_cache"
        private const val MAX_CACHE_SIZE_MB = 100L
        private const val CACHE_EXPIRY_DAYS = 7L
    }
    
    /**
     * Save a file from URI to app storage
     * @return Saved file or null if failed
     */
    suspend fun saveFile(uri: Uri, fileName: String? = null): File? = withContext(Dispatchers.IO) {
        try {
            val inputStream = context.contentResolver.openInputStream(uri) ?: return@withContext null
            
            val finalFileName = fileName ?: getFileNameFromUri(uri) ?: "file_${System.currentTimeMillis()}"
            val outputFile = File(getFilesDirectory(), finalFileName)
            
            FileOutputStream(outputFile).use { outputStream ->
                inputStream.copyTo(outputStream)
            }
            inputStream.close()
            
            outputFile
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Get file name from URI
     */
    private fun getFileNameFromUri(uri: Uri): String? {
        var fileName: String? = null
        
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) {
                    fileName = cursor.getString(nameIndex)
                }
            }
        }
        
        return fileName
    }
    
    /**
     * Get file size from URI
     */
    fun getFileSizeFromUri(uri: Uri): Long {
        var size = 0L
        
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (sizeIndex >= 0) {
                    size = cursor.getLong(sizeIndex)
                }
            }
        }
        
        return size
    }
    
    /**
     * Get MIME type from URI
     */
    fun getMimeTypeFromUri(uri: Uri): String? {
        return context.contentResolver.getType(uri)
    }
    
    /**
     * Get MIME type from file extension
     */
    fun getMimeTypeFromExtension(fileName: String): String? {
        val extension = fileName.substringAfterLast('.', "")
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase())
    }
    
    /**
     * Get file extension from MIME type
     */
    fun getExtensionFromMimeType(mimeType: String): String? {
        return MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
    }
    
    /**
     * Cache a file temporarily
     * @return Cached file
     */
    suspend fun cacheFile(uri: Uri): File? = withContext(Dispatchers.IO) {
        try {
            val inputStream = context.contentResolver.openInputStream(uri) ?: return@withContext null
            
            val fileName = getFileNameFromUri(uri) ?: "cached_${System.currentTimeMillis()}"
            val cacheFile = File(getCacheDirectory(), fileName)
            
            FileOutputStream(cacheFile).use { outputStream ->
                inputStream.copyTo(outputStream)
            }
            inputStream.close()
            
            // Clean cache if needed
            cleanCacheIfNeeded()
            
            cacheFile
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Delete a file
     */
    fun deleteFile(file: File): Boolean {
        return try {
            file.delete()
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Get files directory
     */
    private fun getFilesDirectory(): File {
        val dir = File(context.filesDir, FILES_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }
    
    /**
     * Get cache directory
     */
    private fun getCacheDirectory(): File {
        val dir = File(context.cacheDir, CACHE_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }
    
    /**
     * Get total cache size in bytes
     */
    fun getCacheSize(): Long {
        val cacheDir = getCacheDirectory()
        return calculateDirectorySize(cacheDir)
    }
    
    /**
     * Calculate directory size recursively
     */
    private fun calculateDirectorySize(directory: File): Long {
        var size = 0L
        
        directory.listFiles()?.forEach { file ->
            size += if (file.isDirectory) {
                calculateDirectorySize(file)
            } else {
                file.length()
            }
        }
        
        return size
    }
    
    /**
     * Clean cache if it exceeds size limit
     */
    private fun cleanCacheIfNeeded() {
        val cacheDir = getCacheDirectory()
        val maxCacheSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024
        val currentSize = calculateDirectorySize(cacheDir)
        
        if (currentSize > maxCacheSizeBytes) {
            cleanCacheByAge()
        }
    }
    
    /**
     * Clean cache by deleting oldest files first
     */
    fun cleanCacheByAge() {
        val cacheDir = getCacheDirectory()
        val expiryTime = System.currentTimeMillis() - (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
        
        cacheDir.listFiles()?.forEach { file ->
            if (file.lastModified() < expiryTime) {
                file.delete()
            }
        }
    }
    
    /**
     * Clear all cached files
     */
    fun clearCache() {
        val cacheDir = getCacheDirectory()
        cacheDir.listFiles()?.forEach { file ->
            file.delete()
        }
    }
    
    /**
     * Format file size for display
     */
    fun formatFileSize(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${bytes / 1024} KB"
            bytes < 1024 * 1024 * 1024 -> "${bytes / (1024 * 1024)} MB"
            else -> "${bytes / (1024 * 1024 * 1024)} GB"
        }
    }
}
