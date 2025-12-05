# Codebase Unification Plan: Using @sc/core Across All Platforms

## Executive Summary

**Status**: ❌ **NOT UNIFIED**
**Issue**: Android and iOS have completely separate, native implementations that do NOT use the shared `@sc/core` library
**Impact**: CRITICAL - No cross-platform communication, feature parity impossible, triple maintenance burden
**Effort**: 2-4 weeks full-time development
**Risk**: HIGH - Requires significant refactoring

## Current State (Verified)

### Web ✅
- **Uses**: @sc/core library (TypeScript)
- **Crypto**: Shared primitives from core
- **Networking**: Shared mesh/relay from core
- **Transport**: WebRTC via core

### Android ❌
- **Uses**: Native Kotlin implementation ONLY
- **Crypto**: Separate KeystoreManager implementation
- **Networking**: Separate MeshNetworkManager
- **Transport**: BLE + WebRTC (native Android libraries)
- **NO** @sc/core integration

### iOS ❌
- **Uses**: Native Swift implementation ONLY
- **Crypto**: Separate KeychainManager implementation
- **Networking**: Separate MeshNetworkManager
- **Transport**: BLE + WebRTC (native iOS frameworks)
- **NO** @sc/core integration

## The Problem

### Feature Disparity
```
Feature          | Web | Android | iOS
-----------------|-----|---------|-----
Gossip Protocol  | ✅  | ❌      | ❌
Flood Routing    | ✅  | Partial | Partial
Ed25519 Crypto   | ✅  | SHA-256 | Partial
Session Keys     | ✅  | ❌      | ❌
Proof-of-Work    | ✅  | ❌      | ❌
```

### Maintenance Burden
- **Bug fixes**: Must be implemented 3 times
- **Features**: Must be implemented 3 times  
- **Security patches**: Must be applied 3 times
- **Testing**: 3 separate test suites

### Communication Issues
- Platforms may have **incompatible** protocol implementations
- Version drift creates **interoperability problems**
- No guarantee messages work cross-platform

## Solution: JavaScript Engine Integration

### Approach 1: React Native (Recommended)

**Effort**: 3-4 weeks
**Risk**: Medium
**Benefits**: 
- Share ALL code across platforms
- Unified codebase
- React Native has mature BLE/WebRTC libraries

**Implementation**:
```bash
# Convert existing web app to React Native
npx react-native init SC --template react-native-template-typescript

# Use existing @sc/core library
npm install @sc/core

# Platform-specific bridges
# ios/SC/BLEBridge.swift
# android/app/src/main/java/BLEBridge.kt
```

**Libraries**:
- `react-native-webrtc` - WebRTC support
- `react-native-ble-plx` - BLE support
- `@react-native-async-storage/async-storage` - Storage
- `react-native-keychain` - Secure storage

**Pros**:
- ✅ 90% code sharing
- ✅ Hot reload for development
- ✅ Large ecosystem
- ✅ Proven at scale

**Cons**:
- ❌ Complete rewrite of Android/iOS UI
- ❌ Learning curve for React Native
- ❌ Larger app size

### Approach 2: Capacitor + Web (Faster)

**Effort**: 1-2 weeks
**Risk**: Low
**Benefits**:
- Use existing web app
- Minimal changes to codebase

**Implementation**:
```bash
# Add Capacitor to existing web app
cd web
npm install @capacitor/core @capacitor/cli
npx cap init

# Add platforms
npx cap add android
npx cap add ios

# Platform-specific plugins
npm install @capacitor-community/bluetooth-le
npm install @capacitor/network
npm install @capacitor/storage
```

**Pros**:
- ✅ Use existing web app
- ✅ Fast implementation
- ✅ Minimal code changes

**Cons**:
- ❌ Less native feel
- ❌ Performance not as good as native
- ❌ Still need native bridges for BLE

### Approach 3: JavaScriptCore/LiquidCore (Most Complex)

**Effort**: 4-6 weeks
**Risk**: High
**Benefits**:
- Keep existing native UI
- Share only core logic

**Implementation**:

#### iOS - JavaScriptCore

```swift
// ios/SC/CoreBridge.swift
import JavaScriptCore

class CoreBridge {
    private let context: JSContext
    private let coreBundle: String
    
    init() {
        // Load bundled @sc/core JavaScript
        let path = Bundle.main.path(forResource: "core", ofType: "js")!
        coreBundle = try! String(contentsOfFile: path)
        
        // Create JavaScript context
        context = JSContext()!
        
        // Inject native bindings
        context.setObject(BLEBridge.self, 
                         forKeyedSubscript: "NativeBLE" as NSString)
        context.setObject(CryptoBridge.self, 
                         forKeyedSubscript: "NativeCrypto" as NSString)
        
        // Execute core bundle
        context.evaluateScript(coreBundle)
    }
    
    func initializeMesh() -> Bool {
        let result = context.evaluateScript("""
            const mesh = new MeshNetwork({ transport: 'ble' });
            mesh.start();
        """)
        return result?.toBool() ?? false
    }
    
    func sendMessage(to: String, content: String) {
        context.evaluateScript("""
            mesh.sendMessage('\(to)', '\(content)');
        """)
    }
}
```

#### Android - LiquidCore

```kotlin
// android/app/src/main/kotlin/CoreBridge.kt
import org.liquidplayer.javascript.JSContext

class CoreBridge(private val context: Context) {
    private val jsContext: JSContext
    private val coreScript: String
    
    init() {
        // Load bundled @sc/core JavaScript
        coreScript = context.assets.open("core.js")
            .bufferedReader().use { it.readText() }
        
        // Create JavaScript context
        jsContext = JSContext()
        
        // Inject native bindings
        jsContext.property("NativeBLE", BLEBridge::class.java)
        jsContext.property("NativeCrypto", CryptoBridge::class.java)
        
        // Execute core bundle
        jsContext.evaluateScript(coreScript)
    }
    
    fun initializeMesh(): Boolean {
        val result = jsContext.evaluateScript("""
            const mesh = new MeshNetwork({ transport: 'ble' });
            mesh.start();
        """)
        return result.toBoolean()
    }
    
    fun sendMessage(to: String, content: String) {
        jsContext.evaluateScript("""
            mesh.sendMessage('$to', '$content');
        """)
    }
}
```

**Pros**:
- ✅ Keep existing native UI
- ✅ Share core logic only
- ✅ Native performance for UI

**Cons**:
- ❌ Complex bridging layer
- ❌ Data marshaling overhead
- ❌ Hard to debug
- ❌ Still maintain 2 UIs

## Recommended Approach

### Phase 1: Capacitor Migration (Weeks 1-2)

**Week 1: Setup**
1. Add Capacitor to web app
2. Test on Android with Capacitor
3. Test on iOS with Capacitor
4. Implement BLE plugin bridge

**Week 2: Integration**
1. Replace native BLE with Capacitor plugin
2. Replace native storage with Capacitor Storage
3. Test cross-platform messaging
4. Fix bugs and polish

### Phase 2: Feature Parity (Week 3)

1. Ensure gossip protocol works on all platforms
2. Verify encryption works cross-platform
3. Test WebRTC + BLE hybrid
4. Performance testing

### Phase 3: Production (Week 4)

1. Build production APK/IPA
2. Security audit
3. Performance tuning
4. Documentation

**Total Effort**: 4 weeks
**Cost**: 1 developer full-time
**Risk**: Low-Medium

## Implementation Steps

### Step 1: Build Core as Standalone JS Bundle

```bash
cd core
npm run build

# Output: dist/index.js (bundled for Node/Browser)
# Need to create standalone bundle for mobile
```

Create `core/rollup.mobile.config.js`:
```javascript
export default {
  input: 'dist/index.js',
  output: {
    file: 'dist/core.mobile.js',
    format: 'iife', // Immediately Invoked Function Expression
    name: 'SCCore',
    globals: {
      // Map external dependencies to global variables
      'crypto': 'crypto',
    }
  }
};
```

### Step 2: Create Native Bridge Interface

Define interface in `core/src/bridge/native.ts`:
```typescript
export interface NativeBridge {
  // BLE
  startBLEScanning(): Promise<void>;
  stopBLEScanning(): Promise<void>;
  connectToPeer(peerId: string): Promise<void>;
  sendBLEData(peerId: string, data: Uint8Array): Promise<void>;
  
  // Crypto
  generateSecureRandom(bytes: number): Promise<Uint8Array>;
  pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array>;
  
  // Storage
  secureStore(key: string, value: Uint8Array): Promise<void>;
  secureRetrieve(key: string): Promise<Uint8Array | null>;
}

// Global bridge (injected by native code)
declare global {
  var NativeBridge: NativeBridge;
}
```

### Step 3: Implement Platform Bridges

iOS:
```swift
// Implement NativeBridge protocol
class IOSBridge: NSObject {
    @objc func startBLEScanning(_ callback: JSValue) {
        BLEManager.shared.startScanning { devices in
            callback.call(withArguments: [devices])
        }
    }
    
    // ... implement other methods
}
```

Android:
```kotlin
class AndroidBridge(private val context: Context) {
    @JavascriptInterface
    fun startBLEScanning(callback: JSValue) {
        BLEManager.startScanning { devices ->
            callback.call(devices)
        }
    }
    
    // ... implement other methods
}
```

### Step 4: Integration Testing

Test matrix:
```
Platform A | Platform B | Test
-----------|------------|------
Web        | Web        | ✅
Web        | Android    | ✅
Web        | iOS        | ✅
Android    | Android    | ✅
Android    | iOS        | ✅
iOS        | iOS        | ✅
```

## Migration Path

### Current State
```
┌─────────┐  ┌──────────┐  ┌─────────┐
│   Web   │  │ Android  │  │   iOS   │
│ @sc/core│  │  Native  │  │ Native  │
└─────────┘  └──────────┘  └─────────┘
     ✅            ❌            ❌
```

### Target State
```
┌─────────────────────────────────────┐
│         @sc/core (Shared)           │
│  Crypto | Protocol | Mesh | Relay   │
└─────────────────────────────────────┘
      ↓           ↓           ↓
┌─────────┐  ┌──────────┐  ┌─────────┐
│   Web   │  │ Android  │  │   iOS   │
│ Browser │  │ Capacitor│  │Capacitor│
│  APIs   │  │ Bridge   │  │ Bridge  │
└─────────┘  └──────────┘  └─────────┘
```

## Estimated Timeline

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | Setup Capacitor, Create bridges | Working Capacitor app |
| 2 | Migrate features, Test cross-platform | All features working |
| 3 | Polish, Performance, Security | Production-ready code |
| 4 | Testing, Docs, Deployment | Released to stores |

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| BLE bridge issues | High | High | Prototype early, use proven libs |
| Performance degradation | Medium | Medium | Profile and optimize |
| App size increase | Low | Low | Code splitting, lazy loading |
| Breaking changes | Medium | High | Feature flags, gradual rollout |

## Success Criteria

- ✅ All platforms use @sc/core
- ✅ Feature parity across platforms
- ✅ Cross-platform messaging works
- ✅ No performance regression
- ✅ Single codebase for core logic
- ✅ Tests pass on all platforms

## Conclusion

**Recommendation**: Start with **Capacitor approach** for fastest time-to-market, then consider React Native for long-term maintainability if needed.

**Why Capacitor**:
1. Leverages existing web app
2. Lowest risk and effort (1-2 weeks)
3. Easiest to maintain
4. Good enough for MVP/V1.0

**Next Steps**:
1. Prototype Capacitor integration (2-3 days)
2. Test cross-platform messaging
3. If successful, proceed with full migration
4. If not, evaluate React Native

**Status**: 📋 **PLAN DOCUMENTED** - Awaiting implementation decision
