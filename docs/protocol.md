# Sovereign Communications Protocol Specification

Version: 0.1.0  
Status: Draft

## Overview

The Sovereign Communications Protocol (SCP) is a decentralized, peer-to-peer messaging protocol designed for secure communication without relying on central servers. It uses a mesh network architecture where messages are relayed through intermediate peers to reach their destination.

## Core Principles

1. **No Central Authority**: All peers are equal; no servers required
2. **End-to-End Encryption**: All message payloads are encrypted
3. **Perfect Forward Secrecy**: Session keys rotate to protect past communications
4. **Mesh Routing**: Messages are relayed through the network to reach recipients
5. **Multi-Transport**: Supports WebRTC, Bluetooth, and local network connections

## Message Format

### Binary Message Structure

Every message consists of a fixed-size header followed by a variable-length encrypted payload.

#### Header (109 bytes)

```
+--------+--------+--------+--------+
| Version|  Type  |  TTL   |Reserved|  (4 bytes)
+--------+--------+--------+--------+
| Timestamp                         |  (8 bytes)
+-----------------------------------+
| Sender ID (Ed25519 Public Key)    |  (32 bytes)
+-----------------------------------+
| Signature (Ed25519 Compact)       |  (65 bytes)
+-----------------------------------+
```

**Field Descriptions:**

- **Version** (1 byte): Protocol version number (currently 0x01)
- **Type** (1 byte): Message type identifier (see Message Types below)
- **TTL** (1 byte): Time-to-live for mesh routing (decremented at each hop)
- **Reserved** (1 byte): Reserved for future use (must be 0x00)
- **Timestamp** (8 bytes): Unix timestamp in milliseconds (big-endian)
- **Sender ID** (32 bytes): Ed25519 public key of the sender
- **Signature** (65 bytes): Ed25519 compact signature over (Version || Type || TTL || Timestamp || Payload)

#### Payload (Variable Length)

The payload is encrypted using XChaCha20-Poly1305 with a session key. The structure depends on the message type.

### Message Types

```
TEXT            = 0x01  // Text message
FILE_METADATA   = 0x02  // File transfer metadata
FILE_CHUNK      = 0x03  // File transfer chunk
VOICE           = 0x04  // Voice message
CONTROL_ACK     = 0x10  // Acknowledgment
CONTROL_PING    = 0x11  // Heartbeat ping
CONTROL_PONG    = 0x12  // Heartbeat pong
PEER_DISCOVERY  = 0x20  // Peer announcement
PEER_INTRO      = 0x21  // Peer introduction
KEY_EXCHANGE    = 0x30  // ECDH key exchange
SESSION_KEY     = 0x31  // Session key rotation
```

## Cryptography

### Identity Keys

Each peer has a long-term Ed25519 keypair:
- **Public Key** (32 bytes): Used as the peer's unique identifier
- **Private Key** (32 bytes): Used for signing messages

### Key Exchange (ECDH)

To establish a secure channel with a peer:

1. Convert Ed25519 keys to X25519 format
2. Perform ECDH key exchange
3. Derive session key using HKDF-SHA256
4. Use session key for XChaCha20-Poly1305 encryption

### Session Keys

Session keys provide perfect forward secrecy:
- Generated using secure random number generator
- Rotated periodically (default: every 1000 messages or 24 hours)
- Derived from ECDH shared secret + random salt

### Message Encryption

All payloads are encrypted using XChaCha20-Poly1305:
- **Key**: 32 bytes from session key
- **Nonce**: 24 bytes (random or counter-based)
- **Authentication**: Poly1305 MAC (16 bytes appended)

### Message Signing

All messages are signed using Ed25519:
- Signature covers: Version || Type || TTL || Timestamp || EncryptedPayload
- Compact signature format (65 bytes)

## Mesh Networking

### Routing

The protocol uses flood routing with deduplication:

1. **Receive Message**: Check signature validity
2. **Deduplication**: Compute SHA-256 hash; check if seen before
3. **TTL Check**: If TTL = 0, discard; otherwise, decrement TTL
4. **Destination Check**: If message is for this peer, decrypt and process
5. **Forward**: Send to all connected peers except sender

### Peer Discovery

Peers can be discovered through multiple mechanisms:

1. **mDNS/Bonjour** (local network): Broadcast service on `_sc._udp.local`
2. **QR Code**: Encode `sc://[public-key]@[ip]:[port]`
3. **BLE** (mobile): Custom GATT service UUID
4. **Manual Entry**: Direct IP:port + public key
5. **Mesh Introduction**: Existing peer introduces new peer

### Peer Registry

Each peer maintains a registry of known peers:

```typescript
interface Peer {
  id: string;              // Hex-encoded public key
  publicKey: Uint8Array;   // Ed25519 public key
  lastSeen: number;        // Unix timestamp
  connectedAt: number;     // Unix timestamp
  transportType: 'webrtc' | 'bluetooth' | 'local';
  connectionQuality: number; // 0-100
  bytesSent: number;
  bytesReceived: number;
}
```

### Message Deduplication

To prevent infinite loops and duplicate processing:
- Maintain a cache of message hashes (SHA-256)
- Cache size: 10,000 entries
- TTL: 60 seconds
- When cache is full, evict oldest entries

### Message Priority

Messages are queued and sent based on priority:

1. Control messages (PING, PONG, ACK)
2. Voice messages
3. Text messages
4. File chunks
5. File metadata

## Transport Layer

### WebRTC Data Channels

Primary transport for web and cross-platform communication:
- **Unreliable channel**: For real-time data (voice, video)
- **Reliable channel**: For text messages and file transfers
- ICE candidates exchanged via mesh signaling
- STUN/TURN optional (prefer direct connections)

### Bluetooth Low Energy (Mobile)

For offline mesh networking on mobile devices:
- Custom GATT service: `0000FE9A-0000-1000-8000-00805F9B34FB`
- TX/RX characteristics for message exchange
- MTU-aware fragmentation (default: 512 bytes)
- Multi-hop relay capability

### Local Network (mDNS)

For local area network communication:
- Service type: `_sc._udp.local`
- UDP port: 7331 (configurable)
- Direct peer-to-peer connections

## Payload Formats

### Text Message (0x01)

```json
{
  "text": "Message content",
  "timestamp": 1234567890123
}
```

### File Metadata (0x02)

```json
{
  "fileId": "unique-file-id",
  "name": "document.pdf",
  "size": 1048576,
  "mimeType": "application/pdf",
  "chunks": 128,
  "hash": "sha256-hash-of-file"
}
```

### File Chunk (0x03)

```json
{
  "fileId": "unique-file-id",
  "chunkIndex": 42,
  "data": "base64-encoded-chunk"
}
```

### Peer Discovery (0x20)

```json
{
  "publicKey": "hex-encoded-public-key",
  "endpoints": [
    {"type": "webrtc", "signaling": "peer-id"},
    {"type": "local", "address": "192.168.1.100:7331"}
  ],
  "timestamp": 1234567890123
}
```

### Key Exchange (0x30)

```json
{
  "ephemeralKey": "hex-encoded-x25519-public-key",
  "timestamp": 1234567890123
}
```

## Security Considerations

### Threat Model

**Protected Against:**
- Eavesdropping (encryption)
- Message tampering (signatures + AEAD)
- Impersonation (public key authentication)
- Replay attacks (timestamps + nonces)

**Not Protected Against:**
- Traffic analysis (visible metadata)
- Denial of service (resource exhaustion)
- Sybil attacks (multiple fake identities)
- Physical device compromise

### Best Practices

1. **Verify Keys**: Always verify peer public key fingerprints out-of-band
2. **Rotate Sessions**: Regularly rotate session keys
3. **Limit TTL**: Keep TTL low (5-10 hops) to prevent resource exhaustion
4. **Rate Limiting**: Implement per-peer rate limits
5. **Proof of Work**: Optional PoW for message relay to prevent spam

### Known Limitations

1. No forward anonymity (sender ID in header)
2. No traffic padding (message sizes visible)
3. No onion routing (direct mesh routing)
4. Limited scalability (flood routing)

## Implementation Notes

### Recommended Libraries

- **Cryptography**: @noble/curves, @noble/ciphers (JavaScript)
- **WebRTC**: native WebRTC API or libdatachannel
- **BLE**: CoreBluetooth (iOS), android.bluetooth (Android)
- **Networking**: native platform APIs

### Performance Targets

- Message latency: < 100ms (direct), < 500ms (3 hops)
- Throughput: 1MB/s per peer connection
- Memory: < 100MB for 1000 cached messages
- Battery: < 5% per hour on mobile (background mode)

## Versioning

Protocol version follows semantic versioning:
- **Major**: Breaking changes to message format
- **Minor**: Backward-compatible additions
- **Patch**: Bug fixes

Current version: **0.1.0** (pre-alpha)

## References

- Ed25519: RFC 8032
- X25519: RFC 7748
- XChaCha20-Poly1305: draft-irtf-cfrg-xchacha
- WebRTC: W3C WebRTC 1.0 specification
- BLE GATT: Bluetooth Core Specification 5.0

## Changelog

### 0.1.0 (2024-11-09)
- Initial protocol specification
- Basic message format defined
- Core cryptography primitives specified
- Mesh routing algorithm outlined
