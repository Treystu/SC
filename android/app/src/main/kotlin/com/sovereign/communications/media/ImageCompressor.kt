package com.sovereign.communications.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Image compression and caching utilities
 * Task 87: Add image compression and caching
 */
class ImageCompressor(private val context: Context) {
    
    companion object {
        private const val MAX_IMAGE_SIZE = 1920 // Max width/height for compressed images
        private const val THUMBNAIL_SIZE = 256 // Thumbnail size
        private const val QUALITY_HIGH = 90
        private const val QUALITY_MEDIUM = 75
        private const val QUALITY_LOW = 60
    }
    
    /**
     * Compress an image from URI
     * @param uri Source image URI
     * @param quality Compression quality (0-100)
     * @return Compressed image file
     */
    suspend fun compressImage(
        uri: Uri,
        quality: Int = QUALITY_MEDIUM,
        maxSize: Int = MAX_IMAGE_SIZE
    ): File? = withContext(Dispatchers.IO) {
        try {
            val inputStream = context.contentResolver.openInputStream(uri) ?: return@withContext null
            
            // Decode with inJustDecodeBounds to get dimensions
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeStream(inputStream, null, options)
            inputStream.close()
            
            // Calculate sample size
            val sampleSize = calculateSampleSize(options.outWidth, options.outHeight, maxSize)
            
            // Decode with sample size
            val decodedOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inJustDecodeBounds = false
            }
            
            val bitmap = context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, decodedOptions)
            } ?: return@withContext null
            
            // Scale if still too large
            val scaledBitmap = if (bitmap.width > maxSize || bitmap.height > maxSize) {
                scaleBitmap(bitmap, maxSize)
            } else {
                bitmap
            }
            
            // Compress and save
            val outputFile = createTempImageFile()
            FileOutputStream(outputFile).use { outputStream ->
                scaledBitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
            }
            
            // Clean up
            if (scaledBitmap != bitmap) {
                bitmap.recycle()
            }
            scaledBitmap.recycle()
            
            outputFile
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Create a thumbnail from image URI
     * @param uri Source image URI
     * @return Thumbnail file
     */
    suspend fun createThumbnail(uri: Uri): File? = withContext(Dispatchers.IO) {
        compressImage(uri, QUALITY_LOW, THUMBNAIL_SIZE)
    }
    
    /**
     * Calculate optimal sample size for image decoding
     */
    private fun calculateSampleSize(width: Int, height: Int, maxSize: Int): Int {
        var sampleSize = 1
        
        if (width > maxSize || height > maxSize) {
            val halfWidth = width / 2
            val halfHeight = height / 2
            
            while ((halfWidth / sampleSize) >= maxSize && (halfHeight / sampleSize) >= maxSize) {
                sampleSize *= 2
            }
        }
        
        return sampleSize
    }
    
    /**
     * Scale bitmap to fit within max size while maintaining aspect ratio
     */
    private fun scaleBitmap(bitmap: Bitmap, maxSize: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        
        val scale = if (width > height) {
            maxSize.toFloat() / width
        } else {
            maxSize.toFloat() / height
        }
        
        val scaledWidth = (width * scale).toInt()
        val scaledHeight = (height * scale).toInt()
        
        return Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)
    }
    
    /**
     * Create a temporary file for compressed image
     */
    private fun createTempImageFile(): File {
        val cacheDir = File(context.cacheDir, "images")
        if (!cacheDir.exists()) {
            cacheDir.mkdirs()
        }
        
        return File.createTempFile(
            "IMG_${System.currentTimeMillis()}",
            ".jpg",
            cacheDir
        )
    }
    
    /**
     * Clean up old cached images
     * @param maxAgeMillis Maximum age of cached files in milliseconds
     */
    fun cleanCache(maxAgeMillis: Long = 7 * 24 * 60 * 60 * 1000L) {
        val cacheDir = File(context.cacheDir, "images")
        if (!cacheDir.exists()) return
        
        val now = System.currentTimeMillis()
        cacheDir.listFiles()?.forEach { file ->
            if (now - file.lastModified() > maxAgeMillis) {
                file.delete()
            }
        }
    }
}
