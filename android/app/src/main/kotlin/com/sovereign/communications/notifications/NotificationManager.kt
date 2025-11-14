package com.sovereign.communications.notifications

import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import com.sovereign.communications.R
import com.sovereign.communications.ui.MainActivity

/**
 * Manages notification channels, grouping, and actions
 * Tasks 63-65: Implement proper notification system
 */
class NotificationManager(private val context: Context) {
    
    private val notificationManager = NotificationManagerCompat.from(context)
    
    companion object {
        // Notification channels
        const val CHANNEL_MESSAGES = "messages"
        const val CHANNEL_SERVICE = "service"
        const val CHANNEL_ALERTS = "alerts"
        
        // Notification groups
        const val GROUP_MESSAGES = "group_messages"
        
        // Action keys
        const val KEY_TEXT_REPLY = "key_text_reply"
        const val ACTION_REPLY = "com.sovereign.communications.ACTION_REPLY"
        const val ACTION_MARK_READ = "com.sovereign.communications.ACTION_MARK_READ"
        
        // Notification IDs
        const val NOTIFICATION_ID_SERVICE = 1
        const val NOTIFICATION_ID_MESSAGE_BASE = 1000
        const val NOTIFICATION_ID_SUMMARY = 9999
    }
    
    /**
     * Initialize notification channels
     * Task 63: Implement proper notification channels
     */
    fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Create channel group for messages
            val messageGroup = NotificationChannelGroup(
                GROUP_MESSAGES,
                "Messages"
            )
            
            // Messages channel - high importance for new messages
            val messagesChannel = NotificationChannel(
                CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "New message notifications"
                setShowBadge(true)
                enableVibration(true)
                enableLights(true)
                group = GROUP_MESSAGES
            }
            
            // Service channel - low importance for background service
            val serviceChannel = NotificationChannel(
                CHANNEL_SERVICE,
                "Background Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the mesh network connection active"
                setShowBadge(false)
                enableVibration(false)
                enableLights(false)
            }
            
            // Alerts channel - default importance for system alerts
            val alertsChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "Alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Important system notifications"
                setShowBadge(true)
            }
            
            val systemNotificationManager = 
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            systemNotificationManager.createNotificationChannelGroup(messageGroup)
            systemNotificationManager.createNotificationChannels(
                listOf(messagesChannel, serviceChannel, alertsChannel)
            )
        }
    }
    
    /**
     * Show a message notification with actions
     * Task 64: Add notification actions functionality
     */
    fun showMessageNotification(
        conversationId: String,
        contactName: String,
        messageText: String,
        timestamp: Long
    ) {
        val notificationId = NOTIFICATION_ID_MESSAGE_BASE + conversationId.hashCode()
        
        // Create intent for opening the conversation
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("conversationId", conversationId)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create reply action
        val replyAction = createReplyAction(conversationId, notificationId)
        
        // Create mark as read action
        val markReadAction = createMarkReadAction(conversationId, notificationId)
        
        // Build notification
        val notification = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(contactName)
            .setContentText(messageText)
            .setWhen(timestamp)
            .setShowWhen(true)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setGroup(GROUP_MESSAGES)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .addAction(replyAction)
            .addAction(markReadAction)
            .build()
        
        notificationManager.notify(notificationId, notification)
        
        // Update summary notification for grouping
        updateSummaryNotification()
    }
    
    /**
     * Create reply action with RemoteInput
     */
    private fun createReplyAction(conversationId: String, notificationId: Int): NotificationCompat.Action {
        val remoteInput = RemoteInput.Builder(KEY_TEXT_REPLY)
            .setLabel("Reply")
            .build()
        
        val replyIntent = Intent(context, NotificationReceiver::class.java).apply {
            action = ACTION_REPLY
            putExtra("conversationId", conversationId)
            putExtra("notificationId", notificationId)
        }
        
        val replyPendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId,
            replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        
        return NotificationCompat.Action.Builder(
            R.drawable.ic_reply,
            "Reply",
            replyPendingIntent
        )
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .build()
    }
    
    /**
     * Create mark as read action
     */
    private fun createMarkReadAction(conversationId: String, notificationId: Int): NotificationCompat.Action {
        val markReadIntent = Intent(context, NotificationReceiver::class.java).apply {
            action = ACTION_MARK_READ
            putExtra("conversationId", conversationId)
            putExtra("notificationId", notificationId)
        }
        
        val markReadPendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId + 1,
            markReadIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Action.Builder(
            R.drawable.ic_mark_read,
            "Mark as Read",
            markReadPendingIntent
        ).build()
    }
    
    /**
     * Update summary notification for message grouping
     * Task 65: Implement notification grouping
     */
    private fun updateSummaryNotification() {
        val summaryNotification = NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Sovereign Communications")
            .setContentText("You have new messages")
            .setGroup(GROUP_MESSAGES)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        
        notificationManager.notify(NOTIFICATION_ID_SUMMARY, summaryNotification)
    }
    
    /**
     * Cancel a specific notification
     */
    fun cancelNotification(conversationId: String) {
        val notificationId = NOTIFICATION_ID_MESSAGE_BASE + conversationId.hashCode()
        notificationManager.cancel(notificationId)
    }
    
    /**
     * Cancel all message notifications
     */
    fun cancelAllMessageNotifications() {
        notificationManager.cancel(NOTIFICATION_ID_SUMMARY)
        // Individual message notifications will be handled by the OS
    }
}
