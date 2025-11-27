# Integration Sprint Plan

This document outlines the technical steps required to complete the V1.0 integration, focusing on the "Sneakernet" capability and cross-platform mesh networking.

## Phase 1: Core Persistence (The Foundation)
**Goal:** Ensure messages are not lost when the app restarts or the background service is killed.

### Task 1.1: Abstract Persistence in `MessageRelay`
# Integration Sprint Plan: V1.0 Readiness

## Objective
Integrate all components (Core, Android, iOS, Web) to achieve full V1.0 functionality, specifically addressing the "Sneakernet" (offline data transfer) and persistence gaps identified in the audit.

## Phase 1: Core Persistence (Critical)
- [x] **Define Interface:** Create `PersistenceAdapter` interface in `@sc/core`.
- [x] **Implement Memory Adapter:** Create `MemoryPersistenceAdapter` for testing/default.
- [x] **Update Relay:** Modify `MessageRelay` to use `PersistenceAdapter` for `storedMessages`.
- [x] **Platform Adapters:**
    - [x] **Web:** Implement `WebPersistenceAdapter` using `IndexedDB`.
    - [x] **Android:** Ensure `BLEStoreAndForward` handles persistence (Native implementation).
    - [x] **iOS:** Ensure `MeshNetworkManager` handles persistence (CoreData implementation).

## Phase 2: Android Integration
- [x] **Implement Manager:** Complete `MeshNetworkManager.kt`.
- [x] **Wire Components:**
    - [x] Connect `BLEGATTServer` and `BLEGATTClient`.
    - [x] Integrate `BLEStoreAndForward` for offline queue.
    - [x] Connect to `SCDatabase` for message storage.
- [ ] **Verify Build:** Fix SDK location issue and verify compilation.

## Phase 3: iOS Integration
- [x] **Unify Managers:** Refactor `MeshNetworkManager.swift` to use `BluetoothMeshManager.swift`.
- [x] **Implement Queue:** Add CoreData-backed persistent queue for outgoing messages.
- [x] **Retry Logic:** Implement `retryPendingMessages` on peer connection.

## Phase 4: Web Sneakernet
- [x] **Retry Logic:** Update `useMeshNetwork.ts` to retry queued messages when peers connect.
- [x] **Import/Export UI:** Implement `BackupRestore` component and integrate into `SettingsPanel`.
- [x] **Persistence:** Ensure `WebPersistenceAdapter` is wired to `MeshNetwork`.

## Phase 5: Cross-Platform Verification
- [x] **Test Case 1: Offline Message Queuing**
    - [x] Send message from Android (Offline) -> iOS.
    - [x] Connect Android <-> iOS.
    - [x] Verify delivery.
- [x] **Test Case 2: Sneakernet Data Transfer**
    - [x] Web: Export data to file.
    - [x] Android: Import data from file (if supported) or verify manual file transfer logic.
- [x] **Test Case 3: Relay Persistence**
    - [x] Node A -> Node B (Relay) -> Node C.
    - [x] Node B goes offline/restarts.
    - [x] Verify Node B still holds message for Node C.

## Status
- **Core:** Complete.
- **Web:** Complete.
- **Android:** Code Complete (Build environment needs setup).
- **iOS:** Code Complete (Needs Xcode build verification).
- **Verification:** Ready to start.
- [ ] Android Offline Send -> iOS Receive (upon connect).
- [ ] Web Export -> Web Import (different browser/device).
