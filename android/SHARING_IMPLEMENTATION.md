# Android Native Sharing Implementation

This document describes the Android-specific sharing functionality implemented for Sovereign Communications.

## Overview

The Android app supports multiple native sharing methods:

1. **QR Code Sharing** - Display and scan QR codes containing invite data
2. **NFC Tap-to-Share** - Share invites by tapping NFC-enabled devices together
3. **Google Nearby Connections** - Discover and share with nearby devices offline
4. **Android Share Sheet** - Share invite links via messaging apps, email, etc.
5. **APK Sharing** - Share the app installer directly with invite data

## Architecture

### Core Components

#### Data Models (`com.sovereign.communications.sharing.models`)

- **Invite**: Represents an invite code with metadata
  - `code`: 64-character hex invite code
  - `inviterPeerId`: Peer ID of the inviter
  - `inviterPublicKey`: Public key for verification
  - `inviterName`: Optional display name
  - `createdAt`: Creation timestamp
  - `expiresAt`: Expiration timestamp (default: 7 days)
  - `signature`: Cryptographic signature
  - `bootstrapPeers`: List of bootstrap peer IDs

- **SharePayload**: Serializable payload for QR codes, NFC, etc.
  - `version`: Protocol version
  - `inviteCode`: The invite code
  - `inviterPeerId`: Peer ID
  - `signature`: Signature bytes
  - `bootstrapPeers`: Bootstrap peers
  - `timestamp`: Share timestamp

#### Managers

##### InviteManager (`InviteManager.kt`)

Manages the lifecycle of invites:

```kotlin
val inviteManager = InviteManager(context, peerId, publicKey, displayName)

// Create an invite
val invite = inviteManager.createInvite(ttl = 7 * 24 * 60 * 60 * 1000L)

// Validate an invite
val result = inviteManager.validateInvite(code)

// Redeem an invite
inviteManager.redeemInvite(code) { invite ->
    // Handle successful redemption
}

// Extract invite code from various formats
val code = inviteManager.extractInviteCode(data)
```

##### ShareManager (`ShareManager.kt`)

Handles Android Share Sheet integration:

```kotlin
val shareManager = ShareManager(context)

// Share via Share Sheet (text only)
shareManager.shareApp(invite, includeAPK = false)

// Share via Share Sheet (with APK)
shareManager.shareApp(invite, includeAPK = true)

// Share just the invite code
shareManager.shareInviteCode(invite)

// Share via specific app
shareManager.shareViaApp(invite, "com.whatsapp")
```

##### NFCShareManager (`NFCShareManager.kt`)

Manages NFC-based sharing:

```kotlin
val nfcManager = NFCShareManager(activity)

// Check NFC availability
if (nfcManager.isNFCAvailable() && nfcManager.isNFCEnabled()) {
    // Enable NFC sharing
    nfcManager.enableNFCSharing(invite)
}

// Disable NFC sharing
nfcManager.disableNFCSharing()

// Parse invite from received NDEF message
val invite = nfcManager.parseInviteFromNdef(message)
```

##### NearbyShareManager (`NearbyShareManager.kt`)

Handles Google Nearby Connections for offline device discovery:

```kotlin
val nearbyManager = NearbyShareManager(context)

// Start advertising (make device discoverable)
nearbyManager.startAdvertising(invite, userName = "Alice")

// Start discovery (find nearby devices)
nearbyManager.startDiscovery { receivedInvite ->
    // Handle received invite
}

// Observe discovered devices
nearbyManager.discoveredDevices.collect { devices ->
    // Update UI with discovered devices
}

// Connect to a device
nearbyManager.connectToDevice(endpointId, deviceName)

// Cleanup
nearbyManager.disconnectAll()
```

##### APKExtractor (`APKExtractor.kt`)

Extracts and shares the APK file:

```kotlin
val apkExtractor = APKExtractor(context)

// Get APK URI for sharing
val uri = apkExtractor.getAPKUri()

// Create shareable APK with embedded invite
val apkFile = apkExtractor.createShareableAPK(invite)

// Get APK size
val size = apkExtractor.getAPKSizeFormatted() // e.g., "15.2 MB"

// Cleanup cached files
apkExtractor.cleanupCache()
```

## User Interface

### SharingScreen

A comprehensive UI screen that provides access to all sharing methods:

```kotlin
SharingScreen(
    onNavigateBack = { /* ... */ },
    onNavigateToQRScanner = { /* ... */ },
    onNavigateToQRDisplay = { data -> /* ... */ }
)
```

Features:
- QR Code display button
- QR Code scanner button
- NFC tap-to-share toggle
- Nearby Connections dialog
- Share Sheet integration
- APK sharing option (if available)
- Active invite display

## Configuration

### AndroidManifest.xml

Required permissions:
```xml
<uses-permission android:name="android.permission.NFC" />
<uses-permission android:name="android.permission.CAMERA" />
```

Features:
```xml
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

Deep link handling:
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="sc.app"
          android:pathPrefix="/join" />
</intent-filter>
```

NFC intent filter:
```xml
<intent-filter>
    <action android:name="android.nfc.action.NDEF_DISCOVERED" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="application/vnd.sovereign.communications" />
</intent-filter>
```

FileProvider configuration:
```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_provider_paths" />
</provider>
```

### build.gradle.kts

Required dependencies:
```kotlin
implementation("com.google.zxing:core:3.5.3")
implementation("androidx.camera:camera-camera2:1.3.1")
implementation("androidx.camera:camera-lifecycle:1.3.1")
implementation("androidx.camera:camera-view:1.3.1")
implementation("com.google.accompanist:accompanist-permissions:0.34.0")
implementation("com.google.android.gms:play-services-nearby:19.3.0")
implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
```

## Usage Examples

### Share via QR Code

```kotlin
// Create invite
val invite = inviteManager.createInvite()

// Create share payload
val payload = inviteManager.createSharePayload(invite)

// Display QR code with payload
QRCodeDisplayScreen(
    peerInfo = payload.toJsonString(),
    onNavigateBack = { /* ... */ }
)
```

### Receive via NFC

```kotlin
// In your Activity
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    
    if (NfcAdapter.ACTION_NDEF_DISCOVERED == intent?.action) {
        intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)?.let { rawMessages ->
            val message = rawMessages[0] as NdefMessage
            val invite = nfcManager.parseInviteFromNdef(message)
            
            invite?.let {
                // Process received invite
                inviteManager.redeemInvite(it.code) { contact ->
                    // Connect to contact
                }
            }
        }
    }
}
```

### Nearby Connections Flow

```kotlin
// Device A (Advertiser)
nearbyManager.startAdvertising(invite, "Alice")

// Device B (Discoverer)
nearbyManager.startDiscovery { receivedInvite ->
    // Show dialog to user
    showDialog("Received invite from ${receivedInvite.inviterName}")
    
    // Redeem invite
    inviteManager.redeemInvite(receivedInvite.code) { contact ->
        // Connected!
    }
}
```

## Security Considerations

1. **Signature Verification**: All invites include Ed25519 signatures
2. **Expiration**: Invites expire after 7 days by default
3. **One-time Use**: Invites are deleted after redemption
4. **Secure Random**: Invite codes use cryptographically secure random generation
5. **FileProvider**: APK sharing uses FileProvider for secure file access

## Testing

Unit tests are provided for all managers:

```bash
./gradlew test
```

Test files:
- `ShareManagerTest.kt`
- `InviteManagerTest.kt`
- `APKExtractorTest.kt`

## Troubleshooting

### NFC not working

1. Check if NFC is enabled in device settings
2. Ensure NFC hardware is available: `nfcManager.isNFCAvailable()`
3. Verify NFC permissions in AndroidManifest.xml

### Nearby Connections not discovering devices

1. Ensure both devices have location permissions
2. Check that both devices are on the same network (or nearby)
3. Verify Google Play Services is installed and up to date

### APK sharing fails

1. Check if APK extraction is available: `apkExtractor.isAPKExtractionAvailable()`
2. Ensure FileProvider is configured correctly
3. Verify storage permissions if needed

## Future Enhancements

- [ ] Bluetooth Low Energy (BLE) sharing
- [ ] Wi-Fi Direct integration
- [ ] Batch invite creation
- [ ] QR code styling/branding
- [ ] Analytics for sharing methods
- [ ] Rate limiting for invite creation
- [ ] Invite usage tracking

## References

- [Android NFC Guide](https://developer.android.com/guide/topics/connectivity/nfc)
- [Google Nearby Connections](https://developers.google.com/nearby/connections/overview)
- [ZXing Documentation](https://github.com/zxing/zxing)
- [FileProvider Guide](https://developer.android.com/reference/androidx/core/content/FileProvider)
