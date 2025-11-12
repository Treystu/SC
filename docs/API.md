# Sovereign Communications API Reference

## Core Protocol APIs

### Message Format

Binary message structure for mesh networking:

```
Header (64 bytes):
- version: uint8
- type: uint8 (TEXT=1, VOICE=2, FILE=3, CONTROL=4)
- TTL: uint8
- timestamp: uint64
- sender_id: 32 bytes (Ed25519 public key)
- signature: 64 bytes (Ed25519 signature)

Body (variable):
- encrypted_payload: ChaCha20-Poly1305 encrypted data
```

### Cryptography API

#### Key Generation

```typescript
async function generateIdentityKeyPair(): Promise<KeyPair>
```

Generates an Ed25519 key pair for identity.

**Returns:** `KeyPair` containing public and private keys

#### Message Encryption

```typescript
async function encryptMessage(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array
): Promise<EncryptedMessage>
```

Encrypts a message using ChaCha20-Poly1305 with ECDH-derived key.

**Parameters:**
- `plaintext`: Message content as bytes
- `recipientPublicKey`: Recipient's Ed25519 public key
- `senderPrivateKey`: Sender's Ed25519 private key

**Returns:** `EncryptedMessage` with encrypted payload and nonce

#### Message Decryption

```typescript
async function decryptMessage(
  encrypted: EncryptedMessage,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): Promise<Uint8Array>
```

Decrypts a message using ChaCha20-Poly1305.

**Parameters:**
- `encrypted`: Encrypted message object
- `senderPublicKey`: Sender's Ed25519 public key
- `recipientPrivateKey`: Recipient's Ed25519 private key

**Returns:** Decrypted plaintext as bytes

### Mesh Networking API

#### Peer Management

```typescript
interface Peer {
  id: string;
  publicKey: Uint8Array;
  lastSeen: number;
  connectionType: 'webrtc' | 'ble';
  address?: string;
}

class PeerRegistry {
  addPeer(peer: Peer): void;
  removePeer(peerId: string): void;
  getPeer(peerId: string): Peer | null;
  getAllPeers(): Peer[];
  getConnectedPeers(): Peer[];
}
```

#### Message Routing

```typescript
class MeshRouter {
  sendMessage(message: Message, recipientId: string): Promise<void>;
  broadcastMessage(message: Message): Promise<void>;
  relayMessage(message: Message): Promise<void>;
}
```

#### Connection Management

```typescript
class ConnectionManager {
  connect(peerId: string, address: string): Promise<void>;
  disconnect(peerId: string): void;
  getConnectionStatus(): ConnectionStatus;
}
```

### WebRTC API

#### Peer Connection

```typescript
class WebRTCPeer {
  constructor(peerId: string);
  createOffer(): Promise<RTCSessionDescriptionInit>;
  acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
  acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
  sendData(data: Uint8Array): void;
  close(): void;
  
  on(event: 'data', callback: (data: Uint8Array) => void): void;
  on(event: 'connected', callback: () => void): void;
  on(event: 'disconnected', callback: () => void): void;
}
```

### File Transfer API

```typescript
interface FileTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  senderId: string;
  recipientId: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

class FileTransferManager {
  sendFile(file: File, recipientId: string): Promise<string>;
  receiveFile(transferId: string): Promise<Blob>;
  pauseTransfer(transferId: string): void;
  resumeTransfer(transferId: string): void;
  cancelTransfer(transferId: string): void;
  getTransferStatus(transferId: string): FileTransfer;
}
```

### Storage API

#### Web (IndexedDB)

```typescript
class MessageStore {
  saveMessage(message: Message): Promise<void>;
  getMessage(messageId: string): Promise<Message | null>;
  getConversation(contactId: string, limit: number): Promise<Message[]>;
  deleteMessage(messageId: string): Promise<void>;
  searchMessages(query: string): Promise<Message[]>;
}
```

#### Android (Room)

```kotlin
@Dao
interface MessageDao {
    @Insert
    suspend fun insertMessage(message: MessageEntity)
    
    @Query("SELECT * FROM messages WHERE conversation_id = :conversationId ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getMessages(conversationId: String, limit: Int): List<MessageEntity>
    
    @Query("DELETE FROM messages WHERE id = :messageId")
    suspend fun deleteMessage(messageId: String)
}
```

#### iOS (Core Data)

```swift
class MessageStore {
    func saveMessage(_ message: Message) async throws
    func fetchMessages(conversationId: String, limit: Int) async throws -> [Message]
    func deleteMessage(messageId: String) async throws
}
```

### Peer Discovery API

#### mDNS Broadcasting

```typescript
class MDNSDiscovery {
  startBroadcasting(port: number): void;
  stopBroadcasting(): void;
  startDiscovery(): void;
  stopDiscovery(): void;
  
  on(event: 'peer_discovered', callback: (peer: DiscoveredPeer) => void): void;
}
```

#### QR Code Pairing

```typescript
interface QRCodeData {
  publicKey: string;
  address: string;
  port: number;
}

function generateQRCode(data: QRCodeData): Promise<string>;
function scanQRCode(imageData: ImageData): Promise<QRCodeData>;
```

### Event System

```typescript
interface EventEmitter {
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}

// Available events:
// - 'peer_connected'
// - 'peer_disconnected'
// - 'message_received'
// - 'message_sent'
// - 'file_transfer_progress'
// - 'connection_state_changed'
```

## Error Handling

All async operations return Promises that reject with specific error types:

```typescript
enum ErrorCode {
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PEER_NOT_FOUND = 'PEER_NOT_FOUND',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  STORAGE_ERROR = 'STORAGE_ERROR',
}

class SCError extends Error {
  code: ErrorCode;
  details?: any;
}
```

## Configuration

```typescript
interface SCConfig {
  identity: {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
  };
  network: {
    enableWebRTC: boolean;
    enableBLE: boolean;
    maxPeers: number;
    heartbeatInterval: number;
  };
  storage: {
    messageRetentionDays: number;
    maxStorageSize: number;
  };
}
```

## Platform-Specific Notes

### Web
- Uses IndexedDB for persistent storage
- Service Workers for background sync
- WebRTC for peer connections

### Android
- Room database for persistence
- Foreground service for connectivity
- BLE GATT for mesh networking

### iOS
- Core Data for persistence
- Background modes (VoIP, BLE)
- CoreBluetooth for mesh networking
