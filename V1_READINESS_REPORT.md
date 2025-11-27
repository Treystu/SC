# V1.0 Readiness Audit & Gap Analysis

**Date:** November 27, 2025
**Auditor:** Roo (Architect Mode)
**Target:** V1.0 Production Release (1,000,000 Users)

## Executive Summary

The Sovereign Communications (SC) project is a collection of high-quality, mature components that are currently **not fully integrated**. While the individual pieces (crypto, BLE logic, database persistence) are strong, the "glue" code required to make them work together as a cohesive mesh network is missing or incomplete on all platforms.

**CRITICAL FINDING:** The "Sneakernet" (offline data transfer) capability, a core promise of the V1.0 release, is **not functional**.
- **Core Logic:** In-memory only (data lost on restart).
- **Android:** Has persistence but no orchestration (brain is missing).
- **iOS:** Has duplicate managers and lacks an offline queue.
- **Web:** Has persistence but lacks retry logic and export UI.

**Recommendation:** **DO NOT RELEASE V1.0** in its current state. A release now would result in massive data loss and user frustration. A targeted "Integration Sprint" is required to wire these components together.

---

## Detailed Gap Analysis

### 1. Core Shared Logic (`@sc/core`)
*   **Status:** 🟡 Partial
*   **Strengths:** Robust crypto, message formatting, and routing logic.
*   **Critical Gap:** The `MessageRelay` class stores offline messages in a `Map` (in-memory). There is no interface for persistent storage injection.
*   **Impact:** If the app (or background service) restarts, all messages waiting to be relayed are lost. "Sneakernet" is impossible because you can't carry data if it vanishes when you turn off the screen.

### 2. Android Implementation
*   **Status:** 🔴 Critical
*   **Strengths:** `BLEStoreAndForward` is excellent—it persists the queue to JSON. `BLEConnectionManager` is robust.
*   **Critical Gap:** `MeshNetworkManager.kt` is a **stub**. It contains `TODO` comments for `start()`, `stop()`, and `sendMessage()`. It does not connect the UI to the BLE components.
*   **Impact:** The Android app is effectively a UI shell with a disconnected backend. It cannot send or receive messages via BLE because the manager that should coordinate this is empty.

### 3. iOS Implementation
*   **Status:** 🟠 Major
*   **Strengths:** `BluetoothMeshManager.swift` is a solid, state-restoring BLE implementation.
*   **Critical Gap:**
    *   **Duplication:** `MeshNetworkManager.swift` and `BluetoothMeshManager.swift` both exist and seem to compete.
    *   **No Offline Queue:** Neither manager implements a persistent "store-and-forward" queue for *outgoing* messages like Android does. If a peer is not connected, the message send attempt likely fails or is lost.
*   **Impact:** Unreliable delivery. No true "Sneakernet" capability.

### 4. Web Implementation
*   **Status:** 🟡 Partial
*   **Strengths:** Excellent IndexedDB persistence for user data (`database.ts`).
*   **Critical Gap:**
    *   **No Retry Logic:** `useMeshNetwork.ts` saves messages as 'queued', but has no logic to re-hydrate and retry sending them when the network becomes available or after a page reload.
    *   **No Export UI:** The "Sneakernet" feature (exporting data to a file to carry elsewhere) is implemented in the DB layer (`exportAllData`) but not exposed in the UI.
*   **Impact:** Messages sent while offline will stay "queued" forever.

---

## Actionable Remediation Plan (The "Integration Sprint")

### Step 1: Fix Core Persistence (High Priority)
- [ ] Modify `MessageRelay` in `core/src/mesh/relay.ts` to accept a `PersistenceAdapter` interface.
- [ ] Implement this adapter on each platform (using JSON/File on mobile, IndexedDB on web).

### Step 2: Wire Up Android (Critical Priority)
- [ ] Implement `MeshNetworkManager.kt`. It must:
    - Initialize `BLEGATTServer` and `BLEGATTClient`.
    - Connect `BLEStoreAndForward` to the message flow.
    - Route incoming BLE messages to the `SCDatabase`.

### Step 3: Unify iOS Architecture (High Priority)
- [ ] Deprecate `MeshNetworkManager.swift` (the high-level one) or merge it with `BluetoothMeshManager.swift`.
- [ ] Port the `BLEStoreAndForward` logic from Android (JSON queue) to Swift.
- [ ] Ensure outgoing messages are saved to this queue if immediate delivery fails.

### Step 4: Enable Web Sneakernet (Medium Priority)
- [ ] Add a "Retry Queue" to `useMeshNetwork.ts` that loads 'queued' messages from DB on startup.
- [ ] Add a "Export Data" button in the Settings UI that calls `database.exportAllData()`.
- [ ] Add a "Import Data" button that calls `database.importData()`.

### Step 5: Cross-Platform Verification
- [ ] Test: Send message from Android (offline) -> Walk to iOS device -> Android connects -> Message delivers.
- [ ] Test: Web export -> Save to USB -> Import on another Web client.

---

## Conclusion

The project is a "Ferrari engine in a go-kart frame." The components are powerful, but the drive train is missing. With focused integration work (following the plan above), this can be a solid V1.0. Releasing now would be a mistake.