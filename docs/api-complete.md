# Sovereign Communications - Complete API Documentation

## Table of Contents
1. [Core Cryptography](#core-cryptography)
2. [Mesh Networking](#mesh-networking)
3. [WebRTC Transport](#webrtc-transport)
4. [File Transfer](#file-transfer)
5. [Peer Discovery](#peer-discovery)
6. [Rate Limiting](#rate-limiting)
7. [Message Compression](#message-compression)
8. [Web Application](#web-application)
9. [Android Application](#android-application)
10. [iOS Application](#ios-application)

---

## Core Cryptography

### Identity Management

```typescript
import { Identity } from '@sc/core';

// Generate new identity
const identity = Identity.generate();

// Get public key (for sharing)
const publicKey = identity.getPublicKey(); // Uint8Array

// Sign message
const signature = identity.sign(messageBytes);

// Verify signature
const isValid = Identity.verify(publicKey, messageBytes, signature);
```

### Encryption

```typescript
import { encrypt, decrypt } from '@sc/core';

// Encrypt message
const encrypted = await encrypt(plaintext, recipientPublicKey, senderPrivateKey);

// Decrypt message
const decrypted = await decrypt(ciphertext, senderPublicKey, recipientPrivateKey);
```

### Session Keys

```typescript
import { SessionKeyManager } from '@sc/core';

const sessionMgr = new SessionKeyManager();

// Establish session
const sessionKey = await sessionMgr.establishSession(peerPublicKey);

// Rotate keys (perfect forward secrecy)
await sessionMgr.rotateKey(peerId);

// Get current session key
const currentKey = sessionMgr.getSessionKey(peerId);
```

---

## Mesh Networking

### MeshNetwork Class

```typescript
import { MeshNetwork } from '@sc/core';

const mesh = new MeshNetwork(identity);

// Start network
await mesh.start();

// Send message
await mesh.sendMessage(recipientId, messageBytes);

// Listen for messages
mesh.on('message', (message) => {
  console.log('Received:', message);
});

// Get peer list
const peers = mesh.getPeers();

// Get network stats
const stats = mesh.getStats();
```

### Routing

```typescript
// Message is automatically routed through mesh
// TTL decrements at each hop
// Deduplication prevents loops
// Priority queue ensures control messages are processed first
```

---

## WebRTC Transport

### WebRTC Peer Connection

```typescript
import { WebRTCTransport } from '@sc/core';

const transport = new WebRTCTransport(mesh);

// Connect to peer
await transport.connectToPeer(peerId, offer);

// Send data
transport.send(peerId, data);

// Listen for data
transport.on('data', (peerId, data) => {
  console.log('Data from', peerId);
});

// Connection state
transport.on('connectionStateChange', (peerId, state) => {
  console.log('Connection state:', state);
});
```

---

## File Transfer

### Sending Files

```typescript
import { FileTransferManager } from '@sc/core';

const transferMgr = new FileTransferManager(mesh);

// Send file
const transferId = await transferMgr.sendFile(
  recipientId,
  file,
  {
    onProgress: (progress) => console.log(`${progress}% complete`),
    onComplete: () => console.log('Transfer complete'),
    onError: (error) => console.error('Transfer failed:', error),
  }
);

// Cancel transfer
await transferMgr.cancelTransfer(transferId);
```

### Receiving Files

```typescript
// Listen for incoming files
transferMgr.on('fileOffer', async (offer) => {
  console.log('File offered:', offer.filename, offer.size);
  
  // Accept file
  await transferMgr.acceptFile(offer.transferId);
});

// Track progress
transferMgr.on('progress', (transferId, progress) => {
  console.log(`Transfer ${transferId}: ${progress}%`);
});
```

---

## Peer Discovery

### QR Code Exchange

```typescript
import { QRCodeDiscovery } from '@sc/core';

// Generate QR code
const qrData = QRCodeDiscovery.generateQRCode(identity);

// Scan QR code
const peerInfo = QRCodeDiscovery.parseQRCode(scannedData);
await mesh.addPeer(peerInfo);
```

### mDNS Discovery

```typescript
import { MDNSDiscovery } from '@sc/core';

const mdns = new MDNSDiscovery(mesh);

// Start broadcasting
await mdns.startBroadcast();

// Listen for peers
mdns.on('peerDiscovered', (peer) => {
  console.log('Found peer:', peer.id);
  mesh.addPeer(peer);
});
```

---

## Rate Limiting

### Message Rate Limiter

```typescript
import { MessageRateLimiter } from '@sc/core';

const limiter = new MessageRateLimiter();

// Check if can send
if (limiter.canSend('text')) {
  await mesh.sendMessage(recipientId, message);
} else {
  console.log('Rate limited - try again later');
}

// Get available tokens
const available = limiter.getStatus('text');
console.log(`Can send ${available} more messages`);
```

### Custom Rate Limiter

```typescript
import { RateLimiter } from '@sc/core';

const customLimiter = new RateLimiter({
  capacity: 100, // Max 100 tokens
  refillRate: 10, // 10 tokens per second
});

if (customLimiter.tryConsume(5)) {
  // Action allowed
} else {
  // Rate limited
}
```

---

## Message Compression

### Automatic Compression

```typescript
import { compressMessage, decompressMessage } from '@sc/core';

// Compress (automatically skips small messages)
const result = compressMessage(messageBytes);
console.log(`Compressed: ${result.compressed}`);
console.log(`Ratio: ${result.compressedSize / result.originalSize}`);

// Decompress
const original = decompressMessage(result.data, result.compressed);
```

---

## Web Application

### React Hooks

```typescript
import { useMeshNetwork } from '@sc/web';

function ChatApp() {
  const { mesh, peers, connected } = useMeshNetwork();
  
  return (
    <div>
      <p>Connected: {connected ? 'Yes' : 'No'}</p>
      <p>Peers: {peers.length}</p>
    </div>
  );
}
```

### IndexedDB Storage

```typescript
import { MessageDB } from '@sc/web';

const db = new MessageDB();

// Store message
await db.addMessage(message);

// Get conversations
const conversations = await db.getConversations();

// Get messages for conversation
const messages = await db.getMessages(conversationId);
```

---

## Android Application

### Room Database

```kotlin
@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE conversationId = :id")
    fun getMessages(id: String): Flow<List<MessageEntity>>
    
    @Insert
    suspend fun insert(message: MessageEntity)
}
```

### Foreground Service

```kotlin
class MeshService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())
        meshNetwork.start()
        return START_STICKY
    }
}
```

---

## iOS Application

### Core Data

```swift
class PersistenceController {
    static let shared = PersistenceController()
    
    let container: NSPersistentContainer
    
    func saveMessage(_ message: Message) {
        let context = container.viewContext
        // Save logic
    }
}
```

### SwiftUI Views

```swift
struct ChatView: View {
    @ObservedObject var viewModel: ChatViewModel
    
    var body: some View {
        VStack {
            MessageList(messages: viewModel.messages)
            MessageInput(onSend: viewModel.sendMessage)
        }
    }
}
```

---

## Error Handling

All APIs throw specific error types:

```typescript
try {
  await mesh.sendMessage(recipientId, message);
} catch (error) {
  if (error instanceof PeerNotFoundError) {
    console.error('Peer not connected');
  } else if (error instanceof EncryptionError) {
    console.error('Encryption failed');
  } else if (error instanceof NetworkError) {
    console.error('Network unavailable');
  }
}
```

---

## Events

Subscribe to events for real-time updates:

```typescript
// Mesh events
mesh.on('peerConnected', (peerId) => {});
mesh.on('peerDisconnected', (peerId) => {});
mesh.on('message', (message) => {});
mesh.on('error', (error) => {});

// Transfer events
transferMgr.on('progress', (transferId, percent) => {});
transferMgr.on('complete', (transferId) => {});
transferMgr.on('error', (transferId, error) => {});
```

---

## Performance Considerations

- Messages >1KB are automatically compressed
- Rate limiting prevents network abuse
- Message deduplication cache prevents loops
- Connection pooling reuses WebRTC connections
- Background sync queues operations when offline

---

## Security Best Practices

1. **Always verify signatures** before processing messages
2. **Rotate session keys** regularly (every 1000 messages or 24 hours)
3. **Validate peer identities** before sensitive operations
4. **Use secure storage** for private keys
5. **Enable perfect forward secrecy** for all conversations

---

## Platform-Specific Notes

### Web
- Service worker enables offline support
- IndexedDB stores messages locally
- Web Crypto API for cryptographic operations

### Android
- Foreground service keeps mesh connected
- Room database for persistence
- BLE mesh for local communication

### iOS
- Background modes for continued operation
- Core Data for persistence
- CoreBluetooth for BLE mesh

---

For more examples, see the `/examples` directory in the repository.
