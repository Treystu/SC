# Critical Improvements Implementation Plan

## 🔴 Critical (Must Fix Before Release)

### 1. Replace Placeholder Signatures and Certificates

- [x] **Android**: `network_security_config.xml` - Replace placeholder pins.
- [x] **Android**: `NFCShareManager.kt` - Replace placeholder signatures/logic.
- [x] **Android**: `InviteManager.kt` - Security hardening.
- [x] **iOS**: `CertificatePinningManager.swift` - Update pinning logic.
- [x] **iOS**: `CoreBridge.swift` - Check for security placeholders.

### 2. Implement Proper JavaScript Engine in Android JSBridge

- [x] **Android**: `JSBridge.kt` - Initialize V8 runtime (currently "JavaScript engine not implemented").

### 3. Complete BLE Message Routing and Transmission Logic

- [x] **Android**: `BLEBackgroundService.kt` - Enhance background logic.
- [x] **Android**: `BLEMessageRouting.kt` - Implement transmission logic.
- [x] **Android**: `BLEReassembly.kt` - Review.
- [x] **Android**: `MeshNetworkManager.kt` - Integrate `BLEMessageRouting`.

### 4. Fix Skipped E2E Tests for Core Functionality

- [x] **Universal**: `tests/e2e/*.ts` - Unskip critical test suites.
- [x] `messaging.e2e.test.ts` - Unskip and fix.

### 5. Implement Proper Sender ID Extraction in iOS

- [x] **iOS**: `MeshNetworkManager.swift` - Update `handleCoreApplicationMessage` to use extraction logic.

### 6. Replace Placeholder Encryption in Backups

- [x] **Core**: `backup.ts` - Replace XOR with AES-GCM.
- [x] **Core**: `restore.ts` - Replace XOR with AES-GCM.

### 7. Investigate API Resolution Failure

- [x] **Core**: `src/api/room-client.ts` - Created unified Room Client to replace missing logic and use `api.sovereigncommunications.app` default.

## 🟡 High Priority (Should Fix)

### 8. Remove All Mock/Stub Implementations

- [x] **Android**: `MeshNetworkManager.kt`, `MessageSyncService.kt` - Implemented real DB persistence, routing logic, and identity integration.
- [x] **iOS**: `CompleteSettingsView.swift`, `ChatViewModel.swift` - Connected to CoreData and IdentityManager.

### 9. Fix Temporary Code with Proper Implementations

- [x] **Android**: `FileManager.kt`, `ImageCompressor.kt`, `DatabaseBackupManager.kt` - Confirmed complete implementations with caching, compression, and encryption.
- [x] **iOS**: `BackupRestoreManager.swift` - Added AES-GCM encryption for backups.

### 10. Ensure Consistent Error Handling

- [x] **Universal**: Review and unify error handling across platforms (used Logger/Log appropriately).

### 11. Final Polish

- [x] **Universal**: Address remaining lint warnings and TODOs.
- [x] **Universal**: Final code review and cleanup.

## 🟢 Medium Priority (Nice to Fix)

### 12. Complete Remaining TODO Items

- [x] **Android**: `MainScreen.kt` - Connected display name to prefs and added QR feedback.
- [x] **iOS**: `SettingsView.swift` - Connected to IdentityManager and BackupRestoreManager.

### 13. Add Comprehensive Test Coverage

- [x] Load tests - Added `concurrent-users.integration.test.ts`.
- [x] Remove mocks in tests - Verified integration tests use real components.

### 14. Performance Optimizations

- [x] **iOS**: `ChatViewModel.swift` - Optimized Core Data updates using filtered notifications.

### 15. Documentation and Cleanup

- [x] `network_security_config.xml` (docs) - Verified documentation is present.
- [x] `build.gradle.kts` - Verified clean.
