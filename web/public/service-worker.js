// Service Worker for Sovereign Communications PWA
const CACHE_NAME = 'sovereign-comm-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if found
      if (response) {
        return response;
      }

      // Clone the request
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest).then((response) => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Cache the fetched response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Return offline page if fetch fails
        return caches.match('/index.html');
      });
    })
  );
});

// Background sync for offline messages
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered');
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  try {
    // Get offline messages from IndexedDB
    const db = await openDatabase();
    const messages = await getPendingMessages(db);
    
    // Send each message
    for (const message of messages) {
      try {
        // Attempt to send message
        await sendMessage(message);
        // Mark as sent
        await markMessageAsSent(db, message.id);
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sovereign-communications', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPendingMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offline-queue'], 'readonly');
    const store = transaction.objectStore('offline-queue');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function markMessageAsSent(db, messageId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offline-queue'], 'readwrite');
    const store = transaction.objectStore('offline-queue');
    const request = store.delete(messageId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function sendMessage(message) {
  // This would interact with the mesh network
  // For now, just a placeholder
  console.log('Sending message:', message);
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'New Message';
  const options = {
    body: data.body || 'You have a new message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});
