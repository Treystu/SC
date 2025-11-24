# Performance Optimization Guide

## Overview

This guide provides strategies and techniques for optimizing the performance of Sovereign Communications across all platforms.

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Message Latency** | <100ms | Single-hop message delivery time |
| **Throughput** | 1000+ msg/s | Messages processed per second |
| **Memory Usage** | <100MB | Core library baseline memory |
| **Bundle Size (Web)** | <250KB | Gzipped JavaScript bundle |
| **FPS (Web)** | 60 | Frames per second during scrolling |
| **Battery Drain (Mobile)** | <5%/hour | Idle battery consumption |
| **Cold Start (Mobile)** | <2s | Time to first interactive frame |

## Web Application Optimizations

### 1. Code Splitting & Lazy Loading

#### Route-based Code Splitting

```typescript
// web/src/App.tsx
import { lazy, Suspense } from 'react';

const ChatView = lazy(() => import('./components/ChatView'));
const ContactManager = lazy(() => import('./components/ContactManager'));
const Settings = lazy(() => import('./components/Settings'));

export const App = () => (
  <Router>
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/chat/:id" element={<ChatView />} />
        <Route path="/contacts" element={<ContactManager />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  </Router>
);
```

#### Component-based Lazy Loading

```typescript
// Lazy load heavy components
const VideoCallUI = lazy(() => import('./components/VideoCallUI'));
const VoiceRecorder = lazy(() => import('./components/VoiceRecorder'));

// Only load when needed
{showVideoCall && (
  <Suspense fallback={<div>Loading...</div>}>
    <VideoCallUI />
  </Suspense>
)}
```

### 2. Virtual Scrolling

```typescript
// web/src/components/MessageList.tsx
import { FixedSizeList } from 'react-window';

export const MessageList: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <MessageBubble message={messages[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={messages.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
};
```

**Benefit**: Renders only visible messages, reducing DOM nodes from 1000+ to ~10

### 3. Memoization

```typescript
// Memoize expensive computations
const MessageBubble: React.FC<{ message: Message }> = memo(({ message }) => {
  const decryptedContent = useMemo(
    () => decryptMessage(message.content, sessionKey),
    [message.content, sessionKey]
  );
  
  return <div>{decryptedContent}</div>;
}, (prev, next) => prev.message.id === next.message.id);

// Memoize callbacks
const handleSend = useCallback((text: string) => {
  sendMessage(text);
}, [sendMessage]);
```

### 4. Web Workers

```typescript
// web/src/workers/crypto.worker.ts
self.onmessage = async (e) => {
  const { type, data } = e.data;
  
  switch (type) {
    case 'encrypt':
      const encrypted = await encryptMessage(data.plaintext, data.key);
      self.postMessage({ type: 'encrypted', data: encrypted });
      break;
      
    case 'decrypt':
      const decrypted = await decryptMessage(data.ciphertext, data.key);
      self.postMessage({ type: 'decrypted', data: decrypted });
      break;
  }
};

// Usage
const cryptoWorker = new Worker(new URL('./workers/crypto.worker.ts', import.meta.url));

cryptoWorker.postMessage({
  type: 'encrypt',
  data: { plaintext: message, key: sessionKey }
});

cryptoWorker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'encrypted') {
    sendEncryptedMessage(data);
  }
};
```

**Benefit**: Offloads heavy crypto operations from main thread

### 5. Image Optimization

```typescript
// Lazy load images
<img 
  src={thumbnail} 
  data-src={fullImage}
  loading="lazy"
  onLoad={handleImageLoad}
/>

// Use WebP with fallback
<picture>
  <source srcSet={imageWebp} type="image/webp" />
  <source srcSet={imageJpeg} type="image/jpeg" />
  <img src={imageJpeg} alt="Attachment" />
</picture>

// Compress images before upload
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  // Resize to max 1920x1080
  const maxWidth = 1920;
  const maxHeight = 1080;
  let width = bitmap.width;
  let height = bitmap.height;
  
  if (width > maxWidth) {
    height *= maxWidth / width;
    width = maxWidth;
  }
  if (height > maxHeight) {
    width *= maxHeight / height;
    height = maxHeight;
  }
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(bitmap, 0, 0, width, height);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/webp', 0.85);
  });
}
```

### 6. Bundle Optimization

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'crypto-vendor': ['@noble/curves', '@noble/ciphers', '@noble/hashes'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
});
```

### 7. IndexedDB Optimization

```typescript
// Batch database operations
async function batchInsertMessages(messages: Message[]): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('messages', 'readwrite');
  
  // Insert all messages in one transaction
  await Promise.all(
    messages.map(message => tx.store.add(message))
  );
  
  await tx.done;
}

// Use indexes for faster queries
const messageStore = objectStore('messages', {
  indexes: [
    { name: 'conversationId', keyPath: 'conversationId' },
    { name: 'timestamp', keyPath: 'timestamp' },
    { name: 'senderId', keyPath: 'senderId' },
  ],
});

// Query using indexes
const recentMessages = await db
  .transaction('messages')
  .store
  .index('timestamp')
  .getAll(IDBKeyRange.upperBound(Date.now()), 50);
```

## Mobile Application Optimizations

### Android Optimizations

#### 1. RecyclerView with DiffUtil

```kotlin
class MessageAdapter : ListAdapter<Message, MessageViewHolder>(MessageDiffCallback()) {
    class MessageDiffCallback : DiffUtil.ItemCallback<Message>() {
        override fun areItemsTheSame(oldItem: Message, newItem: Message) =
            oldItem.id == newItem.id
            
        override fun areContentsTheSame(oldItem: Message, newItem: Message) =
            oldItem == newItem
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        // Use ViewBinding for better performance
        val binding = ItemMessageBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return MessageViewHolder(binding)
    }
}
```

**Benefit**: Only updates changed items, reduces layout inflation

#### 2. Image Loading with Coil

```kotlin
dependencies {
    implementation("io.coil-kt:coil-compose:2.4.0")
}

@Composable
fun MessageImage(url: String) {
    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(url)
            .crossfade(true)
            .size(Size.ORIGINAL)
            .transformations(
                RoundedCornersTransformation(8.dp.toPx())
            )
            .build(),
        contentDescription = "Message attachment"
    )
}
```

#### 3. Database Optimization

```kotlin
@Database(
    entities = [Message::class, Contact::class, Conversation::class],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun messageDao(): MessageDao
    abstract fun contactDao(): ContactDao
    abstract fun conversationDao(): ConversationDao
    
    companion object {
        @Volatile
        private var instance: AppDatabase? = null
        
        fun getInstance(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "sc-database"
                )
                .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                .build()
                .also { instance = it }
            }
        }
    }
}

// Use pagination for large queries
@Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY timestamp DESC")
fun getMessagesPaged(conversationId: String): PagingSource<Int, Message>
```

#### 4. ProGuard/R8 Optimization

```proguard
# app/proguard-rules.pro

# Keep crypto library methods
-keep class com.noble.** { *; }

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Optimize code
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
```

### iOS Optimizations

#### 1. List Optimization with LazyVStack

```swift
struct MessageListView: View {
    let messages: [Message]
    
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(messages) { message in
                    MessageBubbleView(message: message)
                        .id(message.id)
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }
}
```

#### 2. Image Caching

```swift
class ImageCacheManager {
    static let shared = ImageCacheManager()
    
    private let memoryCache = NSCache<NSString, UIImage>()
    private let fileManager = FileManager.default
    
    private var cacheDirectory: URL {
        fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("images")
    }
    
    init() {
        memoryCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
    
    func getImage(for key: String) async -> UIImage? {
        // Check memory cache
        if let cached = memoryCache.object(forKey: key as NSString) {
            return cached
        }
        
        // Check disk cache
        let fileURL = cacheDirectory.appendingPathComponent(key)
        if let data = try? Data(contentsOf: fileURL),
           let image = UIImage(data: data) {
            memoryCache.setObject(image, forKey: key as NSString)
            return image
        }
        
        return nil
    }
    
    func setImage(_ image: UIImage, for key: String) async {
        memoryCache.setObject(image, forKey: key as NSString)
        
        let fileURL = cacheDirectory.appendingPathComponent(key)
        if let data = image.jpegData(compressionQuality: 0.8) {
            try? data.write(to: fileURL)
        }
    }
}
```

#### 3. Core Data Optimization

```swift
// Use NSFetchedResultsController for table views
class MessageListViewModel: NSObject {
    private lazy var fetchedResultsController: NSFetchedResultsController<MessageEntity> = {
        let request: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]
        request.predicate = NSPredicate(format: "conversationId == %@", conversationId)
        request.fetchBatchSize = 20
        
        let controller = NSFetchedResultsController(
            fetchRequest: request,
            managedObjectContext: context,
            sectionNameKeyPath: nil,
            cacheName: nil
        )
        controller.delegate = self
        return controller
    }()
}
```

## Core Library Optimizations

### 1. Object Pooling

```typescript
// Reuse Uint8Array buffers
class BufferPool {
  private pools: Map<number, Uint8Array[]> = new Map();
  private maxPoolSize = 100;
  
  acquire(size: number): Uint8Array {
    const pool = this.pools.get(size) || [];
    return pool.pop() || new Uint8Array(size);
  }
  
  release(buffer: Uint8Array): void {
    const size = buffer.length;
    const pool = this.pools.get(size) || [];
    
    if (pool.length < this.maxPoolSize) {
      buffer.fill(0); // Clear data
      pool.push(buffer);
      this.pools.set(size, pool);
    }
  }
}

const bufferPool = new BufferPool();

// Usage
const buffer = bufferPool.acquire(1024);
try {
  // Use buffer
} finally {
  bufferPool.release(buffer);
}
```

### 2. LRU Cache

```typescript
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// Message deduplication cache
const messageCache = new LRUCache<string, boolean>(10000);
```

### 3. Batch Processing

```typescript
class MessageBatcher {
  private queue: Message[] = [];
  private batchSize = 10;
  private flushInterval = 100; // ms
  private timer: number | null = null;
  
  add(message: Message): void {
    this.queue.push(message);
    
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => this.flush(), this.flushInterval);
    }
  }
  
  private flush(): void {
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.batchSize);
    this.processBatch(batch);
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  
  private processBatch(messages: Message[]): void {
    // Process messages in batch
    messages.forEach(message => this.processMessage(message));
  }
}
```

## Network Optimizations

### 1. Connection Pooling

```typescript
class ConnectionPool {
  private connections: Map<string, WebRTCPeer> = new Map();
  private maxConnections = 100;
  
  getOrCreate(peerId: string): WebRTCPeer {
    let peer = this.connections.get(peerId);
    
    if (!peer) {
      // Check pool size
      if (this.connections.size >= this.maxConnections) {
        // Remove oldest idle connection
        const [oldestId, oldestPeer] = Array.from(this.connections.entries())
          .sort(([, a], [, b]) => a.lastActivity - b.lastActivity)[0];
        oldestPeer.close();
        this.connections.delete(oldestId);
      }
      
      peer = new WebRTCPeer(peerId);
      this.connections.set(peerId, peer);
    }
    
    peer.lastActivity = Date.now();
    return peer;
  }
}
```

### 2. Message Compression

```typescript
// Compress large messages before sending
async function compressMessage(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 1024) return data; // Don't compress small messages
  
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}
```

## Monitoring & Profiling

### Performance Budget

```typescript
// web/vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Warn if chunk exceeds size
        chunkFileNames: (chunkInfo) => {
          const size = chunkInfo.modules
            ? Object.values(chunkInfo.modules).reduce(
                (acc, module) => acc + (module.code?.length || 0),
                0
              )
            : 0;
          
          if (size > 100000) {
            console.warn(`Chunk ${chunkInfo.name} is large: ${size} bytes`);
          }
          
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
```

### Runtime Performance Monitoring

```typescript
// Monitor and log slow operations
function measurePerformance<T>(
  fn: () => T,
  label: string,
  threshold: number = 16.67 // 60fps = 16.67ms per frame
): T {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  
  if (duration > threshold) {
    console.warn(`Slow operation: ${label} took ${duration.toFixed(2)}ms`);
  }
  
  return result;
}

// Usage
const result = measurePerformance(
  () => decryptMessage(ciphertext, key),
  'decrypt message'
);
```

## Checklist

- [ ] Implement code splitting for all routes
- [ ] Add virtual scrolling for long lists
- [ ] Use Web Workers for crypto operations
- [ ] Optimize images (lazy loading, compression, WebP)
- [ ] Enable tree shaking and minification
- [ ] Add service worker for caching
- [ ] Use IndexedDB indexes for queries
- [ ] Implement connection pooling
- [ ] Add message batching
- [ ] Set up performance monitoring
- [ ] Configure performance budgets
- [ ] Profile with DevTools/Xcode Instruments
- [ ] Test on low-end devices
- [ ] Measure and optimize bundle size
- [ ] Optimize database queries

## Resources

- [Web Vitals](https://web.dev/vitals/)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Android Performance](https://developer.android.com/topic/performance)
- [iOS Performance](https://developer.apple.com/documentation/xcode/improving-your-app-s-performance)

---

*Last Updated: 2024-11-15*
