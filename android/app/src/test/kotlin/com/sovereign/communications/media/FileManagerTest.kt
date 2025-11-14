package com.sovereign.communications.media

import android.content.Context
import android.net.Uri
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Unit tests for FileManager
 * Task 86: Test file handling functionality
 */
@RunWith(MockitoJUnitRunner::class)
class FileManagerTest {
    
    @Mock
    private lateinit var context: Context
    
    private lateinit var fileManager: FileManager
    
    @Before
    fun setup() {
        fileManager = FileManager(context)
    }
    
    @Test
    fun `formatFileSize returns correct format for bytes`() {
        assertEquals("512 B", fileManager.formatFileSize(512))
    }
    
    @Test
    fun `formatFileSize returns correct format for kilobytes`() {
        assertEquals("2 KB", fileManager.formatFileSize(2048))
    }
    
    @Test
    fun `formatFileSize returns correct format for megabytes`() {
        assertEquals("5 MB", fileManager.formatFileSize(5 * 1024 * 1024))
    }
    
    @Test
    fun `formatFileSize returns correct format for gigabytes`() {
        assertEquals("2 GB", fileManager.formatFileSize(2L * 1024 * 1024 * 1024))
    }
    
    @Test
    fun `getMimeTypeFromExtension returns correct type for jpg`() {
        val mimeType = fileManager.getMimeTypeFromExtension("test.jpg")
        assertNotNull(mimeType)
        assertEquals("image/jpeg", mimeType)
    }
    
    @Test
    fun `getMimeTypeFromExtension returns correct type for mp4`() {
        val mimeType = fileManager.getMimeTypeFromExtension("video.mp4")
        assertNotNull(mimeType)
        assertEquals("video/mp4", mimeType)
    }
    
    @Test
    fun `getExtensionFromMimeType returns correct extension for image`() {
        val extension = fileManager.getExtensionFromMimeType("image/png")
        assertEquals("png", extension)
    }
    
    @Test
    fun `getExtensionFromMimeType returns correct extension for audio`() {
        val extension = fileManager.getExtensionFromMimeType("audio/mpeg")
        assertEquals("mp3", extension)
    }
}
