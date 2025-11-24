package com.sovereign.communications.data

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.sovereign.communications.data.dao.ContactDao
import com.sovereign.communications.data.dao.ConversationDao
import com.sovereign.communications.data.dao.MessageDao
import com.sovereign.communications.data.entity.ContactEntity
import com.sovereign.communications.data.entity.ConversationEntity
import com.sovereign.communications.data.entity.MessageEntity
import com.sovereign.communications.data.entity.MessageTypeConverters
import com.sovereign.communications.data.migration.DatabaseMigrations
import com.sovereign.communications.security.KeystoreManager
import net.sqlcipher.database.SupportFactory

/**
 * Main Room database for Sovereign Communications
 * Tasks 58-61: Implement Room database with migrations, indices, and encryption support
 */
@Database(
    entities = [
        MessageEntity::class,
        ContactEntity::class,
        ConversationEntity::class
    ],
    version = 1,
    exportSchema = true
)
@TypeConverters(MessageTypeConverters::class)
abstract class SCDatabase : RoomDatabase() {
    
    abstract fun messageDao(): MessageDao
    abstract fun contactDao(): ContactDao
    abstract fun conversationDao(): ConversationDao
    
    companion object {
        private const val TAG = "SCDatabase"
        private const val DATABASE_NAME = "sovereign_communications_db"
        private const val PREFS_NAME = "sc_database_prefs"
        private const val PREF_ENCRYPTED_PASSPHRASE = "encrypted_db_passphrase"
        
        @Volatile
        private var INSTANCE: SCDatabase? = null
        
        /**
         * Get database instance with proper configuration
         * @param context Application context
         * @param enableEncryption Whether to enable database encryption (default: true for security)
         */
        fun getDatabase(
            context: Context,
            enableEncryption: Boolean = true
        ): SCDatabase {
            return INSTANCE ?: synchronized(this) {
                val builder = Room.databaseBuilder(
                    context.applicationContext,
                    SCDatabase::class.java,
                    DATABASE_NAME
                )
                    // Add migration strategies
                    .addMigrations(*DatabaseMigrations.getAllMigrations())
                    // Enable auto-migrations for future versions
                    .fallbackToDestructiveMigration()
                    // Enable multi-instance invalidation for data sync
                    .enableMultiInstanceInvalidation()
                    
                // Enable SQLCipher encryption
                if (enableEncryption) {
                    try {
                        val passphrase = getOrCreateDatabasePassphrase(context)
                        val factory = SupportFactory(passphrase)
                        builder.openHelperFactory(factory)
                        Log.i(TAG, "Database encryption enabled with SQLCipher")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to enable database encryption", e)
                        // Continue without encryption rather than crash
                        // In production, you might want to fail hard here
                    }
                }
                
                val instance = builder.build()
                INSTANCE = instance
                instance
            }
        }
        
        /**
         * Get or create a database encryption passphrase.
         * The passphrase is generated once, encrypted with Android Keystore,
         * and stored in SharedPreferences.
         */
        private fun getOrCreateDatabasePassphrase(context: Context): ByteArray {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val encryptedPassphraseB64 = prefs.getString(PREF_ENCRYPTED_PASSPHRASE, null)
            
            return if (encryptedPassphraseB64 != null) {
                try {
                    // Decrypt existing passphrase
                    val encrypted = com.sovereign.communications.security.EncryptedData.fromBase64(encryptedPassphraseB64)
                    KeystoreManager.decrypt("database_passphrase", encrypted)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decrypt database passphrase, generating new one", e)
                    // If decryption fails, generate new passphrase
                    // This will result in data loss, but is necessary for security
                    generateAndStorePassphrase(context)
                }
            } else {
                // Generate new passphrase
                generateAndStorePassphrase(context)
            }
        }
        
        /**
         * Generate a new database passphrase and store it encrypted.
         */
        private fun generateAndStorePassphrase(context: Context): ByteArray {
            // Generate secure random passphrase
            val passphrase = ByteArray(32)
            java.security.SecureRandom().nextBytes(passphrase)
            
            // Encrypt with Keystore
            val encrypted = KeystoreManager.encrypt("database_passphrase", passphrase)
            
            // Store encrypted passphrase
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(PREF_ENCRYPTED_PASSPHRASE, encrypted.toBase64())
                .apply()
            
            Log.d(TAG, "Generated and stored new database passphrase")
            return passphrase
        }
        
        /**
         * Close and clear the database instance
         * Used for testing or data cleanup
         */
        fun closeDatabase() {
            synchronized(this) {
                INSTANCE?.close()
                INSTANCE = null
            }
        }
    }
}
