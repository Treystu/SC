# Migration Guide to V1.0

## Overview

This guide helps you migrate to Sovereign Communications V1.0 from earlier versions (0.1.x).

---

## Breaking Changes

### Core Library (@sc/core)

#### 1. Database Schema Updates

**V1.0** introduces schema version 3 with new persistence stores:

```typescript
// Before (v0.1.x)
const db = await getDatabase();
await db.saveMessage(message);

// After (v1.0)
const db = await getDatabase();
// Schema auto-migrates on first access
await db.saveMessage(message);
```

**Migration**: Automatic - the database will automatically migrate when opened with v1.0.

**Backup recommended**: Create a backup before upgrading:
```typescript
import { BackupManager } from './storage/backup';
const backup = new BackupManager();
await backup.createBackup(true); // encrypted backup
```

#### 2. Message Validation

**V1.0** enforces strict message validation and sanitization:

```typescript
// Before (v0.1.x)
sendMessage(peerId, messageContent);

// After (v1.0)
import { validateMessageContent } from '@sc/core';

const validation = validateMessageContent(messageContent);
if (!validation.valid) {
  console.error(validation.error);
  return;
}
sendMessage(peerId, validation.sanitized);
```

**Migration**: Update all message sending code to validate content first.

#### 3. Rate Limiting

**V1.0** introduces rate limiting for spam prevention:

```typescript
// After (v1.0)
import { rateLimiter } from '@sc/core';

const rateLimitResult = rateLimiter.canSendMessage(userId);
if (!rateLimitResult.allowed) {
  console.error(rateLimitResult.reason);
  return;
}
```

**Limits**:
- 60 messages per minute
- 1,000 messages per hour
- 100 file uploads per hour

**Migration**: Add rate limit checks before sending messages.

#### 4. File Upload Validation

**V1.0** enforces file upload restrictions:

```typescript
// After (v1.0)
import { validateFile } from '@sc/core';

const validation = validateFileUpload(file);
if (!validation.valid) {
  console.error(validation.error);
  return;
}
```

**Limits**:
- Max file size: 100MB
- Max files per message: 10
- Blocked extensions: `.exe`, `.bat`, `.cmd`, `.com`, `.pif`, `.scr`, `.vbs`, `.js`, `.jar`, `.app`, `.deb`, `.rpm`

**Migration**: Add file validation before uploads.

---

### Web Application

#### 1. Identity Management

**V1.0** refactors identity into `useMeshNetwork` hook:

```typescript
// Before (v0.1.x)
import { generateIdentity } from './utils/identity';
const identity = await generateIdentity();

// After (v1.0)
import { useMeshNetwork } from './hooks/useMeshNetwork';
const { identity } = useMeshNetwork();
```

**Migration**: Replace standalone identity generation with the hook.

#### 2. Connection Status

**V1.0** adds connection quality monitoring:

```typescript
// After (v1.0)
const { status } = useMeshNetwork();
console.log(status.connectionQuality); // 'excellent' | 'good' | 'fair' | 'poor' | 'offline'
```

**Migration**: Use `status.connectionQuality` instead of manual checks.

#### 3. Profile Management

**V1.0** introduces user profiles:

```typescript
// After (v1.0)
import { ProfileManager } from './managers/ProfileManager';

const profileManager = new ProfileManager();
await profileManager.updateProfile({
  displayName: 'Alice',
  avatar: avatarBase64,
  bio: 'Mesh networking enthusiast',
  status: 'online'
});
```

**Migration**: Create user profiles for display names instead of using peer IDs.

---

### Android Application

#### 1. Application Initialization

**V1.0** requires proper initialization in `SCApplication`:

```kotlin
// After (v1.0)
class SCApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Automatic initialization of:
        // - Crypto components
        // - Identity loading
        // - Mesh network service
    }
}
```

**Migration**: Ensure your `Application` class extends `SCApplication`.

#### 2. Mesh Network Integration

**V1.0** integrates mesh network into ViewModels:

```kotlin
// Before (v0.1.x)
// Manual message persistence only

// After (v1.0)
val meshManager = SCApplication.instance.meshNetworkManager
meshManager.sendMessage(recipientId, message)
```

**Migration**: Update ViewModels to use `meshNetworkManager` for sending.

#### 3. Security Features

**V1.0** adds backup encryption:

```kotlin
// After (v1.0)
val backupManager = DatabaseBackupManager(context)
val backupFile = backupManager.createBackup(encryptBackup = true)
```

**Migration**: Enable encrypted backups in settings.

---

### iOS Application

#### 1. Background Modes

**V1.0** requires background mode configuration in `Info.plist`:

```xml
<!-- Already configured in v1.0 -->
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
    <string>bluetooth-central</string>
    <string>bluetooth-peripheral</string>
    <string>fetch</string>
    <string>processing</string>
</array>
```

**Migration**: No action needed - already configured.

---

## New Features in V1.0

### ✨ Features

1. **Group Messaging**: Create and manage group chats
2. **Network Diagnostics**: Real-time network status and peer monitoring
3. **Connection Quality**: Visual indicators for connection health
4. **Offline Queue**: Automatic message retry with exponential backoff
5. **Profile System**: User profiles with display names and avatars
6. **Security Alerts**: Peer security alert reporting system
7. **Enhanced Discovery**: QR codes, audio pairing, proximity pairing
8. **Public Rooms**: Join public relay rooms for discovery
9. **Background Sync**: Persistent mesh network in background (mobile)

### 🔒 Security

1. **Input Sanitization**: XSS protection via DOMPurify
2. **Rate Limiting**: Spam prevention
3. **File Validation**: File type and size restrictions
4. **Backup Encryption**: Encrypted database backups
5. **Keystore Integration**: Android Keystore for key storage
6. **Certificate Pinning**: Secure WebRTC signaling

### 🎨 UI/UX

1. **Material 3 Theming**: Modern design system (Android)
2. **Dark Mode**: System-aware theme
3. **Accessibility**: ARIA labels and keyboard navigation
4. **PWA Support**: Installable web app
5. **Service Worker**: Offline functionality

---

## Upgrade Steps

### For Web Users

1. **Backup your data** (optional but recommended):
   ```typescript
   import { BackupManager } from './components/BackupManager';
   // Use the UI to create a backup
   ```

2. **Clear browser cache** (if experiencing issues):
   - Chrome: Settings → Privacy → Clear browsing data
   - Firefox: Settings → Privacy → Clear Data

3. **Reload the app**:
   - The database will automatically migrate
   - Your identity and contacts will be preserved

### For Android Users

1. **Backup your database**:
   ```
   Settings → Backup & Restore → Create Backup
   ```

2. **Update the app**:
   - Via Google Play Store (when available)
   - Or install the APK manually

3. **First launch**:
   - Database auto-migrates
   - Grant any new permissions (Bluetooth, notifications)

### For iOS Users

1. **Backup via iCloud** (automatic)

2. **Update the app**:
   - Via App Store (when available)
   - Or via TestFlight

3. **First launch**:
   - Database auto-migrates
   - Grant any new permissions

---

## Rollback Instructions

If you need to rollback to v0.1.x:

### Web

1. Restore from backup:
   ```typescript
   await backup.restoreBackup(backupFile);
   ```

2. Use browser's "Revert to previous version" if deployed via Netlify

### Android

1. Uninstall v1.0
2. Install v0.1.x APK
3. Restore from backup in Settings

### iOS

1. Delete app
2. Reinstall from previous version (if available)
3. Restore from iCloud backup

---

## Known Issues

### Web

- **Issue**: DOMPurify tests fail in Node.js environment
  - **Impact**: None (browser-only functionality)
  - **Workaround**: Tests pass in browser

### Android

- **Issue**: BLE scanning requires runtime permissions
  - **Impact**: BLE mesh not available without permission
  - **Workaround**: Grant permissions in Settings

### iOS

- **Issue**: Background fetch may be throttled by iOS
  - **Impact**: Delayed message delivery in background
  - **Workaround**: Keep app in foreground or enable notifications

---

## Support

For migration issues:

1. Check [V1_RELEASE_CHECKLIST.md](V1_RELEASE_CHECKLIST.md)
2. Review [TODO_AUDIT.md](../TODO_AUDIT.md)
3. File an issue on [GitHub](https://github.com/Treystu/SC/issues)

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history.

---

**Last Updated**: 2025-12-04
**Version**: 1.0.0
