# Start of a Phenomenon: The 1M+ User Strategy

**Goal:** Beyond "scaling", this document outlines how **Sovereign Communications** becomes a self-sustaining global phenomenon that cannot be stopped, blocked, or censored.

## 1. The "Viral Engine" (Growth)

_How do we get from 0 to 1,000,000?_

### 1.1 The "Sneakernet" Installer

**Problem:** App Stores can ban you. Internet can be cut.
**Solution:** The app must be able to **install itself** onto other phones via local links.

- **Android:**
  - Implement "Share App" feature: Serves the APK file via a local HTTP server (`http://192.168.x.x:8080/sc.apk`) over WiFi Hotspot.
  - Receiver scans QR code -> Downloads APK directly -> Installs.
- **iOS:**
  - Harder due to walled garden. Focus on "Web App" (PWA) peer-to-peer sharing via AirDrop of the URL.

### 1.2 "Invite-to-Decrypt"

**Problem:** Empty networks are boring.
**Solution:**

- Users can create "Locked Groups". The _only_ way to get the decryption key is to physically scan the join QR code or receive a relevant Deep Link.
- **Fix Required**: The Android `InviteManager` currently uses **random bytes** for signatures. This MUST be replaced with real Ed25519 signatures (like the Web version) to prevent spoofing invites.

---

## 2. Censorship Resistance (Survival)

_How do we survive an adversarial environment?_

### 2.1 The "Update Virus"

**Problem:** You find a critical bug, but the App Store blocked updates.
**Solution:** The Mesh _is_ the App Store.

- **Mechanism**:
  1.  Publish signed update binary (APK) into the mesh as a blob.
  2.  Nodes gossip the "Update Manifest" (Version 1.2, Hash: XYZ, Signature: DevKey).
  3.  Nodes autonomously download the update from peers.
  4.  Android prompts user to "Install Update".

### 2.2 Domain Fronting / Rendezvous

**Problem:** The signaling server (Netlify) is blocked by ISP/State.
**Solution:**

- **Domain Fronting**: Tunnel initial handshake through CDN giants (Cloudflare, Fastly) which cannot be blocked without breaking the internet.
- **DHT Bootstrapping**: Once connected to _one_ peer, the DHT replaces the server. The server is only needed for the first 5 seconds of a user's life.

---

## 3. Phenomenon Engineering (Retention)

_How do we make the mesh usable at scale?_

### 3.1 CAS (Content Addressable Storage)

**Current State**: Sending a photo sends the full bytes to the recipient.
**Failure Mode**: A 10MB video sent to a group of 50 people = 500MB of mesh traffic. This kills the battery/network.
**Strategy**:

1.  Sender hashes file: `Hash(Video) = QmXH...`
2.  Sender stores video locally.
3.  Sender broadcasts _Reference_: "I have `QmXH...`".
4.  Recipients request chunk-by-chunk from _whoever has it nearest_ (BitTorrent style).

### 3.2 Immune System (Reputation)

**Current State**: `PeerSecurityAlerts.kt` exists but is isolated.
**Strategy**:

1.  **Global Blocklist**: If a node spams 1,000 messages/sec, neighbors sign a `SPAM_PROOF`.
2.  This proof propagates.
3.  Other nodes verify proof and disconnect/ban the spammer _before_ they even connect.

---

## 📋 Recommended "Phenomenon" Tasks

1.  **[Android]**: Implement `SneakernetInstaller` (Serve APK via WiFi Direct).
2.  **[Core]**: Implement `CAS` (Content Addressable Storage) logic for file handling.
3.  **[Protocol]**: Define `UpdateManifest` message type for self-updating.
4.  **[Security]**: Fix `InviteManager` on Android to use real Ed25519 signatures.
