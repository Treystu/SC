package com.sovereign.communications.sharing

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.sovereign.communications.sharing.models.Invite
import java.io.File

/**
 * ShareManager - Handles Android Share Sheet integration
 * Allows sharing of SC app invitations via various Android sharing methods
 */
class ShareManager(private val context: Context) {
    
    companion object {
        private const val SHARE_URL_BASE = "https://sc.app/join#"
        private const val APP_DOWNLOAD_URL = "https://sc.app/download"
    }
    
    /**
     * Share app invitation via Android Share Sheet
     * Allows user to choose how to share (SMS, email, messaging apps, etc.)
     */
    fun shareApp(invite: Invite, includeAPK: Boolean = false) {
        val shareIntent = Intent().apply {
            action = Intent.ACTION_SEND
            type = if (includeAPK) {
                "application/vnd.android.package-archive"
            } else {
                "text/plain"
            }
            putExtra(Intent.EXTRA_SUBJECT, "Join Sovereign Communications")
            putExtra(Intent.EXTRA_TEXT, buildShareText(invite))
        }
        
        // Add APK if requested
        if (includeAPK) {
            try {
                val apkUri = getAPKUri()
                shareIntent.putExtra(Intent.EXTRA_STREAM, apkUri)
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (e: Exception) {
                // Fall back to text-only share if APK sharing fails
                shareIntent.type = "text/plain"
            }
        }
        
        val chooser = Intent.createChooser(shareIntent, "Share SC via")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
    }
    
    /**
     * Build share text with invite information
     */
    private fun buildShareText(invite: Invite): String {
        val url = "$SHARE_URL_BASE${invite.code}"
        val inviterName = invite.inviterName ?: "A friend"
        
        return """
            $inviterName invited you to Sovereign Communications!
            
            Secure, decentralized messaging with no servers.
            
            Download: $APP_DOWNLOAD_URL
            
            Invite code: ${invite.code}
            
            Direct link: $url
        """.trimIndent()
    }
    
    /**
     * Share just the invite code (for quick sharing)
     */
    fun shareInviteCode(invite: Invite) {
        val shareIntent = Intent().apply {
            action = Intent.ACTION_SEND
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "$SHARE_URL_BASE${invite.code}")
        }
        
        val chooser = Intent.createChooser(shareIntent, "Share invite code")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
    }
    
    /**
     * Get URI for the installed APK file
     * Uses FileProvider for secure file sharing
     */
    private fun getAPKUri(): Uri {
        val apkFile = File(context.applicationInfo.sourceDir)
        val outputFile = File(context.externalCacheDir ?: context.cacheDir, "SC.apk")
        
        // Copy APK to cache directory
        apkFile.copyTo(outputFile, overwrite = true)
        
        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            outputFile
        )
    }
    
    /**
     * Share via specific app package (e.g., WhatsApp, Telegram)
     */
    fun shareViaApp(invite: Invite, packageName: String) {
        val shareIntent = Intent().apply {
            action = Intent.ACTION_SEND
            type = "text/plain"
            `package` = packageName
            putExtra(Intent.EXTRA_TEXT, buildShareText(invite))
        }
        
        try {
            shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(shareIntent)
        } catch (e: Exception) {
            // Fall back to general share if specific app not found
            shareApp(invite, includeAPK = false)
        }
    }
}
