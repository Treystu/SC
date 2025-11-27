package com.sovereign.communications.util

import android.text.Html

object InputSanitizer {
    fun sanitize(input: String): String {
        // Use Html.escapeHtml to prevent XSS attacks.
        // Note: For Android API level 24 and above, Html.escapeHtml is available.
        // For lower API levels, you might need to use a different approach or a compat library.
        return Html.escapeHtml(input)
    }
}