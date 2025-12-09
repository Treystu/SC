//
//  Strings.swift
//  SovereignCommunications
//
//  Created by SC Platform Team on 2025-12-09.
//  Purpose: Centralized string constants for UI (Unified terminology)
//

import Foundation

/**
 * Centralized strings for Sovereign Communications iOS app
 * 
 * Unified terminology (matches Android/Web):
 * - Use "Contact" not "Peer"
 * - Use "Conversation" not "Chat"
 * - Use "Connected/Disconnected" not "Online/Offline"
 * - Spell out "End-to-end encrypted" not "E2E"
 */
struct Strings {
    
    // MARK: - App
    struct App {
        static let name = "Sovereign Communications"
        static let tagline = "Serverless, secure, sovereign communication"
    }
    
    // MARK: - Navigation
    struct Navigation {
        static let conversations = "Conversations"
        static let contacts = "Contacts"
        static let settings = "Settings"
        static let diagnostics = "Diagnostics"
    }
    
    // MARK: - Conversation List
    struct ConversationList {
        static let noConversations = "No conversations yet"
        static let addContactHint = "Add a contact to start messaging"
        static let unreadMessages = "%d unread messages"
        static let pinnedConversation = "Pinned conversation"
    }
    
    // MARK: - Messages
    struct Messages {
        static let typeMessage = "Type a message..."
        static let send = "Send"
        static let messagePending = "Sending"
        static let messageSent = "Sent"
        static let messageDelivered = "Delivered"
        static let messageRead = "Read"
        static let messageFailed = "Failed to send"
        static let messageQueued = "Queued"
    }
    
    // MARK: - Connection Status
    struct ConnectionStatus {
        static let connected = "Connected"
        static let disconnected = "Disconnected"
        static let searchingContacts = "Searching for contacts..."
        static let connectedToContacts = "Connected to %d contact(s)"
        static let noContactsConnected = "No contacts connected"
    }
    
    // MARK: - Security
    struct Security {
        static let endToEndEncrypted = "End-to-end encrypted"
        static let verifiedContact = "Verified contact"
        static let unverified = "Unverified contact"
        static let verifyContactPrompt = "Verify this contact by comparing fingerprints"
        static let fingerprint = "Fingerprint"
        static let compareFingerprints = "Compare Fingerprints"
    }
    
    // MARK: - Contacts
    struct Contacts {
        static let addContact = "Add Contact"
        static let scanQRCode = "Scan QR Code"
        static let enterManually = "Enter Manually"
        static let contactAdded = "Contact added successfully"
        static let contactRemoved = "Contact removed"
        static let contactBlocked = "Contact blocked"
        static let contactUnblocked = "Contact unblocked"
        static let noContacts = "No contacts yet"
    }
    
    // MARK: - Onboarding
    struct Onboarding {
        static let welcome = "Welcome to Sovereign Communications"
        static let introTitle1 = "Truly Serverless"
        static let introText1 = "No central servers. Your messages go directly between devices."
        static let introTitle2 = "End-to-End Encrypted"
        static let introText2 = "Only you and your contact can read your messages."
        static let introTitle3 = "Works Offline"
        static let introText3 = "Messages queue and deliver when you reconnect."
        static let getStarted = "Get Started"
        static let createIdentity = "Create Identity"
        static let chooseDisplayName = "Choose Display Name"
    }
    
    // MARK: - Permissions
    struct Permissions {
        static let permissionRequired = "Permission Required"
        static let bluetoothRationale = "Bluetooth is required for mesh networking"
        static let locationRationale = "Location is required for Bluetooth scanning"
        static let notificationRationale = "Notifications alert you of new messages"
        static let cameraRationale = "Camera is needed to scan QR codes"
        static let microphoneRationale = "Microphone is needed for voice messages"
    }
    
    // MARK: - Notifications
    struct Notifications {
        static let newMessage = "New message from %@"
        static let reply = "Reply"
        static let markRead = "Mark as Read"
    }
    
    // MARK: - Media
    struct Media {
        static let recordVoiceMessage = "Record voice message"
        static let stopRecording = "Stop recording"
        static let cancelRecording = "Cancel"
        static let playVoiceMessage = "Play voice message"
        static let pauseVoiceMessage = "Pause"
        static let selectImage = "Select image"
        static let selectFile = "Select file"
        static let recordingDuration = "Recording: %@"
    }
    
    // MARK: - File Operations
    struct FileOperations {
        static let fileTooLarge = "File is too large (max %@)"
        static let fileTypeNotSupported = "File type not supported"
        static let attachmentDownloading = "Downloading..."
        static let attachmentFailed = "Download failed"
    }
    
    // MARK: - Settings
    struct Settings {
        static let themeSettings = "Theme"
        static let themeLight = "Light"
        static let themeDark = "Dark"
        static let themeSystem = "System default"
        static let notificationSettings = "Notifications"
        static let backupRestore = "Backup & Restore"
        static let createBackup = "Create Backup"
        static let restoreBackup = "Restore Backup"
        static let clearCache = "Clear Cache"
        static let cacheSize = "Cache size: %@"
        static let exportData = "Export Data"
        static let importData = "Import Data"
    }
    
    // MARK: - Errors
    struct Errors {
        static let genericError = "An error occurred"
        static let networkError = "Network error. Please check your connection."
        static let permissionDenied = "Permission denied"
        static let fileNotFound = "File not found"
        static let recordingFailed = "Recording failed"
        static let invalidQRCode = "Invalid QR code"
        static let contactAlreadyExists = "Contact already exists"
    }
    
    // MARK: - Actions
    struct Actions {
        static let retry = "Retry"
        static let cancel = "Cancel"
        static let ok = "OK"
        static let delete = "Delete"
        static let share = "Share"
        static let copy = "Copy"
        static let save = "Save"
        static let done = "Done"
        static let edit = "Edit"
    }
    
    // MARK: - Accessibility
    struct Accessibility {
        static let sendMessage = "Send message"
        static let attachFile = "Attach file"
        static let recordAudio = "Record audio message"
        static let messageBubble = "Message bubble"
        static let conversationItem = "Conversation with %@"
        static let messageStatus = "Message status: %@"
    }
}
