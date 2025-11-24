# Platform Comparison Visual Guide

**Reference:** [PLATFORM_PARITY_AUDIT.md](./PLATFORM_PARITY_AUDIT.md)  
**Date:** November 17, 2024

This document provides a visual comparison of UI patterns across platforms. Screenshots should be added as implementation progresses.

---

## 1. Conversation List

### Web
```
┌─────────────────────────────────────┐
│ Sovereign Communications      ⚙️    │
├─────────────────────────────────────┤
│ 🟢 Connected to 2 peers             │
├─────────────────────────────────────┤
│ Conversations          [+ Add]      │
├─────────────────────────────────────┤
│ 📱 Demo Bot                    1:23  │
│    Echo: Hello world                │
├─────────────────────────────────────┤
│ (Empty conversation list)           │
│                                     │
│ Click "Add Contact" to begin        │
└─────────────────────────────────────┘
```

**Features:**
- Dark theme with custom CSS
- Sidebar layout
- Connection status at top
- Add button in header

---

### Android
```
┌─────────────────────────────────────┐
│ ← Conversations           🟢  ⚙️    │
├─────────────────────────────────────┤
│                                     │
│ 📱 Contact Name            1:23 PM  │
│ Last message preview...             │
│─────────────────────────────────────│
│                                     │
│ (Empty state)                       │
│ Add a contact to start messaging    │
│                                     │
│                              [+]    │
└─────────────────────────────────────┘
```

**Features:**
- Material 3 design
- FAB (Floating Action Button) for add
- Connection badge in toolbar
- Light/dark theme support

---

### iOS
```
┌─────────────────────────────────────┐
│ Conversations                  [+]  │
├─────────────────────────────────────┤
│ 🟢                                  │
├─────────────────────────────────────┤
│ 📱 Contact Name            1:23 PM  │
│ Last message preview...             │
│─────────────────────────────────────│
│                                     │
│ No conversations yet                │
│ Tap + to add a contact              │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- iOS design language
- Plus button in navigation
- System font (San Francisco)
- System light/dark theme

---

## 2. Chat View

### Web
```
┌─────────────────────────────────────┐
│ ← Demo Bot                    🟢    │
├─────────────────────────────────────┤
│                                     │
│     ┌─────────────────┐   1:23 PM   │
│     │ Hello world     │             │
│     └─────────────────┘             │
│                                     │
│  ┌─────────────────┐      1:23 PM   │
│  │ Echo: Hello...  │                │
│  └─────────────────┘                │
│                                     │
├─────────────────────────────────────┤
│ [Type a message...]        [Send]   │
└─────────────────────────────────────┘
```

**Features:**
- Message bubbles aligned (right=sent, left=received)
- Timestamps
- Simple input field
- Send button

---

### Android
```
┌─────────────────────────────────────┐
│ ← Contact Name              🟢  ⋮   │
├─────────────────────────────────────┤
│                                     │
│              ┌──────────┐  1:23 PM  │
│              │ Hello!   │           │
│              └──────────┘           │
│                                     │
│  ┌──────────┐             1:24 PM  │
│  │ Hi there │                      │
│  └──────────┘                      │
│                                     │
├─────────────────────────────────────┤
│ [+] [Message]              [📎][>] │
└─────────────────────────────────────┘
```

**Features:**
- Material Design message bubbles
- Attachment button
- Voice/media options
- Menu (⋮) for options

---

### iOS
```
┌─────────────────────────────────────┐
│ ← Contact Name                      │
├─────────────────────────────────────┤
│                                     │
│            ┌────────────┐  1:23 PM  │
│            │ Hello!     │           │
│            └────────────┘           │
│                                     │
│  ┌────────────┐           1:24 PM  │
│  │ Hi there   │                    │
│  └────────────┘                    │
│                                     │
├─────────────────────────────────────┤
│ [+] [Message...]           [↑]     │
└─────────────────────────────────────┘
```

**Features:**
- iOS-style message bubbles
- Plus button for attachments
- iMessage-like interface
- Up arrow to send

---

## 3. Add Contact Flow

### Web - Dialog
```
┌─────────────────────────────────────┐
│                                     │
│   ┌─────────────────────────────┐   │
│   │ Add Contact            [X]  │   │
│   ├─────────────────────────────┤   │
│   │ [QR Code] [Manual Entry]    │   │
│   ├─────────────────────────────┤   │
│   │                             │   │
│   │ Peer ID:                    │   │
│   │ ┌─────────────────────────┐ │   │
│   │ │ Enter peer ID...        │ │   │
│   │ └─────────────────────────┘ │   │
│   │                             │   │
│   │ Name (optional):            │   │
│   │ ┌─────────────────────────┐ │   │
│   │ │ Enter name...           │ │   │
│   │ └─────────────────────────┘ │   │
│   │                             │   │
│   │        [Cancel]  [Add]      │   │
│   └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

---

### Android - Bottom Sheet
```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│   ╭─────────────────────────────╮   │
│   │      Add Contact            │   │
│   ├─────────────────────────────┤   │
│   │ [📷 Scan QR Code]           │   │
│   │                             │   │
│   │ [✍️ Enter Manually]          │   │
│   │                             │   │
│   │ [📡 Find Nearby (BLE)]      │   │
│   │                             │   │
│   │         [Cancel]            │   │
│   ╰─────────────────────────────╯   │
└─────────────────────────────────────┘
```

---

### iOS - Sheet Modal
```
┌─────────────────────────────────────┐
│                                     │
│ ┌───────────────────────────────┐   │
│ │     Add Contact          Done │   │
│ ├───────────────────────────────┤   │
│ │                               │   │
│ │ • Scan QR Code                │   │
│ │                               │   │
│ │ • Enter Peer ID               │   │
│ │                               │   │
│ │ • Find Nearby                 │   │
│ │                               │   │
│ └───────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

---

## 4. Settings Screen

### Web
```
┌─────────────────────────────────────┐
│ ← Settings                          │
├─────────────────────────────────────┤
│ Identity                            │
│   Peer ID: abc123...          [QR]  │
│                                     │
│ Privacy                             │
│   □ Read receipts                   │
│   □ Typing indicators               │
│                                     │
│ Network                             │
│   WebRTC: Enabled                   │
│   Connection: 2 peers               │
│                                     │
│ Data Sovereignty                    │
│   [Export Data]                     │
│   [Import Data]                     │
│   [Delete All Data]                 │
│                                     │
│ Theme                               │
│   ● Dark                            │
│   ○ Light                           │
└─────────────────────────────────────┘
```

---

### Android
```
┌─────────────────────────────────────┐
│ ← Settings                    🟢    │
├─────────────────────────────────────┤
│ Account                             │
│   Peer ID                           │
│   abc123...                    [>]  │
│                                     │
│ Notifications                       │
│   Message notifications        [>]  │
│                                     │
│ Privacy                             │
│   Blocked contacts             [>]  │
│                                     │
│ Network & Connectivity              │
│   WebRTC                       [>]  │
│   Bluetooth                    [>]  │
│                                     │
│ Theme                               │
│   • System default                  │
│   ○ Light                           │
│   ○ Dark                            │
│                                     │
│ About                               │
│   Version 1.0.0-beta           [>]  │
└─────────────────────────────────────┘
```

---

### iOS
```
┌─────────────────────────────────────┐
│ < Back          Settings            │
├─────────────────────────────────────┤
│                                     │
│ Identity                            │
│   Peer ID              abc123... >  │
│                                     │
│ Notifications                       │
│   Allow Notifications           ○  │
│   Sounds                        ○  │
│                                     │
│ Privacy & Security                  │
│   Blocked Contacts              >  │
│   Data Export                   >  │
│                                     │
│ Appearance                          │
│   Theme                  Automatic  │
│                                     │
│ About                               │
│   Version               1.0.0-beta  │
│   Licenses                      >  │
└─────────────────────────────────────┘
```

---

## 5. Connection Status Indicator

### Web
```
Header: 🟢 Connected to 2 peers
        🟡 Connecting...
        🔴 Disconnected
```

### Android
```
Toolbar badge: 🟢 (green dot)
               🟡 (yellow dot)
               🔴 (red dot)
```

### iOS
```
Navigation: 🟢 Connected
            🟡 Connecting
            🔴 Offline
```

---

## 6. Message Status Indicators

### Proposed Standard

```
Pending:    [○]  Message queued
Sent:       [✓]  Message sent to network
Delivered:  [✓✓] Message received by peer
Read:       [✓✓] (blue) Message read
Failed:     [⚠️] Failed to send
```

**Current Status:**
- Web: ✅ Has component, not integrated
- Android: ❌ Not implemented
- iOS: ❌ Not implemented

---

## 7. Notification Patterns

### Web (Browser Notification)
```
╔════════════════════════════════════╗
║ Sovereign Communications           ║
║ New message from Contact Name      ║
║ Message preview text...            ║
║                            [Reply] ║
╚════════════════════════════════════╝
```

### Android (System Notification)
```
╔════════════════════════════════════╗
║ 📱 Contact Name           1:23 PM  ║
║ Sovereign Communications           ║
║ Message preview text...            ║
║ [Reply] [Mark as Read]             ║
╚════════════════════════════════════╝
```

### iOS (System Notification)
```
╔════════════════════════════════════╗
║ Sovereign Communications  1:23 PM  ║
║ Contact Name                       ║
║ Message preview text...            ║
║                                    ║
╚════════════════════════════════════╝
```

---

## 8. Onboarding Flow (Proposed)

### Screen 1: Welcome
```
┌─────────────────────────────────────┐
│                                     │
│         [App Logo]                  │
│                                     │
│    Sovereign Communications         │
│                                     │
│  Decentralized, End-to-End          │
│    Encrypted Messaging              │
│                                     │
│  • No servers                       │
│  • Complete privacy                 │
│  • You own your data                │
│                                     │
│         [Get Started]               │
│                                     │
│         [○ ○ ● ○]                   │
└─────────────────────────────────────┘
```

### Screen 2: Identity
```
┌─────────────────────────────────────┐
│                                     │
│         [Key Icon]                  │
│                                     │
│    Your Identity Created            │
│                                     │
│  Your unique identity has been      │
│  securely generated and stored.     │
│                                     │
│  Peer ID:                           │
│  ┌───────────────────────────────┐  │
│  │ abc123def456...               │  │
│  └───────────────────────────────┘  │
│                            [Copy]   │
│                                     │
│         [Continue]                  │
│                                     │
│         [○ ● ○ ○]                   │
└─────────────────────────────────────┘
```

### Screen 3: Add First Contact
```
┌─────────────────────────────────────┐
│                                     │
│      [People Icon]                  │
│                                     │
│    Connect with Someone             │
│                                     │
│  To start messaging, add your       │
│  first contact:                     │
│                                     │
│    [📷 Scan QR Code]                │
│                                     │
│    [✍️ Enter Peer ID]                │
│                                     │
│    [📱 Try Demo Mode]               │
│                                     │
│         [Skip for Now]              │
│                                     │
│         [○ ○ ● ○]                   │
└─────────────────────────────────────┘
```

### Screen 4: Privacy Info
```
┌─────────────────────────────────────┐
│                                     │
│       [Lock Icon]                   │
│                                     │
│    Your Privacy is Protected        │
│                                     │
│  ✓ End-to-end encryption            │
│    Only you and your contact        │
│    can read messages                │
│                                     │
│  ✓ No servers                       │
│    Messages go directly peer-       │
│    to-peer                          │
│                                     │
│  ✓ You control your data            │
│    Export, backup, or delete        │
│    anytime                          │
│                                     │
│         [Start Messaging]           │
│                                     │
│         [○ ○ ○ ●]                   │
└─────────────────────────────────────┘
```

---

## 9. Color Palette

### Brand Colors (Proposed)
```
Primary:     #4A90E2 (Blue)
Secondary:   #50C878 (Emerald)
Success:     #00C853 (Green)
Warning:     #FFB300 (Amber)
Error:       #E53935 (Red)
Background:  #1E1E1E (Dark) / #FFFFFF (Light)
Surface:     #2D2D2D (Dark) / #F5F5F5 (Light)
Text:        #FFFFFF (Dark) / #212121 (Light)
```

### Connection Status
```
Connected:    #00C853 (Green)
Connecting:   #FFB300 (Amber)
Disconnected: #9E9E9E (Gray)
Error:        #E53935 (Red)
```

---

## 10. Icon Usage

### Standard Icons
```
Add Contact:     [+] or [👤+]
Settings:        [⚙️] or [三]
Send Message:    [>] or [↑]
Attach File:     [📎]
Camera:          [📷]
Voice:           [🎤]
QR Code:         [▣]
More Options:    [⋮] or [•••]
Back:            [←] or [<]
Search:          [🔍]
```

---

## 11. Typography

### Web
```
Font Family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
Headings:    Bold, 18-24px
Body:        Regular, 14-16px
Small:       Regular, 12px
```

### Android
```
Font Family: Roboto (Material Design)
Headings:    Medium, 20-24sp
Body:        Regular, 16sp
Caption:     Regular, 12sp
```

### iOS
```
Font Family: San Francisco (System Font)
Headings:    Semibold, 20-24pt
Body:        Regular, 17pt
Caption:     Regular, 12pt
```

---

## 12. Spacing & Layout

### Web
```
Padding:     16px (1rem)
Margins:     24px between sections
Border:      1px solid rgba(255,255,255,0.1)
Border Radius: 8px for cards, 18px for bubbles
```

### Android
```
Padding:     16dp
Margins:     16dp between items
Elevation:   2dp for cards, 8dp for dialogs
Corner Radius: 8dp for cards, 16dp for sheets
```

### iOS
```
Padding:     16pt
Margins:     16pt between sections
Shadow:      System default
Corner Radius: 10pt for cards, 18pt for bubbles
```

---

## Note on Screenshots

As implementation progresses, actual screenshots should be added to replace these ASCII mockups. Screenshots should show:

1. Light and dark modes
2. Different screen sizes (mobile, tablet, desktop)
3. Empty states
4. Loading states
5. Error states
6. Success states

**Screenshot Naming Convention:**
```
platform_feature_state_theme.png

Examples:
web_conversation-list_empty_dark.png
android_chat-view_messages_light.png
ios_settings_main_dark.png
```

---

**Document Updated:** November 17, 2024  
**Screenshots Status:** To be added during implementation
