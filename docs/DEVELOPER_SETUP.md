# Developer Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Android Studio (for Android)
- Xcode 14+ (for iOS)
- Git

## Web Application

```bash
cd web
npm install
npm run dev
```

Build for production:
```bash
npm run build
npm run preview
```

## Android Application

1. Open `android/` in Android Studio
2. Sync Gradle dependencies
3. Connect device or start emulator
4. Run application

Build APK:
```bash
cd android
./gradlew assembleRelease
```

## iOS Application

1. Open `ios/SC.xcodeproj` in Xcode
2. Select target device
3. Build and run

## Core TypeScript Libraries

```bash
cd core
npm install
npm run build
npm test
```

## Project Structure

```
├── core/           # Shared TypeScript libraries
│   ├── src/
│   │   ├── crypto/     # Encryption, signing
│   │   ├── mesh/       # Mesh networking
│   │   ├── webrtc/     # WebRTC peer connections
│   │   └── ble/        # Bluetooth mesh
├── web/            # React web application
├── android/        # Android native app
└── ios/            # iOS native app
```

## Running Tests

**All tests:**
```bash
npm test
```

**Specific suites:**
```bash
npm test crypto
npm test mesh
npm test webrtc
```

## Contributing

1. Fork repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## Architecture

- **Crypto Layer:** Ed25519 + ChaCha20-Poly1305
- **Mesh Network:** Flood routing with TTL
- **WebRTC:** Peer-to-peer data channels
- **BLE:** Mobile mesh protocol (Android/iOS)
