package com.sovereign.communications.media

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * Optimized audio player for voice messages
 * Task 85: Optimize voice playback
 */
class AudioPlayer(private val context: Context) {
    
    private var mediaPlayer: MediaPlayer? = null
    private var currentUri: Uri? = null
    
    private val _playbackState = MutableStateFlow(PlaybackState.IDLE)
    val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()
    
    private val _currentPosition = MutableStateFlow(0)
    val currentPosition: StateFlow<Int> = _currentPosition.asStateFlow()
    
    private val _duration = MutableStateFlow(0)
    val duration: StateFlow<Int> = _duration.asStateFlow()
    
    /**
     * Play audio from file
     */
    fun play(file: File) {
        play(Uri.fromFile(file))
    }
    
    /**
     * Play audio from URI
     */
    fun play(uri: Uri) {
        if (currentUri == uri && mediaPlayer != null) {
            // Resume current playback
            resume()
            return
        }
        
        // Stop current playback and start new
        stop()
        currentUri = uri
        
        try {
            mediaPlayer = MediaPlayer().apply {
                setDataSource(context, uri)
                setOnPreparedListener { mp ->
                    _duration.value = mp.duration
                    mp.start()
                    _playbackState.value = PlaybackState.PLAYING
                    startProgressTracking()
                }
                setOnCompletionListener {
                    _playbackState.value = PlaybackState.COMPLETED
                    _currentPosition.value = 0
                }
                setOnErrorListener { _, _, _ ->
                    _playbackState.value = PlaybackState.ERROR
                    true
                }
                prepareAsync()
            }
            
            _playbackState.value = PlaybackState.LOADING
        } catch (e: Exception) {
            _playbackState.value = PlaybackState.ERROR
        }
    }
    
    /**
     * Pause playback
     */
    fun pause() {
        mediaPlayer?.let { mp ->
            if (mp.isPlaying) {
                mp.pause()
                _playbackState.value = PlaybackState.PAUSED
            }
        }
    }
    
    /**
     * Resume playback
     */
    fun resume() {
        mediaPlayer?.let { mp ->
            if (!mp.isPlaying) {
                mp.start()
                _playbackState.value = PlaybackState.PLAYING
                startProgressTracking()
            }
        }
    }
    
    /**
     * Stop playback and release resources
     */
    fun stop() {
        mediaPlayer?.let { mp ->
            if (mp.isPlaying) {
                mp.stop()
            }
            mp.reset()
            mp.release()
        }
        mediaPlayer = null
        currentUri = null
        _playbackState.value = PlaybackState.IDLE
        _currentPosition.value = 0
        _duration.value = 0
    }
    
    /**
     * Seek to position in milliseconds
     */
    fun seekTo(position: Int) {
        mediaPlayer?.seekTo(position)
        _currentPosition.value = position
    }
    
    /**
     * Set playback speed (Android 6.0+)
     */
    fun setPlaybackSpeed(speed: Float) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            mediaPlayer?.playbackParams = mediaPlayer?.playbackParams?.setSpeed(speed) 
                ?: return
        }
    }
    
    private fun startProgressTracking() {
        // This would typically use a coroutine to update position periodically
        // For simplicity, we're just updating on demand
    }
    
    /**
     * Get current playback position
     */
    fun getCurrentPosition(): Int {
        return mediaPlayer?.currentPosition ?: 0
    }
    
    /**
     * Get total duration
     */
    fun getDuration(): Int {
        return mediaPlayer?.duration ?: 0
    }
    
    /**
     * Release all resources
     */
    fun release() {
        stop()
    }
}

enum class PlaybackState {
    IDLE,
    LOADING,
    PLAYING,
    PAUSED,
    COMPLETED,
    ERROR
}
