package com.sovereign.communications.data.backup

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

/**
 * Manages database backup and restore operations
 * Task 61: Add database backup/restore
 */
class DatabaseBackupManager(private val context: Context) {
    
    private val tag = "DatabaseBackup"
    private val databaseName = "sovereign_communications_db"
    
    /**
     * Create a backup of the database
     * @param encryptBackup Whether to encrypt the backup file
     * @return File pointing to the backup, or null if failed
     */
    suspend fun createBackup(encryptBackup: Boolean = true): File? = withContext(Dispatchers.IO) {
        try {
            // Close database connections before backup
            context.getDatabasePath(databaseName)?.let { dbFile ->
                if (!dbFile.exists()) {
                    Log.e(tag, "Database file does not exist")
                    return@withContext null
                }
                
                val backupDir = File(context.filesDir, "backups")
                if (!backupDir.exists()) {
                    backupDir.mkdirs()
                }
                
                val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
                val backupFile = File(backupDir, "sc_backup_$timestamp.db")
                
                // Copy database file
                FileInputStream(dbFile).use { input ->
                    FileOutputStream(backupFile).use { output ->
                        input.copyTo(output)
                    }
                }
                
                // TODO: Encrypt backup file if requested
                // if (encryptBackup) {
                //     encryptFile(backupFile)
                // }
                
                Log.i(tag, "Database backup created: ${backupFile.absolutePath}")
                backupFile
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to create backup", e)
            null
        }
    }
    
    /**
     * Restore database from backup file
     * @param backupFile The backup file to restore from
     * @return True if restore was successful
     */
    suspend fun restoreBackup(backupFile: File): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!backupFile.exists()) {
                Log.e(tag, "Backup file does not exist: ${backupFile.absolutePath}")
                return@withContext false
            }
            
            // TODO: Decrypt backup if encrypted
            // if (isEncrypted(backupFile)) {
            //     decryptFile(backupFile)
            // }
            
            val dbFile = context.getDatabasePath(databaseName)
            
            // Close database before restore
            // This should be done by the caller
            
            // Copy backup to database location
            FileInputStream(backupFile).use { input ->
                FileOutputStream(dbFile).use { output ->
                    input.copyTo(output)
                }
            }
            
            Log.i(tag, "Database restored from: ${backupFile.absolutePath}")
            true
        } catch (e: Exception) {
            Log.e(tag, "Failed to restore backup", e)
            false
        }
    }
    
    /**
     * List all available backups
     * @return List of backup files sorted by date (newest first)
     */
    fun listBackups(): List<File> {
        val backupDir = File(context.filesDir, "backups")
        if (!backupDir.exists()) {
            return emptyList()
        }
        
        return backupDir.listFiles { file ->
            file.name.startsWith("sc_backup_") && file.name.endsWith(".db")
        }?.sortedByDescending { it.lastModified() } ?: emptyList()
    }
    
    /**
     * Delete a backup file
     * @param backupFile The backup file to delete
     * @return True if deletion was successful
     */
    fun deleteBackup(backupFile: File): Boolean {
        return try {
            backupFile.delete()
        } catch (e: Exception) {
            Log.e(tag, "Failed to delete backup", e)
            false
        }
    }
    
    /**
     * Delete old backups, keeping only the most recent N backups
     * @param keepCount Number of backups to keep
     */
    fun cleanOldBackups(keepCount: Int = 5) {
        val backups = listBackups()
        backups.drop(keepCount).forEach { backup ->
            deleteBackup(backup)
            Log.i(tag, "Deleted old backup: ${backup.name}")
        }
    }
}
