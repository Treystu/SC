# Sovereign Communications API Documentation

## Core Cryptographic API

### Identity Generation

```typescript
import { generateIdentity } from '@sc/core';

const identity = generateIdentity();
// Returns: { id: string, publicKey: Uint8Array, privateKey: Uint8Array }
```

### Message Encryption

```typescript
import { encryptMessage, decryptMessage } from '@sc/core';

const encrypted = await encryptMessage(plaintext, recipientPublicKey, senderPrivateKey);
const decrypted = await decryptMessage(encrypted, senderPublicKey, recipientPrivateKey);
```

### Message Signing

```typescript
import { signMessage, verifySignature } from '@sc/core';

const signature = signMessage(message, privateKey);
const isValid = verifySignature(message, signature, publicKey);
```

## Mesh Network API

### Initialization

```typescript
import { MeshNetwork } from '@sc/core';

const network = new MeshNetwork({
  identity,
  port: 8080,
  bootstrapPeers: []
});

await network.initialize();
```

### Sending Messages

```typescript
// Send to specific peer
await network.sendMessage(recipientId, 'Hello!');

// Broadcast to all peers
await network.broadcast('Announcement');
```

### Event Handling

```typescript
network.on('peer:connected', (peerId) => {
  console.log('Peer connected:', peerId);
});

network.on('message', (message) => {
  console.log('Received:', message);
});

network.on('peer:disconnected', (peerId) => {
  console.log('Peer disconnected:', peerId);
});
```

## File Transfer API

### Sending Files

```typescript
import { FileTransferManager } from '@sc/core';

const transferManager = new FileTransferManager(network);

const metadata = await transferManager.createFileMetadata(
  fileData,
  'document.pdf',
  'application/pdf'
);

await transferManager.sendFile(recipientId, metadata, fileData);
```

### Receiving Files

```typescript
transferManager.on('transfer:start', (transfer) => {
  console.log('Receiving file:', transfer.fileName);
});

transferManager.on('transfer:progress', (transferId, progress) => {
  console.log('Progress:', progress);
});

transferManager.on('transfer:complete', async (transferId) => {
  const fileData = await transferManager.getFile(transferId);
  // Save file
});
```

## Web Application API

### React Hooks

```typescript
import { useMeshNetwork } from './hooks/useMeshNetwork';

function MyComponent() {
  const { network, peers, sendMessage } = useMeshNetwork();
  
  return (
    <div>
      <p>Connected peers: {peers.length}</p>
      <button onClick={() => sendMessage('peer123', 'Hi!')}>
        Send Message
      </button>
    </div>
  );
}
```

### Storage API

```typescript
import { saveMessage, getMessages } from './lib/storage';

await saveMessage({
  id: crypto.randomUUID(),
  conversationId: 'conv1',
  content: 'Hello',
  timestamp: Date.now()
});

const messages = await getMessages('conv1');
```

## Android API

### Room Database

```kotlin
val database = Room.databaseBuilder(
    context,
    AppDatabase::class.java,
    "sovereign-communications"
).build()

// Save message
database.messageDao().insert(message)

// Query messages
val messages = database.messageDao().getConversationMessages(conversationId)
```

### BLE Mesh

```kotlin
val bleServer = BLEGATTServer(context)
bleServer.start()

val bleClient = BLEGATTClient(context)
bleClient.connect(device)
bleClient.sendData(data)
```

## iOS API

### Core Data

```swift
let context = persistentContainer.viewContext

let message = MessageEntity(context: context)
message.id = UUID().uuidString
message.content = "Hello"
message.timestamp = Date()

try context.save()
```

### CoreBluetooth

```swift
let gattService = MeshGATTService()
gattService.setupPeripheral()
gattService.setupCentral()
```

## Security Best Practices

1. **Key Storage**
   - Android: Use Android KeyStore
   - iOS: Use Keychain
   - Web: Use IndexedDB with encryption

2. **Message Encryption**
   - All messages encrypted with XChaCha20-Poly1305
   - Ed25519 signatures for authentication
   - Perfect forward secrecy with session keys

3. **Network Security**
   - No central servers
   - End-to-end encryption
   - Peer verification via QR codes
