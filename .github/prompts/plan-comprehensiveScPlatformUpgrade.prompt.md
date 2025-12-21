Based on the comprehensive research, I'll now create a detailed master implementation plan.

## Plan: Comprehensive SC Platform Upgrade

This plan addresses all critical gaps identified in the TODO document: test coverage, JavaScript bridge security, missing build resources, transport layer issues, database migrations, security implementations, and performance concerns. The plan is ordered by priority with explicit file paths and changes required.

---

### Phase 1: Create Missing Build Resources (Day 1)

**1.1 Create nginx configuration**
- Create `/nginx/nginx.conf` with HTTPS config, proxy settings for web app (port 3000), and security headers (X-Content-Type-Options, X-Frame-Options, CSP)
- Create `/nginx/ssl/` directory (certificates will be environment-specific)

**1.2 Create monitoring infrastructure**
- Create `/monitoring/prometheus.yml` with scrape configs for web app metrics (port 3000/metrics), node exporter
- Create `/monitoring/grafana/dashboards/` with JSON dashboards for: mesh network health, DHT statistics, message throughput

**1.3 Update docker-compose.yml**
- Verify all volume mounts reference newly created files at [`docker-compose.yml`](docker-compose.yml) lines 1-50

---

### Phase 2: Fix Security Test Placeholders (Day 1-2)

**2.1 Implement vulnerability scanning tests**
- Edit [`tests/security/vulnerability-scanning.test.ts`](tests/security/vulnerability-scanning.test.ts) - Replace `expect(true).toBe(true)` with:
  - Test for XSS in message content rendering
  - Test for prototype pollution in JSON parsing
  - Test that crypto operations use constant-time comparisons
  - Import `@sc/core` crypto functions and test edge cases

**2.2 Implement input validation tests**
- Edit [`tests/security/input-validation.test.ts`](tests/security/input-validation.test.ts) - Replace placeholder with:
  - Test message size limits (max 1MB per [`core/src/protocol/message.ts`](core/src/protocol/message.ts) line 8)
  - Test invalid UTF-8 handling
  - Test oversized headers rejection
  - Test TTL boundary conditions (0, 255, negative)

**2.3 Implement rate limiting tests**
- Edit [`tests/security/rate-limiting.test.ts`](tests/security/rate-limiting.test.ts) - Replace placeholder with:
  - Test message flooding detection
  - Test peer connection rate limits
  - Test DHT query rate limiting

---

### Phase 3: Enable Skipped E2E Tests (Day 2-4)

**3.1 Fix messaging E2E tests**
- Edit [`tests/e2e/messaging.e2e.test.ts`](tests/e2e/messaging.e2e.test.ts):
  - Line 120: Remove `.skip` from group message test, implement using `MeshNetwork.sendGroupMessage()`
  - Line 128: Remove `.skip` from offline delivery test, ensure DHT store/retrieve works
  - Line 338: Remove `.skip` from file attachment test
  - Line 368-400: Remove `.skip` from security tests, implement proper assertions

**3.2 Fix diagnostics E2E tests**
- Edit [`tests/e2e/diagnostics.e2e.test.ts`](tests/e2e/diagnostics.e2e.test.ts):
  - Line 3: Remove `describe.skip`, fix peer statistics collection
  - Add mock peers using `MeshNetwork.addPeer()` before assertions

**3.3 Fix cross-platform E2E tests**
- Edit [`tests/e2e/cross-platform/web-to-web.e2e.test.ts`](tests/e2e/cross-platform/web-to-web.e2e.test.ts):
  - Line 224: Remove `describe.skip`, configure two separate Playwright browser contexts
  - Line 272: Implement actual WebRTC connection between contexts

**3.4 Enable mobile E2E tests (requires Appium setup)**
- Edit [`tests/e2e/mobile/android/web-to-android.e2e.test.ts`](tests/e2e/mobile/android/web-to-android.e2e.test.ts) - Line 9: Change `test.skip(!runMobileE2E)` to `test.skip(false)` after configuring Appium
- Edit [`tests/e2e/mobile/ios/web-to-ios.e2e.test.ts`](tests/e2e/mobile/ios/web-to-ios.e2e.test.ts) - Same pattern
- Configure [`appium.config.ts`](appium.config.ts) with actual device/emulator capabilities

---

### Phase 4: Configure Certificate Pinning (Day 3)

**4.1 iOS - Add actual certificate pins**
- Edit [`ios/SovereignCommunications/Security/CertificatePinningManager.swift`](ios/SovereignCommunications/Security/CertificatePinningManager.swift):
  - Line ~10: Populate `pinnedCertificates` dictionary with SHA-256 hashes:
    ```swift
    private let pinnedCertificates: [String: Set<String>] = [
        "api.sovereigncommunications.io": ["sha256/BASE64_HASH_HERE"],
        "stun.sovereigncommunications.io": ["sha256/BASE64_HASH_HERE"]
    ]
    ```
  - Generate pins using: `openssl x509 -in cert.pem -pubkey -noout | openssl rsa -pubin -outform DER | openssl dgst -sha256 -binary | base64`

**4.2 Android - Implement certificate pinning**
- Create new file `android/app/src/main/kotlin/.../security/CertificatePinningManager.kt`:
  - Use OkHttp's `CertificatePinner.Builder()`
  - Add pins for the same domains as iOS
  - Integrate with any network client in the app

---

### Phase 5: Add TURN Server Configuration (Day 3-4)

**5.1 Update WebRTC core configuration**
- Edit [`core/src/transport/webrtc.ts`](core/src/transport/webrtc.ts) line ~80-90:
  - Add TURN servers to `iceServers` array:
    ```typescript
    iceServers: iceServers || [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:turn.sovereigncommunications.io:3478", username: "sc", credential: "ENV_CREDENTIAL" },
      { urls: "turns:turn.sovereigncommunications.io:5349", username: "sc", credential: "ENV_CREDENTIAL" }
    ]
    ```
  - Make credentials configurable via environment/config

**5.2 Update Android WebRTC**
- Edit [`android/app/src/main/kotlin/.../webrtc/WebRTCManager.kt`](android/app/src/main/kotlin/com/sovereigncommunications/app/webrtc/WebRTCManager.kt):
  - Add same TURN servers to `PeerConnection.RTCConfiguration`

**5.3 Update iOS WebRTC**
- Edit [`ios/SovereignCommunications/Data/WebRTCManager.swift`](ios/SovereignCommunications/Data/WebRTCManager.swift):
  - Add TURN servers to `RTCConfiguration.iceServers`

---

### Phase 6: IndexedDB Migration Strategy (Day 4)

**6.1 Add versioned migrations to web database**
- Edit [`web/src/storage/database.ts`](web/src/storage/database.ts):
  - Add version tracking: `const DB_VERSION = 2;`
  - Implement `onupgradeneeded` handler:
    ```typescript
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      
      if (oldVersion < 1) {
        db.createObjectStore('messages', { keyPath: 'id' });
        db.createObjectStore('contacts', { keyPath: 'publicKey' });
      }
      if (oldVersion < 2) {
        const messageStore = transaction.objectStore('messages');
        messageStore.createIndex('timestamp', 'timestamp');
      }
    };
    ```
  - Add data migration for existing records if schema changes

---

### Phase 7: Enable Property-Based Crypto Tests (Day 5)

**7.1 Fix and enable crypto property tests**
- Locate crypto tests with `describe.skip` (search for `Property-Based` in test files)
- Edit the test file (likely `core/src/crypto/__tests__/crypto.test.ts` or similar):
  - Remove `describe.skip`
  - Ensure `fast-check` package is installed: `npm install -D fast-check`
  - Fix any failing property tests by ensuring crypto functions handle edge cases:
    - Empty inputs
    - Maximum-size inputs (1MB)
    - Invalid key sizes

---

### Phase 8: Implement Real Load Testing (Day 5-6)

**8.1 Update concurrent users test**
- Edit [`tests/load/concurrent-users.test.ts`](tests/load/concurrent-users.test.ts):
  - Replace in-memory-only test with actual WebRTC connections
  - Use multiple Node.js workers to simulate peers
  - Test with 100, 500, 1000 actual connections
  - Measure: connection time, message latency, memory usage

**8.2 Update database performance test**
- Edit [`tests/load/database-performance.test.ts`](tests/load/database-performance.test.ts):
  - Test IndexedDB with 10K, 50K, 100K messages
  - Test Room DB (Android) and Core Data (iOS) via integration tests
  - Measure: write throughput, read latency, query performance

---

### Phase 9: Evaluate Native Crypto (Day 6-7) - Architecture Decision

**9.1 Document current bridge security risks**
- Current flow in [`android/app/.../core/CoreBridge.kt`](android/app/src/main/kotlin/com/sovereigncommunications/app/core/CoreBridge.kt) passes private keys through JavaScript
- Create decision document comparing:
  - **Option A**: Keep JS bridge, add memory protections
  - **Option B**: Implement native Ed25519/X25519 using platform APIs
  - **Option C**: Hybrid - use native for key storage, JS for protocol logic

**9.2 If choosing Option B (Recommended for security)**
- Android: Use `java.security` + BouncyCastle for Ed25519
- iOS: Use `CryptoKit` (iOS 13+) for Ed25519
- Create native interfaces matching `@sc/core` crypto API
- This is a significant refactor - plan for 2-3 week sprint

---

### Phase 10: Add DHT Persistence (Day 7)

**10.1 Create file-based storage adapter**
- Edit or create `core/src/mesh/dht/storage.ts`:
  - Add `FileStorage` class implementing `StorageAdapter` interface
  - Use platform-specific file APIs (IndexedDB for web, AsyncStorage/MMKV for mobile)
  - Implement LRU eviction for bounded storage

**10.2 Update DHT initialization**
- Edit [`core/src/mesh/dht.ts`](core/src/mesh/dht.ts):
  - Accept `StorageAdapter` in constructor
  - Default to `FileStorage` instead of `MemoryStorage`

---

### Steps Summary

1. Create [`nginx/nginx.conf`], [`monitoring/prometheus.yml`], [`monitoring/grafana/dashboards/`] - missing Docker resources
2. Implement real tests in [`tests/security/*.test.ts`] - replace all placeholders
3. Remove `.skip` from tests in [`tests/e2e/messaging.e2e.test.ts`], [`tests/e2e/diagnostics.e2e.test.ts`], [`tests/e2e/cross-platform/*.test.ts`]
4. Configure certificate pins in [`ios/.../CertificatePinningManager.swift`] and create Android equivalent
5. Add TURN servers to [`core/src/transport/webrtc.ts`] line ~80
6. Add IndexedDB migrations to [`web/src/storage/database.ts`]

---

### Further Considerations

1. **Native Crypto Decision**: Should the team invest 2-3 weeks to replace JS bridges with native crypto implementations? This significantly improves security but requires substantial refactoring of Android `CoreBridge.kt` and iOS `JSBridge.swift`.

2. **TURN Server Infrastructure**: Who will host the TURN server? Options: Self-hosted (Coturn), Twilio, Xirsys. This affects credential management in the codebase.

3. **Mobile E2E Test Infrastructure**: Enabling mobile tests requires Appium + either real devices or emulator farm (BrowserStack, AWS Device Farm). What's the preferred approach?

4. **Monitoring Dashboard Specifics**: What metrics are highest priority for the Grafana dashboards - peer count, message throughput, DHT health, or error rates?

5. **Load Testing Environment**: Should load tests run in CI/CD pipelines or only locally? Consider resource usage and test duration.

