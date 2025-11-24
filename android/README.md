# Sovereign Communications - Android Application

## Overview

The Android application for Sovereign Communications provides a native mobile experience for secure, decentralized messaging with Material Design 3 UI and comprehensive features.

## Architecture

### Technology Stack

- **Language**: Kotlin 2.0.21
- **UI Framework**: Jetpack Compose with Material Design 3
- **Architecture**: MVVM with Repository pattern
- **Database**: Room (SQLite) with migration support
- **Async**: Kotlin Coroutines + Flow
- **Dependency Injection**: Manual DI (lightweight)
- **Minimum SDK**: Android 8.0 (API 26)
- **Target SDK**: Android 15 (API 35)

### Project Structure

```
app/src/main/kotlin/com/sovereign/communications/
├── data/                    # Data layer
│   ├── backup/             # Database backup/restore
│   ├── dao/                # Room DAOs
│   ├── entity/             # Room entities
│   └── migration/          # Database migrations
├── media/                   # Media handling
│   ├── AudioPlayer.kt      # Voice playback
│   ├── AudioRecorder.kt    # Voice recording
│   ├── FileManager.kt      # File operations
│   └── ImageCompressor.kt  # Image compression
├── notifications/           # Notification system
│   ├── NotificationManager.kt
│   └── NotificationReceiver.kt
├── permissions/             # Permission handling
│   └── PermissionManager.kt
├── service/                 # Background services
│   └── MeshNetworkService.kt
├── ui/                      # Presentation layer
│   ├── components/         # Reusable UI components
│   ├── screen/             # App screens
│   ├── theme/              # Material 3 theme
│   ├── viewmodel/          # ViewModels
│   └── MainActivity.kt
└── SCApplication.kt         # Application class
```

## Features

### Database (Tasks 57-61) ✅

- **Room Database** with proper schema management
- **Migration Strategy** for version upgrades
- **Performance Indices** on frequently queried columns
- **Backup/Restore** functionality
- **Comprehensive Tests** for data operations

**Schema:**
- Messages table with indices on conversationId, timestamp, status, senderId
- Conversations table with index on lastMessageTimestamp
- Contacts table with unique index on publicKey

### Services & Notifications (Tasks 62-65) ✅

- **Foreground Service** for persistent mesh connectivity
- **Battery Optimization** with adaptive heartbeat and partial wake lock
- **Notification Channels**: Messages, Service, Alerts
- **Notification Actions**: Reply, Mark as Read with RemoteInput
- **Notification Grouping** for conversations

### Permissions (Tasks 66-68) ✅

- **Runtime Permission Manager** with proper request flows
- **Permission Groups**:
  - Bluetooth (CONNECT, SCAN, ADVERTISE)
  - Location (FINE, COARSE - required for BLE)
  - Notifications (POST_NOTIFICATIONS on Android 13+)
  - Camera (for QR codes)
  - Audio (RECORD_AUDIO for voice messages)

### UI Components (Tasks 73-82) 🔄

- **Material Design 3** compliance
- **Dynamic Color** support (Android 12+)
- **Accessibility**: Content descriptions, TalkBack support
- **Components**:
  - MessageBubble with status indicators
  - ConversationItem with unread badges
  - Reusable UI patterns

### Media Features (Tasks 84-87) ✅

- **Audio Recording** with quality settings (64kbps AAC)
- **Audio Playback** with StateFlow for reactive state
- **Image Compression** with configurable quality
- **File Management** with caching and size limits
- **Automatic Cache Cleanup** based on age and size

## Development

### Building

```bash
cd android
gradle build
```

### Testing

```bash
# Unit tests
gradle test

# Instrumentation tests
gradle connectedAndroidTest
```

### Running

```bash
# Install debug APK
gradle installDebug

# Run on connected device
gradle installDebug && adb shell am start -n com.sovereign.communications/.ui.MainActivity
```

## Performance Targets

- **Startup Time**: < 2 seconds (cold start)
- **UI Performance**: Smooth 60fps with Jetpack Compose
- **Memory Usage**: < 100MB typical, < 150MB peak
- **Battery Impact**: Minimal with optimized background service
- **Database Operations**: < 50ms for common queries (with indices)

## Battery Optimization

The app implements several battery-saving strategies:

1. **Partial Wake Lock**: Only keeps CPU awake, not screen
2. **Adaptive Heartbeat**: 30s when active, 60s when idle
3. **Efficient BLE**: Duty cycling for scanning/advertising
4. **Foreground Service**: Properly declared for background restrictions compliance

## Accessibility

All UI components include:
- **Content Descriptions** for screen readers
- **Semantic Labels** for interactive elements
- **Touch Target Sizes** meeting Material Design guidelines (48dp minimum)
- **Color Contrast** meeting WCAG AA standards
- **Text Scaling** support

## Security

- **Database Encryption**: Hooks for SQLCipher integration
- **Secure File Storage**: Files stored in app-private directories
- **Permission Model**: Minimal permissions, runtime requests with rationale
- **No Plaintext Secrets**: All keys managed through secure storage APIs

## Testing Strategy

### Unit Tests
- Database operations (MessageDao, etc.)
- Business logic in ViewModels
- Utility functions (file operations, compression)

### Integration Tests
- Service lifecycle
- Permission flows
- Notification delivery

### UI Tests
- Screen navigation
- User interactions
- Accessibility features

## Known Limitations

- Database encryption requires SQLCipher library (not yet integrated)
- BLE implementation requires further optimization
- WebRTC Android SDK needs update to latest version
- Screenshot tests not yet implemented

## Future Enhancements

- [ ] SQLCipher integration for database encryption
- [ ] Advanced BLE mesh routing
- [ ] WebRTC optimization for battery
- [ ] Offline message queue
- [ ] End-to-end test suite
- [ ] Performance benchmarks
- [ ] Memory leak detection

## Contributing

When contributing to the Android app:

1. Follow Kotlin coding conventions
2. Use Material Design 3 components
3. Ensure accessibility support
4. Write tests for new features
5. Update documentation
6. Test on multiple Android versions (API 26-35)

## Resources

- [Android Developers Guide](https://developer.android.com/)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Material Design 3](https://m3.material.io/)
- [Room Database](https://developer.android.com/training/data-storage/room)
- [Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)
