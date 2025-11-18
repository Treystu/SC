package com.sovereign.communications.security

import java.io.File
import java.io.RandomAccessFile
import java.security.SecureRandom
import java.util.Arrays

/**
 * Secure deletion and memory wiping utilities for Android
 * 
 * IMPORTANT LIMITATIONS:
 * - SSDs use wear leveling which may prevent true data erasure
 * - File systems may keep journal copies
 * - JVM garbage collector may create copies that we cannot wipe
 * - These are BEST-EFFORT implementations for defense-in-depth
 * 
 * Primary defense should always be:
 * 1. Android Keystore for keys
 * 2. SQLCipher for database
 * 3. Encrypted storage
 */
object SecureDeletion {
    
    /**
     * Wipe a ByteArray by overwriting with zeros
     * 
     * Note: JVM garbage collector may have created copies we cannot wipe.
     * This is best-effort.
     */
    fun ByteArray.wipe() {
        Arrays.fill(this, 0.toByte())
    }
    
    /**
     * Wipe multiple ByteArrays
     */
    fun wipeMultiple(vararg arrays: ByteArray) {
        arrays.forEach { it.wipe() }
    }
    
    /**
     * Execute a block with automatic memory wiping
     * 
     * @param data Sensitive data to use
     * @param block Function to execute with the data
     * @return Result of the block
     */
    inline fun <T> withAutoWipe(data: ByteArray, block: (ByteArray) -> T): T {
        return try {
            block(data)
        } finally {
            data.wipe()
        }
    }
    
    /**
     * Securely delete a file by overwriting before deletion
     * 
     * LIMITATIONS:
     * - SSDs use wear leveling - data may persist on other blocks
     * - File system journaling may keep copies
     * - This is best-effort, not guaranteed secure erasure
     * 
     * @param file File to securely delete
     * @param passes Number of overwrite passes (default: 2)
     * @throws SecurityException if file cannot be wiped securely
     */
    fun secureDeleteFile(file: File, passes: Int = 2) {
        if (!file.exists()) {
            return
        }
        
        if (!file.isFile) {
            throw IllegalArgumentException("Can only securely delete files, not directories")
        }
        
        if (!file.canWrite()) {
            throw SecurityException("Cannot write to file for secure deletion: ${file.path}")
        }
        
        try {
            val fileSize = file.length()
            
            // Perform multiple overwrite passes
            repeat(passes) { pass ->
                RandomAccessFile(file, "rw").use { raf ->
                    raf.seek(0)
                    
                    // Buffer for writing
                    val bufferSize = minOf(4096, fileSize.toInt())
                    val buffer = ByteArray(bufferSize)
                    
                    var remaining = fileSize
                    
                    while (remaining > 0) {
                        val toWrite = minOf(bufferSize.toLong(), remaining).toInt()
                        
                        // Alternate between random and zeros
                        if (pass % 2 == 0) {
                            SecureRandom().nextBytes(buffer)
                        } else {
                            Arrays.fill(buffer, 0.toByte())
                        }
                        
                        raf.write(buffer, 0, toWrite)
                        remaining -= toWrite
                    }
                    
                    // Ensure data is written to disk
                    raf.fd.sync()
                }
            }
            
            // Final deletion
            if (!file.delete()) {
                throw SecurityException("Failed to delete file after wiping: ${file.path}")
            }
        } catch (e: Exception) {
            throw SecurityException("Secure deletion failed for ${file.path}", e)
        }
    }
    
    /**
     * Securely delete multiple files
     * 
     * @param files Files to delete
     * @param passes Number of overwrite passes per file
     * @return Map of files to their deletion success status
     */
    fun secureDeleteFiles(files: List<File>, passes: Int = 2): Map<File, Boolean> {
        return files.associateWith { file ->
            try {
                secureDeleteFile(file, passes)
                true
            } catch (e: Exception) {
                android.util.Log.e("SecureDeletion", "Failed to delete ${file.path}", e)
                false
            }
        }
    }
    
    /**
     * Securely delete a directory and all its contents
     * 
     * WARNING: This will recursively delete everything in the directory!
     * 
     * @param directory Directory to delete
     * @param passes Number of overwrite passes per file
     */
    fun secureDeleteDirectory(directory: File, passes: Int = 2) {
        if (!directory.exists()) {
            return
        }
        
        if (!directory.isDirectory) {
            throw IllegalArgumentException("Not a directory: ${directory.path}")
        }
        
        // Recursively delete contents
        directory.listFiles()?.forEach { file ->
            if (file.isDirectory) {
                secureDeleteDirectory(file, passes)
            } else {
                secureDeleteFile(file, passes)
            }
        }
        
        // Delete empty directory
        if (!directory.delete()) {
            throw SecurityException("Failed to delete directory: ${directory.path}")
        }
    }
    
    /**
     * Generate random bytes with automatic cleanup
     * 
     * @param size Size of random data
     * @param block Function to use the random data
     * @return Result of the block
     */
    inline fun <T> withRandomBytes(size: Int, block: (ByteArray) -> T): T {
        val data = ByteArray(size)
        SecureRandom().nextBytes(data)
        return try {
            block(data)
        } finally {
            data.wipe()
        }
    }
    
    /**
     * Timing-safe comparison with automatic wiping
     * 
     * @param a First array
     * @param b Second array
     * @param wipeAfter Whether to wipe arrays after comparison
     * @return true if arrays are equal
     */
    fun timingSafeCompareAndWipe(
        a: ByteArray,
        b: ByteArray,
        wipeAfter: Boolean = true
    ): Boolean {
        if (a.size != b.size) {
            if (wipeAfter) {
                wipeMultiple(a, b)
            }
            return false
        }
        
        var result = 0
        for (i in a.indices) {
            result = result or (a[i].toInt() xor b[i].toInt())
        }
        
        val isEqual = result == 0
        
        if (wipeAfter) {
            wipeMultiple(a, b)
        }
        
        return isEqual
    }
}

/**
 * Extension function for easier wiping syntax
 */
fun ByteArray.secureWipe() = SecureDeletion.run { this@secureWipe.wipe() }

/**
 * Extension function to securely delete a file
 */
fun File.secureDelete(passes: Int = 2) = SecureDeletion.secureDeleteFile(this, passes)

/**
 * Best practices and limitations documentation
 */
object SecureDeletionNotes {
    const val LIMITATIONS = """
        SECURE DELETION LIMITATIONS ON ANDROID:
        
        1. SSD/eMMC Wear Leveling:
           - Flash storage controllers remap blocks to distribute wear
           - Overwritten data may still exist on physical medium
           - True erasure requires full device encryption + factory reset
        
        2. File System Journaling:
           - ext4 and other filesystems keep transaction logs
           - Previous versions of files may exist in journal
           - Journal wiping requires root access
        
        3. Virtual Memory:
           - Data may be swapped to storage
           - We cannot control or wipe swap
           - Android encrypts swap on modern devices
        
        4. JVM Garbage Collection:
           - GC may create object copies we cannot track
           - Wiping is best-effort for JVM-managed memory
           - Sensitive data should use hardware-backed storage
        
        5. Copy-on-Write:
           - Some filesystems (like F2FS) use CoW
           - Modified blocks may leave old data intact
        
        BEST PRACTICES:
        
        1. PRIMARY DEFENSE: Use Android Keystore for all keys
        2. SECONDARY: Use SQLCipher for database encryption
        3. TERTIARY: Use this secure deletion as defense-in-depth
        4. DOCUMENT: Note limitations in security documentation
        5. EDUCATE: Users should enable device encryption + secure boot
        6. VERIFY: File deletion on device with appropriate security model
    """
    
    const val USAGE_EXAMPLE = """
        // Wipe sensitive data
        val password = "secret".toByteArray()
        try {
            authenticate(password)
        } finally {
            password.wipe()
        }
        
        // Use auto-wipe
        SecureDeletion.withAutoWipe(sensitiveData) { data ->
            process(data)
        }
        
        // Securely delete file
        val tempFile = File(cacheDir, "temp_secret.dat")
        try {
            tempFile.writeBytes(secretData)
            processFile(tempFile)
        } finally {
            tempFile.secureDelete()
        }
        
        // Generate random with auto-cleanup
        SecureDeletion.withRandomBytes(32) { nonce ->
            encrypt(message, nonce)
        }
    """
}
