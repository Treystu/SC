package com.sovereign.communications.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Material 3 theme for Sovereign Communications
 * Task 89: Create basic theme (light/dark)
 */

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF00D9A1),
    onPrimary = Color(0xFF000000),
    primaryContainer = Color(0xFF00A37A),
    secondary = Color(0xFF6C63FF),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFF121212),
    surface = Color(0xFF1E1E1E),
    onSurface = Color(0xFFE0E0E0),
    error = Color(0xFFCF6679),
)

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF00A37A),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFCCF6EB),
    secondary = Color(0xFF6C63FF),
    onSecondary = Color(0xFFFFFFFF),
    background = Color(0xFFFAFAFA),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1C1C1C),
    error = Color(0xFFB00020),
)

@Composable
fun SCTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content
    )
}
