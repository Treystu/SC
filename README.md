# SC - Sovereign Communications

A decentralized P2P messaging application with end-to-end encryption, supporting WebRTC data channels for internet connectivity and BLE mesh for offline/local communication. No servers required - all messages relay through peer devices.

## Features

- **End-to-End Encryption**: ChaCha20-Poly1305 authenticated encryption
- **Message Signing**: Ed25519 digital signatures for authentication
- **Perfect Forward Secrecy**: ECDH key exchange with session key rotation
- **Mesh Networking**: Flood routing with TTL, message deduplication, and priority queuing
- **Multi-Transport**: WebRTC data channels, BLE mesh, and mDNS discovery
- **Peer-to-Peer**: No central servers - complete data sovereignty
- **Cross-Platform**: TypeScript/React web, Kotlin Android, Swift iOS

## Architecture

### Core Cryptography (Tasks 1-10 ✅)
- ✅ Binary message format with versioned headers
- ✅ ECDH key exchange (X25519)
- ✅ Ed25519 message signing and verification
- ✅ ChaCha20-Poly1305 encryption/decryption
- ✅ Identity keypair generation and management
- ✅ Perfect forward secrecy with session keys
- ✅ Automatic session key rotation

### Mesh Networking (Tasks 11-22 ✅)
- ✅ In-memory routing table
- ✅ Peer registry for connected peers
- ✅ Message TTL decrement and expiration
- ✅ Hash-based message deduplication
- ✅ Flood routing (excludes sender)
- ✅ Message relay logic
- ✅ Peer health monitoring (heartbeat)
- ✅ Automatic peer timeout and removal
- ✅ Message fragmentation for large payloads
- ✅ Fragment reassembly with timeout
- ✅ Priority queue (Control > Voice > Text > File)
- ✅ Bandwidth-aware message scheduling

## Project Structure

```
SC/
├── packages/
│   └── core/           # Core crypto and mesh protocol (TypeScript)
│       ├── src/
│       │   ├── crypto/     # Cryptographic primitives
│       │   ├── protocol/   # Message serialization
│       │   ├── mesh/       # Routing and relay
│       │   ├── types/      # TypeScript interfaces
│       │   └── utils/      # Helper functions
│       └── dist/           # Compiled output
└── apps/               # Platform-specific applications (future)
    ├── web/           # React web application
    ├── android/       # Kotlin Android app
    └── ios/           # Swift iOS app
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Core Package

The `@sc/core` package provides all cryptographic and mesh networking functionality:

```typescript
import {
  generateIdentity,
  signMessage,
  verifySignature,
  encryptMessage,
  decryptMessage,
  createSessionKey,
  RoutingTable,
  MessageRouter,
  PriorityQueue,
} from '@sc/core';

// Generate identity
const identity = generateIdentity('Alice');

// Create and sign a message
const data = new TextEncoder().encode('Hello');
const signature = signMessage(data, identity.privateKey);

// Verify signature
const isValid = verifySignature(data, signature, identity.publicKey);

// Encrypt data
const key = generateKey();
const nonce = generateNonce();
const encrypted = encryptMessage(data, key, nonce);

// Set up mesh networking
const routingTable = new RoutingTable();
const deduplicationCache = new DeduplicationCache();
const router = new MessageRouter(routingTable, deduplicationCache);
```

## Security

- **No Trust Required**: All cryptographic operations use well-tested libraries (@noble)
- **Perfect Forward Secrecy**: Session keys expire and rotate automatically
- **Message Authentication**: All messages signed with Ed25519
- **Authenticated Encryption**: ChaCha20-Poly1305 AEAD
- **Data Sovereignty**: No servers, users control their own data

## Protocol Specification

### Message Format

```
Header (111 bytes):
  - Version (1 byte)
  - Type (1 byte): TEXT, FILE, VOICE, CONTROL, etc.
  - TTL (1 byte): Max 16 hops
  - Timestamp (8 bytes): Unix timestamp in milliseconds
  - Sender ID (32 bytes): Ed25519 public key
  - Signature (64 bytes): Ed25519 signature
  - Payload Length (4 bytes): Encrypted payload size

Payload (variable):
  - ChaCha20-Poly1305 encrypted content
```

### Routing

- **Flood Routing**: Messages forwarded to all connected peers except sender
- **TTL Management**: Each hop decrements TTL; message dropped at 0
- **Deduplication**: SHA-256 hash cache prevents duplicate processing
- **Priority Queuing**: Control messages take precedence over user data

## Development Status

### Completed (Tasks 1-22) ✅
- Foundation: Protocol & Crypto (Tasks 1-10)
- Mesh Networking Core (Tasks 11-22)

### In Progress
- WebRTC Peer-to-Peer (Tasks 23-32)
- Bluetooth Mesh (Tasks 33-46)
- Peer Discovery (Tasks 47-56)

### Planned
- Android Application (Tasks 57-89)
- iOS Application (Tasks 90-122)
- Web Application (Tasks 123-153)
- Additional Features (Tasks 154-285)

## Testing

All core functionality is thoroughly tested:

```bash
cd packages/core
npm test
```

Test coverage includes:
- Cryptographic operations (signing, encryption, key exchange)
- Message serialization/deserialization
- Fragmentation and reassembly
- Routing table management
- Message deduplication
- Priority queuing
- Bandwidth scheduling
- Peer health monitoring

## License

This project is released into the public domain under The Unlicense. See LICENSE for details.

## Contributing

This is an open-source project. Contributions are welcome!

## Roadmap

See [Issue #2](https://github.com/Treystu/SC/issues/2) for the complete task list and development roadmap.

