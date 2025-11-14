# GitHub Copilot Instructions for Sovereign Communications

## Project Overview

Sovereign Communications (SC) is a decentralized, end-to-end encrypted mesh networking communication platform that works across Web, Android, and iOS with no central servers.

### Core Technologies
- **Cryptography**: Ed25519 signing, X25519 key exchange, XChaCha20-Poly1305 encryption
- **Protocol**: Binary message format with 109-byte header
- **Networking**: WebRTC data channels, mesh routing, flood algorithm
- **Frontend**: React 18 + TypeScript + Vite (web), Jetpack Compose (Android)
- **Backend**: Node.js/TypeScript core library

## Architecture

### Monorepo Structure
```
SC/
├── core/           # @sc/core - Shared TypeScript cryptography and protocol
├── web/            # Vite + React + TypeScript PWA
├── android/        # Kotlin + Jetpack Compose
├── ios/            # Swift + SwiftUI (planned)
├── docs/           # Documentation
└── tests/          # Integration tests
```

### Key Components

1. **Core Library** (`core/src/`)
   - `crypto/` - Ed25519, X25519, ChaCha20-Poly1305, session keys
   - `protocol/` - Binary message encoding/decoding
   - `mesh/` - Routing table, peer registry, health monitoring, message relay
   - `transport/` - WebRTC, transport abstractions

2. **Web Application** (`web/src/`)
   - `components/` - React UI components
   - `hooks/` - Custom React hooks for mesh networking
   - `stores/` - State management (IndexedDB)

3. **Android Application** (`android/app/src/`)
   - `ui/` - Jetpack Compose screens
   - `data/` - Room database, repositories
   - `service/` - Foreground service for connectivity

## Coding Standards

### TypeScript/JavaScript
- Use TypeScript strict mode
- Prefer functional programming patterns
- Use async/await for asynchronous operations
- Include JSDoc comments for public APIs
- Write comprehensive unit tests (Jest)

### Code Style
- 2-space indentation
- Use const/let, not var
- Use template literals for strings
- Use arrow functions for callbacks
- Prefer interfaces over type aliases for objects

### Testing
- Unit tests: Jest for TypeScript
- Test coverage: Aim for >80%
- Name tests descriptively: "should [behavior] when [condition]"
- Use beforeEach/afterEach for setup/cleanup

### Cryptography
- Never implement custom crypto primitives
- Always use audited libraries (@noble/curves, @noble/ciphers)
- Validate all cryptographic inputs
- Use constant-time operations where applicable
- Document security assumptions

### Mesh Networking
- Messages must be deduplicated (SHA-256 hash cache)
- Implement TTL to prevent infinite loops
- Support multi-hop routing with metrics
- Track peer health with adaptive heartbeats
- Handle network partitions gracefully

## Common Patterns

### Creating Messages
```typescript
const message: Message = {
  header: {
    version: 0x01,
    type: MessageType.TEXT,
    ttl: 10,
    timestamp: Date.now(),
    senderId: identity.publicKey,
    signature: new Uint8Array(65), // Placeholder
  },
  payload: encryptedData,
};

// Sign message
const messageBytes = encodeMessage(message);
const sig64 = signMessage(messageBytes, identity.privateKey);

// Pad to 65 bytes for compact signature format
const sig65 = new Uint8Array(65);
sig65.set(sig64, 0);
sig65[64] = 0; // Recovery byte
message.header.signature = sig65;
```

### Managing Peers
```typescript
// Use helper function for consistency
const peer = createPeer(peerId, publicKey, 'webrtc');
routingTable.addPeer(peer);

// Update reputation
routingTable.updatePeerReputation(peerId, success);

// Blacklist problematic peers
if (peer.metadata.failureCount > 10) {
  routingTable.blacklistPeer(peerId, 3600000); // 1 hour
}
```

### Handling Fragments
```typescript
// Fragment large messages
const fragments = fragmentMessage(largeMessage, messageId);

// Reassemble
const reassembler = new MessageReassembler();
reassembler.onComplete((id, message) => {
  // Process complete message
});

fragments.forEach(fragment => {
  reassembler.addFragment(fragment);
});
```

## Performance Targets

- **Throughput**: 1000+ messages per second
- **Peers**: Support 100+ simultaneous connections
- **Latency**: Sub-100ms message relay
- **Memory**: Minimal footprint (<100MB for core)

## Security Considerations

1. **Message Authentication**: All messages signed with Ed25519
2. **Perfect Forward Secrecy**: Session keys rotate automatically
3. **Peer Verification**: Public key fingerprints for out-of-band verification
4. **DoS Protection**: Rate limiting, flood detection, peer blacklisting
5. **Input Validation**: Validate all message headers and payloads

## Development Workflow

### Building
```bash
# Install dependencies
npm install

# Build core library
cd core && npm run build

# Build web app
cd web && npm run build
```

### Testing
```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- routing.test.ts
```

### Linting
```bash
# Lint all TypeScript files
npm run lint
```

## Documentation

- Keep README.md up to date
- Document all public APIs with JSDoc
- Update PROGRESS.md when completing tasks
- Write architecture docs in docs/

## Common Issues

### Signature Size Mismatch
Ed25519 signatures are 64 bytes but the protocol expects 65 bytes (compact format with recovery byte). Always pad:
```typescript
const sig65 = new Uint8Array(65);
sig65.set(sig64, 0);
sig65[64] = 0;
```

### Peer State Management
Always use `createPeer()` helper to ensure all required fields (state, metadata) are initialized.

### Memory Leaks
- Cleanup intervals/timeouts in beforeDestroy
- Remove event listeners when unmounting
- Use WeakMap for caches when appropriate

## Contributing

- Write tests for new features
- Update documentation
- Follow existing code style
- Keep commits focused and well-described
- Run tests before pushing

## Questions?

Refer to:
- docs/protocol.md - Message protocol specification
- docs/security.md - Security model and threat analysis
- docs/SETUP.md - Development environment setup
- README.md - Quick start and API examples
