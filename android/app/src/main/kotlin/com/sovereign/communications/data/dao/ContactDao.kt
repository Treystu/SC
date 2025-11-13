package com.sovereign.communications.data.dao

import androidx.room.*
import com.sovereign.communications.data.entity.ContactEntity
import kotlinx.coroutines.flow.Flow

/**
 * Contact Data Access Object
 * Task 60: Implement contact persistence
 */
@Dao
interface ContactDao {
    
    @Query("SELECT * FROM contacts WHERE isBlocked = 0 ORDER BY displayName ASC")
    fun getAllContacts(): Flow<List<ContactEntity>>
    
    @Query("SELECT * FROM contacts WHERE id = :contactId")
    suspend fun getContact(contactId: String): ContactEntity?
    
    @Query("SELECT * FROM contacts WHERE publicKey = :publicKey")
    suspend fun getContactByPublicKey(publicKey: String): ContactEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: ContactEntity)
    
    @Update
    suspend fun update(contact: ContactEntity)
    
    @Delete
    suspend fun delete(contact: ContactEntity)
    
    @Query("UPDATE contacts SET isBlocked = :blocked WHERE id = :contactId")
    suspend fun setBlocked(contactId: String, blocked: Boolean)
    
    @Query("UPDATE contacts SET isVerified = :verified WHERE id = :contactId")
    suspend fun setVerified(contactId: String, verified: Boolean)
    
    @Query("UPDATE contacts SET lastSeen = :timestamp WHERE id = :contactId")
    suspend fun updateLastSeen(contactId: String, timestamp: Long)
}
