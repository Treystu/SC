# Apocalypse-Resilient Sovereign Communications Implementation Plan

> *"Think through what a world would look like with all phones interconnected, and relaying on behalf of one-another. The internet could crash, and people could still communicate worldwide with minimal delay."*

---

## Executive Summary

This plan transforms Sovereign Communications from a functional mesh networking app into apocalypse-resilient infrastructure for humanity. The implementation spans 5 phases over approximately 14-18 weeks, building progressively from foundational reliability to global reach.

### Architectural Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deduplication | Bloom filter + Persistent log | O(1) speed + restart accuracy |
| Storage Budget | 500MB per device | ~100K messages, realistic for budget phones |
| Identity Bootstrap | QR code + BLE beacon | Intentional pairing + opportunistic discovery |
| Eviction Strategy | Priority-aware hybrid | Critical messages survive longest |
| Meshtastic Integration | Bridge wrapper (V1) | Fast to market, full protocol V2 |
| Location Privacy | 100km grid zones (configurable) | Balance privacy and routing utility |
| Message TTL | Configurable by priority | Emergency: 30d, Normal: 7d, Low: 24h |
| Power Target | 72 hours adaptive duty cycling | Realistic survival scenario |

---

## Phase 1: Foundation Hardening (Weeks 1-3)

**Goal:** Make the existing system production-ready and persistent.

### 1.1 Persistent Message Store

**Problem:** Current relay uses memory-only storage with 5-minute TTL. Messages die on app restart.

**Files to Create:**

```
core/src/storage/
├── MessageStore.ts          # Abstract interface
├── IndexedDBMessageStore.ts # Browser/PWA implementation
├── SQLiteMessageStore.ts    # React Native implementation
├── StorageManager.ts        # Quota management, eviction
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/storage/MessageStore.ts`:**

```typescript
export enum MessagePriority {
  LOW = 0,        // 24-hour TTL
  NORMAL = 1,     // 7-day TTL
  HIGH = 2,       // 14-day TTL
  EMERGENCY = 3,  // 30-day TTL
}

export interface StoredMessage {
  id: string;                    // Unique message ID (hash of content + sender + timestamp)
  encryptedPayload: Uint8Array;  // Double-ratchet encrypted content
  senderId: string;              // Sender's public key fingerprint
  recipientId: string;           // Recipient's public key fingerprint (or 'BROADCAST')
  priority: MessagePriority;
  createdAt: number;             // Unix timestamp ms
  expiresAt: number;             // Unix timestamp ms (based on priority TTL)
  hopCount: number;              // How many relays this has traversed
  maxHops: number;               // Maximum allowed hops
  geoZone?: string;              // 100km grid zone hint (e.g., "US-NY-42.7,-73.9")
  signature: Uint8Array;         // Ed25519 signature from sender
  relayedAt?: number;            // When we received this for relay
  deliveredAt?: number;          // When recipient acknowledged (own messages only)
  isOwnMessage: boolean;         // True if we originated this message
}

export interface MessageStore {
  // Core operations
  store(message: StoredMessage): Promise<void>;
  get(id: string): Promise<StoredMessage | null>;
  delete(id: string): Promise<void>;

  // Query operations
  getByRecipient(recipientId: string): Promise<StoredMessage[]>;
  getForRelay(excludeIds: Set<string>): Promise<StoredMessage[]>;
  getExpired(): Promise<StoredMessage[]>;

  // Quota management
  getStorageUsed(): Promise<number>;  // bytes
  getMessageCount(): Promise<number>;
  evictByPriority(bytesToFree: number): Promise<number>;  // returns bytes freed

  // Sync operations (for courier mode)
  getAllMessageIds(): Promise<string[]>;
  getMessagesSince(timestamp: number): Promise<StoredMessage[]>;
  bulkStore(messages: StoredMessage[]): Promise<void>;
}

export const TTL_BY_PRIORITY: Record<MessagePriority, number> = {
  [MessagePriority.LOW]: 24 * 60 * 60 * 1000,        // 24 hours
  [MessagePriority.NORMAL]: 7 * 24 * 60 * 60 * 1000, // 7 days
  [MessagePriority.HIGH]: 14 * 24 * 60 * 60 * 1000,  // 14 days
  [MessagePriority.EMERGENCY]: 30 * 24 * 60 * 60 * 1000, // 30 days
};
```

**Files to Modify:**
- `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/mesh/routing.ts` - Use MessageStore instead of memory Map
- `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/mesh/StoreAndForwardRelay.ts` - Integrate with MessageStore

---

### 1.2 Deduplication System

**Problem:** Global relay with 30-day TTL will cause message explosion without proper deduplication.

**Files to Create:**

```
core/src/dedup/
├── BloomFilter.ts           # Space-efficient probabilistic filter
├── MessageIdLog.ts          # Persistent rolling log
├── DeduplicationManager.ts  # Combines both strategies
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/dedup/DeduplicationManager.ts`:**

```typescript
export interface DeduplicationManager {
  /**
   * Check if message has been seen before.
   * Uses bloom filter for O(1) check, falls back to persistent log.
   *
   * @returns true if message should be processed (not a duplicate)
   */
  shouldProcess(messageId: string): Promise<boolean>;

  /**
   * Mark message as seen. Call after successful processing.
   */
  markSeen(messageId: string): Promise<void>;

  /**
   * Rebuild bloom filter from persistent log (call on app start).
   */
  rebuildFromLog(): Promise<void>;

  /**
   * Prune old entries from persistent log (call periodically).
   * Keeps entries younger than maxAge.
   */
  pruneLog(maxAge: number): Promise<number>;  // returns entries pruned
}

// Bloom filter configuration
export const BLOOM_CONFIG = {
  expectedItems: 100_000,       // Expected unique messages
  falsePositiveRate: 0.01,      // 1% false positive acceptable
  hashFunctions: 7,             // Optimal for this config
};
```

---

### 1.3 Real P2P Signaling (DHT Rendezvous)

**Problem:** WebRTC currently uses demo signaling server. Need true P2P via DHT.

**Files to Create:**

```
core/src/signaling/
├── DHTSignaling.ts          # DHT-based signaling
├── SignalingProtocol.ts     # Message types for signaling
└── index.ts
```

**Files to Modify:**
- `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/mesh/MeshNetworkManager.ts` - Use DHTSignaling

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/signaling/DHTSignaling.ts`:**

```typescript
export interface DHTSignaling {
  /**
   * Publish our signaling endpoint to DHT.
   * Key: hash(ourPublicKey + "signaling")
   * Value: { peerId, offers: RTCSessionDescription[], timestamp }
   */
  publishEndpoint(): Promise<void>;

  /**
   * Look up peer's signaling endpoint from DHT.
   */
  findPeer(peerId: string): Promise<SignalingEndpoint | null>;

  /**
   * Exchange WebRTC offer/answer via DHT.
   */
  sendOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void>;
  waitForAnswer(peerId: string, timeout: number): Promise<RTCSessionDescriptionInit | null>;

  /**
   * Exchange ICE candidates via DHT.
   */
  sendIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void>;
  getIceCandidates(peerId: string): Promise<RTCIceCandidateInit[]>;
}
```

---

### 1.4 Storage Quota Management

**Files to Create:**

```
core/src/storage/
├── QuotaManager.ts          # Monitor and enforce 500MB limit
├── EvictionPolicy.ts        # Priority-aware eviction logic
└── StorageMetrics.ts        # Track usage statistics
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/storage/QuotaManager.ts`:**

```typescript
export interface QuotaManager {
  readonly maxBytes: number;  // 500MB = 500 * 1024 * 1024
  readonly warningThreshold: number;  // 80% = 400MB
  readonly criticalThreshold: number; // 95% = 475MB

  /**
   * Check current usage and trigger eviction if needed.
   */
  checkAndEvict(): Promise<EvictionResult>;

  /**
   * Get current storage statistics.
   */
  getStats(): Promise<StorageStats>;

  /**
   * Register callback for quota warnings.
   */
  onQuotaWarning(callback: (stats: StorageStats) => void): void;
}

export interface StorageStats {
  totalBytes: number;
  usedBytes: number;
  messageCount: number;
  byPriority: Record<MessagePriority, { count: number; bytes: number }>;
  oldestMessage: number;  // timestamp
  newestMessage: number;  // timestamp
}

export interface EvictionResult {
  evicted: number;        // messages evicted
  bytesFreed: number;
  duration: number;       // ms
  reason: 'quota' | 'expiry' | 'manual';
}
```

**Eviction Order (Priority-Aware Hybrid):**
1. Expired messages (any priority)
2. Oldest LOW priority messages
3. Oldest NORMAL priority messages
4. Oldest HIGH priority messages
5. Oldest EMERGENCY messages (only if critically full)
6. NEVER evict own undelivered outbound messages

---

### Phase 1 Dependencies

```
┌─────────────────┐
│  MessageStore   │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌──────────────┐
│ Dedup │ │ QuotaManager │
└───┬───┘ └──────┬───────┘
    │            │
    └─────┬──────┘
          ▼
   ┌─────────────┐
   │ DHTSignaling│
   └─────────────┘
```

### Phase 1 Testing Strategy

| Component | Test Type | Coverage Target |
|-----------|-----------|-----------------|
| MessageStore | Unit + Integration | 90% |
| BloomFilter | Unit (property-based) | 95% |
| DeduplicationManager | Integration | 85% |
| QuotaManager | Unit + Stress | 90% |
| DHTSignaling | Integration + E2E | 80% |

**Key Test Scenarios:**
1. App restart preserves messages and dedup state
2. 500MB quota enforced with correct eviction order
3. Bloom filter false positive rate stays under 1%
4. DHT signaling completes WebRTC handshake without central server
5. Message survives 7-day relay chain (simulated time)

---

## Phase 2: Courier Mode & Extended Survival (Weeks 4-7)

**Goal:** Enable physical message carrying and extended offline operation.

### 2.1 Courier Sync Protocol

**Problem:** When two phones meet after days apart, they need to efficiently sync all relevant messages.

**Files to Create:**

```
core/src/courier/
├── CourierMode.ts           # Main courier logic
├── SyncProtocol.ts          # Efficient sync negotiation
├── MessageDiff.ts           # Delta sync computation
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/courier/SyncProtocol.ts`:**

```typescript
export interface SyncProtocol {
  /**
   * Phase 1: Exchange bloom filters of message IDs.
   * This identifies which messages each side is missing.
   */
  exchangeBloomFilters(peer: PeerConnection): Promise<SyncNegotiation>;

  /**
   * Phase 2: Request specific messages we're missing.
   */
  requestMissingMessages(peer: PeerConnection, messageIds: string[]): Promise<void>;

  /**
   * Phase 3: Send messages peer is missing.
   */
  sendMissingMessages(peer: PeerConnection, messageIds: string[]): Promise<void>;

  /**
   * Full sync handshake (combines phases).
   */
  performSync(peer: PeerConnection): Promise<SyncResult>;
}

export interface SyncNegotiation {
  ourMessageCount: number;
  theirMessageCount: number;
  estimatedMissing: number;
  estimatedToSend: number;
  estimatedDuration: number;  // ms
}

export interface SyncResult {
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  duration: number;
  errors: SyncError[];
}
```

**Sync Protocol Flow:**

```
Device A                          Device B
   │                                  │
   │──── SYNC_REQUEST ───────────────▶│
   │     (our bloom filter)           │
   │                                  │
   │◀─── SYNC_RESPONSE ──────────────│
   │     (their bloom filter)         │
   │                                  │
   │  [Both compute missing sets]     │
   │                                  │
   │◀─── REQUEST_MESSAGES ───────────│
   │     (IDs B is missing)           │
   │                                  │
   │──── REQUEST_MESSAGES ───────────▶│
   │     (IDs A is missing)           │
   │                                  │
   │──── MESSAGE_BATCH ──────────────▶│
   │◀─── MESSAGE_BATCH ──────────────│
   │                                  │
   │──── SYNC_COMPLETE ──────────────▶│
   │◀─── SYNC_COMPLETE ──────────────│
```

---

### 2.2 Offline Identity Bootstrap (QR + BLE)

**Problem:** New user with zero internet can't join the network.

**Files to Create:**

```
core/src/bootstrap/
├── QRIdentityExchange.ts    # QR code identity exchange
├── BLEBeacon.ts             # BLE discovery beacon
├── BootstrapManager.ts      # Coordinates both methods
└── index.ts

mobile/ios/SovereignComms/Bootstrap/
├── QRScanner.swift          # Native QR scanning
├── BLEBeaconManager.swift   # Native BLE beacon
└── BootstrapBridge.swift    # React Native bridge

mobile/android/app/src/main/java/com/sovereigncomms/bootstrap/
├── QRScanner.kt             # Native QR scanning
├── BLEBeaconManager.kt      # Native BLE beacon
└── BootstrapModule.kt       # React Native bridge
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/bootstrap/QRIdentityExchange.ts`:**

```typescript
export interface QRIdentityPayload {
  version: 1;
  publicKey: string;          // Base64 Ed25519 public key
  displayName: string;        // User's chosen name
  fingerprint: string;        // Short fingerprint for verification
  meshNodes?: string[];       // Known DHT bootstrap nodes
  timestamp: number;          // When QR was generated
  signature: string;          // Self-signed for integrity
}

export interface QRIdentityExchange {
  /**
   * Generate QR code payload for our identity.
   */
  generatePayload(): QRIdentityPayload;

  /**
   * Encode payload as QR-compatible string.
   */
  encodeForQR(payload: QRIdentityPayload): string;

  /**
   * Decode scanned QR data.
   */
  decodeFromQR(data: string): QRIdentityPayload | null;

  /**
   * Process scanned identity and add to contacts.
   */
  processScannedIdentity(payload: QRIdentityPayload): Promise<ProcessResult>;
}
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/bootstrap/BLEBeacon.ts`:**

```typescript
export interface BLEBeaconPayload {
  serviceUUID: string;        // SC-specific UUID
  publicKeyPrefix: string;    // First 8 bytes of public key (for discovery)
  supportsSync: boolean;      // Ready for courier sync
  messageCount: number;       // Hint for sync priority
  lastSyncTimestamp: number;  // When we last synced with anyone
}

export interface BLEBeacon {
  /**
   * Start advertising our presence.
   */
  startAdvertising(): Promise<void>;
  stopAdvertising(): Promise<void>;

  /**
   * Start scanning for other SC users.
   */
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;

  /**
   * Event: Discovered another SC user.
   */
  onPeerDiscovered(callback: (peer: DiscoveredPeer) => void): void;

  /**
   * Connect to discovered peer for sync.
   */
  connectForSync(peer: DiscoveredPeer): Promise<PeerConnection>;
}

export interface DiscoveredPeer {
  publicKeyPrefix: string;
  rssi: number;               // Signal strength (for proximity)
  supportsSync: boolean;
  messageCount: number;
  lastSeen: number;
}
```

---

### 2.3 Dead Phone Relay Mode

**Problem:** Phone may only have power for 10 minutes (solar charge). Must sync efficiently.

**Files to Create:**

```
core/src/power/
├── DeadPhoneMode.ts         # Ultra-fast sync mode
├── PowerAwareSync.ts        # Battery-conscious operations
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/power/DeadPhoneMode.ts`:**

```typescript
export interface DeadPhoneMode {
  /**
   * Enter dead phone mode. Prioritizes:
   * 1. Sending our queued outbound messages
   * 2. Receiving messages addressed to us
   * 3. Relay sync (if time permits)
   */
  activate(): Promise<void>;

  /**
   * Check estimated time needed for critical sync.
   */
  estimateCriticalSyncTime(): Promise<number>;  // ms

  /**
   * Perform critical-only sync (own messages + direct messages).
   */
  performCriticalSync(peer: PeerConnection, maxTime: number): Promise<CriticalSyncResult>;

  /**
   * Event: Critical sync complete, can power down.
   */
  onCriticalComplete(callback: () => void): void;
}

export interface CriticalSyncResult {
  outboundSent: number;       // Our messages successfully sent
  inboundReceived: number;    // Messages for us received
  relayMessagesExchanged: number;
  timeUsed: number;           // ms
  criticalComplete: boolean;  // True if own messages are safe
}
```

---

### 2.4 Adaptive Power Management

**Files to Create:**

```
core/src/power/
├── DutyCycleManager.ts      # Adaptive wake/sleep cycles
├── BatteryMonitor.ts        # Battery state tracking
├── PowerProfile.ts          # Predefined power profiles
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/power/DutyCycleManager.ts`:**

```typescript
export enum PowerProfile {
  NORMAL = 'normal',          // Full functionality
  CONSERVATION = 'conservation', // 50% duty cycle
  SURVIVAL = 'survival',      // 10% duty cycle, critical only
  DEAD_PHONE = 'dead_phone',  // One-shot sync then shutdown
}

export interface DutyCycleConfig {
  profile: PowerProfile;
  wakeInterval: number;       // ms between wake periods
  wakeDuration: number;       // ms of active time
  scanDuration: number;       // ms of BLE scanning per wake
  relaySyncEnabled: boolean;  // Whether to participate in relay
}

export const POWER_CONFIGS: Record<PowerProfile, DutyCycleConfig> = {
  [PowerProfile.NORMAL]: {
    profile: PowerProfile.NORMAL,
    wakeInterval: 0,          // Always on
    wakeDuration: Infinity,
    scanDuration: 30_000,     // 30s scans
    relaySyncEnabled: true,
  },
  [PowerProfile.CONSERVATION]: {
    profile: PowerProfile.CONSERVATION,
    wakeInterval: 60_000,     // Wake every minute
    wakeDuration: 30_000,     // 30s active
    scanDuration: 10_000,     // 10s scans
    relaySyncEnabled: true,
  },
  [PowerProfile.SURVIVAL]: {
    profile: PowerProfile.SURVIVAL,
    wakeInterval: 300_000,    // Wake every 5 minutes
    wakeDuration: 15_000,     // 15s active
    scanDuration: 5_000,      // 5s scans
    relaySyncEnabled: false,  // Own messages only
  },
  [PowerProfile.DEAD_PHONE]: {
    profile: PowerProfile.DEAD_PHONE,
    wakeInterval: 0,          // One-shot
    wakeDuration: 600_000,    // 10 minutes max
    scanDuration: 30_000,     // Full scan
    relaySyncEnabled: true,   // Maximize sync
  },
};

export interface DutyCycleManager {
  setProfile(profile: PowerProfile): void;
  getCurrentProfile(): PowerProfile;

  /**
   * Auto-select profile based on battery level.
   */
  enableAutoProfile(thresholds: BatteryThresholds): void;

  /**
   * Force wake for immediate action.
   */
  forceWake(reason: string): Promise<void>;

  /**
   * Schedule next wake.
   */
  scheduleNextWake(): void;
}

export interface BatteryThresholds {
  conservation: number;  // Below this %, enter conservation (e.g., 50%)
  survival: number;      // Below this %, enter survival (e.g., 20%)
  deadPhone: number;     // Below this %, enter dead phone (e.g., 5%)
}
```

---

### Phase 2 Testing Strategy

| Component | Test Type | Coverage Target |
|-----------|-----------|-----------------|
| SyncProtocol | Integration | 85% |
| QRIdentityExchange | Unit + E2E | 90% |
| BLEBeacon | Integration (native) | 75% |
| DeadPhoneMode | Simulation | 80% |
| DutyCycleManager | Unit + Battery Sim | 85% |

**Key Test Scenarios:**
1. Two phones with 10,000 messages each sync in under 60 seconds
2. QR code scan adds contact and establishes encrypted channel
3. BLE beacon discovery works in airplane mode
4. Dead phone mode completes critical sync in under 2 minutes
5. Survival mode achieves 72-hour battery life (simulated)

---

## Phase 3: Geo-Aware Routing (Weeks 8-10)

**Goal:** Route messages intelligently based on geographic hints.

### 3.1 Location Grid System

**Files to Create:**

```
core/src/geo/
├── GridZone.ts              # 100km grid zone encoding
├── LocationManager.ts       # Privacy-preserving location
├── GeoRouter.ts             # Geo-aware routing decisions
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/geo/GridZone.ts`:**

```typescript
export enum LocationPrecision {
  EXACT = 'exact',            // Raw coordinates (emergency responders)
  GRID_10KM = 'grid_10km',    // 10km squares
  GRID_100KM = 'grid_100km',  // 100km squares (default)
  REGION = 'region',          // Country/state level
  NONE = 'none',              // No location
}

export interface GridZone {
  /**
   * Zone identifier (e.g., "US-NY-42.7,-73.9" for 100km grid).
   */
  zoneId: string;

  /**
   * Center coordinates of zone (for routing calculations).
   */
  centerLat: number;
  centerLon: number;

  /**
   * Precision level of this zone.
   */
  precision: LocationPrecision;

  /**
   * Human-readable description (e.g., "New York, USA").
   */
  description: string;
}

export interface GridZoneEncoder {
  /**
   * Encode coordinates to zone at specified precision.
   */
  encode(lat: number, lon: number, precision: LocationPrecision): GridZone;

  /**
   * Calculate distance between two zones (km).
   */
  distance(zone1: GridZone, zone2: GridZone): number;

  /**
   * Get adjacent zones (for routing).
   */
  getAdjacentZones(zone: GridZone): GridZone[];

  /**
   * Check if zone is on path between two other zones.
   */
  isOnPath(zone: GridZone, from: GridZone, to: GridZone): boolean;
}
```

---

### 3.2 Geo-Aware Routing

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/geo/GeoRouter.ts`:**

```typescript
export interface GeoRoutingHint {
  sourceZone: GridZone;
  destinationZone: GridZone;
  preferredDirection: 'north' | 'south' | 'east' | 'west' | 'any';
  estimatedHops: number;
  estimatedDeliveryTime: number;  // ms
}

export interface GeoRouter {
  /**
   * Calculate routing hint for message.
   */
  calculateRoute(
    sourceZone: GridZone,
    destinationZone: GridZone
  ): GeoRoutingHint;

  /**
   * Score a potential relay peer based on geo position.
   * Higher score = better relay candidate.
   */
  scorePeerForRelay(
    peer: PeerInfo,
    message: StoredMessage
  ): number;

  /**
   * Select best peers for relaying a message.
   */
  selectRelayPeers(
    availablePeers: PeerInfo[],
    message: StoredMessage,
    maxPeers: number
  ): PeerInfo[];

  /**
   * Update our own zone (call when location changes).
   */
  updateOwnZone(zone: GridZone): void;
}
```

**Routing Score Algorithm:**

```typescript
function calculateRelayScore(
  peer: PeerInfo,
  message: StoredMessage,
  ourZone: GridZone
): number {
  const destZone = message.geoZone ? decodeZone(message.geoZone) : null;

  if (!destZone || !peer.zone) {
    return 50;  // Neutral score for unknown locations
  }

  const ourDistToDest = distance(ourZone, destZone);
  const peerDistToDest = distance(peer.zone, destZone);

  // Peer is closer to destination = higher score
  const proximityScore = Math.max(0, (ourDistToDest - peerDistToDest) / ourDistToDest * 100);

  // Peer is in the right direction = bonus
  const directionBonus = isOnPath(peer.zone, ourZone, destZone) ? 20 : 0;

  // Peer has high connectivity = bonus
  const connectivityBonus = Math.min(peer.knownPeers * 2, 20);

  // Peer has low message count = bonus (not overloaded)
  const loadBonus = peer.messageCount < 10000 ? 10 : 0;

  return proximityScore + directionBonus + connectivityBonus + loadBonus;
}
```

---

### 3.3 Location Privacy Manager

**Files to Modify:**
- `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/config/ConfigManager.ts` - Add location privacy settings

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/geo/LocationManager.ts`:**

```typescript
export interface LocationPrivacySettings {
  defaultPrecision: LocationPrecision;  // User's default (GRID_100KM)
  allowExactForEmergency: boolean;      // Allow EXACT in emergency broadcasts
  shareWithContacts: LocationPrecision; // Precision for direct messages
  shareForRelay: LocationPrecision;     // Precision as relay node
  updateInterval: number;               // How often to update (ms)
}

export interface LocationManager {
  /**
   * Get current location at specified precision.
   */
  getCurrentZone(precision?: LocationPrecision): Promise<GridZone | null>;

  /**
   * Get location for outgoing message (respects privacy settings).
   */
  getZoneForMessage(messageType: 'direct' | 'broadcast' | 'relay'): Promise<GridZone | null>;

  /**
   * Update privacy settings.
   */
  updateSettings(settings: Partial<LocationPrivacySettings>): void;

  /**
   * Get cached location (no GPS query).
   */
  getCachedZone(): GridZone | null;
}
```

---

### Phase 3 Testing Strategy

| Component | Test Type | Coverage Target |
|-----------|-----------|-----------------|
| GridZoneEncoder | Unit (property-based) | 95% |
| GeoRouter | Unit + Simulation | 85% |
| LocationManager | Unit + Privacy | 90% |

**Key Test Scenarios:**
1. Message from NYC to LA routes westward (not through Europe)
2. 100km grid zone doesn't leak exact location
3. Privacy settings respected for different message types
4. Routing score correctly prioritizes closer peers
5. Geo routing degrades gracefully with no location data

---

## Phase 4: Long-Range Transports (Weeks 11-14)

**Goal:** Bridge to LoRa, Meshtastic, and satellite networks.

### 4.1 Transport Abstraction Enhancement

**Files to Modify:**
- `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/transport/Transport.ts` - Add transport capabilities

**Enhanced Interface:**

```typescript
export interface TransportCapabilities {
  maxPayloadSize: number;     // bytes
  maxBandwidth: number;       // bytes per second
  latencyMs: number;          // typical latency
  range: 'local' | 'medium' | 'long' | 'global';
  powerUsage: 'low' | 'medium' | 'high';
  bidirectional: boolean;
  requiresInternet: boolean;
}

export interface Transport {
  // Existing methods...

  /**
   * Get transport capabilities for routing decisions.
   */
  getCapabilities(): TransportCapabilities;

  /**
   * Check if transport can handle message size.
   */
  canSend(payloadSize: number): boolean;

  /**
   * Fragment large message for transport.
   */
  fragment(payload: Uint8Array): Uint8Array[];

  /**
   * Reassemble fragmented message.
   */
  reassemble(fragments: Uint8Array[]): Uint8Array;
}
```

---

### 4.2 Meshtastic Bridge

**Files to Create:**

```
core/src/transport/meshtastic/
├── MeshtasticBridge.ts      # Bridge to Meshtastic network
├── MeshtasticProtocol.ts    # Meshtastic packet wrapper
├── MeshtasticSerial.ts      # USB serial connection
├── MeshtasticBLE.ts         # BLE connection to Meshtastic device
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/transport/meshtastic/MeshtasticBridge.ts`:**

```typescript
export interface MeshtasticBridge extends Transport {
  /**
   * Connect to Meshtastic device.
   */
  connect(connection: MeshtasticConnection): Promise<void>;

  /**
   * Send SC message wrapped in Meshtastic packet.
   */
  sendWrapped(message: StoredMessage): Promise<void>;

  /**
   * Receive and unwrap Meshtastic packets.
   */
  onWrappedMessage(callback: (message: StoredMessage) => void): void;

  /**
   * Get Meshtastic network info.
   */
  getNetworkInfo(): Promise<MeshtasticNetworkInfo>;
}

export type MeshtasticConnection =
  | { type: 'serial'; port: string }
  | { type: 'ble'; deviceId: string }
  | { type: 'tcp'; host: string; port: number };

export interface MeshtasticNetworkInfo {
  nodeCount: number;
  myNodeId: number;
  channelSettings: ChannelSettings;
  airtime: number;            // % airtime used
  lastHeard: Map<number, number>;  // nodeId -> timestamp
}

// Meshtastic packet wrapper
export interface SCMeshtasticPacket {
  magic: 0x5343;              // "SC" in hex
  version: 1;
  messageId: string;          // First 16 bytes of message ID
  fragmentIndex: number;
  fragmentCount: number;
  payload: Uint8Array;        // SC message fragment
  checksum: number;
}
```

**Meshtastic Capabilities:**

```typescript
export const MESHTASTIC_CAPABILITIES: TransportCapabilities = {
  maxPayloadSize: 237,        // Meshtastic max payload
  maxBandwidth: 100,          // ~100 bytes/sec effective
  latencyMs: 5000,            // 5 second typical
  range: 'long',              // 10-15km typical
  powerUsage: 'low',
  bidirectional: true,
  requiresInternet: false,
};
```

---

### 4.3 LoRa Direct Transport

**Files to Create:**

```
core/src/transport/lora/
├── LoRaTransport.ts         # Direct LoRa communication
├── LoRaModem.ts             # Modem abstraction
├── LoRaProtocol.ts          # SC-over-LoRa protocol
└── index.ts

mobile/ios/SovereignComms/LoRa/
├── LoRaManager.swift        # Native LoRa handling
└── LoRaBridge.swift         # React Native bridge

mobile/android/app/src/main/java/com/sovereigncomms/lora/
├── LoRaManager.kt           # Native LoRa handling
└── LoRaModule.kt            # React Native bridge
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/transport/lora/LoRaTransport.ts`:**

```typescript
export interface LoRaConfig {
  frequency: number;          // MHz (e.g., 915 for US, 868 for EU)
  bandwidth: 125 | 250 | 500; // kHz
  spreadingFactor: 7 | 8 | 9 | 10 | 11 | 12;
  codingRate: 5 | 6 | 7 | 8;  // 4/5, 4/6, 4/7, 4/8
  txPower: number;            // dBm (max typically 20)
  syncWord: number;           // Network identifier
}

export const SC_LORA_CONFIG: LoRaConfig = {
  frequency: 915,             // US ISM band
  bandwidth: 125,
  spreadingFactor: 10,        // Good range/speed balance
  codingRate: 5,
  txPower: 17,
  syncWord: 0x53,             // "S" for Sovereign
};

export interface LoRaTransport extends Transport {
  /**
   * Configure LoRa modem.
   */
  configure(config: LoRaConfig): Promise<void>;

  /**
   * Get current RSSI (signal strength).
   */
  getRSSI(): Promise<number>;

  /**
   * Get current SNR (signal-to-noise ratio).
   */
  getSNR(): Promise<number>;

  /**
   * Set channel activity detection.
   */
  enableCAD(enabled: boolean): Promise<void>;
}
```

---

### 4.4 Satellite Bridge (Future)

**Files to Create (Stub):**

```
core/src/transport/satellite/
├── SatelliteBridge.ts       # Satellite bridge interface
├── IridiumBridge.ts         # Iridium SBD implementation
├── SwarmBridge.ts           # Swarm tile implementation
└── index.ts
```

**Stub Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/transport/satellite/SatelliteBridge.ts`:**

```typescript
/**
 * Satellite bridge for global reach.
 * V1: Stub interface only.
 * V2: Full implementation with Swarm/Iridium.
 */
export interface SatelliteBridge extends Transport {
  /**
   * Check satellite availability.
   */
  checkAvailability(): Promise<SatelliteStatus>;

  /**
   * Send message via satellite (expensive, use sparingly).
   */
  sendViaSatellite(message: StoredMessage): Promise<void>;

  /**
   * Receive messages from satellite.
   */
  onSatelliteMessage(callback: (message: StoredMessage) => void): void;
}

export interface SatelliteStatus {
  available: boolean;
  provider: 'iridium' | 'swarm' | 'starlink' | 'none';
  signalStrength: number;     // 0-100
  costPerByte: number;        // Estimated cost in cents
  queuedMessages: number;
}

// Satellite is global but expensive
export const SATELLITE_CAPABILITIES: TransportCapabilities = {
  maxPayloadSize: 340,        // Iridium SBD limit
  maxBandwidth: 10,           // Very slow
  latencyMs: 30000,           // 30 second typical
  range: 'global',
  powerUsage: 'high',
  bidirectional: true,
  requiresInternet: false,
};
```

---

### Phase 4 Testing Strategy

| Component | Test Type | Coverage Target |
|-----------|-----------|-----------------|
| MeshtasticBridge | Integration + Hardware | 75% |
| LoRaTransport | Integration + Hardware | 75% |
| SatelliteBridge | Stub only | N/A |
| Transport Selection | Unit | 90% |

**Key Test Scenarios:**
1. SC message round-trips through Meshtastic node
2. Large message fragments correctly over LoRa
3. Transport selector chooses optimal transport
4. LoRa CAD prevents collisions
5. Meshtastic bridge handles network partitions

**Hardware Requirements:**
- 2x Meshtastic devices (RAK WisBlock or LilyGO T-Beam)
- 2x LoRa modules (SX1276 or similar)
- Test environment with RF isolation (or outdoor testing)

---

## Phase 5: Emergency Broadcasts (Weeks 15-18)

**Goal:** One-to-many verified alert system with spam prevention.

### 5.1 Broadcast Message Type

**Files to Create:**

```
core/src/broadcast/
├── BroadcastMessage.ts      # Broadcast message type
├── BroadcastManager.ts      # Sending and receiving broadcasts
├── BroadcastVerifier.ts     # Web-of-trust verification
├── BroadcastAggregator.ts   # Spam prevention
└── index.ts
```

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/broadcast/BroadcastMessage.ts`:**

```typescript
export enum BroadcastType {
  EMERGENCY = 'emergency',    // Highest priority, long TTL
  ALERT = 'alert',            // High priority
  ANNOUNCEMENT = 'announcement', // Normal priority
}

export interface BroadcastMessage extends StoredMessage {
  type: 'broadcast';
  broadcastType: BroadcastType;

  /**
   * Target zone (or 'GLOBAL' for worldwide).
   */
  targetZone: string;

  /**
   * Broadcast radius in km (0 = exact zone only).
   */
  radiusKm: number;

  /**
   * Web-of-trust attestations.
   */
  attestations: BroadcastAttestation[];

  /**
   * Plaintext content (broadcasts are not encrypted).
   */
  content: string;

  /**
   * Optional attachment hash (content stored separately).
   */
  attachmentHash?: string;
}

export interface BroadcastAttestation {
  attesterId: string;         // Public key fingerprint
  attesterName: string;       // Display name
  attestedAt: number;         // Timestamp
  trustLevel: TrustLevel;
  signature: string;          // Signature over broadcast ID
}

export enum TrustLevel {
  DIRECT = 3,                 // Directly trusted by user
  SECOND_DEGREE = 2,          // Trusted by someone user trusts
  THIRD_DEGREE = 1,           // Trusted by second-degree contact
  UNKNOWN = 0,                // No trust path
}
```

---

### 5.2 Web-of-Trust Verification

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/broadcast/BroadcastVerifier.ts`:**

```typescript
export interface TrustGraph {
  /**
   * Add trust relationship.
   */
  addTrust(from: string, to: string, level: TrustLevel): void;

  /**
   * Remove trust relationship.
   */
  removeTrust(from: string, to: string): void;

  /**
   * Get trust level from our perspective.
   */
  getTrustLevel(targetId: string): TrustLevel;

  /**
   * Get trust path to target (for UI display).
   */
  getTrustPath(targetId: string): TrustPath | null;
}

export interface TrustPath {
  target: string;
  level: TrustLevel;
  path: Array<{
    id: string;
    name: string;
  }>;
}

export interface BroadcastVerifier {
  /**
   * Verify broadcast signatures and trust chain.
   */
  verify(broadcast: BroadcastMessage): Promise<VerificationResult>;

  /**
   * Check if sender is authorized to broadcast.
   */
  isAuthorizedBroadcaster(senderId: string): boolean;

  /**
   * Add attestation to broadcast.
   */
  addAttestation(broadcast: BroadcastMessage): Promise<BroadcastMessage>;

  /**
   * Get minimum trust level required to display broadcast.
   */
  getMinDisplayTrust(): TrustLevel;
}

export interface VerificationResult {
  valid: boolean;
  signatureValid: boolean;
  senderTrustLevel: TrustLevel;
  attestationCount: number;
  highestAttestationTrust: TrustLevel;
  reasons: string[];
}
```

---

### 5.3 Broadcast Aggregation (Spam Prevention)

**Key Interface - `/Users/christymaxwell/Desktop/Luke_Stuff/GitHub/SC/core/src/broadcast/BroadcastAggregator.ts`:**

```typescript
export interface BroadcastAggregator {
  /**
   * Check if broadcast should be displayed (spam filter).
   */
  shouldDisplay(broadcast: BroadcastMessage): boolean;

  /**
   * Check if broadcast should be relayed.
   */
  shouldRelay(broadcast: BroadcastMessage): boolean;

  /**
   * Get aggregated broadcasts for zone.
   */
  getForZone(zoneId: string): BroadcastMessage[];

  /**
   * Report broadcast as spam.
   */
  reportSpam(broadcastId: string): void;

  /**
   * Get sender reputation score.
   */
  getSenderReputation(senderId: string): number;
}

// Spam prevention rules
export const BROADCAST_LIMITS = {
  maxPerSenderPerHour: 3,     // Rate limit per sender
  maxPerZonePerHour: 10,      // Rate limit per zone
  minTrustToRelay: TrustLevel.THIRD_DEGREE,
  minTrustToDisplay: TrustLevel.UNKNOWN, // Display all but mark trust
  spamReportsToBlock: 5,      // Block sender after N reports
};
```

---

### 5.4 Broadcast UI Components

**Files to Create:**

```
web/src/components/broadcast/
├── BroadcastFeed.tsx        # List of broadcasts
├── BroadcastCard.tsx        # Individual broadcast display
├── BroadcastCompose.tsx     # Create new broadcast
├── TrustBadge.tsx           # Trust level indicator
└── index.ts

mobile/src/screens/
├── BroadcastFeedScreen.tsx  # Mobile broadcast feed
├── ComposeBroadcastScreen.tsx # Mobile compose
└── BroadcastDetailScreen.tsx  # Full broadcast view
```

---

### Phase 5 Testing Strategy

| Component | Test Type | Coverage Target |
|-----------|-----------|-----------------|
| BroadcastMessage | Unit | 95% |
| TrustGraph | Unit (property-based) | 90% |
| BroadcastVerifier | Unit + Integration | 85% |
| BroadcastAggregator | Unit | 90% |
| Spam Prevention | Simulation | 80% |

**Key Test Scenarios:**
1. Broadcast reaches all nodes in target zone within 1 hour (simulated)
2. Unknown sender broadcast displays with warning
3. Spam from blocked sender is not relayed
4. Web-of-trust correctly calculates trust paths
5. Emergency broadcast survives 30-day relay chain

---

## Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| BLE background limits (iOS) | Messages delayed when app backgrounded | Use iOS background modes, educate users |
| Storage quota exceeded | Old messages lost | Priority eviction, user warnings |
| Meshtastic protocol changes | Bridge breaks | Pin Meshtastic version, adapter pattern |
| Battery drain complaints | Users disable app | Aggressive duty cycling, clear power stats |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bloom filter false positives | Some messages not relayed | Tune parameters, persistent log backup |
| Geo-routing privacy leaks | Location exposed | Default to 100km zones, audit logging |
| DHT bootstrap failure | New users can't join | QR fallback, hardcoded bootstrap nodes |
| Message explosion | Network congestion | Hop limits, geo-scoping, TTL decay |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| LoRa regulatory issues | Feature unavailable in some regions | Region detection, user responsibility |
| Satellite costs | Feature underutilized | Clear cost warnings, fallback to other transports |
| Web-of-trust gaming | Spam gets through | Reputation system, community moderation |

---

## Success Metrics

### Phase 1 (Foundation)
- [ ] 99.9% message persistence across app restarts
- [ ] Dedup false positive rate < 1%
- [ ] Storage quota enforced with correct eviction order
- [ ] DHT signaling achieves connection in < 30 seconds

### Phase 2 (Courier Mode)
- [ ] Two phones sync 10,000 messages in < 60 seconds
- [ ] Dead phone mode completes critical sync in < 2 minutes
- [ ] Survival mode achieves 72-hour battery life (lab tested)
- [ ] BLE discovery works in airplane mode

### Phase 3 (Geo-Aware)
- [ ] Cross-country routing prefers directional peers
- [ ] Location privacy verified (no exact coordinates leaked)
- [ ] Routing score correctly prioritizes closer peers

### Phase 4 (Long-Range)
- [ ] Meshtastic bridge achieves 10km message delivery
- [ ] LoRa direct achieves 5km message delivery
- [ ] Large messages fragment/reassemble correctly

### Phase 5 (Broadcasts)
- [ ] Emergency broadcast reaches 1000 nodes in < 1 hour (simulated)
- [ ] Spam prevention blocks 99% of malicious broadcasts
- [ ] Trust path calculation < 100ms

---

## Dependency Graph

```
Phase 1: Foundation
    │
    ├── MessageStore ─────────────┐
    ├── DeduplicationManager ─────┼── Required for all later phases
    ├── QuotaManager ─────────────┘
    └── DHTSignaling
            │
            ▼
Phase 2: Courier Mode
    │
    ├── SyncProtocol ◄── Depends on MessageStore
    ├── QRIdentityExchange
    ├── BLEBeacon
    ├── DeadPhoneMode ◄── Depends on SyncProtocol
    └── DutyCycleManager
            │
            ▼
Phase 3: Geo-Aware Routing
    │
    ├── GridZoneEncoder
    ├── LocationManager
    └── GeoRouter ◄── Depends on MessageStore, integrates with SyncProtocol
            │
            ▼
Phase 4: Long-Range Transports
    │
    ├── MeshtasticBridge ◄── Depends on Transport abstraction
    ├── LoRaTransport ◄── Depends on Transport abstraction
    └── SatelliteBridge (stub)
            │
            ▼
Phase 5: Emergency Broadcasts
    │
    ├── BroadcastMessage ◄── Depends on MessageStore, GeoRouter
    ├── TrustGraph
    ├── BroadcastVerifier
    └── BroadcastAggregator
```

---

## Commit Strategy

### Phase 1 Commits
1. `feat(storage): Add persistent MessageStore with IndexedDB implementation`
2. `feat(dedup): Add bloom filter and persistent deduplication`
3. `feat(storage): Add quota management with priority-aware eviction`
4. `feat(signaling): Add DHT-based P2P signaling for WebRTC`
5. `test(storage): Add integration tests for persistence and eviction`

### Phase 2 Commits
1. `feat(courier): Add sync protocol for efficient message exchange`
2. `feat(bootstrap): Add QR code identity exchange`
3. `feat(bootstrap): Add BLE beacon discovery`
4. `feat(power): Add dead phone mode for critical sync`
5. `feat(power): Add adaptive duty cycling with power profiles`

### Phase 3 Commits
1. `feat(geo): Add 100km grid zone encoding`
2. `feat(geo): Add privacy-preserving location manager`
3. `feat(geo): Add geo-aware routing with peer scoring`
4. `test(geo): Add geo-routing simulation tests`

### Phase 4 Commits
1. `feat(transport): Enhance transport abstraction with capabilities`
2. `feat(transport): Add Meshtastic bridge wrapper`
3. `feat(transport): Add LoRa direct transport`
4. `feat(transport): Add satellite bridge stub`

### Phase 5 Commits
1. `feat(broadcast): Add broadcast message type and manager`
2. `feat(broadcast): Add web-of-trust verification`
3. `feat(broadcast): Add spam prevention aggregator`
4. `feat(ui): Add broadcast feed and compose components`

---

## Next Steps

To begin implementation, run:

```
/start-work APOCALYPSE_IMPLEMENTATION_PLAN.md
```

This will:
1. Parse this plan into actionable tasks
2. Set up the development environment
3. Begin Phase 1 implementation
4. Track progress through each phase

---

*"Every phone becomes a relay station for humanity. The internet could crash, and people could still communicate worldwide. This is the audacious goal."*

---

**Plan Generated:** 2026-01-14
**Prometheus Strategic Planning Session Complete**
