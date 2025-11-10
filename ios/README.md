# Sovereign Communications - iOS

iOS application for the Sovereign Communications decentralized mesh network platform.

## Features

- **SwiftUI Interface**: Modern, native iOS UI with TabView navigation
- **Core Data Persistence**: Local storage for messages, contacts, and conversations
- **Background Modes**: Support for VoIP, Bluetooth LE, and background networking
- **Material Design**: iOS-adapted Material 3 design language
- **Dark/Light Theme**: System-integrated theme support

## Requirements

- iOS 15.0+
- Xcode 14.0+
- Swift 5.9+
- CocoaPods (for dependencies)

## Dependencies

- **WebRTC iOS SDK**: Peer-to-peer communication
- **Sodium** (libsodium): Cryptography (Ed25519, X25519, ChaCha20-Poly1305)
- **ZXing**: QR code scanning/generation

## Project Structure

```
ios/SovereignCommunications/
├── SovereignCommunicationsApp.swift  # App entry point
├── Data/
│   ├── CoreDataStack.swift          # Core Data configuration
│   ├── Entity/                      # Managed object classes
│   │   ├── MessageEntity+CoreDataClass.swift
│   │   ├── ContactEntity+CoreDataClass.swift
│   │   └── ConversationEntity+CoreDataClass.swift
│   └── SovereignCommunications.xcdatamodeld
├── Views/
│   ├── MainView.swift               # TabView navigation
│   ├── ConversationListView.swift   # Conversations screen
│   ├── ContactListView.swift        # Contacts screen
│   └── SettingsView.swift           # Settings screen
└── Components/
    └── ConnectionStatusBadge.swift   # Connection indicator
```

## Build Instructions

```bash
cd ios
open SovereignCommunications.xcodeproj

# Install dependencies (if using CocoaPods)
pod install
open SovereignCommunications.xcworkspace

# Build with Xcode
# Command+B to build
# Command+R to run on simulator/device
```

## Features Implemented

### Database (Core Data)
- Message persistence with conversation relationships
- Contact management with verification status
- Conversation tracking with unread counts
- Automatic context management

### UI Screens
- **Conversations**: List of active chats with empty states
- **Contacts**: Contact list with verification badges
- **Settings**: Identity, network, and app configuration

### Background Capabilities
- VoIP for persistent connectivity
- Bluetooth LE for mesh networking
- Background fetch for syncing

## Core Data Model

**Message Entity**:
- id, conversationId, senderId
- content, timestamp, status
- isEncrypted flag

**Contact Entity**:
- id, publicKey, displayName
- lastSeen, isVerified, isFavorite

**Conversation Entity**:
- id, contactId
- lastMessage, lastMessageTimestamp
- unreadCount, isPinned
- Relationships to messages and contact

## Next Steps

1. Implement chat view with message bubbles
2. Add notification system
3. Integrate WebRTC iOS SDK
4. Implement CoreBluetooth for BLE mesh
5. Add QR code scanner
6. Identity backup/restore

## License

See main project LICENSE file.
