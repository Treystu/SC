package com.sovereign.communications.media

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Audio recording for voice messages
 * Task 84: Add proper audio recording with permissions
 */
class AudioRecorder(
    private val context: Context,
) {
    private var mediaRecorder: MediaRecorder? = null
    private var currentRecordingFile: File? = null
    private var isRecording = false

    companion object {
        private const val AUDIO_BITRATE = 64000 // 64 kbps
        private const val AUDIO_SAMPLE_RATE = 44100 // 44.1 kHz
        private const val MAX_RECORDING_DURATION_MS = 5 * 60 * 1000 // 5 minutes
    }

    /**
     * Start recording audio
     * @return File where audio is being recorded
     */
    suspend fun startRecording(): File? =
        withContext(Dispatchers.IO) {
            if (isRecording) {
                return@withContext null
            }

            try {
                val outputFile = createAudioFile()
                currentRecordingFile = outputFile

                mediaRecorder =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        MediaRecorder(context)
                    } else {
                        @Suppress("DEPRECATION")
                        MediaRecorder()
                    }.apply {
                        setAudioSource(MediaRecorder.AudioSource.MIC)
                        setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                        setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                        setAudioEncodingBitRate(AUDIO_BITRATE)
                        setAudioSamplingRate(AUDIO_SAMPLE_RATE)
                        setOutputFile(outputFile.absolutePath)
                        setMaxDuration(MAX_RECORDING_DURATION_MS)
                        setOnInfoListener { _, what, _ ->
                            if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                                kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                                    stopRecording()
                                }
                            }
                        }

                        prepare()
                        start()
                    }

                isRecording = true
                outputFile
            } catch (e: Exception) {
                cleanupRecorder()
                null
            }
        }

    /**
     * Stop recording and return the recorded file
     * @return Recorded audio file, or null if not recording
     */
    suspend fun stopRecording(): File? =
        withContext(Dispatchers.IO) {
            if (!isRecording) {
                return@withContext null
            }

            try {
                mediaRecorder?.apply {
                    stop()
                    reset()
                }

                val file = currentRecordingFile
                cleanupRecorder()

                file
            } catch (e: Exception) {
                cleanupRecorder()
                null
            }
        }

    /**
     * Cancel recording and delete the file
     */
    suspend fun cancelRecording() =
        withContext(Dispatchers.IO) {
            if (isRecording) {
                try {
                    mediaRecorder?.apply {
                        stop()
                        reset()
                    }
                } catch (e: Exception) {
                    // Ignore errors during cancel
                }

                currentRecordingFile?.delete()
                cleanupRecorder()
            }
        }

    /**
     * Get current recording duration in milliseconds
     */
    fun getRecordingDuration(): Long =
        if (isRecording && currentRecordingFile?.exists() == true) {
            System.currentTimeMillis() - (currentRecordingFile?.lastModified() ?: 0L)
        } else {
            0L
        }

    /**
     * Check if currently recording
     */
    fun isRecording(): Boolean = isRecording

    private fun cleanupRecorder() {
        try {
            mediaRecorder?.release()
        } catch (e: Exception) {
            // Ignore
        }
        mediaRecorder = null
        currentRecordingFile = null
        isRecording = false
    }

    private fun createAudioFile(): File {
        val audioDir = File(context.filesDir, "audio")
        if (!audioDir.exists()) {
            audioDir.mkdirs()
        }

        return File.createTempFile(
            "AUDIO_${System.currentTimeMillis()}",
            ".m4a",
            audioDir,
        )
    }
}
