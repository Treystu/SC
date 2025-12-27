package com.sovereign.communications.ble

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * BLE Store and Forward - Stores messages when devices are offline and forwards when they come online
 */
class BLEStoreAndForward(
    private val context: Context
) {
    private val scope = CoroutineScope(Dispatchers.IO)
    private val pendingMessages = mutableListOf<PendingMessage>()
    private val storageDir = File(context.filesDir, "ble_pending_messages")

    init {
        storageDir.mkdirs()
        loadPendingMessages()
    }

    companion object {
        private const val TAG = "BLEStoreAndForward"
        private const val MAX_STORED_MESSAGES = 100
        private const val RETRY_DELAY_MS = 5000L
    }

    data class PendingMessage(
        val id: String,
        val targetDeviceAddress: String,
        val message: ByteArray,
        val timestamp: Long,
        val retryCount: Int = 0
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false

            other as PendingMessage

            if (id != other.id) return false
            if (!message.contentEquals(other.message)) return false

            return true
        }

        override fun hashCode(): Int {
            var result = id.hashCode()
            result = 31 * result + message.contentHashCode()
            return result
        }
    }

    /**
     * Store a message for later delivery
     */
    fun storeMessage(targetDeviceAddress: String, message: ByteArray) {
        if (pendingMessages.size >= MAX_STORED_MESSAGES) {
            // Remove oldest message
            val oldest = pendingMessages.minByOrNull { it.timestamp }
            oldest?.let { removeMessage(it.id) }
        }

        val pendingMessage = PendingMessage(
            id = generateMessageId(),
            targetDeviceAddress = targetDeviceAddress,
            message = message,
            timestamp = System.currentTimeMillis()
        )

        pendingMessages.add(pendingMessage)
        saveMessageToFile(pendingMessage)

        Log.d(TAG, "Stored message for device: $targetDeviceAddress")
    }

    /**
     * Attempt to deliver pending messages to a device
     */
    fun deliverPendingMessages(deviceAddress: String, sendFunction: (ByteArray) -> Boolean) {
        val messagesForDevice = pendingMessages.filter { it.targetDeviceAddress == deviceAddress }

        messagesForDevice.forEach { pendingMessage ->
            scope.launch {
                val success = sendFunction(pendingMessage.message)
                if (success) {
                    removeMessage(pendingMessage.id)
                    Log.d(TAG, "Delivered pending message: ${pendingMessage.id}")
                } else {
                    // Increment retry count
                    val updatedMessage = pendingMessage.copy(retryCount = pendingMessage.retryCount + 1)
                    updateMessage(updatedMessage)

                    // If too many retries, remove the message
                    if (updatedMessage.retryCount >= 3) {
                        removeMessage(pendingMessage.id)
                        Log.w(TAG, "Removed message after max retries: ${pendingMessage.id}")
                    } else {
                        // Schedule retry
                        delay(RETRY_DELAY_MS)
                        deliverPendingMessages(deviceAddress, sendFunction)
                    }
                }
            }
        }
    }

    /**
     * Get the count of pending messages
     */
    fun getPendingMessageCount(): Int = pendingMessages.size

    /**
     * Get pending messages for a specific device
     */
    fun getPendingMessagesForDevice(deviceAddress: String): List<PendingMessage> {
        return pendingMessages.filter { it.targetDeviceAddress == deviceAddress }
    }

    /**
     * Clear all pending messages (for cleanup)
     */
    fun clearAllMessages() {
        pendingMessages.clear()
        storageDir.listFiles()?.forEach { it.delete() }
        Log.d(TAG, "Cleared all pending messages")
    }

    private fun generateMessageId(): String {
        return "msg_${System.currentTimeMillis()}_${pendingMessages.size}"
    }

    private fun saveMessageToFile(message: PendingMessage) {
        try {
            val file = File(storageDir, message.id)
            FileOutputStream(file).use { fos ->
                fos.write(message.targetDeviceAddress.toByteArray())
                fos.write(byteArrayOf('\n'.code.toByte()))
                fos.write(message.message)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save message to file", e)
        }
    }

    private fun loadPendingMessages() {
        storageDir.listFiles()?.forEach { file ->
            try {
                FileInputStream(file).use { fis ->
                    val content = fis.readBytes()
                    val separatorIndex = content.indexOf('\n'.code.toByte())
                    if (separatorIndex > 0) {
                        val targetAddress = String(content, 0, separatorIndex)
                        val message = content.sliceArray(separatorIndex + 1 until content.size)

                        val pendingMessage = PendingMessage(
                            id = file.name,
                            targetDeviceAddress = targetAddress,
                            message = message,
                            timestamp = file.lastModified()
                        )

                        pendingMessages.add(pendingMessage)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load message from file: ${file.name}", e)
                file.delete()
            }
        }

        Log.d(TAG, "Loaded ${pendingMessages.size} pending messages")
    }

    private fun removeMessage(messageId: String) {
        pendingMessages.removeIf { it.id == messageId }
        val file = File(storageDir, messageId)
        file.delete()
    }

    private fun updateMessage(updatedMessage: PendingMessage) {
        val index = pendingMessages.indexOfFirst { it.id == updatedMessage.id }
        if (index >= 0) {
            pendingMessages[index] = updatedMessage
            saveMessageToFile(updatedMessage)
        }
    }
}