package com.sovereign.communications.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Handles notification actions (reply, mark as read)
 * Task 64: Add notification actions functionality
 */
class NotificationReceiver : BroadcastReceiver() {
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            NotificationManager.ACTION_REPLY -> handleReplyAction(context, intent)
            NotificationManager.ACTION_MARK_READ -> handleMarkReadAction(context, intent)
        }
    }
    
    private fun handleReplyAction(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra("conversationId") ?: return
        val notificationId = intent.getIntExtra("notificationId", -1)
        
        // Get reply text from RemoteInput
        val remoteInput = RemoteInput.getResultsFromIntent(intent)
        val replyText = remoteInput?.getCharSequence(NotificationManager.KEY_TEXT_REPLY)?.toString()
        
        if (replyText != null) {
            scope.launch {
                // TODO: Send message through mesh network
                // meshNetwork.sendMessage(conversationId, replyText)
                
                // Cancel the notification
                val notificationManager = NotificationManager(context)
                notificationManager.cancelNotification(conversationId)
            }
        }
    }
    
    private fun handleMarkReadAction(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra("conversationId") ?: return
        
        scope.launch {
            // TODO: Mark messages as read in database
            // database.messageDao().markConversationAsRead(conversationId)
            
            // Cancel the notification
            val notificationManager = NotificationManager(context)
            notificationManager.cancelNotification(conversationId)
        }
    }
}
