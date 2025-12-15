package com.sovereign.communications.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sovereign.communications.data.SettingsRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
) : ViewModel() {
    // Expose the unified local Peer ID from the Application singleton
    val localPeerId: String = com.sovereign.communications.SCApplication.instance.localPeerId ?: "Unknown"

    val bleEnabled: StateFlow<Boolean> =
        settingsRepository.bleEnabled
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    val webrtcEnabled: StateFlow<Boolean> =
        settingsRepository.webrtcEnabled
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    fun setBleEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setBleEnabled(enabled)
        }
    }

    fun setWebrtcEnabled(enabled: Boolean) {
        viewModelScope.launch {
            settingsRepository.setWebrtcEnabled(enabled)
        }
    }
}
