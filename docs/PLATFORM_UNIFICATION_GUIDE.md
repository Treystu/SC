# Platform Unification Guide

**Version:** 1.0  
**Date:** December 2025  
**Status:** Implementation Guide

## Overview

This document provides a comprehensive guide for unifying the codebase across Web, Android, and iOS platforms to ensure consistent behavior, eliminate code duplication, and improve maintainability.

## Core Principles

### 1. Shared Core Logic
The `@sc/core` library contains all platform-agnostic logic:
- **Cryptography**: Ed25519, X25519, ChaCha20-Poly1305
- **Protocol**: Binary message encoding/decoding
- **Mesh Networking**: Routing, relay, gossip, peer management
- **Health Monitoring**: Peer health scores, adaptive heartbeats
- **Message Handling**: Deduplication, TTL, store-and-forward

### 2. Platform-Specific Adapters
Each platform implements adapters for:
- **Persistence**: IndexedDB (Web), Room (Android), CoreData (iOS)
- **Transport**: WebRTC (all), BLE (mobile only)
- **UI**: React (Web), Jetpack Compose (Android), SwiftUI (iOS)

### 3. Standardized Patterns
All platforms follow the same:
- **Initialization sequence**
- **Terminology and naming**
- **API contracts**
- **Error handling**

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   @sc/core Library                      │
│  ┌────────────┬────────────┬────────────┬────────────┐ │
│  │   Crypto   │  Protocol  │    Mesh    │  Transport │ │
│  │            │            │            │            │ │
│  │ Ed25519    │  Binary    │  Routing   │  WebRTC    │ │
│  │ X25519     │  Message   │  Relay     │  Abstract  │ │
│  │ ChaCha20   │  Format    │  Gossip    │            │ │
│  └────────────┴────────────┴────────────┴────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌─────▼──────┐    ┌────▼────┐
    │   Web   │      │  Android   │    │   iOS   │
    │         │      │            │    │         │
    │ React   │      │  Compose   │    │ SwiftUI │
    │ Vite    │      │  Kotlin    │    │  Swift  │
    │IndexedDB│      │   Room     │    │CoreData │
    └─────────┘      └────────────┘    └─────────┘
```

## Persistence Adapter Interface

All platforms must implement the `PersistenceAdapter` interface defined in `@sc/core`:

```typescript
interface PersistenceAdapter {
  saveMessage(id: string, message: StoredMessage): Promise<void>;
  getMessage(id: string): Promise<StoredMessage | null>;
  removeMessage(id: string): Promise<void>;
  getAllMessages(): Promise<Map<string, StoredMessage>>;
  pruneExpired(now: number): Promise<void>;
  size(): Promise<number>;
}
```

### Web Implementation
- **Location**: `web/src/utils/WebPersistenceAdapter.ts`
- **Storage**: IndexedDB via `web/src/storage/database.ts`
- **Requirements**:
  - Store queued messages with metadata
  - Serialize/deserialize binary protocol messages
  - Support retry logic with backoff
  - Export/import for sneakernet

### Android Implementation
- **Location**: `android/app/src/main/kotlin/com/sovereign/communications/data/adapter/AndroidPersistenceAdapter.kt` ✅
- **Storage**: Room database
- **Requirements**:
  - Use `BLEStoreAndForward` persistence mechanism
  - Map to/from Room entities
  - Support foreground service access
  - Handle process death scenarios

### iOS Implementation
- **Location**: `ios/SovereignCommunications/Data/Adapter/IOSPersistenceAdapter.swift` ✅
- **Storage**: Core Data
- **Requirements**:
  - Port `BLEStoreAndForward` logic from Android
  - Use Core Data for persistence
  - Support background task access
  - Handle app suspension scenarios

## Mesh Network Manager Pattern

### Anti-Pattern: Platform-Specific Re-implementations
❌ **Don't**: Create platform-specific mesh managers that duplicate core logic

```kotlin
// BAD: Re-implementing routing in Android
class MeshNetworkManager {
    fun sendMessage(recipient: String, message: String) {
        // Custom routing logic here
        // This duplicates @sc/core routing!
    }
}
```

### Best Practice: Thin Wrapper Over Core
✅ **Do**: Create thin platform adapters that delegate to core

```kotlin
// GOOD: Delegate to core library
class MeshNetworkManager(
    private val context: Context,
    private val database: SCDatabase
) {
    private val persistenceAdapter = AndroidPersistenceAdapter(database)
    private lateinit var meshNetwork: MeshNetwork // From @sc/core
    
    fun start() {
        // Initialize core mesh network
        val identity = loadOrGenerateIdentity()
        meshNetwork = MeshNetwork(
            identity = identity,
            persistence = persistenceAdapter,
            defaultTTL = 10,
            maxPeers = 50
        )
        
        // Set up transport layers
        setupBLE()
        setupWebRTC()
    }
    
    fun sendMessage(recipient: String, message: String) {
        // Delegate to core - no custom logic!
        meshNetwork.sendMessage(recipient, message)
    }
}
```

## Standardized Initialization Sequence

All platforms must follow this initialization order:

### 1. Load or Generate Identity
```typescript
// Pseudo-code (adapt to platform)
async function initializeIdentity() {
    let identity = await db.getPrimaryIdentity();
    if (!identity) {
        identity = generateIdentity();
        await db.saveIdentity(identity);
    }
    return identity;
}
```

### 2. Initialize Persistence Adapter
```typescript
const persistenceAdapter = new PlatformPersistenceAdapter(db);
```

### 3. Create MeshNetwork Instance
```typescript
const meshNetwork = new MeshNetwork({
    identity: identity,
    persistence: persistenceAdapter,
    defaultTTL: 10,
    maxPeers: 50
});
```

### 4. Set Up Transport Layers
```typescript
// WebRTC (all platforms)
meshNetwork.addTransport(webrtcTransport);

// BLE (mobile only)
if (platform === 'mobile') {
    meshNetwork.addTransport(bleTransport);
}
```

### 5. Register Message Handlers
```typescript
meshNetwork.onMessage((from, message) => {
    // Handle incoming messages
    saveToDatabase(from, message);
    updateUI(from, message);
});
```

### 6. Start Network
```typescript
await meshNetwork.start();
```

## Terminology Standardization

### User-Facing Terms

| Concept | Standard Term | Avoid |
|---------|---------------|-------|
| Application | "Sovereign Communications" | "SC", "SovComm" |
| Person | "Contact" | "Peer", "User" |
| Chat | "Conversation" | "Chat", "Thread" |
| Connection | "Connected" / "Disconnected" | "Online", "Active" |
| Public Key | "Peer ID" | "Public Key", "Identity" |
| Fingerprint | "Fingerprint" | "Hash", "ID" |
| Encryption | "End-to-end encrypted" | "E2E", "Encrypted" |
| Network | "Mesh network" | "P2P network" |
| Actions | "Send" / "Receive" | "Transmit", "Deliver" |

### Technical Terms (Internal)

Use these consistently in code:
- `peerId` (not `userId`, `contactId` in mesh layer)
- `routingTable` (not `peerRegistry`)
- `messageRelay` (not `messageRouter`)
- `healthMonitor` (not `peerMonitor`)
- `persistenceAdapter` (not `storage`, `db`)

## Feature Parity Requirements

All platforms must implement:

### Core Messaging
- [x] Text message send/receive
- [x] Message encryption (ChaCha20-Poly1305)
- [x] Message signing (Ed25519)
- [x] Message persistence
- [x] Offline message queue
- [x] Store-and-forward (sneakernet)

### Peer Management
- [x] Add contact (manual peer ID entry)
- [x] Add contact (QR code - mobile, web via camera)
- [x] Contact list
- [x] Contact details
- [x] Fingerprint verification
- [x] Contact persistence

### Mesh Networking
- [x] WebRTC transport
- [ ] BLE transport (mobile only - acceptable)
- [x] Multi-hop routing
- [x] Message deduplication
- [x] TTL enforcement
- [x] Health monitoring
- [x] Adaptive heartbeats

### Data Persistence
- [x] Messages persist across restarts
- [x] Contacts persist across restarts
- [x] Conversations persist across restarts
- [x] Identity persists across restarts
- [x] Queued messages persist
- [x] Data export/import

### User Experience
- [x] Onboarding flow (4 screens)
- [x] Connection status indicator
- [x] Message status (pending/sent/delivered)
- [x] Typing indicators (optional, privacy setting)
- [x] Read receipts (optional, privacy setting)
- [ ] Notifications (local on mobile, browser on web)

## Testing Requirements

### Unit Tests
Each platform must test:
- Persistence adapter implementation
- Message encoding/decoding
- Identity generation and loading
- Error handling

### Integration Tests
Cross-platform tests must verify:
- Web ↔ Android messaging
- Web ↔ iOS messaging
- Android ↔ iOS messaging
- Multi-hop routing across platforms
- Store-and-forward across platforms

### E2E Tests
Test critical user journeys:
1. Fresh install → onboarding → add contact → send message
2. Send message → restart app → verify message persisted
3. Send message while offline → come online → message delivers
4. Export data → import on another device → verify data restored

## Migration Path

### Phase 1: Core Enhancement ✅
- [x] Verify `PersistenceAdapter` interface complete
- [x] Document core API for platforms
- [x] Create platform unification guide

### Phase 2: Platform Adapters
- [ ] Create `AndroidPersistenceAdapter` using Room
- [ ] Create `IOSPersistenceAdapter` using CoreData
- [ ] Enhance `WebPersistenceAdapter` with full implementation

### Phase 3: Manager Refactoring
- [ ] Refactor Android `MeshNetworkManager` to use core
- [ ] Merge iOS duplicate managers, use core
- [ ] Update Web `useMeshNetwork` to use enhanced adapter

### Phase 4: Terminology Update
- [ ] Audit all UI strings across platforms
- [ ] Replace inconsistent terms
- [ ] Update button labels, menu items, error messages

### Phase 5: Testing & Validation
- [ ] Create cross-platform integration tests
- [ ] Test persistence on all platforms
- [ ] Verify terminology consistency
- [ ] Test offline/online scenarios

### Phase 6: Documentation & CI/CD
- [ ] Update CONTRIBUTING.md
- [ ] Add platform integration examples
- [ ] Update CI workflows
- [ ] Create troubleshooting guide

## Implementation Checklist

### For Each Platform

#### Android
- [ ] Create `AndroidPersistenceAdapter.kt`
- [ ] Refactor `MeshNetworkManager.kt` to delegate to core
- [ ] Update UI strings to match terminology
- [ ] Test persistence across app restarts
- [ ] Test BLE + WebRTC transport integration
- [ ] Document Android-specific quirks

#### iOS
- [ ] Create `IOSPersistenceAdapter.swift`
- [ ] Merge `MeshNetworkManager.swift` and `BluetoothMeshManager.swift`
- [ ] Port Android `BLEStoreAndForward` logic
- [ ] Update UI strings to match terminology
- [ ] Test persistence across app suspensions
- [ ] Document iOS-specific quirks

#### Web
- [ ] Complete `WebPersistenceAdapter.ts` implementation
- [ ] Add retry logic for queued messages in `useMeshNetwork.ts`
- [ ] Expose export/import UI
- [ ] Update UI strings to match terminology
- [ ] Test persistence across page reloads
- [ ] Document web-specific limitations (no BLE)

## Success Criteria

Platform unification is complete when:

1. ✅ All platforms use `@sc/core` for routing and relay
2. ✅ All platforms implement `PersistenceAdapter` interface
3. ✅ All platforms follow the same initialization sequence
4. ✅ All platforms use the same terminology
5. ✅ Messages send/receive successfully across all platforms
6. ✅ Data persists across app restarts on all platforms
7. ✅ Store-and-forward works (sneakernet capability)
8. ✅ Integration tests pass for all platform combinations
9. ✅ Documentation is updated and complete
10. ✅ CI/CD pipeline validates all platforms

## Resources

- [CONTRIBUTING.md](../CONTRIBUTING.md) - General contribution guidelines
- [PLATFORM_PARITY_AUDIT.md](./PLATFORM_PARITY_AUDIT.md) - Feature parity audit
- [V1_READINESS_REPORT.md](../V1_READINESS_REPORT.md) - V1 readiness assessment
- [core/src/mesh/relay.ts](../core/src/mesh/relay.ts) - Core relay implementation
- [core/src/mesh/routing.ts](../core/src/mesh/routing.ts) - Core routing implementation

## Questions?

If you have questions about platform unification:
1. Review this guide and the resources above
2. Check existing implementations in `core/src/`
3. Open a GitHub Discussion with the `platform-parity` label
4. Reference this guide in your PR description

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Maintainer:** Platform Team  
**Status:** Active
