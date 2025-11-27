package com.sovereign.communications.data.backup

import android.content.Context
import android.util.Log
import com.sovereign.communications.security.KeystoreManager
import com.sovereign.communications.security.EncryptedData
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
    private val backupKeyAlias = "backup_encryption_key"
    
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
                
                // Encrypt backup file if requested
                if (encryptBackup) {
                    val encryptedFile = encryptBackupFile(backupFile)
                    if (encryptedFile != null) {
                        // Delete unencrypted backup
                        backupFile.delete()
                        Log.i(tag, "Encrypted database backup created: ${encryptedFile.absolutePath}")
                        return@withContext encryptedFile
                    } else {
                        Log.w(tag, "Encryption failed, keeping unencrypted backup")
                    }
                }
                
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
            
            var fileToRestore = backupFile
            
            // Decrypt backup if encrypted
            if (isEncryptedBackup(backupFile)) {
                val decryptedFile = decryptBackupFile(backupFile)
                if (decryptedFile == null) {
                    Log.e(tag, "Failed to decrypt backup file")
                    return@withContext false
                }
                fileToRestore = decryptedFile
            }
            
            val dbFile = context.getDatabasePath(databaseName)
            
            // Close database before restore
            // This should be done by the caller
            
            // Copy backup to database location
            FileInputStream(fileToRestore).use { input ->
                FileOutputStream(dbFile).use { output ->
                    input.copyTo(output)
                }
            }
            
            // Clean up temporary decrypted file if we created one
            if (fileToRestore != backupFile) {
                fileToRestore.delete()
            }
            
            Log.i(tag, "Database restored from: ${backupFile.absolutePath}")
            true
        } catch (e: Exception) {
            Log.e(tag, "Failed to restore backup", e)
            false
        }
    }
    
    /**
     * Encrypt a backup file using Android Keystore.
     * @param backupFile The unencrypted backup file
     * @return The encrypted backup file, or null if encryption failed
     */
    private fun encryptBackupFile(backupFile: File): File? {
        return try {
            // Read the backup file
            val backupData = backupFile.readBytes()
            
            // Encrypt the data
            val encryptedData = KeystoreManager.encrypt(backupKeyAlias, backupData)
            
            // Create encrypted file with .enc extension
            val encryptedFile = File(backupFile.parent, "${backupFile.name}.enc")
            
            // Write encrypted data (IV + ciphertext) to file
            encryptedFile.writeBytes(encryptedData.toBase64().toByteArray())
            
            Log.d(tag, "Backup file encrypted successfully")
            encryptedFile
        } catch (e: Exception) {
            Log.e(tag, "Failed to encrypt backup file", e)
            null
        }
    }
    
    /**
     * Decrypt an encrypted backup file.
     * @param encryptedFile The encrypted backup file
     * @return A temporary decrypted file, or null if decryption failed
     */
    private fun decryptBackupFile(encryptedFile: File): File? {
        return try {
            // Read the encrypted data
            val encryptedBase64 = String(encryptedFile.readBytes())
            val encryptedData = EncryptedData.fromBase64(encryptedBase64)
            
            // Decrypt the data
            val decryptedData = KeystoreManager.decrypt(backupKeyAlias, encryptedData)
            
            // Create temporary decrypted file
            val tempFile = File(context.cacheDir, "temp_restore_${System.currentTimeMillis()}.db")
            tempFile.writeBytes(decryptedData)
            
            Log.d(tag, "Backup file decrypted successfully")
            tempFile
        } catch (e: Exception) {
            Log.e(tag, "Failed to decrypt backup file", e)
            null
        }
    }
    
    /**
     * Check if a backup file is encrypted.
     * @param backupFile The backup file to check
     * @return True if the file is encrypted
     */
    private fun isEncryptedBackup(backupFile: File): Boolean {
        return backupFile.name.endsWith(".enc")
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
            (file.name.startsWith("sc_backup_") && file.name.endsWith(".db")) ||
            (file.name.startsWith("sc_backup_") && file.name.endsWith(".db.enc"))
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
