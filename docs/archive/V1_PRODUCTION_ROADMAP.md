# Sovereign Communications - V1 Production Roadmap
## Complete Context-Driven Implementation Plan

**Mission:** Achieve production-ready V1 rollout of a fully sovereign, serverless mesh networking platform  
**Core Principle:** User data sovereignty - local-only storage, user-controlled export/import, no central servers  
**Generated:** 2024-11-16  
**Status:** EXECUTION READY - Beginning systematic implementation

---

## 📊 CURRENT STATE ANALYSIS

### Repository Facts
- **Monorepo Structure:** npm workspaces (core, web, shared)
- **Current Progress:** 130/285 tasks (45.6%)
- **Test Status:** 91 tests passing (100%)
- **Security:** 0 CodeQL vulnerabilities
- **Build Status:** ❌ BROKEN - 37 TypeScript errors in core library

### What Works Today
✅ **Core Cryptography:** Ed25519, X25519, ChaCha20-Poly1305 (audited @noble libraries)  
✅ **Protocol:** 109-byte binary message format with signing  
✅ **Mesh Routing:** Flood routing, TTL, deduplication, priority queue  
✅ **WebRTC Transport:** Peer connections, data channels, NAT traversal  
✅ **File Transfer:** Chunking, progress tracking, integrity verification  
✅ **Peer Discovery:** QR codes, manual entry, peer introduction  
✅ **Web UI:** React 18, basic chat layout, dark theme  
✅ **Android Foundation:** Kotlin, Jetpack Compose, Room entities defined  
✅ **iOS Complete:** Swift, SwiftUI, CoreData, 100% complete per PROGRESS.md  

### Critical Gaps (Blocking V1)
❌ **Build:** Core library won't compile (missing types, dependencies)  
❌ **Persistence:** Schemas defined but not integrated with mesh network  
❌ **Sovereignty:** Export/import features missing  
❌ **UI:** Many features stubbed or incomplete  
❌ **Testing:** No E2E or integration tests  
❌ **Deployment:** No CI/CD pipeline  

---

## 🎯 V1 DEFINITION OF DONE

### Functional Requirements
1. ✅ **Messaging:** Send/receive encrypted text messages peer-to-peer
2. ✅ **File Sharing:** Transfer files with progress tracking
3. ✅ **Voice Messages:** Record and send voice messages
4. ✅ **Contact Management:** Add, verify, block, delete contacts
5. ✅ **Peer Discovery:** QR codes, manual entry, local network (mDNS)
6. ✅ **Multi-Platform:** Web (PWA), Android, iOS all functional
7. ✅ **Offline-First:** Works without internet, stores messages locally
8. ✅ **Data Sovereignty:** Export all data, import to new device, delete all data

### Technical Requirements
1. ✅ **Build:** All packages compile with 0 errors
2. ✅ **Tests:** Unit (>80% coverage), integration, E2E all passing
3. ✅ **Security:** 0 vulnerabilities, external audit complete
4. ✅ **Performance:** <100ms message latency, supports 100+ peers
5. ✅ **Persistence:** All data survives app restart
6. ✅ **Transport:** WebRTC + BLE mesh working
7. ✅ **UI/UX:** Polished, intuitive, accessible

### Launch Requirements
1. ✅ **Web:** Deployed with HTTPS, PWA installable
2. ✅ **Android:** Live on Google Play Store
3. ✅ **iOS:** Live on Apple App Store
4. ✅ **Docs:** User guide, API docs, privacy policy, terms
5. ✅ **Support:** Help channels, FAQ, community space

---

## 📋 COMPLETE V1 TASK BREAKDOWN (155 Tasks)

### PHASE 1: FOUNDATION - MAKE IT WORK (48 tasks, ~3 weeks)

#### 1.1 Core Library Build Fixes (8 tasks) [P0 - BLOCKING]
**Goal:** Get core library compiling with 0 errors

- [ ] **1.1.1** Install missing npm dependencies
  - **Action:** `cd core && npm install @types/node @noble/curves @noble/ciphers @noble/hashes`
  - **Files:** `/core/package.json`
  - **Acceptance:** Dependencies in package.json, no install errors

- [ ] **1.1.2** Update TypeScript configuration
  - **Action:** Edit `/core/tsconfig.json`
  - **Changes:**
    ```json
    {
      "compilerOptions": {
        "types": ["node"],
        "moduleResolution": "node",
        "lib": ["ES2020"],
        "esModuleInterop": true,
        "allowSyntheticDefaultImports": true
      }
    }
    ```
  - **Acceptance:** tsconfig properly configured

- [ ] **1.1.3** Fix crypto primitives imports
  - **File:** `/core/src/crypto/primitives.ts`
  - **Action:** Verify all @noble imports are correct:
    ```typescript
    import { ed25519 } from '@noble/curves/ed25519';
    import { x25519 } from '@noble/curves/ed25519';
    import { sha256 } from '@noble/hashes/sha256';
    import { bytesToHex } from '@noble/hashes/utils';
    import { xchacha20poly1305 } from '@noble/ciphers/chacha';
    import { hkdf } from '@noble/hashes/hkdf';
    ```
  - **Acceptance:** All imports resolve, no module errors

- [ ] **1.1.4** Fix Array.map type inference issues
  - **Files:** `/core/src/crypto/primitives.ts:426`, `/core/src/protocol/message.ts:298`
  - **Action:** Change `Array.from(bytes).map((b: number) => ...)` to `Array.from(bytes).map((b) => ...)`
  - **Reason:** TypeScript can infer type from Uint8Array
  - **Acceptance:** No type errors on map functions

- [ ] **1.1.5** Fix NodeJS namespace references
  - **Files:** Multiple discovery and transport files
  - **Action:** Replace `NodeJS.Timeout` with `ReturnType<typeof setTimeout>`
  - **Or:** Ensure @types/node is properly installed and recognized
  - **Acceptance:** No NodeJS namespace errors

- [ ] **1.1.6** Fix process/require/module Node.js globals
  - **Files:** `config-manager.ts`, `logger.ts`, `crypto/benchmarks.ts`
  - **Action:** Add environment guards:
    ```typescript
    const env = typeof process !== 'undefined' ? process.env : {};
    const isDev = env.NODE_ENV === 'development';
    ```
  - **Acceptance:** Code works in both Node and browser environments

- [ ] **1.1.7** Run build and verify success
  - **Command:** `cd /home/runner/work/SC/SC/core && npm run build`
  - **Expected:** Build completes with 0 errors, `/core/dist/` populated
  - **Acceptance:** `dist/index.js` and `dist/index.d.ts` exist

- [ ] **1.1.8** Run tests and verify all pass
  - **Command:** `npm test`
  - **Expected:** All 91 tests pass
  - **Acceptance:** Test output shows "Tests: 91 passed, 91 total"

---

#### 1.2 Web IndexedDB Persistence Integration (13 tasks) [P0]
**Goal:** All web data persists across page reloads, export/import works

- [ ] **1.2.1** Extend IndexedDB schema
  - **File:** `/core/src/db-schema.ts`
  - **Action:** Add interfaces:
    ```typescript
    export interface Identity {
      id: string;
      publicKey: Uint8Array;
      privateKey: Uint8Array; // Will be encrypted
      fingerprint: string;
      createdAt: number;
      label?: string;
      isPrimary: boolean;
    }
    
    export interface PersistedPeer {
      id: string;
      publicKey: string;
      transportType: 'webrtc' | 'ble' | 'wifi';
      lastSeen: number;
      connectedAt: number;
      connectionQuality: number;
      bytesSent: number;
      bytesReceived: number;
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
      metrics?: {
        latency: number;
        successRate: number;
      };
    }
    
    export interface SessionKey {
      peerId: string;
      key: Uint8Array; // Encrypted
      nonce: Uint8Array;
      createdAt: number;
      messageCount: number;
      expiresAt: number;
    }
    ```
  - **Acceptance:** TypeScript interfaces compile, exported from module

- [ ] **1.2.2** Create IndexedDB object stores
  - **File:** `/web/src/storage/database.ts`
  - **Action:** In `DatabaseManager.init()`, add to `onupgradeneeded`:
    ```typescript
    // Increment version
    private version = 2;
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Identities store
      if (!db.objectStoreNames.contains('identities')) {
        const identityStore = db.createObjectStore('identities', { keyPath: 'id' });
        identityStore.createIndex('publicKey', 'publicKey', { unique: true });
        identityStore.createIndex('fingerprint', 'fingerprint', { unique: true });
        identityStore.createIndex('isPrimary', 'isPrimary', { unique: false });
      }
      
      // Peers store
      if (!db.objectStoreNames.contains('peers')) {
        const peerStore = db.createObjectStore('peers', { keyPath: 'id' });
        peerStore.createIndex('publicKey', 'publicKey', { unique: true });
        peerStore.createIndex('lastSeen', 'lastSeen', { unique: false });
        peerStore.createIndex('isBlacklisted', 'isBlacklisted', { unique: false });
        peerStore.createIndex('transportType', 'transportType', { unique: false });
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
    };
    ```
  - **Test:** Open app in Chrome DevTools → Application → IndexedDB → sovereign-communications
  - **Acceptance:** All 7 stores present (messages, contacts, conversations, identities, peers, routes, sessionKeys)

- [ ] **1.2.3** Implement identity CRUD operations
  - **File:** `/web/src/storage/database.ts`
  - **Action:** Add methods to DatabaseManager class:
    ```typescript
    // ===== IDENTITY OPERATIONS =====
    
    async saveIdentity(identity: Identity): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['identities'], 'readwrite');
        const store = transaction.objectStore('identities');
        const request = store.put(identity);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    async getIdentity(id: string): Promise<Identity | null> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['identities'], 'readonly');
        const store = transaction.objectStore('identities');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }
    
    async getPrimaryIdentity(): Promise<Identity | null> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['identities'], 'readonly');
        const store = transaction.objectStore('identities');
        const index = store.index('isPrimary');
        const request = index.get(true);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }
    
    async getAllIdentities(): Promise<Identity[]> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['identities'], 'readonly');
        const store = transaction.objectStore('identities');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    async deleteIdentity(id: string): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['identities'], 'readwrite');
        const store = transaction.objectStore('identities');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    ```
  - **Acceptance:** Can create, read, update, delete identities

- [ ] **1.2.4** Implement peer persistence operations
  - **Action:** Add to DatabaseManager:
    ```typescript
    // ===== PEER OPERATIONS =====
    
    async savePeer(peer: PersistedPeer): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['peers'], 'readwrite');
        const store = transaction.objectStore('peers');
        const request = store.put(peer);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    async getPeer(id: string): Promise<PersistedPeer | null> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['peers'], 'readonly');
        const store = transaction.objectStore('peers');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }
    
    async getAllPeers(): Promise<PersistedPeer[]> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['peers'], 'readonly');
        const store = transaction.objectStore('peers');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    async getActivePeers(maxAgeMs: number = 300000): Promise<PersistedPeer[]> {
      // Get peers seen in last 5 minutes (default)
      const cutoff = Date.now() - maxAgeMs;
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['peers'], 'readonly');
        const store = transaction.objectStore('peers');
        const index = store.index('lastSeen');
        const range = IDBKeyRange.lowerBound(cutoff);
        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    async updatePeerReputation(id: string, reputation: number): Promise<void> {
      const peer = await this.getPeer(id);
      if (peer) {
        peer.reputation = reputation;
        await this.savePeer(peer);
      }
    }
    
    async blacklistPeer(id: string, durationMs: number): Promise<void> {
      const peer = await this.getPeer(id);
      if (peer) {
        peer.isBlacklisted = true;
        peer.blacklistedUntil = Date.now() + durationMs;
        await this.savePeer(peer);
      }
    }
    
    async deletePeer(id: string): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['peers'], 'readwrite');
        const store = transaction.objectStore('peers');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    ```
  - **Acceptance:** Full peer lifecycle management works

- [ ] **1.2.5** Implement routing table persistence
  - **Action:** Add route operations:
    ```typescript
    // ===== ROUTE OPERATIONS =====
    
    async saveRoute(route: Route): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['routes'], 'readwrite');
        const store = transaction.objectStore('routes');
        const request = store.put(route);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    async getRoute(destinationId: string): Promise<Route | null> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['routes'], 'readonly');
        const store = transaction.objectStore('routes');
        const request = store.get(destinationId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }
    
    async getAllRoutes(): Promise<Route[]> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['routes'], 'readonly');
        const store = transaction.objectStore('routes');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    async deleteExpiredRoutes(): Promise<void> {
      const routes = await this.getAllRoutes();
      const now = Date.now();
      const expired = routes.filter(r => r.lastUpdated + (r.ttl * 1000) < now);
      
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['routes'], 'readwrite');
        const store = transaction.objectStore('routes');
        
        expired.forEach(route => {
          store.delete(route.destinationId);
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }
    
    async clearRoutes(): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['routes'], 'readwrite');
        const store = transaction.objectStore('routes');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    ```
  - **Acceptance:** Routes persist and can be queried/expired

- [ ] **1.2.6** Implement session key persistence
  - **Action:** Add session key operations:
    ```typescript
    // ===== SESSION KEY OPERATIONS =====
    
    async saveSessionKey(sessionKey: SessionKey): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['sessionKeys'], 'readwrite');
        const store = transaction.objectStore('sessionKeys');
        const request = store.put(sessionKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    async getSessionKey(peerId: string): Promise<SessionKey | null> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['sessionKeys'], 'readonly');
        const store = transaction.objectStore('sessionKeys');
        const request = store.get(peerId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }
    
    async deleteSessionKey(peerId: string): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['sessionKeys'], 'readwrite');
        const store = transaction.objectStore('sessionKeys');
        const request = store.delete(peerId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    async deleteExpiredSessionKeys(): Promise<void> {
      const now = Date.now();
      if (!this.db) await this.init();
      
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['sessionKeys'], 'readwrite');
        const store = transaction.objectStore('sessionKeys');
        const index = store.index('expiresAt');
        const range = IDBKeyRange.upperBound(now);
        const request = index.openCursor(range);
        
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    }
    ```
  - **Acceptance:** Session keys persist with expiration

- [ ] **1.2.7** Implement data export (sovereignty)
  - **Action:** Add export method:
    ```typescript
    async exportAllData(): Promise<Blob> {
      if (!this.db) await this.init();
      
      const exportData = {
        version: 1,
        exportedAt: Date.now(),
        exportedBy: 'Sovereign Communications Web',
        
        identities: await this.getAllIdentities(),
        contacts: await this.getContacts(),
        conversations: await this.getConversations(),
        messages: await this.getAllMessages(),
        peers: await this.getAllPeers(),
        routes: await this.getAllRoutes(),
        // Don't export session keys - they're ephemeral
      };
      
      const json = JSON.stringify(exportData, null, 2);
      return new Blob([json], { type: 'application/json' });
    }
    
    private async getAllMessages(): Promise<StoredMessage[]> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['messages'], 'readonly');
        const store = transaction.objectStore('messages');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    ```
  - **Acceptance:** Export produces downloadable JSON with all data

- [ ] **1.2.8** Implement data import
  - **Action:** Add import method:
    ```typescript
    async importData(
      jsonData: string,
      mergeStrategy: 'overwrite' | 'merge' | 'skip' = 'merge'
    ): Promise<{ imported: number; skipped: number; errors: string[] }> {
      const result = { imported: 0, skipped: 0, errors: [] as string[] };
      
      try {
        const data = JSON.parse(jsonData);
        
        // Validate version
        if (data.version !== 1) {
          throw new Error(`Unsupported export version: ${data.version}`);
        }
        
        // Import identities
        for (const identity of data.identities || []) {
          try {
            const existing = await this.getIdentity(identity.id);
            if (existing && mergeStrategy === 'skip') {
              result.skipped++;
              continue;
            }
            await this.saveIdentity(identity);
            result.imported++;
          } catch (err) {
            result.errors.push(`Identity ${identity.id}: ${err.message}`);
          }
        }
        
        // Import contacts
        for (const contact of data.contacts || []) {
          try {
            await this.saveContact(contact);
            result.imported++;
          } catch (err) {
            result.errors.push(`Contact ${contact.id}: ${err.message}`);
          }
        }
        
        // Import conversations
        for (const conversation of data.conversations || []) {
          try {
            await this.saveConversation(conversation);
            result.imported++;
          } catch (err) {
            result.errors.push(`Conversation ${conversation.id}: ${err.message}`);
          }
        }
        
        // Import messages
        for (const message of data.messages || []) {
          try {
            await this.saveMessage(message);
            result.imported++;
          } catch (err) {
            result.errors.push(`Message ${message.id}: ${err.message}`);
          }
        }
        
        // Import peers (optional)
        if (data.peers) {
          for (const peer of data.peers) {
            try {
              await this.savePeer(peer);
              result.imported++;
            } catch (err) {
              result.errors.push(`Peer ${peer.id}: ${err.message}`);
            }
          }
        }
        
        // Import routes (optional)
        if (data.routes) {
          for (const route of data.routes) {
            try {
              await this.saveRoute(route);
              result.imported++;
            } catch (err) {
              result.errors.push(`Route ${route.destinationId}: ${err.message}`);
            }
          }
        }
        
      } catch (err) {
        result.errors.push(`Import failed: ${err.message}`);
      }
      
      return result;
    }
    ```
  - **Acceptance:** Import works with conflict resolution

- [ ] **1.2.9** Implement secure data deletion
  - **Action:** Add delete method:
    ```typescript
    async deleteAllData(confirmationToken: string): Promise<void> {
      // Require exact phrase for safety
      if (confirmationToken !== 'DELETE ALL MY DATA') {
        throw new Error('Invalid confirmation token. You must type exactly: DELETE ALL MY DATA');
      }
      
      if (!this.db) await this.init();
      
      const stores = ['identities', 'contacts', 'conversations', 'messages', 'peers', 'routes', 'sessionKeys'];
      
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(stores, 'readwrite');
        
        stores.forEach(storeName => {
          const store = transaction.objectStore(storeName);
          store.clear();
        });
        
        transaction.oncomplete = () => {
          console.log('All data deleted - sovereignty in action!');
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
    }
    ```
  - **Acceptance:** Can delete all data with confirmation

- [ ] **1.2.10** Integrate with mesh network initialization
  - **File:** `/web/src/hooks/useMeshNetwork.ts`
  - **Action:** Update hook to load from IndexedDB:
    ```typescript
    import { getDatabase } from '../storage/database';
    
    export function useMeshNetwork() {
      const [identity, setIdentity] = useState<Identity | null>(null);
      const [peers, setPeers] = useState<Peer[]>([]);
      const [isInitialized, setIsInitialized] = useState(false);
      
      useEffect(() => {
        async function initMesh() {
          const db = getDatabase();
          await db.init();
          
          // Load or create identity
          let primaryIdentity = await db.getPrimaryIdentity();
          if (!primaryIdentity) {
            // Generate new identity
            const keypair = generateIdentity();
            primaryIdentity = {
              id: bytesToHex(keypair.publicKey).substring(0, 16),
              publicKey: keypair.publicKey,
              privateKey: keypair.privateKey,
              fingerprint: await generateFingerprint(keypair.publicKey),
              createdAt: Date.now(),
              isPrimary: true
            };
            await db.saveIdentity(primaryIdentity);
          }
          setIdentity(primaryIdentity);
          
          // Load known peers
          const activePeers = await db.getActivePeers();
          // Convert to Peer objects and add to routing table
          activePeers.forEach(persistedPeer => {
            const peer: Peer = {
              id: persistedPeer.id,
              publicKey: new Uint8Array(Buffer.from(persistedPeer.publicKey, 'hex')),
              lastSeen: persistedPeer.lastSeen,
              connectedAt: persistedPeer.connectedAt,
              transportType: persistedPeer.transportType,
              connectionQuality: persistedPeer.connectionQuality,
              bytesSent: persistedPeer.bytesSent,
              bytesReceived: persistedPeer.bytesReceived,
            };
            routingTable.addPeer(peer);
          });
          setPeers(routingTable.getAllPeers());
          
          // Load routes
          const routes = await db.getAllRoutes();
          // Populate routing table with persisted routes
          
          // Clean up expired data
          await db.deleteExpiredRoutes();
          await db.deleteExpiredSessionKeys();
          
          setIsInitialized(true);
        }
        
        initMesh();
      }, []);
      
      return { identity, peers, isInitialized };
    }
    ```
  - **Acceptance:** Mesh network hydrates from IndexedDB on startup

- [ ] **1.2.11** Persist messages on send/receive
  - **File:** `/web/src/hooks/useMeshNetwork.ts`
  - **Action:** Add persistence to message handlers:
    ```typescript
    const sendMessage = useCallback(async (content: string, recipientId: string) => {
      const db = getDatabase();
      
      // Create message
      const message: StoredMessage = {
        id: generateMessageId(),
        conversationId: getOrCreateConversationId(recipientId),
        content,
        timestamp: Date.now(),
        senderId: identity!.id,
        recipientId,
        type: 'text',
        status: 'pending'
      };
      
      // Persist immediately (local echo)
      await db.saveMessage(message);
      
      // Update conversation
      const conversation = await db.getConversation(message.conversationId);
      if (conversation) {
        conversation.lastMessageId = message.id;
        conversation.lastMessageTimestamp = message.timestamp;
        await db.saveConversation(conversation);
      }
      
      // Send via mesh network
      await meshNetwork.send(message);
      
      // Update status when confirmed
      await db.updateMessageStatus(message.id, 'sent');
      
    }, [identity]);
    
    const onMessageReceived = useCallback(async (message: Message) => {
      const db = getDatabase();
      
      // Persist received message
      const storedMessage: StoredMessage = {
        id: message.id,
        conversationId: getOrCreateConversationId(message.senderId),
        content: message.payload,
        timestamp: message.header.timestamp,
        senderId: message.header.senderId,
        recipientId: identity!.id,
        type: 'text',
        status: 'delivered'
      };
      
      await db.saveMessage(storedMessage);
      
      // Update conversation
      let conversation = await db.getConversation(storedMessage.conversationId);
      if (!conversation) {
        conversation = {
          id: storedMessage.conversationId,
          contactId: message.senderId,
          lastMessageId: storedMessage.id,
          lastMessageTimestamp: storedMessage.timestamp,
          unreadCount: 1,
          createdAt: Date.now()
        };
      } else {
        conversation.lastMessageId = storedMessage.id;
        conversation.lastMessageTimestamp = storedMessage.timestamp;
        conversation.unreadCount++;
      }
      await db.saveConversation(conversation);
      
      // Trigger UI update
      setMessages(prev => [...prev, storedMessage]);
      
    }, [identity]);
    ```
  - **Acceptance:** Messages persist on send and receive

- [ ] **1.2.12** Create Settings UI with sovereignty controls
  - **File:** `/web/src/components/Settings.tsx` (NEW)
  - **Action:** Create React component:
    ```typescript
    import React, { useState, useEffect } from 'react';
    import { getDatabase } from '../storage/database';
    import './Settings.css';
    
    export function Settings() {
      const [storageSize, setStorageSize] = useState<number>(0);
      const [confirmDelete, setConfirmDelete] = useState('');
      const [exportStatus, setExportStatus] = useState('');
      const [importStatus, setImportStatus] = useState('');
      
      useEffect(() => {
        calculateStorageSize();
      }, []);
      
      async function calculateStorageSize() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          const sizeInMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
          setStorageSize(parseFloat(sizeInMB));
        }
      }
      
      async function handleExport() {
        try {
          setExportStatus('Exporting...');
          const db = getDatabase();
          const blob = await db.exportAllData();
          
          // Download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sc-export-${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setExportStatus('Export complete!');
          setTimeout(() => setExportStatus(''), 3000);
        } catch (err) {
          setExportStatus(`Error: ${err.message}`);
        }
      }
      
      async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
          setImportStatus('Importing...');
          const text = await file.text();
          const db = getDatabase();
          const result = await db.importData(text, 'merge');
          
          setImportStatus(
            `Imported ${result.imported} items, skipped ${result.skipped}. ` +
            (result.errors.length > 0 ? `Errors: ${result.errors.length}` : '')
          );
        } catch (err) {
          setImportStatus(`Error: ${err.message}`);
        }
      }
      
      async function handleDelete() {
        if (confirmDelete !== 'DELETE ALL MY DATA') {
          alert('Please type the exact phrase to confirm deletion.');
          return;
        }
        
        if (!confirm('This will permanently delete ALL your local data. This cannot be undone. Are you sure?')) {
          return;
        }
        
        try {
          const db = getDatabase();
          await db.deleteAllData(confirmDelete);
          alert('All data deleted. The page will now reload.');
          window.location.reload();
        } catch (err) {
          alert(`Error: ${err.message}`);
        }
      }
      
      return (
        <div className="settings">
          <h1>Settings</h1>
          
          <section className="sovereignty-section">
            <h2>Data Sovereignty</h2>
            <p className="sovereignty-info">
              Your data is stored <strong>only on this device</strong>. 
              No servers, no cloud, no tracking. You have complete control.
            </p>
            
            <div className="storage-info">
              <h3>Storage Usage</h3>
              <p>{storageSize} MB used on this device</p>
            </div>
            
            <div className="export-section">
              <h3>Export Your Data</h3>
              <p>Download all your data as a portable JSON file.</p>
              <button onClick={handleExport}>Export All Data</button>
              {exportStatus && <p className="status">{exportStatus}</p>}
            </div>
            
            <div className="import-section">
              <h3>Import Data</h3>
              <p>Restore data from a previous export.</p>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImport}
              />
              {importStatus && <p className="status">{importStatus}</p>}
            </div>
            
            <div className="delete-section danger-zone">
              <h3>Delete All Data</h3>
              <p className="warning">
                ⚠️ This will permanently delete ALL your local data. 
                There is no backup - your data exists only on this device.
              </p>
              <p>Type <code>DELETE ALL MY DATA</code> to confirm:</p>
              <input 
                type="text"
                value={confirmDelete}
                onChange={e => setConfirmDelete(e.target.value)}
                placeholder="DELETE ALL MY DATA"
              />
              <button 
                onClick={handleDelete}
                disabled={confirmDelete !== 'DELETE ALL MY DATA'}
                className="delete-button"
              >
                Delete Everything
              </button>
            </div>
          </section>
        </div>
      );
    }
    ```
  - **Acceptance:** Settings UI provides full data sovereignty controls

- [ ] **1.2.13** Add tests for persistence
  - **File:** `/web/src/storage/database.test.ts` (NEW)
  - **Action:** Create Jest tests:
    ```typescript
    import { DatabaseManager } from './database';
    
    describe('DatabaseManager', () => {
      let db: DatabaseManager;
      
      beforeEach(async () => {
        db = new DatabaseManager();
        await db.init();
      });
      
      afterEach(async () => {
        await db.clearAll();
        db.close();
      });
      
      describe('Identity persistence', () => {
        test('should save and retrieve identity', async () => {
          const identity = {
            id: 'test-id',
            publicKey: new Uint8Array(32),
            privateKey: new Uint8Array(64),
            fingerprint: 'test-fingerprint',
            createdAt: Date.now(),
            isPrimary: true
          };
          
          await db.saveIdentity(identity);
          const retrieved = await db.getIdentity('test-id');
          
          expect(retrieved).toEqual(identity);
        });
        
        test('should get primary identity', async () => {
          const identity = {
            id: 'primary',
            publicKey: new Uint8Array(32),
            privateKey: new Uint8Array(64),
            fingerprint: 'fingerprint',
            createdAt: Date.now(),
            isPrimary: true
          };
          
          await db.saveIdentity(identity);
          const primary = await db.getPrimaryIdentity();
          
          expect(primary?.id).toBe('primary');
        });
      });
      
      describe('Peer persistence', () => {
        test('should save and retrieve peer', async () => {
          const peer = {
            id: 'peer-1',
            publicKey: 'abc123',
            transportType: 'webrtc' as const,
            lastSeen: Date.now(),
            connectedAt: Date.now(),
            connectionQuality: 100,
            bytesSent: 0,
            bytesReceived: 0,
            reputation: 100,
            isBlacklisted: false
          };
          
          await db.savePeer(peer);
          const retrieved = await db.getPeer('peer-1');
          
          expect(retrieved).toEqual(peer);
        });
        
        test('should get only active peers', async () => {
          const oldPeer = {
            id: 'old-peer',
            publicKey: 'old',
            transportType: 'webrtc' as const,
            lastSeen: Date.now() - 600000, // 10 minutes ago
            connectedAt: Date.now() - 600000,
            connectionQuality: 0,
            bytesSent: 0,
            bytesReceived: 0,
            reputation: 0,
            isBlacklisted: false
          };
          
          const newPeer = {
            id: 'new-peer',
            publicKey: 'new',
            transportType: 'webrtc' as const,
            lastSeen: Date.now(),
            connectedAt: Date.now(),
            connectionQuality: 100,
            bytesSent: 0,
            bytesReceived: 0,
            reputation: 100,
            isBlacklisted: false
          };
          
          await db.savePeer(oldPeer);
          await db.savePeer(newPeer);
          
          const active = await db.getActivePeers(300000); // 5 min cutoff
          expect(active.length).toBe(1);
          expect(active[0].id).toBe('new-peer');
        });
        
        test('should blacklist peer', async () => {
          const peer = {
            id: 'bad-peer',
            publicKey: 'bad',
            transportType: 'webrtc' as const,
            lastSeen: Date.now(),
            connectedAt: Date.now(),
            connectionQuality: 0,
            bytesSent: 0,
            bytesReceived: 0,
            reputation: 0,
            isBlacklisted: false
          };
          
          await db.savePeer(peer);
          await db.blacklistPeer('bad-peer', 3600000); // 1 hour
          
          const blacklisted = await db.getPeer('bad-peer');
          expect(blacklisted?.isBlacklisted).toBe(true);
          expect(blacklisted?.blacklistedUntil).toBeGreaterThan(Date.now());
        });
      });
      
      describe('Export/Import', () => {
        test('should export and import data', async () => {
          // Create test data
          const identity = {
            id: 'test-id',
            publicKey: new Uint8Array(32),
            privateKey: new Uint8Array(64),
            fingerprint: 'fingerprint',
            createdAt: Date.now(),
            isPrimary: true
          };
          await db.saveIdentity(identity);
          
          const contact = {
            id: 'contact-1',
            publicKey: 'contact-key',
            displayName: 'Test Contact',
            lastSeen: Date.now(),
            createdAt: Date.now(),
            fingerprint: 'contact-fingerprint',
            verified: true,
            blocked: false,
            endpoints: []
          };
          await db.saveContact(contact);
          
          // Export
          const blob = await db.exportAllData();
          const text = await blob.text();
          
          // Clear database
          await db.clearAll();
          
          // Import
          const result = await db.importData(text, 'merge');
          
          expect(result.imported).toBeGreaterThan(0);
          expect(result.errors.length).toBe(0);
          
          // Verify data restored
          const restoredIdentity = await db.getIdentity('test-id');
          expect(restoredIdentity).toBeTruthy();
          
          const restoredContact = await db.getContact('contact-1');
          expect(restoredContact).toBeTruthy();
        });
      });
      
      describe('Delete all data', () => {
        test('should delete all data with confirmation', async () => {
          await db.saveIdentity({
            id: 'test',
            publicKey: new Uint8Array(32),
            privateKey: new Uint8Array(64),
            fingerprint: 'test',
            createdAt: Date.now(),
            isPrimary: true
          });
          
          await db.deleteAllData('DELETE ALL MY DATA');
          
          const identities = await db.getAllIdentities();
          expect(identities.length).toBe(0);
        });
        
        test('should reject invalid confirmation', async () => {
          await expect(
            db.deleteAllData('wrong phrase')
          ).rejects.toThrow('Invalid confirmation');
        });
      });
    });
    ```
  - **Run:** `cd web && npm test`
  - **Acceptance:** All tests pass, >80% coverage

---

#### [Continue with remaining sections...]

Due to length, I'll create a tracking document that we'll update as we complete tasks.

