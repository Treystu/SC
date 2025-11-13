package com.sovereign.communications.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.sovereign.communications.data.dao.ContactDao
import com.sovereign.communications.data.dao.ConversationDao
import com.sovereign.communications.data.dao.MessageDao
import com.sovereign.communications.data.entity.ContactEntity
import com.sovereign.communications.data.entity.ConversationEntity
import com.sovereign.communications.data.entity.MessageEntity

/**
 * Main Room database for Sovereign Communications
 * Task 58: Implement Room database for messages/contacts
 */
@Database(
    entities = [
        MessageEntity::class,
        ContactEntity::class,
        ConversationEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class SCDatabase : RoomDatabase() {
    
    abstract fun messageDao(): MessageDao
    abstract fun contactDao(): ContactDao
    abstract fun conversationDao(): ConversationDao
    
    companion object {
        @Volatile
        private var INSTANCE: SCDatabase? = null
        
        fun getDatabase(context: Context): SCDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SCDatabase::class.java,
                    "sovereign_communications_db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
