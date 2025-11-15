# Sovereign Communications - Architecture Documentation

## Overview

Sovereign Communications (SC) is a decentralized, end-to-end encrypted mesh networking communication platform that operates across Web, Android, and iOS with no central servers.

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Layer                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │   Web    │    │  Android  │    │   iOS    │                  │
│  │   PWA    │    │   App     │    │   App    │                  │
│  └────┬─────┘    └────┬──────┘    └────┬─────┘                  │
└───────┼──────────────┼────────────────┼────────────────────────┘
        │              │                │
┌───────┼──────────────┼────────────────┼────────────────────────┐
│       │         Application Layer     │                         │
│  ┌────▼──────┐  ┌───▼────────┐  ┌────▼──────┐                  │
│  │ React UI  │  │ Compose UI │  │ SwiftUI   │                  │
│  │ Components│  │ Components │  │ Components│                  │
│  └────┬──────┘  └───┬────────┘  └────┬──────┘                  │
│       │             │                 │                         │
│  ┌────▼─────────────▼─────────────────▼──────┐                 │
│  │        Mesh Network Manager                │                 │
│  │  (Connection, Discovery, Routing)          │                 │
│  └────┬───────────────────────────────────────┘                 │
└───────┼──────────────────────────────────────────────────────────┘
        │
┌───────┼──────────────────────────────────────────────────────────┐
│       │              Core Layer (@sc/core)                       │
│  ┌────▼──────────────────────────────────────────────┐          │
│  │                 Protocol Engine                    │          │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐     │          │
│  │  │  Message │  │  Crypto  │  │   Mesh      │     │          │
│  │  │  Codec   │  │  Engine  │  │   Router    │     │          │
│  │  └──────────┘  └──────────┘  └─────────────┘     │          │
│  └─────────────────────────────────────────────────┘           │
└───────┼──────────────────────────────────────────────────────────┘
        │
┌───────┼──────────────────────────────────────────────────────────┐
│       │           Transport Layer                                │
│  ┌────▼─────┐  ┌──────────┐  ┌──────────┐  ┌────────┐          │
│  │  WebRTC  │  │   BLE    │  │   mDNS   │  │  Local │          │
│  │   P2P    │  │   Mesh   │  │ Discovery│  │  WiFi  │          │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

### Component Architecture

#### Core Library (@sc/core)

The core library is a TypeScript package that provides:

1. **Cryptographic Primitives** (`crypto/`)
   - Ed25519 signing (identity & message authentication)
   - X25519 key exchange (ECDH)
   - ChaCha20-Poly1305 AEAD encryption
   - Perfect forward secrecy with session keys
   - Double ratchet algorithm for key rotation

2. **Binary Protocol** (`protocol/`)
   - 109-byte fixed header format
   - Message encoding/decoding
   - Fragmentation & reassembly
   - Validation & error handling

3. **Mesh Networking** (`mesh/`)
   - Routing table management
   - Flood routing algorithm
   - Message deduplication (SHA-256 hash cache)
   - TTL-based expiration
   - Priority queue (Control > Voice > Text > File)
   - Peer health monitoring with heartbeats
   - Bandwidth-aware scheduling

4. **Transport Abstractions** (`transport/`)
   - WebRTC data channels
   - BLE mesh (mobile platforms)
   - Local network (mDNS/Bonjour)
   - Transport multiplexing

5. **File Transfer** (`transfer/`)
   - Chunked transfer with progress tracking
   - Metadata exchange
   - Resumable transfers
   - Integrity verification

6. **Peer Discovery** (`discovery/`)
   - QR code exchange
   - Manual IP:port entry
   - Peer introduction relay
   - Reachability verification
   - mDNS/Bonjour broadcasting

## Data Flow

### Message Send Flow

```
User Input (Alice)
    │
    ▼
┌───────────────────────────┐
│  UI Layer                 │
│  - Validate input         │
│  - Create message object  │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Application Layer        │
│  - Add metadata           │
│  - Queue message          │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Crypto Engine            │
│  - Encrypt payload        │
│  - Sign message           │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Protocol Encoder         │
│  - Encode to binary       │
│  - Add header             │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Mesh Router              │
│  - Find route to Bob      │
│  - Fragment if needed     │
│  - Mark as seen           │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Transport Layer          │
│  - WebRTC/BLE send        │
│  - Handle errors          │
└───────────┬───────────────┘
            │
            ▼
        Network
            │
            ▼
    Recipient (Bob)
```

### Message Receive Flow

```
    Network
        │
        ▼
┌───────────────────────────┐
│  Transport Layer          │
│  - Receive data           │
│  - Validate transport     │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Protocol Decoder         │
│  - Decode binary          │
│  - Parse header           │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Mesh Router              │
│  - Check if seen          │
│  - Verify TTL > 0         │
│  - Reassemble fragments   │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Crypto Engine            │
│  - Verify signature       │
│  - Decrypt payload        │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Application Layer        │
│  - Process message        │
│  - Store in database      │
│  - Emit to UI             │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  UI Layer                 │
│  - Display message        │
│  - Update conversation    │
│  - Notify user            │
└───────────────────────────┘
```

## Security Architecture

### Cryptographic Stack

```
┌─────────────────────────────────────────────────────────┐
│                     Application                         │
│                   (Plaintext Messages)                   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│              End-to-End Encryption                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ChaCha20-Poly1305 AEAD                         │   │
│  │  - 256-bit keys                                 │   │
│  │  - 192-bit nonces                               │   │
│  │  - Authenticated encryption                     │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│              Message Authentication                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Ed25519 Signatures                             │   │
│  │  - 256-bit keys                                 │   │
│  │  - Deterministic signatures                     │   │
│  │  - Public key = identity                        │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│              Key Exchange                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │  X25519 ECDH                                    │   │
│  │  - Curve25519 elliptic curve                    │   │
│  │  - HKDF for key derivation                      │   │
│  │  - Perfect forward secrecy                      │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                 Transport Security                       │
│                (WebRTC DTLS/SRTP)                       │
└─────────────────────────────────────────────────────────┘
```

### Trust Model

1. **Identity**
   - Each user has a long-term Ed25519 keypair
   - Public key serves as identity (cryptographic identifier)
   - Private key never leaves device

2. **Key Exchange**
   - Out-of-band verification via QR codes or fingerprints
   - X25519 ECDH establishes shared secrets
   - Session keys derived using HKDF

3. **Perfect Forward Secrecy**
   - Session keys rotate based on time or message count
   - Old key material securely wiped from memory
   - Double ratchet algorithm for ongoing conversations

4. **Message Integrity**
   - All messages signed with sender's Ed25519 key
   - Signature verified before processing
   - Replay attacks prevented via timestamps and deduplication

## Data Storage

### Web (IndexedDB)

```
Database: sovereign-communications
├── Object Store: identities
│   ├── Primary Key: id
│   ├── publicKey: Uint8Array
│   ├── privateKey: Uint8Array (encrypted)
│   └── createdAt: number
│
├── Object Store: contacts
│   ├── Primary Key: id
│   ├── publicKey: Uint8Array
│   ├── name: string
│   ├── fingerprint: string
│   └── lastSeen: number
│
├── Object Store: conversations
│   ├── Primary Key: id
│   ├── participants: string[]
│   ├── lastMessageAt: number
│   └── unreadCount: number
│
├── Object Store: messages
│   ├── Primary Key: id
│   ├── Index: conversationId
│   ├── Index: timestamp
│   ├── senderId: string
│   ├── content: Uint8Array (encrypted)
│   └── status: 'sent' | 'delivered' | 'read'
│
└── Object Store: sessionKeys
    ├── Primary Key: peerId
    ├── key: Uint8Array (encrypted)
    ├── nonce: Uint8Array
    ├── createdAt: number
    └── messageCount: number
```

### Android (Room Database)

```sql
-- Identity table
CREATE TABLE identities (
    id TEXT PRIMARY KEY,
    public_key BLOB NOT NULL,
    private_key BLOB NOT NULL,  -- Encrypted with Android Keystore
    created_at INTEGER NOT NULL
);

-- Contacts table
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    public_key BLOB NOT NULL,
    name TEXT,
    fingerprint TEXT,
    last_seen INTEGER,
    UNIQUE(public_key)
);

-- Conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    last_message_at INTEGER NOT NULL,
    unread_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content BLOB NOT NULL,  -- Encrypted
    type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- Session keys table
CREATE TABLE session_keys (
    peer_id TEXT PRIMARY KEY,
    key BLOB NOT NULL,  -- Encrypted
    nonce BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    message_count INTEGER DEFAULT 0
);
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**
   - Components loaded on demand
   - Messages loaded incrementally (virtual scrolling)
   - Contacts loaded on first access

2. **Caching**
   - Message cache (LRU, max 1000 messages in memory)
   - Contact cache (all contacts in memory)
   - Image cache (disk-backed, max 100 MB)

3. **Resource Pooling**
   - WebRTC connection pool (max 100 peers)
   - Crypto operation pooling (reuse buffers)
   - Database connection pooling

4. **Memory Management**
   - Automatic cleanup of old messages (>30 days)
   - Secure wipe of sensitive data
   - Garbage collection tuning

### Performance Targets

- **Message Latency**: <100ms (single hop)
- **Throughput**: 1000+ messages/sec
- **Peer Connections**: 100+ simultaneous
- **Memory Footprint**: <100MB (core library)
- **Battery Impact**: <5% per hour (mobile, idle)

## Scalability

### Mesh Network Limits

- **Maximum Peers**: 100 direct connections per node
- **Maximum Hops**: 10 (TTL limit)
- **Message Dedupe Cache**: 10,000 hashes (LRU)
- **Fragment Reassembly**: 100 concurrent reassemblies

### Network Topology

```
        Alice
       /  |  \
      /   |   \
     /    |    \
   Bob  Carol  Dave
    |     |     |
    |     |     |
  Emma  Frank Grace
```

- **Small Networks** (2-10 peers): Direct connections, no routing
- **Medium Networks** (10-50 peers): Partial mesh, 1-2 hops typical
- **Large Networks** (50-100 peers): Hierarchical routing, 2-4 hops typical

## Deployment Architecture

### Web Application

```
┌─────────────────────────────────────────┐
│           CDN / Static Hosting          │
│  ┌─────────────────────────────────┐   │
│  │  index.html                     │   │
│  │  /assets/                       │   │
│  │    - JavaScript bundles         │   │
│  │    - CSS                        │   │
│  │    - Images                     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Mobile Applications

```
┌─────────────────────────────────────────┐
│         App Store / Play Store          │
│  ┌─────────────────────────────────┐   │
│  │  SC.apk / SC.ipa                │   │
│  │  - Native UI                    │   │
│  │  - @sc/core library             │   │
│  │  - Platform SDKs                │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Monitoring & Observability

### Metrics Collection

```
┌─────────────────────────────────────────┐
│          Application Metrics            │
├─────────────────────────────────────────┤
│  - Messages sent/received               │
│  - Active connections                   │
│  - Message latency                      │
│  - Success/failure rates                │
│  - Bandwidth usage                      │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│       Local Analytics Store             │
│  (Privacy-preserving, no telemetry)     │
└─────────────────────────────────────────┘
```

### Health Checks

- **Crypto Health**: Verify signing/encryption operations
- **Network Health**: Check peer connectivity
- **Storage Health**: Verify database integrity
- **Performance Health**: Monitor FPS, memory, latency

## Future Architecture Enhancements

1. **Group Messaging**
   - Multi-party key agreement (MLS protocol)
   - Efficient group ratcheting

2. **Multi-Device Sync**
   - Device-to-device synchronization
   - Conflict resolution

3. **Voice/Video Calls**
   - WebRTC media channels
   - Opus audio codec
   - VP8/VP9 video codec

4. **Offline Message Queue**
   - Store-and-forward messaging
   - Opportunistic delivery

## Technology Stack Summary

| Layer | Technology |
|-------|-----------|
| **Web UI** | React 18, TypeScript, Vite |
| **Android UI** | Kotlin, Jetpack Compose, Material 3 |
| **iOS UI** | Swift, SwiftUI |
| **Core Logic** | TypeScript, ES Modules |
| **Cryptography** | @noble/curves, @noble/ciphers |
| **Storage (Web)** | IndexedDB |
| **Storage (Android)** | Room (SQLite) |
| **Storage (iOS)** | Core Data |
| **Networking** | WebRTC, Bluetooth LE, mDNS |
| **Build** | TypeScript Compiler, Vite, Gradle, Xcode |
| **Testing** | Jest, Playwright, Espresso, XCTest |

## References

- [Binary Protocol Specification](./protocol.md)
- [Security Model](./SECURITY.md)
- [API Documentation](./API.md)
- [Developer Setup Guide](./DEVELOPER_SETUP.md)
