package com.sovereign.communications.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import com.sovereign.communications.SCApplication
import com.sovereign.communications.ui.MainActivity
import kotlinx.coroutines.launch

object NotificationHelper {
    private const val TAG = "NotificationHelper"
    private const val CHANNEL_ID = "messages"
    private const val CHANNEL_NAME = "Messages"
    private const val KEY_TEXT_REPLY = "key_text_reply"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel =
                NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                    description = "Message notifications"
                    enableVibration(true)
                    setShowBadge(true)
                }

            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showMessageNotification(
        context: Context,
        messageId: String,
        contactName: String,
        messageContent: String,
        conversationId: String,
    ) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Intent to open chat
        val openChatIntent =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                putExtra("conversation_id", conversationId)
            }
        val openChatPendingIntent =
            PendingIntent.getActivity(
                context,
                conversationId.hashCode(),
                openChatIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        // Reply action
        val replyAction = createReplyAction(context, conversationId, contactName)

        // Mark as read action
        val markReadAction = createMarkReadAction(context, messageId, conversationId)

        // Build notification
        val notification =
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_email) // Using system icon for now
                .setContentTitle(contactName)
                .setContentText(messageContent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setContentIntent(openChatPendingIntent)
                .setAutoCancel(true)
                .addAction(replyAction)
                .addAction(markReadAction)
                .build()

        notificationManager.notify(conversationId.hashCode(), notification)
    }

    private fun createReplyAction(
        context: Context,
        conversationId: String,
        contactName: String,
    ): NotificationCompat.Action {
        val remoteInput =
            RemoteInput
                .Builder(KEY_TEXT_REPLY)
                .setLabel("Reply to $contactName")
                .build()

        val replyIntent =
            Intent(context, NotificationReplyReceiver::class.java).apply {
                putExtra("conversation_id", conversationId)
            }

        val replyPendingIntent =
            PendingIntent.getBroadcast(
                context,
                conversationId.hashCode() + 1,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )

        return NotificationCompat.Action
            .Builder(
                android.R.drawable.ic_menu_send,
                "Reply",
                replyPendingIntent,
            ).addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .build()
    }

    private fun createMarkReadAction(
        context: Context,
        messageId: String,
        conversationId: String,
    ): NotificationCompat.Action {
        val markReadIntent =
            Intent(context, NotificationActionReceiver::class.java).apply {
                action = "MARK_READ"
                putExtra("message_id", messageId)
                putExtra("conversation_id", conversationId)
            }

        val markReadPendingIntent =
            PendingIntent.getBroadcast(
                context,
                messageId.hashCode(),
                markReadIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return NotificationCompat.Action
            .Builder(
                android.R.drawable.ic_menu_view,
                "Mark Read",
                markReadPendingIntent,
            ).build()
    }
}

// Broadcast receiver for reply action
class NotificationReplyReceiver : android.content.BroadcastReceiver() {
    companion object {
        private const val TAG = "NotificationReplyReceiver"
    }

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val conversationId = intent.getStringExtra("conversation_id") ?: return
        val remoteInput = RemoteInput.getResultsFromIntent(intent)
        val replyText = remoteInput?.getCharSequence("key_text_reply")?.toString() ?: return

        // Send message through mesh network
        try {
            val meshManager = SCApplication.instance.meshNetworkManager
            meshManager.sendMessage(
                recipientId = conversationId,
                message = replyText,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send reply", e)
        }
        // For now, just dismiss the notification
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(conversationId.hashCode())
    }
}

// Broadcast receiver for mark read action
class NotificationActionReceiver : android.content.BroadcastReceiver() {
    companion object {
        private const val TAG = "NotificationActionReceiver"
    }

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        when (intent.action) {
            "MARK_READ" -> {
                val messageId = intent.getStringExtra("message_id") ?: return
                val conversationId = intent.getStringExtra("conversation_id") ?: return

                val pendingResult = goAsync()
                val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO)

                scope.launch {
                    try {
                        // Mark message as read in database
                        val database = SCApplication.instance.database
                        database.messageDao().markConversationAsRead(conversationId)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to mark as read", e)
                    } finally {
                        pendingResult.finish()
                    }
                }

                // Dismiss notification immediately
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.cancel(messageId.hashCode())
            }
        }
    }
}
