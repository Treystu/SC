# MESH NETWORK INITIALIZATION DEBUG GUIDE

**Issue**: "❌ Mesh network not initialized" error appearing in DirectConnectionQR component

**Status**: Investigating root cause with comprehensive logging

---

## Debugging Steps

### 1. Check Browser Console
Open browser console (F12) and look for initialization logs:

```
Expected logs:
[useMeshNetwork] ========== MESH NETWORK INITIALIZATION START ==========
[useMeshNetwork] Step 1: Getting mesh network instance...
[MeshNetworkService] Starting mesh network initialization
[MeshNetworkService] Initializing database...
[MeshNetworkService] Database initialized successfully
[MeshNetworkService] Loading primary identity from DB...
[MeshNetworkService] Loaded persisted identity: <fingerprint> <id>
[MeshNetworkService] Identity ready: { peerId, fingerprint, pubKeyLen, privKeyLen }
[MeshNetworkService] Creating MeshNetwork instance...
[MeshNetworkService] MeshNetwork initialized
[MeshNetworkService] Initializing bootstrap...
[MeshNetworkService] Bootstrap initialized successfully
[useMeshNetwork] Step 2: Mesh network instance obtained: true
[useMeshNetwork] Step 3: Starting network...
[useMeshNetwork] Step 4: Network started successfully
[useMeshNetwork] Step 5: meshNetworkRef.current set: true
[useMeshNetwork] Step 6: Connection monitor created
[useMeshNetwork] Step 7: Setting status with localPeerId: <peerId>
[useMeshNetwork] ========== MESH NETWORK INITIALIZATION COMPLETE ==========
[useMeshNetwork] Final check - meshNetworkRef.current: true
[useMeshNetwork] Final check - localPeerId: <peerId>
```

### 2. Common Failure Scenarios

#### A. NO_IDENTITY Error
```
[useMeshNetwork] ========== MESH NETWORK INITIALIZATION FAILED ==========
[useMeshNetwork] Error message: NO_IDENTITY
[useMeshNetwork] No identity found - user needs to complete onboarding
```

**Solution**: User must complete onboarding flow to create identity

#### B. Database Initialization Timeout
```
[MeshNetworkService] Mesh network initialization timed out after 15000ms
```

**Solution**: Check IndexedDB is working, clear browser data if corrupted

#### C. Identity Corruption
```
[MeshNetworkService] Invalid stored identity key lengths, regenerating...
[MeshNetworkService] Failed to load identity (corruption/decryption error)
```

**Solution**: Clear IndexedDB and re-run onboarding

#### D. Network Start Failure
```
[useMeshNetwork] Step 3: Starting network...
[useMeshNetwork] ========== MESH NETWORK INITIALIZATION FAILED ==========
```

**Solution**: Check network.start() implementation for errors

---

## Current Investigation

### What We Know
1. User sees "❌ Mesh network not initialized" in DirectConnectionQR
2. Peer ID is displayed: "a7cfbf3cb63"
3. Error message suggests meshNetworkRef.current is null/undefined

### What We Need to Check
1. Does initialization complete successfully?
2. Is there a race condition between init and UI render?
3. Is meshNetworkRef.current being set correctly?
4. Is the error coming from generateConnectionOffer() call?

### Next Steps
1. ✅ Added comprehensive logging
2. ⏳ Check browser console for actual error
3. ⏳ Identify specific failure point
4. ⏳ Fix root cause
5. ⏳ Verify mesh network initializes perfectly

---

## How to Test

### Manual Testing
1. Open app in browser: http://localhost:3000
2. Complete onboarding if needed
3. Open browser console (F12)
4. Navigate to Direct Connection page
5. Check console logs for initialization sequence
6. Look for any errors or warnings

### Expected Behavior
- Mesh network initializes successfully
- Peer ID displays correctly
- QR code generates without errors
- No "Mesh network not initialized" errors

---

## Code Locations

### Initialization Flow
1. `web/src/hooks/useMeshNetwork.ts` - Main initialization hook
2. `web/src/services/mesh-network-service.ts` - Network service singleton
3. `web/src/services/bootstrap-service.ts` - Bootstrap integration
4. `core/src/mesh/network.ts` - MeshNetwork class

### Error Checking
1. `web/src/components/DirectConnectionQR.tsx` - Where error appears
2. `web/src/hooks/useMeshNetwork.ts:generateConnectionOffer` - Throws error if not initialized

---

## Resolution Plan

1. **Identify** - Use console logs to find exact failure point
2. **Diagnose** - Understand why initialization fails or appears to fail
3. **Fix** - Implement proper fix (not workaround)
4. **Test** - Verify mesh network initializes perfectly every time
5. **Validate** - Ensure all features work with initialized network

---

**Goal**: Mesh network must be PERFECT - initialization included.
