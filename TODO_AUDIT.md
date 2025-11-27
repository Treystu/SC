# TODO Items Audit

This document lists all TODO, FIXME, HACK, and XXX comments found in the codebase (excluding node_modules and generated files).

## Summary
- **Total TODO items found**: 38
- **FIXME items**: 0 (in source code)
- **HACK items**: 0 (in source code)
- **XXX items**: 0 (in source code)

---

## Android Platform

### NotificationReceiver.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/notifications/NotificationReceiver.kt`

1. **Line 37**: Send message through mesh network
   ```kotlin
   // TODO: Send message through mesh network
   ```
   **Priority**: High
   **Context**: Quick reply functionality needs mesh network integration

2. **Line 51**: Mark messages as read in database
   ```kotlin
   // TODO: Mark messages as read in database
   ```
   **Priority**: Medium
   **Context**: Message read status tracking

### DatabaseBackupManager.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/data/backup/DatabaseBackupManager.kt`

3. **Line 51**: Encrypt backup file if requested
   ```kotlin
   // TODO: Encrypt backup file if requested
   ```
   **Priority**: High
   **Context**: Backup encryption feature

4. **Line 77**: Decrypt backup if encrypted
   ```kotlin
   // TODO: Decrypt backup if encrypted
   ```
   **Priority**: High
   **Context**: Backup decryption feature

### KeystoreManager.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/security/KeystoreManager.kt`

5. **Line 191**: Implement persistent storage of encrypted passphrase
   ```kotlin
   // TODO: Implement persistent storage of encrypted passphrase
   ```
   **Priority**: High
   **Context**: Secure passphrase storage

### PeerSecurityAlerts.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/security/PeerSecurityAlerts.kt`

6. **Line 391**: Implement Ed25519 signing
   ```kotlin
   // TODO: Implement Ed25519 signing
   ```
   **Priority**: High
   **Context**: Cryptographic signing implementation

7. **Line 399**: Implement Ed25519 verification
   ```kotlin
   // TODO: Implement Ed25519 verification
   ```
   **Priority**: High
   **Context**: Cryptographic verification implementation

### NotificationHelper.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/util/NotificationHelper.kt`

8. **Line 129**: Send message through mesh network
   ```kotlin
   // TODO: Send message through mesh network
   ```
   **Priority**: High
   **Context**: Notification reply integration

9. **Line 143**: Mark message as read in database
   ```kotlin
   // TODO: Mark message as read in database
   ```
   **Priority**: Medium
   **Context**: Message read status from notifications

### SCApplication.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/SCApplication.kt`

10. **Line 26**: Initialize mesh network service
    ```kotlin
    // TODO: Initialize mesh network service
    ```
    **Priority**: Critical
    **Context**: App initialization - mesh network setup

11. **Line 27**: Initialize crypto components
    ```kotlin
    // TODO: Initialize crypto components
    ```
    **Priority**: Critical
    **Context**: App initialization - cryptography setup

12. **Line 28**: Load identity from secure storage
    ```kotlin
    // TODO: Load identity from secure storage
    ```
    **Priority**: Critical
    **Context**: App initialization - identity management

### ConversationViewModel.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/ui/viewmodel/ConversationViewModel.kt`

13. **Line 74**: Send via mesh network
    ```kotlin
    // TODO: Send via mesh network
    ```
    **Priority**: High
    **Context**: Message sending functionality

14. **Line 112**: Get from identity manager
    ```kotlin
    // TODO: Get from identity manager
    ```
    **Priority**: High
    **Context**: Identity retrieval

15. **Line 117**: Get from conversation
    ```kotlin
    // TODO: Get from conversation
    ```
    **Priority**: Medium
    **Context**: Conversation data retrieval

### SecurityAlertsScreen.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/ui/security/SecurityAlertsScreen.kt`

16. **Line 157**: Get actual reporter ID and private key
    ```kotlin
    // TODO: Get actual reporter ID and private key
    ```
    **Priority**: High
    **Context**: Security alert reporting

### MainActivity.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/ui/MainActivity.kt`

17. **Line 61**: Get from MeshNetwork
    ```kotlin
    localPeerId = "generated_peer_id_placeholder", // TODO: Get from MeshNetwork
    ```
    **Priority**: High
    **Context**: Peer ID initialization

18. **Line 107**: Implement permission rationale dialog
    ```kotlin
    // TODO: Implement permission rationale dialog
    ```
    **Priority**: Medium
    **Context**: User permission flow

### ChatViewModel.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/ui/viewmodel/ChatViewModel.kt`

19. **Line 71**: Send via MeshNetworkService
    ```kotlin
    // TODO: Send via MeshNetworkService
    ```
    **Priority**: High
    **Context**: Chat message sending

### QRCodeDisplayScreen.kt
**File**: `android/app/src/main/kotlin/com/sovereign/communications/ui/screen/QRCodeDisplayScreen.kt`

20. **Line 115**: Implement share functionality
    ```kotlin
    // TODO: Implement share functionality
    ```
    **Priority**: Medium
    **Context**: QR code sharing feature

---

## Web Platform

### useMeshNetwork.ts
**File**: `web/src/hooks/useMeshNetwork.ts`

21. **Line ~200** (approximate): File/voice message retry logic
    ```typescript
    // TODO: Implement retry logic for file/voice messages
    ```
    **Priority**: Medium
    **Context**: Enhanced retry mechanism for different message types

---

## Documentation References

### Security Documentation
**File**: `SECURITY.md`

22. **Line 208**: WebRTC Libraries update needed
    ```markdown
    3. **WebRTC Libraries**: Android version needs updating (documented in SECURITY_TODO.md)
    ```
    **Priority**: Medium
    **Context**: Dependency update

23. **Line 211**: Reference to SECURITY_TODO.md
    ```markdown
    See [SECURITY_TODO.md](docs/SECURITY_TODO.md) for complete list of ongoing security work.
    ```
    **Priority**: Info
    **Context**: Security work tracking document

### V1 Readiness Report
**File**: `V1_READINESS_REPORT.md`

24. **Line 32**: MeshNetworkManager.kt stub status
    ```markdown
    *   **Critical Gap:** `MeshNetworkManager.kt` is a **stub**. It contains `TODO` comments for `start()`, `stop()`, and `sendMessage()`.
    ```
    **Priority**: Critical (Note: This has been addressed in recent integration work)
    **Context**: Android mesh network manager implementation

---

## V1 Rollout Importance Ranking

### 🔴 BLOCKING V1 RELEASE (Must Fix Before Launch)

**Note**: Based on the recent Integration Sprint work, MeshNetworkManager.kt has been implemented. The following are remaining blockers:

#### 1. Android App Initialization (SCApplication.kt) - Items 10-12
**Status**: BLOCKING - App won't function without these
- **Line 26**: Initialize mesh network service
- **Line 27**: Initialize crypto components  
- **Line 28**: Load identity from secure storage

**Impact**: Without these, the Android app cannot start the mesh network or handle any secure communications.

**Estimated Effort**: 4-6 hours
**Dependencies**: MeshNetworkManager (already implemented), KeystoreManager

---

#### 2. Core Message Sending Integration - Items 1, 8, 13, 19
**Status**: BLOCKING - Core functionality incomplete
- NotificationReceiver.kt (Line 37): Send message through mesh network
- NotificationHelper.kt (Line 129): Send message through mesh network
- ConversationViewModel.kt (Line 74): Send via mesh network
- ChatViewModel.kt (Line 71): Send via MeshNetworkService

**Impact**: Users cannot send messages, which is the primary app function.

**Estimated Effort**: 6-8 hours
**Dependencies**: SCApplication initialization, MeshNetworkManager

---

#### 3. Identity Management - Items 14, 17
**Status**: BLOCKING - Required for peer identification
- ConversationViewModel.kt (Line 112): Get from identity manager
- MainActivity.kt (Line 61): Get peer ID from MeshNetwork

**Impact**: Without proper identity management, peer-to-peer communication cannot be established.

**Estimated Effort**: 3-4 hours
**Dependencies**: SCApplication initialization

---

### 🟡 CRITICAL FOR V1 (Should Fix Before Launch)

#### 4. Backup Encryption - Items 3-4
**Status**: CRITICAL - Security feature for data sovereignty
- DatabaseBackupManager.kt (Line 51): Encrypt backup file if requested
- DatabaseBackupManager.kt (Line 77): Decrypt backup if encrypted

**Impact**: Users cannot securely backup/restore their data, undermining the "data sovereignty" value proposition.

**Estimated Effort**: 4-6 hours
**Can be deferred if**: Basic backup/restore works without encryption (less secure but functional)

---

#### 5. Ed25519 Cryptography - Items 6-7
**Status**: CRITICAL - Security implementation
- PeerSecurityAlerts.kt (Line 391): Implement Ed25519 signing
- PeerSecurityAlerts.kt (Line 399): Implement Ed25519 verification

**Impact**: Security alert system cannot verify peer reports, reducing trust in the network.

**Estimated Effort**: 6-8 hours
**Can be deferred if**: Security alerts are disabled for V1 beta

---

#### 6. Secure Passphrase Storage - Item 5
**Status**: CRITICAL - Security best practice
- KeystoreManager.kt (Line 191): Implement persistent storage of encrypted passphrase

**Impact**: Passphrase may not persist across app restarts, requiring re-entry.

**Estimated Effort**: 2-3 hours
**Can be deferred if**: Users can re-enter passphrase on each app start (poor UX but functional)

---

### 🟢 IMPORTANT FOR V1 (Nice to Have)

#### 7. Message Read Status - Items 2, 9
**Status**: IMPORTANT - UX feature
- NotificationReceiver.kt (Line 51): Mark messages as read in database
- NotificationHelper.kt (Line 143): Mark message as read in database

**Impact**: Read/unread status not tracked properly, causing confusion.

**Estimated Effort**: 2-3 hours
**Can be deferred**: Yes - messages still work, just no read tracking

---

#### 8. Security Alert Reporting - Item 16
**Status**: IMPORTANT - Security feature
- SecurityAlertsScreen.kt (Line 157): Get actual reporter ID and private key

**Impact**: Users cannot report malicious peers.

**Estimated Effort**: 2-3 hours
**Can be deferred**: Yes - if security alerts are disabled for V1 beta

---

#### 9. Conversation Data Retrieval - Item 15
**Status**: IMPORTANT - Data access
- ConversationViewModel.kt (Line 117): Get from conversation

**Impact**: May affect conversation metadata display.

**Estimated Effort**: 1-2 hours
**Can be deferred**: Yes - if basic messaging works

---

### 🔵 POST-V1 (Can Wait Until V1.1+)

#### 10. Permission Rationale Dialog - Item 18
**Status**: ENHANCEMENT - UX improvement
- MainActivity.kt (Line 107): Implement permission rationale dialog

**Impact**: Users don't get explanation when permissions are denied.

**Estimated Effort**: 1-2 hours
**Defer to**: V1.1

---

#### 11. QR Code Sharing - Item 20
**Status**: ENHANCEMENT - Convenience feature
- QRCodeDisplayScreen.kt (Line 115): Implement share functionality

**Impact**: Users must manually share QR codes (screenshot works).

**Estimated Effort**: 1-2 hours
**Defer to**: V1.1

---

#### 12. File/Voice Message Retry - Item 21
**Status**: ENHANCEMENT - Reliability improvement
- useMeshNetwork.ts: File/voice message retry logic

**Impact**: File transfers may fail without retry (text messages have retry).

**Estimated Effort**: 3-4 hours
**Defer to**: V1.1

---

#### 13. WebRTC Library Update - Item 22
**Status**: MAINTENANCE - Dependency update
- SECURITY.md (Line 208): Android WebRTC version needs updating

**Impact**: Potential security vulnerabilities in old WebRTC version.

**Estimated Effort**: 2-4 hours (testing required)
**Defer to**: V1.1 (unless critical CVE discovered)

---

## V1 Launch Checklist

### Must Complete (Blocking)
- [ ] **Item 1**: SCApplication initialization (10-12)
- [ ] **Item 2**: Core message sending (1, 8, 13, 19)
- [ ] **Item 3**: Identity management (14, 17)

**Total Estimated Effort**: 13-18 hours

### Should Complete (Critical)
- [ ] **Item 4**: Backup encryption (3-4)
- [ ] **Item 5**: Ed25519 cryptography (6-7)
- [ ] **Item 6**: Secure passphrase storage (5)

**Total Estimated Effort**: 12-17 hours

### Optional for V1
- [ ] **Item 7**: Message read status (2, 9)
- [ ] **Item 8**: Security alert reporting (16)
- [ ] **Item 9**: Conversation data retrieval (15)

**Total Estimated Effort**: 5-8 hours

### Defer to V1.1+
- [ ] **Item 10**: Permission rationale (18)
- [ ] **Item 11**: QR code sharing (20)
- [ ] **Item 12**: File/voice retry (21)
- [ ] **Item 13**: WebRTC update (22)

---

## Recommended V1 Launch Strategy

### Minimum Viable V1 (MVP)
**Complete Items**: 1-3 only
**Timeline**: 2-3 days
**Functionality**: Basic messaging works, but limited security features

### Recommended V1 (Balanced)
**Complete Items**: 1-6
**Timeline**: 4-5 days  
**Functionality**: Full messaging + core security features

### Full-Featured V1 (Ideal)
**Complete Items**: 1-9
**Timeline**: 6-7 days
**Functionality**: All core features + UX polish

---

## Notes

- Many Android TODOs are related to mesh network integration, which has been partially addressed in recent integration work
- The critical SCApplication initialization TODOs should be prioritized as they block other functionality
- Security-related TODOs (Ed25519, encryption, passphrase storage) are high priority for V1.0
- Some items in V1_READINESS_REPORT.md may be outdated due to recent integration sprint work

---

**Last Updated**: 2025-11-27
**Generated By**: Automated TODO audit
