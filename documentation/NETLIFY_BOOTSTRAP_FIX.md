# Netlify Bootstrapping Fix Summary

## Overview

Fixed the Netlify bootstrapping feature for mesh network connections. The system now properly handles deep linking to the Android app and passes bootstrap parameters for mesh network initialization.

## Issues Fixed

### 1. **Inconsistent URL Format**

- **Problem**: Web app used hash fragments (`#join=code`) but Android expected query parameters (`?code=xxx`)
- **Solution**: Updated QRCodeShare.tsx to use query parameters: `/join?code=XXX&inviter=Name`

### 2. **Missing Netlify Redirects**

- **Problem**: No redirect rules for `/join` paths
- **Solution**: Added redirect rule in netlify.toml to serve join.html for `/join` requests

### 3. **No Android Detection**

- **Problem**: join.html didn't detect Android devices or offer native app deep linking
- **Solution**:
  - Added platform detection (Android/iOS/mobile)
  - Implemented deep link attempt before PWA installation
  - Updated button text for Android users
  - Added 2-second fallback to web install if app doesn't open

### 4. **Empty Bootstrap Peers**

- **Problem**: InviteManager.getBootstrapPeers() returned empty array
- **Solution**:
  - Added bootstrapPeers parameter to InviteManager constructor
  - Updated useInvite hook to accept and pass bootstrap peers
  - Modified App.tsx to pass discoveredPeers as bootstrap peers

### 5. **URL Parameter Handling**

- **Problem**: Web app only checked hash fragments for invite codes
- **Solution**: Updated usePendingInvite hook to check query parameters first, then fall back to hash and localStorage

## Files Modified

1. **netlify.toml**
   - Added `/join` redirect rule for deep linking support

2. **web/src/components/QRCodeShare.tsx**
   - Changed URL format from hash to query parameters
   - Added inviter name to URL

3. **web/public/join.html**
   - Added support for both query parameters and hash fragments
   - Implemented Android detection and deep linking
   - Added fallback flow for web app installation
   - Updated button text for Android users

4. **web/src/hooks/usePendingInvite.ts**
   - Added query parameter checking (new format)
   - Maintained backwards compatibility with hash fragments
   - Added support for pendingInviterName in localStorage

5. **web/src/hooks/useInvite.ts**
   - Added bootstrapPeers parameter
   - Passes bootstrap peers to InviteManager

6. **web/src/App.tsx**
   - Passes discoveredPeers to useInvite hook

7. **core/src/sharing/InviteManager.ts**
   - Added bootstrapPeers constructor parameter
   - Stores and returns bootstrap peers in invites

## How It Works Now

### Web to Android Flow:

1. User A creates an invite on web app
2. QRCodeShare generates URL: `https://sc.netlify.app/join?code=XXX&inviter=UserA`
3. User B scans QR code or clicks link on Android device
4. Netlify serves join.html
5. join.html detects Android and attempts deep link: `sc://join?code=XXX&inviter=UserA`
6. If Android app is installed, it opens with the invite code
7. If not installed, falls back to PWA installation after 2 seconds
8. Android MainActivity extracts `code` parameter from intent.data
9. MainScreen receives initialInviteCode and processes it

### Web to Web Flow:

1. User A creates an invite
2. URL generated with query parameters
3. User B clicks link
4. join.html extracts code and inviter from query params
5. Stores in localStorage
6. Redirects to main app with parameters
7. usePendingInvite hook picks up the code
8. App processes the invite

### Bootstrap Peers:

1. When creating an invite, the system includes discoveredPeers from the public room
2. New users receive this list of bootstrap peers
3. They can use these peers to initially connect to the mesh network
4. This enables faster mesh network bootstrapping without relying solely on the public room

## Testing Recommendations

1. **Test Android Deep Linking**:
   - Generate invite on web
   - Scan QR code with Android device that has app installed
   - Verify app opens with invite code

2. **Test Fallback Flow**:
   - Generate invite on web
   - Open link on Android device without app installed
   - Verify it attempts deep link then falls back to web install

3. **Test Backwards Compatibility**:
   - Test old hash-based URLs still work
   - Verify localStorage fallback works

4. **Test Bootstrap Peers**:
   - Join public room with multiple peers
   - Create invite
   - Verify invite includes bootstrap peers
   - Test new user can connect using bootstrap peers

## Manual Connect Button Fixes

The manual connect button functionality was also audited and fixed:

### Issue

- **Problem**: The `createManualConnection` and `acceptManualConnection` methods in `MeshNetwork` created WebRTC peers but failed to attach state change listeners.
- **Result**: Connections would establish at the WebRTC layer, but the `MeshNetwork` would never be notified. The peer would not be added to the routing table, and the app would not recognize the connection.

### Solution

- Updated `core/src/mesh/network.ts` to attach `onStateChange` listeners in both `createManualConnection` and `acceptManualConnection`.
- These listeners now correctly call `handlePeerConnected` when the connection is established, ensuring the peer is registered in the mesh network.

## Manual Connect Button

The manual connect button functionality is separate from the invite system and should work independently:

- Uses createManualOffer/acceptManualOffer/finalizeManualConnection
- Creates direct peer-to-peer connection via WebRTC
- Does not rely on Netlify redirects or deep linking
- Should be tested separately to ensure it works end-to-end
