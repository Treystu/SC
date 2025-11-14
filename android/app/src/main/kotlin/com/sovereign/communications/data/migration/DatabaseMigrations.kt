package com.sovereign.communications.data.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Database migration strategies for Room
 * Task 58: Implement proper database migration strategy
 */

object DatabaseMigrations {
    
    /**
     * Migration from version 1 to 2
     * Adds indices for performance and new columns for future features
     */
    val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(database: SupportSQLiteDatabase) {
            // Add indices for frequently queried columns
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS index_messages_conversationId_timestamp " +
                "ON messages(conversationId, timestamp DESC)"
            )
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS index_messages_status " +
                "ON messages(status)"
            )
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS index_messages_senderId " +
                "ON messages(senderId)"
            )
            
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS index_conversations_lastMessageTime " +
                "ON conversations(lastMessageTime DESC)"
            )
            
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS index_contacts_publicKey " +
                "ON contacts(publicKey)"
            )
            
            // Add columns for message metadata
            database.execSQL(
                "ALTER TABLE messages ADD COLUMN deliveredAt INTEGER"
            )
            database.execSQL(
                "ALTER TABLE messages ADD COLUMN readAt INTEGER"
            )
            database.execSQL(
                "ALTER TABLE messages ADD COLUMN editedAt INTEGER"
            )
            
            // Add columns for conversation metadata
            database.execSQL(
                "ALTER TABLE conversations ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0"
            )
            database.execSQL(
                "ALTER TABLE conversations ADD COLUMN isMuted INTEGER NOT NULL DEFAULT 0"
            )
        }
    }
    
    /**
     * Migration from version 2 to 3
     * Adds support for file attachments and media
     */
    val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(database: SupportSQLiteDatabase) {
            // Create attachments table
            database.execSQL(
                """
                CREATE TABLE IF NOT EXISTS attachments (
                    id TEXT PRIMARY KEY NOT NULL,
                    messageId TEXT NOT NULL,
                    fileName TEXT NOT NULL,
                    mimeType TEXT NOT NULL,
                    fileSize INTEGER NOT NULL,
                    localPath TEXT,
                    thumbnailPath TEXT,
                    uploadStatus TEXT NOT NULL,
                    createdAt INTEGER NOT NULL,
                    FOREIGN KEY(messageId) REFERENCES messages(id) ON DELETE CASCADE
                )
                """.trimIndent()
            )
            
            database.execSQL(
                "CREATE INDEX IF NOT EXISTS index_attachments_messageId " +
                "ON attachments(messageId)"
            )
            
            // Add attachment support to messages
            database.execSQL(
                "ALTER TABLE messages ADD COLUMN hasAttachment INTEGER NOT NULL DEFAULT 0"
            )
        }
    }
    
    /**
     * Get all migrations in order
     */
    fun getAllMigrations(): Array<Migration> {
        return arrayOf(
            MIGRATION_1_2,
            MIGRATION_2_3
        )
    }
}
