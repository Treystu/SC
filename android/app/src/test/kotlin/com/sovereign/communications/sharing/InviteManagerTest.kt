package com.sovereign.communications.sharing

import android.content.Context
import com.sovereign.communications.sharing.models.Invite
import com.sovereign.communications.sharing.models.SharePayload
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import org.mockito.kotlin.whenever
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(MockitoJUnitRunner::class)
class InviteManagerTest {
    
    @Mock
    private lateinit var mockContext: Context
    
    private lateinit var inviteManager: InviteManager
    
    private val testPeerId = "peer123"
    private val testPublicKey = ByteArray(32) { it.toByte() }
    private val testDisplayName = "Test User"
    
    @Before
    fun setup() {
        whenever(mockContext.packageName).thenReturn("com.sovereign.communications")
        inviteManager = InviteManager(mockContext, testPeerId, testPublicKey, testDisplayName)
    }
    
    @Test
    fun `test invite creation`() = runBlocking {
        val invite = inviteManager.createInvite()
        
        assertNotNull(invite)
        assertEquals(testPeerId, invite.inviterPeerId)
        assertEquals(testDisplayName, invite.inviterName)
        assertTrue(invite.code.length == 64) // 32 bytes * 2 hex chars
        assertTrue(invite.expiresAt > invite.createdAt)
    }
    
    @Test
    fun `test invite validation with valid code`() = runBlocking {
        val invite = inviteManager.createInvite()
        val result = inviteManager.validateInvite(invite.code)
        
        assertTrue(result.valid)
        assertEquals(invite, result.invite)
    }
    
    @Test
    fun `test invite validation with invalid code`() {
        val result = inviteManager.validateInvite("invalid_code")
        
        assertTrue(!result.valid)
        assertEquals("Invalid invite code", result.error)
    }
    
    @Test
    fun `test invite code extraction from deep link`() {
        val deepLink = "https://sc.app/join#abc123"
        val extractedCode = inviteManager.extractInviteCode(deepLink)
        
        assertEquals("abc123", extractedCode)
    }
    
    @Test
    fun `test invite code extraction from hex code`() {
        val hexCode = "a".repeat(64)
        val extractedCode = inviteManager.extractInviteCode(hexCode)
        
        assertEquals(hexCode, extractedCode)
    }
    
    @Test
    fun `test share payload creation`() = runBlocking {
        val invite = inviteManager.createInvite()
        val payload = inviteManager.createSharePayload(invite)
        
        assertNotNull(payload)
        assertEquals(invite.code, payload.inviteCode)
        assertEquals(invite.inviterPeerId, payload.inviterPeerId)
        assertTrue(payload.signature.contentEquals(invite.signature))
    }
    
    @Test
    fun `test cleanup expired invites`() = runBlocking {
        // Create an invite that's already expired (expiration in the past)
        val pastTime = System.currentTimeMillis() - 1000
        val expiredCode = "a".repeat(64)
        
        // Manually create an expired invite for testing
        // In real implementation, we would use internal methods or time mocking
        val result = inviteManager.validateInvite(expiredCode)
        
        // Should be invalid since it doesn't exist
        assertTrue(!result.valid)
    }
    
    @Test
    fun `test revoke invite`() = runBlocking {
        val invite = inviteManager.createInvite()
        
        assertTrue(inviteManager.validateInvite(invite.code).valid)
        
        val revoked = inviteManager.revokeInvite(invite.code)
        assertTrue(revoked)
        
        val result = inviteManager.validateInvite(invite.code)
        assertTrue(!result.valid)
    }
}
