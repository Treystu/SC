package com.sovereign.communications.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {

    private val BLE_ENABLED = booleanPreferencesKey("ble_enabled")
    private val WEBRTC_ENABLED = booleanPreferencesKey("webrtc_enabled")

    val bleEnabled: Flow<Boolean> = context.dataStore.data
        .map { preferences ->
            preferences[BLE_ENABLED] ?: true
        }

    val webrtcEnabled: Flow<Boolean> = context.dataStore.data
        .map { preferences ->
            preferences[WEBRTC_ENABLED] ?: true
        }

    suspend fun setBleEnabled(enabled: Boolean) {
        context.dataStore.edit { settings ->
            settings[BLE_ENABLED] = enabled
        }
    }

    suspend fun setWebrtcEnabled(enabled: Boolean) {
        context.dataStore.edit { settings ->
            settings[WEBRTC_ENABLED] = enabled
        }
    }
}