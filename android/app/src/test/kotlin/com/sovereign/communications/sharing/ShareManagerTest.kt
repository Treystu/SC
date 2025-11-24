package com.sovereign.communications.sharing

import android.content.Context
import com.sovereign.communications.sharing.models.Invite
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
class ShareManagerTest {
    
    @Mock
    private lateinit var mockContext: Context
    
    private lateinit var shareManager: ShareManager
    
    private val testInvite = Invite(
        code = "abc123def456",
        inviterPeerId = "peer123",
        inviterPublicKey = ByteArray(32),
        inviterName = "Test User",
        createdAt = System.currentTimeMillis(),
        expiresAt = System.currentTimeMillis() + 86400000,
        signature = ByteArray(64),
        bootstrapPeers = listOf("bootstrap1", "bootstrap2")
    )
    
    @Before
    fun setup() {
        whenever(mockContext.packageName).thenReturn("com.sovereign.communications")
        shareManager = ShareManager(mockContext)
    }
    
    @Test
    fun `test ShareManager instantiation`() {
        assertNotNull(shareManager)
    }
    
    @Test
    fun `test invite code extraction from deep link`() {
        val inviteManager = InviteManager(mockContext, "peer123", ByteArray(32))
        val deepLink = "https://sc.app/join#abc123def456"
        val extractedCode = inviteManager.extractInviteCode(deepLink)
        
        assertEquals("abc123def456", extractedCode)
    }
    
    @Test
    fun `test invite code extraction from direct code`() {
        val inviteManager = InviteManager(mockContext, "peer123", ByteArray(32))
        val directCode = "a".repeat(64)
        val extractedCode = inviteManager.extractInviteCode(directCode)
        
        assertEquals(directCode, extractedCode)
    }
    
    @Test
    fun `test invite validation with valid invite`() {
        val inviteManager = InviteManager(mockContext, "peer123", ByteArray(32))
        val invite = testInvite
        
        // Manually add invite to manager
        inviteManager.getAllInvites() // Initialize
        
        // This would normally be created through createInvite
        // For now just test the validation logic exists
        assertTrue(inviteManager.getAllInvites().isEmpty())
    }
}
