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
│   ├── ChatView.swift               # Chat interface with message bubbles
│   ├── ContactListView.swift        # Contacts screen
│   └── SettingsView.swift           # Settings screen
├── Components/
│   └── ConnectionStatusBadge.swift   # Connection indicator
├── Notifications/
│   └── NotificationManager.swift     # Push notification management
└── QR/
    └── QRCodeScannerView.swift       # QR code scanner and display
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
- **Chat**: Full chat interface with message bubbles and delivery status
- **Contacts**: Contact list with verification badges
- **Settings**: Identity, network, and app configuration
- **QR Scanner**: Real-time QR code scanning for peer discovery
- **QR Display**: Generate and share peer identity QR codes

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

### Notifications
- Local push notifications for new messages
- Inline reply action from notifications
- Mark as read action
- Notification badge management
- Background notification handling

### QR Code System
- Real-time camera-based QR scanning (AVFoundation)
- QR code generation for peer identity
- Share functionality for peer info
- JSON-encoded peer data format

## Next Steps

1. ✅ ~~Implement chat view with message bubbles~~ **COMPLETE**
2. ✅ ~~Add notification system~~ **COMPLETE**
3. ✅ ~~Add QR code scanner~~ **COMPLETE**
4. Integrate WebRTC iOS SDK
5. Implement CoreBluetooth for BLE mesh
6. Identity backup/restore
7. Voice message support

## License

See main project LICENSE file.
