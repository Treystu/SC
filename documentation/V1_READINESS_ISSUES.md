# V1 Readiness - Comprehensive Task Breakdown

Based on comprehensive analysis of the Sovereign Communications codebase, this document outlines all remaining tasks for V1 readiness, organized by 3 major phases. Each task includes specific file paths, implementation details, and acceptance criteria aligned with the app's sovereignty ideology (fully serverless, user-controlled, local-first).

## Current State Analysis

**Repository Stats:**
- Progress: 130/285 tasks complete (45.6%)
- Core Infrastructure: 92% complete
- Web App: 29% complete (9/31 tasks)
- Android: 55% complete (18/33 tasks)
- iOS: 100% complete (33/33 tasks) ✅
- Tests: 91 passing, 0 vulnerabilities

**Existing Persistence:**
- Web: IndexedDB schema defined in `core/src/db-schema.ts` + implementation in `web/src/storage/database.ts`
- Android: Room entities defined in `android/app/src/main/kotlin/.../data/entity/`
- iOS: CoreData entities defined in `ios/SovereignCommunications/Data/Entity/`

**Build Status:**
- ⚠️ Core library has TypeScript errors (missing @types/node, @noble dependencies)
- ✅ 91 tests passing
- ✅ Zero CodeQL vulnerabilities

---

## PHASE 1: DATA PERSISTENCE & CORE STABILITY (Critical Path)

### Issue 1.1: Fix Core Library Build Errors

**Priority:** P0 (Blocking)  
**Category:** Build & Release  
**Labels:** `bug`, `build`, `core`

**Problem:**
TypeScript compilation fails with 37 errors in core library due to missing type definitions and dependencies.

**Files to Fix:**
1. `/home/runner/work/SC/SC/core/package.json`
2. `/home/runner/work/SC/SC/core/tsconfig.json`
3. `/home/runner/work/SC/SC/core/src/crypto/primitives.ts`
4. `/home/runner/work/SC/SC/core/src/protocol/message.ts`
5. `/home/runner/work/SC/SC/core/src/config-manager.ts`
6. `/home/runner/work/SC/SC/core/src/connection-manager.ts`
7. Multiple discovery and transport files

**Tasks:**

- [ ] **Task 1.1.1:** Install missing dependencies
  ```bash
  cd /home/runner/work/SC/SC/core
  npm install --save-dev @types/node
  npm install @noble/curves @noble/ciphers @noble/hashes
  ```
  **Acceptance:** Dependencies in package.json, no install errors

- [ ] **Task 1.1.2:** Fix TypeScript configuration
  - Edit `/home/runner/work/SC/SC/core/tsconfig.json`
  - Add `"types": ["node"]` to compilerOptions
  - Ensure `"moduleResolution": "node"` is set
  - Verify `"lib": ["ES2020"]` or higher for modern features
  **Acceptance:** tsconfig properly configured for Node.js types

- [ ] **Task 1.1.3:** Fix crypto primitives imports
  - File: `/home/runner/work/SC/SC/core/src/crypto/primitives.ts`
  - Replace any incorrect import paths for @noble libraries
  - Verify imports: `@noble/curves/ed25519`, `@noble/hashes/sha256`, `@noble/ciphers/chacha`
  **Acceptance:** All imports resolve correctly

- [ ] **Task 1.1.4:** Fix Array mapping type errors
  - Files: `primitives.ts` line 426, `message.ts` line 298
  - Change `.map((b: number) => ...)` to `.map((b) => ...)`
  - Let TypeScript infer the type from Uint8Array
  **Acceptance:** No type errors on map functions

- [ ] **Task 1.1.5:** Fix NodeJS namespace references
  - Add conditional types or use `ReturnType<typeof setTimeout>` instead of `NodeJS.Timeout`
  - Or install @types/node properly
  **Acceptance:** All NodeJS namespace references resolve

- [ ] **Task 1.1.6:** Fix process/require/module references
  - Add guards: `typeof process !== 'undefined' ? process.env : {}`
  - Replace `require` checks with proper ES module patterns
  **Acceptance:** Code works in both Node and browser environments

- [ ] **Task 1.1.7:** Verify build succeeds
  ```bash
  cd /home/runner/work/SC/SC/core
  npm run build
  ```
  **Acceptance:** Build completes with 0 errors, dist/ folder populated

- [ ] **Task 1.1.8:** Run tests
  ```bash
  npm test
  ```
  **Acceptance:** All 91 tests pass

**Sovereignty Impact:** None - this is infrastructure repair to enable further development.

---

### Issue 1.2: Complete Web IndexedDB Data Persistence

**Priority:** P0 (Critical for V1)  
**Category:** Web Application  
**Labels:** `web`, `persistence`, `indexeddb`, `sovereignty`

**Problem:**
IndexedDB schema is defined but not fully integrated with the mesh network. Missing: identity storage, peer registry persistence, routing table persistence, session keys, export/import, and sovereignty controls.

**Files to Modify:**
1. `/home/runner/work/SC/SC/core/src/db-schema.ts` - Extend schema
2. `/home/runner/work/SC/SC/web/src/storage/database.ts` - Enhance DatabaseManager
3. `/home/runner/work/SC/SC/web/src/hooks/useMeshNetwork.ts` - Integrate persistence
4. `/home/runner/work/SC/SC/web/src/components/Settings.tsx` - NEW: Add sovereignty UI
5. `/home/runner/work/SC/SC/core/src/indexeddb-handler.ts` - Enhance helper

**Tasks:**

- [ ] **Task 1.2.1:** Extend IndexedDB schema for full persistence
  - File: `/home/runner/work/SC/SC/core/src/db-schema.ts`
  - Add interfaces:
    ```typescript
    export interface Identity {
      id: string;
      publicKey: Uint8Array;
      privateKey: Uint8Array; // encrypted at rest
      fingerprint: string;
      createdAt: number;
      label?: string;
    }
    
    export interface PersistedPeer {
      id: string;
      publicKey: string;
      transportType: 'webrtc' | 'ble' | 'wifi';
      lastSeen: number;
      connectionQuality: number;
      reputation: number;
      isBlacklisted: boolean;
      blacklistedUntil?: number;
      metadata?: Record<string, any>;
    }
    
    export interface Route {
      destinationId: string;
      nextHopId: string;
      cost: number;
      lastUpdated: number;
      ttl: number;
    }
    
    export interface SessionKey {
      peerId: string;
      key: Uint8Array; // encrypted
      nonce: Uint8Array;
      createdAt: number;
      messageCount: number;
      expiresAt: number;
    }
    ```
  **Acceptance:** Interfaces defined with proper types

- [ ] **Task 1.2.2:** Create object stores in DatabaseManager.init()
  - File: `/home/runner/work/SC/SC/web/src/storage/database.ts`
  - In `onupgradeneeded` callback, add:
    ```typescript
    // Identities store
    if (!db.objectStoreNames.contains('identities')) {
      const identityStore = db.createObjectStore('identities', { keyPath: 'id' });
      identityStore.createIndex('publicKey', 'publicKey', { unique: true });
      identityStore.createIndex('fingerprint', 'fingerprint', { unique: true });
    }
    
    // Peers store
    if (!db.objectStoreNames.contains('peers')) {
      const peerStore = db.createObjectStore('peers', { keyPath: 'id' });
      peerStore.createIndex('publicKey', 'publicKey', { unique: true });
      peerStore.createIndex('lastSeen', 'lastSeen', { unique: false });
      peerStore.createIndex('isBlacklisted', 'isBlacklisted', { unique: false });
    }
    
    // Routes store
    if (!db.objectStoreNames.contains('routes')) {
      const routeStore = db.createObjectStore('routes', { keyPath: 'destinationId' });
      routeStore.createIndex('nextHopId', 'nextHopId', { unique: false });
      routeStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
    }
    
    // Session keys store
    if (!db.objectStoreNames.contains('sessionKeys')) {
      const sessionStore = db.createObjectStore('sessionKeys', { keyPath: 'peerId' });
      sessionStore.createIndex('expiresAt', 'expiresAt', { unique: false });
    }
    ```
  - Increment `this.version` to 2
  **Acceptance:** All stores created with proper indices

- [ ] **Task 1.2.3:** Add identity persistence methods
  - File: `/home/runner/work/SC/SC/web/src/storage/database.ts`
  - Add methods to DatabaseManager class:
    ```typescript
    async saveIdentity(identity: Identity): Promise<void>
    async getIdentity(id: string): Promise<Identity | null>
    async getPrimaryIdentity(): Promise<Identity | null>
    async deleteIdentity(id: string): Promise<void>
    ```
  - Implement using IndexedDB transactions
  **Acceptance:** CRUD operations for identities work

- [ ] **Task 1.2.4:** Add peer persistence methods
  ```typescript
  async savePeer(peer: PersistedPeer): Promise<void>
  async getPeer(id: string): Promise<PersistedPeer | null>
  async getAllPeers(): Promise<PersistedPeer[]>
  async getActivePeers(): Promise<PersistedPeer[]> // lastSeen < 5 min
  async updatePeerReputation(id: string, reputation: number): Promise<void>
  async blacklistPeer(id: string, duration: number): Promise<void>
  async deletePeer(id: string): Promise<void>
  ```
  **Acceptance:** Full peer lifecycle management

- [ ] **Task 1.2.5:** Add routing table persistence
  ```typescript
  async saveRoute(route: Route): Promise<void>
  async getRoute(destinationId: string): Promise<Route | null>
  async getAllRoutes(): Promise<Route[]>
  async deleteExpiredRoutes(): Promise<void> // TTL expired
  async clearRoutes(): Promise<void>
  ```
  **Acceptance:** Routes persisted and retrieved correctly

- [ ] **Task 1.2.6:** Add session key persistence
  ```typescript
  async saveSessionKey(sessionKey: SessionKey): Promise<void>
  async getSessionKey(peerId: string): Promise<SessionKey | null>
  async deleteSessionKey(peerId: string): Promise<void>
  async deleteExpiredSessionKeys(): Promise<void>
  ```
  **Acceptance:** Session keys managed with expiration

- [ ] **Task 1.2.7:** Implement data export (sovereignty feature)
  ```typescript
  async exportAllData(): Promise<{
    version: number;
    exportedAt: number;
    identities: Identity[];
    contacts: StoredContact[];
    conversations: StoredConversation[];
    messages: StoredMessage[];
    peers: PersistedPeer[];
    routes: Route[];
    settings: Settings;
  }>
  ```
  - Serialize to JSON
  - Return as Blob for download
  **Acceptance:** All user data exported in portable format

- [ ] **Task 1.2.8:** Implement data import
  ```typescript
  async importData(data: ExportedData, options: {
    mergeStrategy: 'overwrite' | 'merge' | 'skip-existing'
  }): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }>
  ```
  - Validate structure
  - Handle conflicts
  - Preserve integrity
  **Acceptance:** Import works with conflict resolution

- [ ] **Task 1.2.9:** Implement secure data deletion
  ```typescript
  async deleteAllData(confirmationToken: string): Promise<void> {
    // Require user to type exact phrase
    if (confirmationToken !== 'DELETE ALL MY DATA') {
      throw new Error('Invalid confirmation');
    }
    // Clear all stores
    // Optionally overwrite with random data first
  }
  ```
  **Acceptance:** All data can be permanently deleted

- [ ] **Task 1.2.10:** Integrate with mesh network initialization
  - File: `/home/runner/work/SC/SC/web/src/hooks/useMeshNetwork.ts`
  - On mount:
    1. Load identity from DB
    2. Load known peers and populate routing table
    3. Load active routes
    4. Load session keys
  - Example:
    ```typescript
    const db = getDatabase();
    await db.init();
    
    const identity = await db.getPrimaryIdentity();
    if (identity) {
      // Initialize mesh with existing identity
    }
    
    const peers = await db.getActivePeers();
    peers.forEach(peer => routingTable.addPeer(peer));
    
    const routes = await db.getAllRoutes();
    // Populate routing table
    ```
  **Acceptance:** Mesh network hydrates from persistent storage on startup

- [ ] **Task 1.2.11:** Persist messages on send/receive
  - In message handlers:
    ```typescript
    // On send
    await db.saveMessage({
      id: messageId,
      conversationId,
      content: encrypted,
      timestamp: Date.now(),
      status: 'pending',
      // ... other fields
    });
    
    // On receive
    await db.saveMessage(incomingMessage);
    await db.saveConversation(/* update last message */);
    ```
  **Acceptance:** Messages persist across page reloads

- [ ] **Task 1.2.12:** Create Settings UI with sovereignty controls
  - File: `/home/runner/work/SC/SC/web/src/components/Settings.tsx` (NEW)
  - Sections:
    1. **Your Data**: Storage usage, retention policy
    2. **Export Data**: Button to download all data as JSON
    3. **Import Data**: File upload to restore data
    4. **Delete Data**: Danger zone with confirmation
  - Example UI:
    ```tsx
    <section>
      <h2>Data Sovereignty</h2>
      <p>Your data is stored locally on this device only. No servers involved.</p>
      
      <div>
        <h3>Storage Usage</h3>
        <p>{storageSize} MB used</p>
        <button onClick={handleExport}>Export All Data</button>
      </div>
      
      <div className="danger-zone">
        <h3>Delete All Local Data</h3>
        <p>This action cannot be undone. Your data is not backed up anywhere.</p>
        <input 
          placeholder="Type 'DELETE ALL MY DATA' to confirm"
          onChange={e => setConfirmation(e.target.value)}
        />
        <button onClick={handleDelete} disabled={confirmation !== 'DELETE ALL MY DATA'}>
          Delete Everything
        </button>
      </div>
    </section>
    ```
  **Acceptance:** UI provides full sovereignty controls

- [ ] **Task 1.2.13:** Add automated tests
  - File: `/home/runner/work/SC/SC/web/src/storage/database.test.ts` (NEW)
  - Test cases:
    - Identity CRUD
    - Peer persistence with blacklisting
    - Route expiration
    - Session key rotation
    - Export/import round-trip
    - Data deletion
  **Acceptance:** >80% coverage, all tests pass

**Sovereignty Principles Enforced:**
✅ All data local to device  
✅ User can export everything  
✅ User can delete everything  
✅ No hidden cloud sync  
✅ Clear UI about what's stored  

---

### Issue 1.3: Complete Android Room Database Integration

**Priority:** P0 (Critical for V1)  
**Category:** Android Application  
**Labels:** `android`, `persistence`, `room`, `sovereignty`

**Problem:**
Android Room entities are defined but not integrated with the mesh network. Missing: identity storage, peer persistence, routing, session keys, and sovereignty features.

**Files to Modify:**
1. `/home/runner/work/SC/SC/android/app/src/main/kotlin/.../data/entity/` - Add new entities
2. `/home/runner/work/SC/SC/android/app/src/main/kotlin/.../data/dao/` - Add DAOs
3. `/home/runner/work/SC/SC/android/app/src/main/kotlin/.../data/AppDatabase.kt` - Extend database
4. `/home/runner/work/SC/SC/android/app/src/main/kotlin/.../data/repository/` - Add repositories
5. `/home/runner/work/SC/SC/android/app/src/main/kotlin/.../ui/settings/SettingsScreen.kt` - Add sovereignty UI

**Tasks:**

- [ ] **Task 1.3.1:** Create Identity entity
  - File: `/home/runner/work/SC/SC/android/app/src/main/kotlin/com/sovereign/communications/data/entity/IdentityEntity.kt` (NEW)
  ```kotlin
  @Entity(
      tableName = "identities",
      indices = [Index(value = ["publicKey"], unique = true)]
  )
  data class IdentityEntity(
      @PrimaryKey val id: String,
      val publicKey: ByteArray,
      val privateKeyAlias: String, // Reference to Android Keystore
      val fingerprint: String,
      val label: String?,
      val createdAt: Long,
      val isPrimary: Boolean = false
  )
  ```
  **Acceptance:** Entity compiles with Room annotations

- [ ] **Task 1.3.2:** Create Peer entity
  - File: `.../data/entity/PeerEntity.kt` (NEW)
  ```kotlin
  @Entity(
      tableName = "peers",
      indices = [
          Index(value = ["publicKey"], unique = true),
          Index(value = ["lastSeen"]),
          Index(value = ["isBlacklisted"])
      ]
  )
  data class PeerEntity(
      @PrimaryKey val id: String,
      val publicKey: String,
      val transportType: String,
      val lastSeen: Long,
      val connectionQuality: Int,
      val reputation: Int,
      val isBlacklisted: Boolean,
      val blacklistedUntil: Long?,
      val metadata: String? // JSON
  )
  ```
  **Acceptance:** Proper indices for query performance

- [ ] **Task 1.3.3:** Create Route entity
  ```kotlin
  @Entity(
      tableName = "routes",
      indices = [Index(value = ["lastUpdated"])]
  )
  data class RouteEntity(
      @PrimaryKey val destinationId: String,
      val nextHopId: String,
      val cost: Int,
      val lastUpdated: Long,
      val ttl: Int
  )
  ```
  **Acceptance:** Routes can be queried and expired

- [ ] **Task 1.3.4:** Create SessionKey entity
  ```kotlin
  @Entity(tableName = "session_keys")
  data class SessionKeyEntity(
      @PrimaryKey val peerId: String,
      val keyAlias: String, // Android Keystore reference
      val nonce: ByteArray,
      val createdAt: Long,
      val messageCount: Int,
      val expiresAt: Long
  )
  ```
  **Acceptance:** Keys reference secure storage

- [ ] **Task 1.3.5:** Create DAOs for new entities
  - Files: `.../data/dao/IdentityDao.kt`, `PeerDao.kt`, `RouteDao.kt`, `SessionKeyDao.kt` (NEW)
  - Each DAO should have:
    ```kotlin
    @Dao
    interface IdentityDao {
        @Insert(onConflict = OnConflictStrategy.REPLACE)
        suspend fun insert(identity: IdentityEntity)
        
        @Query("SELECT * FROM identities WHERE id = :id")
        suspend fun getById(id: String): IdentityEntity?
        
        @Query("SELECT * FROM identities WHERE isPrimary = 1 LIMIT 1")
        suspend fun getPrimary(): IdentityEntity?
        
        @Delete
        suspend fun delete(identity: IdentityEntity)
    }
    ```
  **Acceptance:** All CRUD operations defined

- [ ] **Task 1.3.6:** Update AppDatabase
  - File: `.../data/AppDatabase.kt`
  - Add new entities to `@Database` annotation
  - Increment version number
  - Add migration strategy
  ```kotlin
  @Database(
      entities = [
          MessageEntity::class,
          ConversationEntity::class,
          ContactEntity::class,
          IdentityEntity::class,
          PeerEntity::class,
          RouteEntity::class,
          SessionKeyEntity::class
      ],
      version = 2
  )
  ```
  **Acceptance:** Database compiles with all entities

- [ ] **Task 1.3.7:** Implement Android Keystore integration
  - File: `.../data/security/KeystoreManager.kt` (NEW)
  - Store private keys and session keys in Android Keystore
  - Provide alias-based retrieval
  ```kotlin
  class KeystoreManager {
      fun generateAndStoreIdentityKey(alias: String): String
      fun getPrivateKey(alias: String): PrivateKey
      fun deleteKey(alias: String)
  }
  ```
  **Acceptance:** Keys stored securely, not in Room DB

- [ ] **Task 1.3.8:** Create repositories
  - Files: `.../data/repository/IdentityRepository.kt`, etc.
  - Encapsulate DAO calls
  - Provide higher-level API
  ```kotlin
  class IdentityRepository(private val dao: IdentityDao) {
      suspend fun createIdentity(label: String): IdentityEntity {
          val keyAlias = keystoreManager.generateAndStoreIdentityKey(...)
          val identity = IdentityEntity(...)
          dao.insert(identity)
          return identity
      }
  }
  ```
  **Acceptance:** Business logic in repositories

- [ ] **Task 1.3.9:** Integrate with mesh service
  - File: `.../service/MeshNetworkService.kt`
  - On service start:
    1. Load identity from DB
    2. Load known peers
    3. Initialize routing table
  **Acceptance:** Mesh bootstraps from persistent state

- [ ] **Task 1.3.10:** Implement data export
  - File: `.../data/export/DataExporter.kt` (NEW)
  ```kotlin
  class DataExporter(private val db: AppDatabase) {
      suspend fun exportAllData(): File {
          val exportData = ExportData(
              identities = db.identityDao().getAll(),
              messages = db.messageDao().getAll(),
              // ... etc
          )
          val json = gson.toJson(exportData)
          // Write to file in app's external storage
          return file
      }
  }
  ```
  **Acceptance:** Export creates JSON file

- [ ] **Task 1.3.11:** Implement data import
  ```kotlin
  suspend fun importData(file: File, mergeStrategy: MergeStrategy): ImportResult
  ```
  **Acceptance:** Import restores data

- [ ] **Task 1.3.12:** Add sovereignty UI in Settings
  - File: `.../ui/settings/SettingsScreen.kt`
  - Add sections:
    ```kotlin
    @Composable
    fun DataSovereigntySection(viewModel: SettingsViewModel) {
        Column {
            Text("Your Data", style = MaterialTheme.typography.h6)
            Text("Stored locally: ${viewModel.storageSize.value}")
            
            Button(onClick = { viewModel.exportData() }) {
                Text("Export All Data")
            }
            
            Button(onClick = { viewModel.showImportDialog() }) {
                Text("Import Data")
            }
            
            // Danger zone
            OutlinedButton(
                onClick = { viewModel.showDeleteDialog() },
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colors.error
                )
            ) {
                Text("Delete All Local Data")
            }
        }
    }
    ```
  **Acceptance:** UI matches sovereignty principles

- [ ] **Task 1.3.13:** Add unit tests
  - Files: `.../data/dao/*DaoTest.kt`
  - Test with in-memory database
  - Cover all CRUD operations
  **Acceptance:** Tests pass

- [ ] **Task 1.3.14:** Add instrumentation tests
  - Test actual device database
  - Test Keystore integration
  - Test data export/import
  **Acceptance:** E2E data flows work

**Sovereignty Principles:**
✅ Keys in Android Keystore  
✅ Data local to device  
✅ Export/import capability  
✅ User can delete all data  

---

### Issue 1.4: Complete iOS CoreData Integration

**Priority:** P0 (Critical for V1)  
**Category:** iOS Application  
**Labels:** `ios`, `persistence`, `coredata`, `sovereignty`

**Note:** iOS already shows 100% completion in PROGRESS.md. This issue ensures data persistence is fully integrated.

**Files to Review/Modify:**
1. `/home/runner/work/SC/SC/ios/SovereignCommunications/Data/CoreDataStack.swift`
2. `/home/runner/work/SC/SC/ios/SovereignCommunications/Data/Entity/*.swift`
3. `/home/runner/work/SC/SC/ios/SovereignCommunications/ViewModels/ViewModels.swift`

**Tasks:**

- [ ] **Task 1.4.1:** Verify CoreData entities are complete
  - Ensure: IdentityEntity, PeerEntity, RouteEntity, SessionKeyEntity exist
  - If missing, create them matching Android/Web schemas
  **Acceptance:** All entities defined

- [ ] **Task 1.4.2:** Verify Keychain integration for keys
  - File: `.../Security/KeychainManager.swift`
  - Ensure private keys stored in Keychain, not CoreData
  **Acceptance:** Keys secured in Keychain

- [ ] **Task 1.4.3:** Implement data export
  - File: `.../Data/DataExporter.swift` (NEW if needed)
  ```swift
  class DataExporter {
      func exportAllData() async throws -> URL {
          let data = ExportData(
              identities: try await fetchAllIdentities(),
              messages: try await fetchAllMessages(),
              // ...
          )
          let jsonData = try JSONEncoder().encode(data)
          let url = FileManager.default.temporaryDirectory
              .appendingPathComponent("sc-export-\(Date().timeIntervalSince1970).json")
          try jsonData.write(to: url)
          return url
      }
  }
  ```
  **Acceptance:** Export produces shareable file

- [ ] **Task 1.4.4:** Implement data import
  ```swift
  func importData(from url: URL, mergeStrategy: MergeStrategy) async throws
  ```
  **Acceptance:** Import works with conflict resolution

- [ ] **Task 1.4.5:** Add sovereignty UI in Settings
  - File: `.../Views/SettingsView.swift`
  - Add sections for export/import/delete
  **Acceptance:** UI provides data controls

- [ ] **Task 1.4.6:** Integrate with mesh network initialization
  - Load persisted state on app launch
  **Acceptance:** Mesh hydrates from CoreData

- [ ] **Task 1.4.7:** Add tests
  - Unit tests for CoreData operations
  - Integration tests for export/import
  **Acceptance:** Tests pass

**Sovereignty Principles:**
✅ Keys in Keychain  
✅ Data in CoreData (on-device)  
✅ Export via Files app  
✅ Import with validation  
✅ Delete all data option  

---

### Issue 1.5: Cross-Platform Data Export/Import Format

**Priority:** P1 (Important for V1)  
**Category:** Core Library  
**Labels:** `core`, `persistence`, `interoperability`

**Problem:**
Need a canonical export format that works across Web, Android, and iOS for true data portability.

**Files to Create:**
1. `/home/runner/work/SC/SC/core/src/export-format.ts` (NEW)

**Tasks:**

- [ ] **Task 1.5.1:** Define export schema
  ```typescript
  export interface SCExportFormat {
      version: '1.0';
      exportedAt: number; // Unix timestamp
      exportedBy: string; // Device identifier
      
      identities: Array<{
          id: string;
          publicKey: string; // base64
          privateKey?: string; // base64, encrypted with user password
          fingerprint: string;
          label?: string;
          createdAt: number;
      }>;
      
      contacts: Array<{
          id: string;
          publicKey: string;
          displayName: string;
          fingerprint: string;
          verified: boolean;
          blocked: boolean;
          addedAt: number;
      }>;
      
      conversations: Array<{
          id: string;
          contactId: string;
          lastMessageTimestamp: number;
          unreadCount: number;
          createdAt: number;
      }>;
      
      messages: Array<{
          id: string;
          conversationId: string;
          senderId: string;
          recipientId: string;
          content: string; // encrypted, base64
          timestamp: number;
          type: 'text' | 'file' | 'voice';
          status: string;
          signature?: string; // base64
      }>;
      
      // Optional: if user chooses to export
      peers?: Array<{...}>;
      routes?: Array<{...}>;
  }
  ```
  **Acceptance:** Schema defined and documented

- [ ] **Task 1.5.2:** Implement encryption for export
  ```typescript
  export async function encryptExport(
      data: SCExportFormat,
      password: string
  ): Promise<Uint8Array> {
      // Use PBKDF2 to derive key from password
      // Encrypt with XChaCha20-Poly1305
      // Include salt and nonce in output
  }
  
  export async function decryptExport(
      encrypted: Uint8Array,
      password: string
  ): Promise<SCExportFormat> {
      // Verify integrity
      // Decrypt
      // Validate schema
  }
  ```
  **Acceptance:** Export can be password-protected

- [ ] **Task 1.5.3:** Implement validator
  ```typescript
  export function validateExport(data: unknown): data is SCExportFormat {
      // Check version
      // Validate structure
      // Check required fields
      // Verify checksums if present
  }
  ```
  **Acceptance:** Invalid imports rejected gracefully

- [ ] **Task 1.5.4:** Add merge strategies
  ```typescript
  export enum MergeStrategy {
      OVERWRITE = 'overwrite', // Replace existing
      MERGE = 'merge',         // Combine, latest wins
      SKIP = 'skip'            // Keep existing, ignore duplicates
  }
  ```
  **Acceptance:** Users can choose how to handle conflicts

- [ ] **Task 1.5.5:** Document format in `/home/runner/work/SC/SC/docs/export-format.md`
  - Explain structure
  - Provide examples
  - Explain security (private keys encrypted)
  - Explain merge strategies
  **Acceptance:** Clear documentation for users/developers

- [ ] **Task 1.5.6:** Add tests
  - Round-trip export/import
  - Password encryption
  - Invalid data rejection
  - Merge strategies
  **Acceptance:** All test cases pass

**Sovereignty Impact:**
✅ Users can move data between devices  
✅ Data portable across platforms (Web ↔ Android ↔ iOS)  
✅ Private keys encrypted in export  
✅ No vendor lock-in  

---

## PHASE 2: POLISH & PRODUCTION READINESS

### Issue 2.1: Complete Web UI Features

**Priority:** P1  
**Category:** Web Application  
**Labels:** `web`, `ui`, `ux`

**Remaining Tasks from PROGRESS.md (9/31 complete):**

- [ ] **Task 2.1.1:** Implement notification system (Task 125)
  - File: `/home/runner/work/SC/SC/web/src/components/NotificationManager.tsx` (NEW)
  - Browser notifications API
  - In-app toast notifications
  - Sound notifications
  **Acceptance:** Users notified of new messages

- [ ] **Task 2.1.2:** Add typing indicators (Task 126)
  - Send typing state to peers
  - Display "X is typing..." in chat
  **Acceptance:** Real-time typing feedback

- [ ] **Task 2.1.3:** Implement read receipts (Task 127)
  - Send read confirmations
  - Display checkmarks (✓ sent, ✓✓ delivered, ✓✓ blue read)
  **Acceptance:** Message status visible

- [ ] **Task 2.1.4:** Add file upload UI (Task 128)
  - Drag & drop files
  - File preview
  - Upload progress
  **Acceptance:** Users can send files

- [ ] **Task 2.1.5:** Implement voice message recording (Task 129)
  - Mic access
  - Record audio
  - Waveform visualization
  **Acceptance:** Voice messages work

- [ ] **Task 2.1.6:** Add emoji picker (Task 130)
  - Emoji picker component
  - Recent emojis
  **Acceptance:** Users can add emojis

- [ ] **Task 2.1.7:** Implement message search (Task 131)
  - Search bar
  - Full-text search in IndexedDB
  - Highlight results
  **Acceptance:** Users can search messages

- [ ] **Task 2.1.8:** Add user profile UI (Task 132)
  - Display name
  - Avatar
  - QR code for sharing
  - Fingerprint display
  **Acceptance:** User can view/edit profile

- [ ] **Task 2.1.9:** Implement settings panel (Task 133-135)
  - Notifications settings
  - Privacy settings (read receipts, typing indicators)
  - Network settings (enable WebRTC, BLE)
  - Theme settings
  - Data sovereignty controls (from Issue 1.2)
  **Acceptance:** All settings configurable

- [ ] **Task 2.1.10:** Add connection status details (Task 140)
  - Show connected peers
  - Connection quality indicators
  - Manual connect/disconnect
  **Acceptance:** Users can see network state

- [ ] **Task 2.1.11:** Implement contact management (Task 141-145)
  - Add contact via QR code
  - Add contact manually
  - View contact list
  - Block/unblock contacts
  - Delete contacts
  **Acceptance:** Full contact lifecycle

- [ ] **Task 2.1.12:** Add QR code scanner (Task 146)
  - Camera access
  - QR decode
  - Add contact from QR
  **Acceptance:** Users can scan QR to add contacts

- [ ] **Task 2.1.13:** Implement media viewer (Task 147)
  - Image lightbox
  - Video player
  - File download
  **Acceptance:** Media viewable in-app

- [ ] **Task 2.1.14:** Add conversation actions (Task 148-150)
  - Delete conversation
  - Archive conversation
  - Mute conversation
  **Acceptance:** Conversation management works

- [ ] **Task 2.1.15:** Implement PWA features (Task 151-152)
  - Service worker
  - Offline support
  - Install prompt
  **Acceptance:** App works offline, installable

**Priority Order:**
1. Settings panel with sovereignty controls (2.1.9)
2. Contact management (2.1.11)
3. Notifications (2.1.1)
4. File upload (2.1.4)
5. QR scanner (2.1.12)
6. PWA features (2.1.15)
7. Rest are polish

---

### Issue 2.2: Complete Android UI Features

**Priority:** P1  
**Category:** Android Application  
**Labels:** `android`, `ui`, `compose`

**Remaining Tasks (18/33 complete):**

- [ ] **Task 2.2.1:** Implement chat UI with message bubbles (Task 75-77)
  - File: `.../ui/chat/ChatScreen.kt`
  - Material 3 message bubbles
  - Sent vs received styling
  - Timestamp, status indicators
  **Acceptance:** Chat looks polished

- [ ] **Task 2.2.2:** Add message input with actions (Task 79-81)
  - Text input
  - Send button
  - Attach file button
  - Voice record button
  **Acceptance:** Users can compose messages

- [ ] **Task 2.2.3:** Implement file picker (Task 83)
  - Android SAF integration
  - File type filtering
  **Acceptance:** Users can attach files

- [ ] **Task 2.2.4:** Add voice recording (Task 84)
  - Microphone permission
  - Audio recording
  - Waveform animation
  **Acceptance:** Voice messages recordable

- [ ] **Task 2.2.5:** Implement image capture (Task 85)
  - Camera permission
  - Capture photo
  - Preview and send
  **Acceptance:** Users can take and send photos

- [ ] **Task 2.2.6:** Add contact picker (Task 86)
  - List contacts
  - Search/filter
  - Select to chat
  **Acceptance:** Users can start new chats

- [ ] **Task 2.2.7:** Implement QR scanner (Task 87)
  - Camera permission
  - ML Kit barcode scanning
  - Add contact from QR
  **Acceptance:** QR code scanning works

- [ ] **Task 2.2.8:** Add notifications (Task 63-65)
  - Foreground notifications
  - Message notifications
  - Notification actions (reply, mark read)
  **Acceptance:** Notifications work properly

- [ ] **Task 2.2.9:** Implement WebRTC integration (Task 66-67)
  - WebRTC Android SDK
  - Peer connections
  - Data channels
  **Acceptance:** WebRTC transport works

- [ ] **Task 2.2.10:** Add BLE mesh (Task 68-72)
  - BLE permissions
  - BLE scanning
  - BLE advertising
  - BLE connections
  - BLE data transfer
  **Acceptance:** BLE mesh functional

**Priority:**
1. Chat UI (2.2.1-2)
2. Notifications (2.2.8)
3. WebRTC (2.2.9)
4. File/voice (2.2.3-5)
5. BLE (2.2.10)
6. Polish (2.2.6-7)

---

### Issue 2.3: Implement Remaining Mesh Features

**Priority:** P1  
**Category:** Core Library  
**Labels:** `core`, `mesh`, `networking`

**Tasks:**

- [ ] **Task 2.3.1:** Complete bandwidth-aware scheduling (Task 22)
  - File: `/home/runner/work/SC/SC/core/src/mesh/scheduler.ts` (NEW)
  - Implement fair queuing
  - Rate limiting per peer
  - Priority enforcement
  **Acceptance:** Bandwidth distributed fairly

- [ ] **Task 2.3.2:** Implement mDNS/Bonjour discovery (Task 47-48)
  - File: `/home/runner/work/SC/SC/core/src/discovery/mdns.ts`
  - Service broadcasting
  - Service discovery
  - Works on local network
  **Acceptance:** Peers discover each other locally

- [ ] **Task 2.3.3:** Complete peer timeout logic (Task 18)
  - File: `/home/runner/work/SC/SC/core/src/mesh/health-monitor.ts`
  - Detect unresponsive peers
  - Remove from routing table
  - Optionally blacklist
  **Acceptance:** Dead peers removed automatically

- [ ] **Task 2.3.4:** Implement audio tone pairing (Task 51)
  - File: `/home/runner/work/SC/SC/core/src/audio-tone-pairing.ts`
  - DTMF encoding
  - DTMF decoding
  - Exchange peer info over audio
  **Acceptance:** Proximity pairing via audio works

- [ ] **Task 2.3.5:** Implement BLE proximity pairing (Task 52)
  - Mobile platforms only
  - Use RSSI for proximity detection
  **Acceptance:** BLE pairing works

---

### Issue 2.4: Testing & Quality Assurance

**Priority:** P0  
**Category:** Testing  
**Labels:** `testing`, `qa`, `integration`

**Tasks:**

- [ ] **Task 2.4.1:** Add integration tests (Task 252-253)
  - File: `/home/runner/work/SC/SC/tests/integration/` (NEW)
  - Two-peer messaging test
  - Multi-hop routing test
  - Peer discovery test
  **Acceptance:** Integration tests pass

- [ ] **Task 2.4.2:** Add E2E tests for web (Task 254)
  - Playwright tests
  - Full user workflows
  - Message send/receive
  - Contact management
  **Acceptance:** E2E tests cover main flows

- [ ] **Task 2.4.3:** Add E2E tests for mobile (Task 255-256)
  - Espresso tests (Android)
  - XCTest UI tests (iOS)
  **Acceptance:** Mobile E2E tests pass

- [ ] **Task 2.4.4:** Performance testing (Task 257)
  - Measure message latency
  - Measure throughput
  - Stress test with 100 peers
  - Memory profiling
  **Acceptance:** Meets performance targets

- [ ] **Task 2.4.5:** Security testing
  - Verify encryption
  - Test replay protection
  - Validate signatures
  - Penetration testing (if resources available)
  **Acceptance:** No security vulnerabilities

- [ ] **Task 2.4.6:** Usability testing
  - User testing sessions
  - Gather feedback
  - Fix UX issues
  **Acceptance:** Positive user feedback

---

### Issue 2.5: Documentation & User Onboarding

**Priority:** P1  
**Category:** Documentation  
**Labels:** `docs`, `ux`, `onboarding`

**Tasks:**

- [ ] **Task 2.5.1:** Create user guide (Task 262)
  - File: `/home/runner/work/SC/SC/docs/USER_GUIDE.md`
  - How to get started
  - How to add contacts
  - How to send messages
  - Privacy & security explanations
  - Data sovereignty explanation
  **Acceptance:** Comprehensive user guide

- [ ] **Task 2.5.2:** Create troubleshooting guide (Task 265)
  - File: `/home/runner/work/SC/SC/docs/TROUBLESHOOTING.md`
  - Common issues
  - How to reset
  - How to export data before reinstall
  **Acceptance:** Users can self-help

- [ ] **Task 2.5.3:** Add in-app onboarding flow
  - Web: First-time user tutorial
  - Mobile: Welcome screens
  - Explain sovereignty principles
  - Guide through first contact add
  **Acceptance:** New users understand the app

- [ ] **Task 2.5.4:** Create API documentation (Task 261)
  - File: `/home/runner/work/SC/SC/docs/API.md`
  - Core library API
  - Examples
  - Best practices
  **Acceptance:** Developers can use the library

- [ ] **Task 2.5.5:** Update README
  - Reflect V1 status
  - Add screenshots
  - Clear installation instructions
  **Acceptance:** README is compelling and clear

---

## PHASE 3: DEPLOYMENT & V1 LAUNCH

### Issue 3.1: Build & Release Pipeline

**Priority:** P0  
**Category:** Build & Release  
**Labels:** `ci-cd`, `deployment`, `devops`

**Tasks:**

- [ ] **Task 3.1.1:** Set up GitHub Actions CI (Task 268)
  - File: `.github/workflows/ci.yml` (NEW)
  - Run tests on every PR
  - Build core library
  - Build web app
  - Run linting
  **Acceptance:** CI passes on main branch

- [ ] **Task 3.1.2:** Add automated testing in CI (Task 269)
  - Unit tests
  - Integration tests
  - E2E tests (if not too slow)
  - Security scanning (CodeQL)
  **Acceptance:** Full test suite runs in CI

- [ ] **Task 3.1.3:** Web deployment pipeline (Task 270)
  - Build production bundle
  - Deploy to hosting (Netlify, Vercel, or self-hosted)
  - HTTPS enforced
  **Acceptance:** Web app auto-deploys on merge to main

- [ ] **Task 3.1.4:** Android release build (Task 271)
  - Signing configuration
  - Release build
  - Upload to Play Store (internal testing)
  **Acceptance:** APK/AAB generated and signed

- [ ] **Task 3.1.5:** iOS release build (Task 272)
  - Archive and export
  - Upload to TestFlight
  **Acceptance:** iOS build on TestFlight

- [ ] **Task 3.1.6:** Versioning strategy (Task 273)
  - Semantic versioning
  - Changelog automation
  - Git tags
  **Acceptance:** Clear version numbering

- [ ] **Task 3.1.7:** Release checklist (Task 274)
  - All tests passing
  - Documentation up to date
  - Known issues documented
  - Security audit complete
  **Acceptance:** Checklist defined and followed

---

### Issue 3.2: Security Audit & Hardening

**Priority:** P0  
**Category:** Security  
**Labels:** `security`, `audit`, `critical`

**Tasks:**

- [ ] **Task 3.2.1:** Internal security review
  - Review all crypto code
  - Check for hardcoded secrets
  - Verify signature validation
  - Check encryption is always on
  **Acceptance:** No obvious security issues

- [ ] **Task 3.2.2:** External security audit (if budget allows)
  - Hire security firm
  - Provide codebase
  - Remediate findings
  **Acceptance:** Audit report with fixes implemented

- [ ] **Task 3.2.3:** Dependency audit
  - Check all npm/gradle/cocoapods dependencies
  - Update to latest secure versions
  - Remove unused dependencies
  **Acceptance:** No known vulnerabilities in dependencies

- [ ] **Task 3.2.4:** Privacy policy
  - File: `/home/runner/work/SC/SC/docs/PRIVACY_POLICY.md`
  - Explain what data is collected (none on servers)
  - Explain local storage
  - Explain sovereignty model
  **Acceptance:** Clear privacy policy

- [ ] **Task 3.2.5:** Terms of service
  - File: `/home/runner/work/SC/SC/docs/TERMS_OF_SERVICE.md`
  - Define acceptable use
  - Liability disclaimers
  **Acceptance:** Legal terms documented

---

### Issue 3.3: Performance Optimization

**Priority:** P1  
**Category:** Performance  
**Labels:** `performance`, `optimization`

**Tasks:**

- [ ] **Task 3.3.1:** Web bundle size optimization
  - Code splitting
  - Tree shaking
  - Lazy loading components
  - Compress assets
  **Acceptance:** Bundle < 200KB gzipped

- [ ] **Task 3.3.2:** IndexedDB query optimization
  - Add missing indices
  - Batch operations
  - Pagination for large datasets
  **Acceptance:** Queries < 100ms

- [ ] **Task 3.3.3:** Mobile battery optimization
  - Reduce background activity
  - Efficient BLE scanning
  - Sleep when idle
  **Acceptance:** < 5% battery drain per hour

- [ ] **Task 3.3.4:** Memory optimization
  - Limit message cache size
  - Clean up old routes
  - Efficient image loading
  **Acceptance:** < 100MB memory usage

- [ ] **Task 3.3.5:** Network optimization
  - Message compression
  - Efficient routing
  - Connection pooling
  **Acceptance:** Low latency, high throughput

---

### Issue 3.4: App Store Preparation

**Priority:** P0  
**Category:** Deployment  
**Labels:** `android`, `ios`, `app-store`, `play-store`

**Tasks:**

- [ ] **Task 3.4.1:** Create app store assets
  - Screenshots (Android & iOS)
  - App icon (all sizes)
  - Feature graphic
  - Promotional video (optional)
  **Acceptance:** All assets created

- [ ] **Task 3.4.2:** Write app store descriptions
  - Short description
  - Full description
  - What's New
  - Highlight sovereignty/privacy
  **Acceptance:** Compelling descriptions

- [ ] **Task 3.4.3:** Android Play Store listing
  - Create listing
  - Upload APK/AAB
  - Internal testing
  - Closed beta
  - Open beta
  - Production release
  **Acceptance:** App on Play Store

- [ ] **Task 3.4.4:** iOS App Store listing
  - Create listing
  - Upload IPA
  - TestFlight beta
  - Submit for review
  - Release
  **Acceptance:** App on App Store

- [ ] **Task 3.4.5:** Monitor reviews and crashes
  - Set up crash reporting (privacy-respecting)
  - Monitor user reviews
  - Respond to feedback
  **Acceptance:** Monitoring in place

---

### Issue 3.5: Community & Support

**Priority:** P1  
**Category:** Community  
**Labels:** `community`, `support`, `docs`

**Tasks:**

- [ ] **Task 3.5.1:** Create support channels
  - GitHub Discussions
  - Discord/Matrix server (dogfooding!)
  - Email support
  **Acceptance:** Users can get help

- [ ] **Task 3.5.2:** Create FAQ
  - File: `/home/runner/work/SC/SC/docs/FAQ.md`
  - Common questions
  - Sovereignty explanations
  - Technical questions
  **Acceptance:** FAQ answers common questions

- [ ] **Task 3.5.3:** Contribution guidelines
  - File: `/home/runner/work/SC/SC/CONTRIBUTING.md`
  - How to contribute
  - Code style
  - PR process
  **Acceptance:** Clear contribution guidelines

- [ ] **Task 3.5.4:** Code of conduct
  - File: `/home/runner/work/SC/SC/CODE_OF_CONDUCT.md`
  - Community standards
  **Acceptance:** CoC in place

- [ ] **Task 3.5.5:** Roadmap communication
  - Public roadmap
  - Regular updates
  - Transparency
  **Acceptance:** Community knows what's next

---

## Summary of V1 Readiness

### Phase 1: Data Persistence & Core Stability (CRITICAL)
**Issues:**
1. Fix Core Library Build Errors (8 tasks)
2. Complete Web IndexedDB Data Persistence (13 tasks)
3. Complete Android Room Database Integration (14 tasks)
4. Complete iOS CoreData Integration (7 tasks)
5. Cross-Platform Data Export/Import Format (6 tasks)

**Total Tasks:** 48 tasks  
**Priority:** P0  
**Estimated Effort:** 2-3 weeks  

### Phase 2: Polish & Production Readiness
**Issues:**
1. Complete Web UI Features (15 tasks)
2. Complete Android UI Features (10 tasks)
3. Implement Remaining Mesh Features (5 tasks)
4. Testing & Quality Assurance (6 tasks)
5. Documentation & User Onboarding (5 tasks)

**Total Tasks:** 41 tasks  
**Priority:** P1  
**Estimated Effort:** 3-4 weeks  

### Phase 3: Deployment & V1 Launch
**Issues:**
1. Build & Release Pipeline (7 tasks)
2. Security Audit & Hardening (5 tasks)
3. Performance Optimization (5 tasks)
4. App Store Preparation (5 tasks)
5. Community & Support (5 tasks)

**Total Tasks:** 27 tasks  
**Priority:** P0-P1  
**Estimated Effort:** 2-3 weeks  

---

## GRAND TOTAL FOR V1 READINESS

**Total New Tasks:** 116 tasks  
**Total Time Estimate:** 7-10 weeks  
**Combined with Existing:** 130 (current) + 116 (new) = 246 tasks tracked  

---

## Sovereignty Principles Checklist

For each feature, verify:
- [ ] No data sent to central servers
- [ ] User can export all their data
- [ ] User can delete all their data
- [ ] User understands what's stored locally
- [ ] No telemetry without explicit opt-in
- [ ] Encryption always on
- [ ] Keys stored securely (never in plain text)
- [ ] No vendor lock-in

---

## Next Steps

1. **Review this document** and adjust priorities based on business needs
2. **Create GitHub issues** for each section (can be done manually or via script)
3. **Assign to milestones:** V1.0, V1.1, etc.
4. **Begin Phase 1** immediately (blocking issues)
5. **Parallelize where possible** (Web, Android, iOS teams can work independently)
6. **Weekly progress reviews** to track completion

---

*This document was generated based on comprehensive analysis of the Sovereign Communications codebase as of 2024-11-16. All file paths, code examples, and architecture decisions are derived from actual repository structure.*
