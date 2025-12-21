Worldwide Decentralized Mesh Deployment Plan
Concept: A transport-agnostic, self-healing, global mesh network that connects humanity without central authority. The app treats every device as a sovereign node, capable of routing traffic, storing data, and bridging disconnected local meshes into a planetary network.

1. The Core Concept: "The Sovereign Bridge"
The fundamental architectural shift is to move from Connected Clients to Sovereign Bridges. Every phone, laptop, and server is a Bridge.

Key Pillars
Transport Agnosticism (The Universal Adapter)

The core logic never says "WebRTC" or "Bluetooth". It says 
send(peerId, data)
.
Pluggable Transports: The 
MeshNetwork
 manages a TransportRegistry.
Local: Bluetooth LE, WiFi Direct, mDNS, AWDL (Apple), Nearby Share.
Internet: WebRTC (p2p), WebSocket (relayed), QUIC.
Exotic: LoRa (long range), Audio (ultrasonic data), Satellite (Blockstream/Starlink).
Automatic Handover: Traffic flows like water. If WiFi drops, it flows to Bluetooth. If Bluetooth drops, it buffers for "Sneakernet" (carry-and-forward).
Global Bridging (The Infinite Mesh)

Local First, Global Second: The app prioritizes local, high-bandwidth peers (LAN/BLE).
The Bridge Protocol: Any node with Internet access and a Public IP (or UPnP) automatically becomes a Global Bridge.
DHT-Based Rendezvous: Use the Kademlia DHT not just for value storage, but for peer discovery.
Nodes announce themselves: STORE(hash(my_region), my_ip_or_signal_info).
Isolated meshes find bridges via this DHT lookup when Internet becomes available.
Sovereignty (Data Ownership)

Zero-Knowledge Storage: All data on the mesh is E2E encrypted.
Persistent DHT: Your "User Profile" lives in the DHT, replicated across your friends' devices. If you lose your phone, you recover your account from the mesh (Social Recovery).
2. Technical Gap Analysis (Current vs. Future)
Feature	Current State (@sc/core)	Required for Worldwide Scale
Transport	WebRTC + ad-hoc callbacks for "External"	TransportManager Interface: Generic API for generic plugins.
Routing	Tiered (Direct -> Kademlia -> Flood)	Geospatial & Latency Routing: Prioritize low-latency paths.
Discovery	Bootstrap List & mDNS	Global Rendezvous: DHT-based peer finding. PubSub: Topic-based discovery (e.g., #emergency-response).
DHT	In-Memory (wipes on restart)	Persistent Storage: LevelDB/SQLite backing. Replication: K=20 redundancy.
NAT	Basic STUN	Hole Punching & Relay: DCUTR (Direct Connection Upgrade) & Circuit Relay.
Identity	Simple Keypair	DID (Decentralized Identity): W3C standard compatible.
3. Execution Roadmap
Phase 1: The Iron Core (Hardening)
Goal: Make the current mesh rock-solid and persistent.

 Hardened DHT: Implement persistence for the 
DHT
 class. (SQLite/IndexedDB).
 Transport Interface: Create 
Transport
 interface and refactor PeerConnectionPool to be just one implementation of it.
 Packet Reliability: Add ACK/Retry logic at the mesh layer for critical messages.
Phase 2: The Universal Bridge (Transport Expansion)
Goal: Connect the unconnectable.

 Native Transports: Formalize the iOS/Android BLE & WiFi Direct bridges into the Core TransportManager.
 Seamless Roaming: Logic to switch transports without closing the "Link".
 Sneakernet Queue: "Store-and-Forward" capability. If no route exists, hold message until a new peer appears.
Phase 3: The World Web (Global Discovery)
Goal: One single global network.

 Bootstrap Nodes: Deploy community-run, high-uptime DHT bootstrap nodes (DHT Entry Points).
 Global Rendezvous: Nodes publish their "Region" and "Public Key" to the DHT.
 Circuit Relays: Allow peers behind strict NATs to talk via a relay (Bridge) until a direct hole is punched.
Phase 4: The Sovereign Social Layer
Goal: User experience scaling.

 Social Recovery: Sharded private keys stored on trusted friends' nodes.
 Content Addressing: Share files/images via their Hash (IPFS-style) rather than direct transfer.