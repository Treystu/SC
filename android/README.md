# Sovereign Communications - Android Application

This is the Android application for Sovereign Communications, a decentralized mesh communication platform.

## Features

- **Room Database**: Local persistence for messages, contacts, and conversations
- **Jetpack Compose UI**: Modern declarative UI framework
- **Foreground Service**: Persistent mesh network connectivity
- **WebRTC**: Peer-to-peer communication
- **BLE Mesh**: Bluetooth Low Energy mesh networking (planned)
- **End-to-End Encryption**: Ed25519 + ChaCha20-Poly1305

## Building

```bash
cd android
./gradlew assembleDebug
```

## Requirements

- Android SDK 26+  
- Target SDK 34
- Kotlin 1.9.20
- Java 17

## Architecture

```
app/
├── data/
│   ├── entity/       # Room entities
│   ├── dao/          # Data access objects
│   └── SCDatabase.kt # Room database
├── service/
│   └── MeshNetworkService.kt  # Foreground service
├── ui/
│   ├── screen/       # Compose screens
│   ├── component/    # Reusable UI components
│   └── theme/        # Material 3 theme
└── util/             # Utility classes
```

## Tasks Implemented

- ✅ Task 57: Set up Android project (Kotlin)
- ✅ Task 58: Implement Room database for messages/contacts
- ✅ Task 59: Create message persistence
- ✅ Task 60: Implement contact persistence
- ✅ Task 61: Create conversation persistence
- ✅ Task 62: Implement foreground service for persistent connectivity
- ✅ Task 73: Create main activity with navigation
- ✅ Task 74: Implement conversation list UI
- ✅ Task 78: Implement contact list UI
- ✅ Task 82: Implement settings screen
- ✅ Task 89: Create basic theme (light/dark)

## Next Steps

- Integrate core cryptography library
- Implement WebRTC peer connections
- Add BLE mesh networking
- Implement message encryption/decryption
- Add QR code scanner
- Implement notifications
