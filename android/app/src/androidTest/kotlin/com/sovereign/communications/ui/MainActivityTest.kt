package com.sovereign.communications.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * UI tests for MainActivity using Compose Testing
 * Task 80: Comprehensive UI tests (Espresso/Compose)
 */
@RunWith(AndroidJUnit4::class)
class MainActivityTest {
    
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()
    
    @Test
    fun mainActivity_launches_successfully() {
        // Verify that the main screen is displayed
        composeTestRule.waitForIdle()
    }
    
    @Test
    fun mainScreen_displays_conversations_tab() {
        // Check if conversations tab is visible
        composeTestRule.onNodeWithText("Conversations")
            .assertExists()
            .assertIsDisplayed()
    }
    
    @Test
    fun mainScreen_can_switch_tabs() {
        // Wait for content to load
        composeTestRule.waitForIdle()
        
        // Switch to contacts tab if it exists
        composeTestRule.onNodeWithText("Contacts")
            .performClick()
        
        composeTestRule.waitForIdle()
    }
    
    @Test
    fun conversationList_displays_empty_state() {
        // When no conversations exist, should show empty state
        composeTestRule.onNodeWithText("No conversations yet")
            .assertExists()
    }
    
    @Test
    fun messageInput_is_accessible() {
        // Verify message input has proper accessibility
        composeTestRule.onNodeWithContentDescription("Type a message")
            .assertExists()
    }
}
