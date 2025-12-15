# Unification & 1M+ Scale Taxonomy

**Goal:** Transform the fragmented prototype into a unified, scalable platform capable of supporting 1,000,000+ Active Users (AU).

## ⚠️ The "Three-Head Problem" (Current State)

Currently, you are building **three separate applications** that look similar but speak different languages:

1.  **Web**: Speaks `Binary Protocol` (Official).
2.  **Android**: Speaks `String/Text Protocol` (Partial).
3.  **iOS**: Speaks `JSON Protocol` (Incompatible).

**Verdict:** This will **never** scale. You cannot debug a global mesh where 66% of nodes fundamentally misunderstand the packet format.

---

## 🏗️ Phase 1: Radical Unification (The Core Integration)

_Objective: Stop re-writing logic. Write once, run everywhere._

Instead of porting `@sc/core` to Kotlin/Swift, we must **embed** the verified JS Core into the mobile apps.

### Task 1.1: Mobile JS Environment Setup

- **Android**: Integrate **LiquidCore** or **JavaScriptCore (JSC)** to run `@sc/core` as a background service.
- **iOS**: Initialize **JavaScriptCore** context to host `@sc/core`.

### Task 1.2: The "Thin Client" Refactor

Refactor Android/iOS `MeshNetworkManager`:

- **Remove:** All routing logic, message parsing, and crypto logic from Kotlin/Swift.
- **Keep:** Only "Dumb Pipes" (BLE, WiFi, WebRTC connections).
- **New Flow:**
  1.  Native Transport receives bytes.
  2.  Native passes bytes directly to JS Core: `core.handlePacket(bytes)`.
  3.  JS Core processes (decrypts, routes, verifying signature).
  4.  JS Core emits event: `onMessage(json)` or `onRelay(bytes, peerId)`.
  5.  Native UI displays the result.

### Task 1.3: Binary Protocol Enforcement

- **Action**: Hard-deprecate JSON/String payloads on mobile. All messages must be strictly typed `UInt8Array` buffers conforming to the 109-byte header spec.

---

## 🚀 Phase 2: Architecture for 1 Million Users (Scale)

_Objective: Move from "Flood" to "Precision"._

Flood routing (gossiping every message to everyone) works for 500 users. It crashes the network at 10,000. For 1M, you need **O(log N)** efficiency.

### Task 2.1: Implement DHT (Distributed Hash Table)

- **Action**: Implement Kademlia logic in `@sc/core`.
- **Why**: To find "Peer A", I shouldn't ask _everyone_. I should ask the node `closer` to Peer A.
- **Scale**: Allows finding any user in ~20 hops, even for 1M nodes.

### Task 2.2: The Super-Node / Relay Layer

- **Action**: Define `Capability Flags` in the protocol.
- **Logic**:
  - **Mobile (Battery)**: "Leaf Node" (Only route for self or direct neighbors).
  - **Desktop/Web (Power)**: "Relay Node" (Store & Forward for offline peers).
  - **Server/Cloud (Optional)**: "Bootstrap Node" (Stable entry points).

### Task 2.3: Blob Storage (Sovereign Cloud)

- **Problem**: 1M users sending images will crush peer bandwidth.
- **Solution**: Implement **Content Addressable Storage (CAS)** (like IPFS basics).
  - Message contains: `ref: hash_of_image`.
  - Receiver requests `hash_of_image` from the DHT.

---

## 🔒- [x] Address Sovereignty Audit findings and remove centralized dependencies

1.  [x] Implement Kademlia DHT-based scalable routing
2.  [x] Implement multi-layered decentralized peer discovery
3.  **[Core]**: Implement `Kademlia` routing table structure (Task 2.1). (Completed)
4.  **[Core]**: Create large-scale network simulator and verify DHT routing (Task 2.4). (Completed)

## 🔄 Phase 2: Scale (The Mesh Logic)

### Task 2.1: Kademlia Implementation (Completed)

- Implement `RoutingTable` with K-Buckets. (Done)
- Implement recursive `findNode` and `findValue`. (Done)
- Ensure proper XOR distance metric. (Done)

### Task 2.2: Binary Protocol Enforcement (Completed)

- Remove all JSON-based messaging from Native. (Verified Bridge Logic)
- Ensure all packets use the 108-byte header structure. (Fixed signature overflow bug)
- **Protocol**: `core/src/protocol/message.ts` (Done)

### Task 2.3: Storage and Caching

- Implement `DHT.store` logic (store on K closest nodes). (Done)
- Implement efficient LRU cache for `MessageRelay` to prevent flooding loops. (Done in `relay.ts`)

### Task 2.4: Large Scale Simulation (Completed)

- Create `NetworkSimulator` to spin up 50-100 virtual nodes. (Done: 30-node test passed)
- Measure propagation latency and hop count. (Verified E2E)
- Ensure `findValue` works in O(log N) steps.

### Task 3.1: MDNS / Local Discovery (Completed)

- **Action**: Ensure every app broadcasts presence on local WiFi/LAN. This creates "Islands of Connectivity" that merge when users move. (Implemented in iOS and Android MeshNetworkManagers)

### Task 3.2: Mutable Device Reputation (Completed)

- **Action**: Implement a "Trust Score" in `@sc/core`. Nodes must autonomously ban peers who send malformed packets or excessive garbage. (Implemented in `routing.ts`)

---

## 📋 Recommended Immediate Sprint

1.  **[Android]**: Rip out `MeshNetworkManager.kt` routing logic. Replace with a J2V8/LiquidCore bridge to `@sc/core`. (Completed)
2.  **[iOS]**: - [ ] Audit `MeshNetworkManager.kt` for completion vs `MeshNetworkManager.swift`

- [ ] Verify `MeshGATTServer.kt` implementation
- [ ] Verify `MeshGATTClient.kt` implementation `Kademlia` routing table structure (Task 2.1). (Completed)

1.  **[Core]**: Implement `Kademlia` routing table structure (Task 2.1). (Completed)
