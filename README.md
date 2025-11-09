# Sovereign Communications

A decentralized, end-to-end encrypted mesh networking communication platform that works across Web, Android, and iOS with no central servers.

## 🌟 Features

- **End-to-End Encryption**: All messages encrypted with Ed25519 signing and ChaCha20-Poly1305 encryption
- **Mesh Networking**: Direct peer-to-peer communication with automatic message relay
- **Multi-Platform**: Works on Web (PWA), Android, and iOS
- **No Servers**: Completely decentralized with no reliance on central infrastructure
- **Perfect Forward Secrecy**: Session keys rotate automatically to protect past communications
- **Multi-Transport**: Uses WebRTC, Bluetooth Low Energy, and local network discovery

## 🏗️ Architecture

The project is organized as a monorepo with the following structure:

```
SC/
├── core/           # Shared cryptography and protocol implementation
│   ├── src/
│   │   ├── crypto/       # Cryptographic primitives
│   │   ├── protocol/     # Binary message format
│   │   ├── mesh/         # Routing and peer management
│   │   └── transport/    # Transport abstractions
├── web/            # Web application (Vite + React + TypeScript)
├── android/        # Android application (Kotlin)
├── ios/            # iOS application (Swift)
└── docs/           # Documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- For Android: Android Studio with Kotlin support
- For iOS: Xcode with Swift support

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Treystu/SC.git
cd SC
```

2. Install dependencies:
```bash
npm install
```

3. Build the core library:
```bash
cd core
npm run build
npm test
```

4. Run the web application:
```bash
cd ../web
npm install
npm run dev
```

The web app will be available at `http://localhost:3000`

## 📦 Core Library

The `@sc/core` library provides the foundational cryptography and networking primitives used across all platforms.

### Cryptographic Primitives

```typescript
import { 
  generateIdentity, 
  signMessage, 
  verifySignature,
  encryptMessage,
  decryptMessage 
} from '@sc/core';

// Generate identity keypair
const identity = generateIdentity();

// Sign a message
const message = new TextEncoder().encode('Hello, mesh!');
const signature = signMessage(message, identity.privateKey);

// Verify signature
const isValid = verifySignature(message, signature, identity.publicKey);

// Encrypt/decrypt messages
import { generateSessionKey } from '@sc/core';
const sessionKey = generateSessionKey();
const ciphertext = encryptMessage(message, sessionKey.key, sessionKey.nonce);
const plaintext = decryptMessage(ciphertext, sessionKey.key, sessionKey.nonce);
```

### Message Protocol

```typescript
import { MessageType, encodeMessage, decodeMessage } from '@sc/core';

const message = {
  header: {
    version: 0x01,
    type: MessageType.TEXT,
    ttl: 10,
    timestamp: Date.now(),
    senderId: identity.publicKey,
    signature: messageSignature,
  },
  payload: encryptedContent,
};

// Encode to binary
const encoded = encodeMessage(message);

// Decode from binary
const decoded = decodeMessage(encoded);
```

### Mesh Routing

```typescript
import { RoutingTable, Peer } from '@sc/core';

const routingTable = new RoutingTable();

// Add a peer
const peer: Peer = {
  id: 'peer-id',
  publicKey: peerPublicKey,
  lastSeen: Date.now(),
  connectedAt: Date.now(),
  transportType: 'webrtc',
  connectionQuality: 100,
  bytesSent: 0,
  bytesReceived: 0,
};

routingTable.addPeer(peer);

// Find route to destination
const nextHop = routingTable.getNextHop('destination-id');

// Message deduplication
if (!routingTable.hasSeenMessage(messageHash)) {
  routingTable.markMessageSeen(messageHash);
  // Process message
}
```

## 🌐 Web Application

Built with Vite, React, and TypeScript, the web app provides a modern PWA experience.

### Features Implemented

- ✅ Basic UI layout with conversation list and chat view
- ✅ Connection status indicator
- ✅ Message input and display
- ✅ Dark theme with responsive design
- 🚧 IndexedDB persistence (in progress)
- 🚧 WebRTC peer connections (in progress)
- 🚧 Service worker for offline support (planned)

### Development

```bash
cd web
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## 📱 Mobile Applications

### Android (Planned)

- Kotlin with Jetpack Compose UI
- Room database for persistence
- Foreground service for persistent connectivity
- BLE mesh networking
- WebRTC peer connections

### iOS (Planned)

- Swift with SwiftUI
- Core Data for persistence
- Background modes for connectivity
- CoreBluetooth for BLE mesh
- WebRTC peer connections

## 🔒 Security

### Cryptographic Stack

- **Identity**: Ed25519 public-key cryptography for signing
- **Key Exchange**: ECDH (X25519) for establishing shared secrets
- **Encryption**: XChaCha20-Poly1305 AEAD cipher
- **Hashing**: SHA-256 for fingerprints and message hashes
- **Libraries**: [@noble/curves](https://github.com/paulmillr/noble-curves) and [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) - audited, minimal dependencies

### Message Format

Each message has a fixed 109-byte header:
- Version (1 byte): Protocol version
- Type (1 byte): Message type
- TTL (1 byte): Time-to-live for routing
- Reserved (1 byte): Future use
- Timestamp (8 bytes): Unix timestamp in ms
- Sender ID (32 bytes): Ed25519 public key
- Signature (65 bytes): Compact Ed25519 signature

Payload is encrypted with session keys that rotate automatically for perfect forward secrecy.

## 🧪 Testing

```bash
# Run core library tests
cd core
npm test

# With coverage
npm test -- --coverage
```

Current test coverage:
- ✅ Cryptographic primitives (38 tests)
- ✅ Message encoding/decoding
- ✅ Routing table and peer management
- ✅ Message queue prioritization

## 📖 Protocol Specification

### Peer Discovery

1. **Local Network**: mDNS/Bonjour broadcasting
2. **QR Code**: Encode public key + optional connection info
3. **Audio Pairing**: DTMF tone encoding (proximity pairing)
4. **BLE**: Bluetooth Low Energy RSSI-based discovery
5. **Manual Entry**: Direct IP:port input
6. **Mesh Introduction**: Existing peers introduce new peers

### Mesh Routing

- **Flood Routing**: Messages forwarded to all peers except sender
- **TTL Decrement**: Each hop decrements TTL; message expires at 0
- **Deduplication**: SHA-256 hash cache prevents duplicate processing
- **Priority Queue**: Control > Voice > Text > File transfers
- **Fragmentation**: Large messages split for transmission

### Transport Priority

1. WebRTC Data Channels (lowest latency, NAT traversal)
2. Bluetooth Low Energy (mobile mesh, no internet required)
3. Local Network (direct connections on same network)

## 🗺️ Roadmap

### Phase 1: Foundation (Current)
- [x] Core cryptography library
- [x] Binary message protocol
- [x] Mesh routing basics
- [x] Web UI foundation
- [ ] IndexedDB persistence
- [ ] WebRTC implementation

### Phase 2: Core Functionality
- [ ] Complete peer discovery
- [ ] File transfer protocol
- [ ] Voice messages (Opus encoding)
- [ ] Android application
- [ ] iOS application

### Phase 3: Advanced Features
- [ ] BLE mesh networking (mobile)
- [ ] Whisper.cpp integration (voice-to-text)
- [ ] Multi-device sync
- [ ] Group messaging
- [ ] Message search

### Phase 4: Polish
- [ ] UI/UX refinement
- [ ] Performance optimization
- [ ] Battery optimization (mobile)
- [ ] Comprehensive testing
- [ ] Security audit

## 🤝 Contributing

This is currently a development project implementing a comprehensive feature set. Contributions welcome once the initial implementation is complete.

## 📄 License

MIT License - See LICENSE file for details

## 🔗 Resources

- [Protocol Specification](./docs/protocol.md) (coming soon)
- [Security Model](./docs/security.md) (coming soon)
- [API Documentation](./docs/api.md) (coming soon)

## ⚠️ Status

**Pre-Alpha**: Core cryptography and protocol implemented. UI functional but not connected to mesh network. Not ready for production use.

### Completed Tasks

**Foundation - Protocol & Crypto (10 tasks)**
- ✅ 1. Define binary message format
- ✅ 2. Implement ECDH key exchange protocol
- ✅ 3. Implement Ed25519 for message signing
- ✅ 4. Implement ChaCha20-Poly1305 for message encryption
- ✅ 5. Generate and store identity keypair on device
- ✅ 6. Implement message encryption/decryption
- ✅ 7. Implement message signing/verification
- ✅ 8. Create secure key storage (IndexedDB Web, Memory for Node)
- ✅ 9. Implement perfect forward secrecy with session keys
- ✅ 10. Create session key rotation logic

**Mesh Networking Core (12 tasks)**
- ✅ 11. Implement in-memory routing table
- ✅ 12. Create peer registry (connected peers)
- ✅ 13. Implement message TTL decrement and expiration
- ✅ 14. Create message deduplication cache (hash-based)
- ✅ 21. Implement message priority queue (control > voice > text > file)
- ⏳ 15-20, 22: Additional routing features (in progress)

**Web Application (31 tasks)**
- ✅ 123. Set up Vite + React + TypeScript
- ✅ 136. Implement main app layout
- ✅ 137. Create conversation list component
- ✅ 138. Implement chat component
- ✅ 139. Create message input component
- ✅ 153. Create basic theme (light/dark)
- ⏳ 124-152: Persistence, WebRTC, and advanced features (in progress)

**Testing (8 tasks)**
- ✅ 250. Create unit tests for crypto functions
- ✅ 251. Implement unit tests for message routing
- ⏳ 252-257: Integration and E2E tests (planned)

**Documentation (7 tasks)**
- ✅ 259. Write README with quick start
- ✅ 260. Create setup instructions per platform
- ⏳ 261-265: Additional documentation (in progress)

**Build & Release (10 tasks)**
- ✅ 266. Set up Git repository
- ✅ 267. Create .gitignore files
- ⏳ 268-275: CI/CD and release process (planned)

### Progress: 28/285 tasks completed (9.8%)
