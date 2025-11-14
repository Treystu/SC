package com.sovereign.communications.data

import android.content.Context
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
        private const val DATABASE_NAME = "sovereign_communications_db"
        
        @Volatile
        private var INSTANCE: SCDatabase? = null
        
        /**
         * Get database instance with proper configuration
         * @param context Application context
         * @param enableEncryption Whether to enable database encryption (requires SQLCipher)
         */
        fun getDatabase(
            context: Context,
            enableEncryption: Boolean = false
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
                    
                // TODO: Add SQLCipher support when available
                // if (enableEncryption) {
                //     val passphrase = getOrCreateDatabasePassphrase(context)
                //     builder.openHelperFactory(SupportFactory(passphrase))
                // }
                
                val instance = builder.build()
                INSTANCE = instance
                instance
            }
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
