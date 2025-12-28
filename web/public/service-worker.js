// Service Worker for Sovereign Communications PWA
const CACHE_NAME = "sovereign-comm-v2";
const ASSETS_TO_CACHE = ["/", "/index.html", "/manifest.json", "/join.html"];

// Store for active invite shares
let activeInvite = null;

// Install event - cache assets
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...", { cache: CACHE_NAME, assets: ASSETS_TO_CACHE });
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching assets", ASSETS_TO_CACHE);
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        return self.skipWaiting();
      }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("Service Worker: Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        return self.clients.claim();
      }),
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignore unsupported schemes (like chrome-extension://)
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Helpful debug: log navigation requests and asset fetches that might fail
  try {
    if (event.request.mode === "navigate") {
      console.log("Service Worker: Navigation fetch for:", url.pathname);
    } else {
      // Limit verbosity: only log failed asset fetches via catch below
    }
  } catch (e) {
    console.warn("Service Worker: Error while logging fetch request", e);
  }

  // Handle /join route with invite data
  if (url.pathname === "/join" && activeInvite) {
    event.respondWith(
      caches.match("/join.html").then((response) => {
        if (response) {
          return response
            .clone()
            .text()
            .then((body) => {
              // Inject invite data into the page
              const modifiedBody = body
                .replace(
                  "const inviteCode = params.get('invite') || hash;",
                  `const inviteCode = '${activeInvite.code}';`,
                )
                .replace(
                  "const inviterName = params.get('inviter') || sessionStorage.getItem('inviterName');",
                  `const inviterName = '${activeInvite.inviterName || "A friend"}';`,
                );

              return new Response(modifiedBody, {
                headers: {
                  "Content-Type": "text/html",
                },
              });
            });
        }
        return fetch("/join.html");
      }),
    );
    return;
  }

  // STRATEGY: Network First for HTML (Navigation), Cache First for Assets
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          // Update cache with new version
          try {
            const responseToCache = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, responseToCache);
            console.log("Service Worker: Cached navigation response for", event.request.url);
          } catch (cacheErr) {
            console.warn("Service Worker: Failed to cache navigation response", cacheErr);
          }
          return response;
        } catch (fetchErr) {
          console.warn("Service Worker: Network navigation fetch failed, attempting cache", fetchErr);
          try {
            const cached = await caches.match(event.request);
            return cached || (await caches.match("/index.html"));
          } catch (cacheErr) {
            console.error("Service Worker: Both network and cache failed for navigation", cacheErr);
            throw cacheErr;
          }
        }
      })(),
    );
  } else {
    // Cache First for everything else (JS, CSS, Images)
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        try {
          const fetchRequest = event.request.clone();
          const response = await fetch(fetchRequest);
          if (!response || response.status !== 200) return response;
          try {
            if (event.request.method === "GET") {
              const cache = await caches.open(CACHE_NAME);
              cache.put(event.request, response.clone());
              console.log("Service Worker: Cached resource", event.request.url);
            }
          } catch (cachePutErr) {
            console.warn("Service Worker: Failed to cache fetched resource", cachePutErr);
          }
          return response;
        } catch (err) {
          console.warn("Service Worker: Fetch failed for resource, returning fallback index.html", event.request.url, err);
          return caches.match("/index.html");
        }
      })(),
    );
  }
});

// Global error handlers inside the Service Worker to surface unexpected failures
self.addEventListener('error', (e) => {
  console.error('Service Worker: Global error event', e.filename, e.lineno, e.colno, e.message, e.error);
});

self.addEventListener('unhandledrejection', (e) => {
  console.error('Service Worker: Unhandled promise rejection', e.reason);
});

// Background sync for offline messages
self.addEventListener("sync", (event) => {
  console.log("Service Worker: Background sync triggered");
  if (event.tag === "sync-messages") {
    event.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  try {
    // Get offline messages from IndexedDB
    const db = await openDatabase();
    const messages = await getPendingMessages(db);

    if (messages.length === 0) return;

    console.log(
      `Service Worker: Found ${messages.length} pending messages to sync`,
    );

    // Notify all open clients to process the queue
    const clients = await self.clients.matchAll({ type: "window" });
    if (clients && clients.length > 0) {
      for (const client of clients) {
        client.postMessage({
          type: "SYNC_OFFLINE_MESSAGES",
          count: messages.length,
        });
      }
    } else {
      // No clients open. In a real P2P mesh, we can't do much without a running window
      // unless we have a relay to POST to.
      // For Phase 2, we'll just log this limitation.
      console.log(
        "Service Worker: No active clients to handle sync. Messages remain queued.",
      );
    }
  } catch (error) {
    console.error("Background sync failed:", error);
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    // Use version 4 to match the application schema
    const request = indexedDB.open("sovereign-communications", 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // We don't handle upgrades here; the main app does that.
    // If the DB doesn't exist or is old, this might fail or open an old version,
    // but the main app is responsible for migration.
  });
}

function getPendingMessages(db) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(["offline-queue"], "readonly");
      const store = transaction.objectStore("offline-queue");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      // Store might not exist if migration hasn't run
      resolve([]);
    }
  });
}

// Message handler for registering invite shares and other events
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "REGISTER_INVITE") {
    console.log("Service Worker: Registering invite share");
    activeInvite = event.data.invite;
  } else if (event.data && event.data.type === "UNREGISTER_INVITE") {
    console.log("Service Worker: Unregistering invite share");
    activeInvite = null;
  } else if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push notification received");

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.warn("Push data is not JSON");
    }
  }

  const title = data.title || "New Message";
  let body = data.body || "You have a new message";
  let url = data.url || "/";
  let icon = "/icon-192.png";

  // Handle specific notification types
  if (data.type === "peer_connection") {
    body = `New peer connected: ${data.name || "Unknown"}`;
    url = `/?peer=${data.peerId}`;
  } else if (data.type === "message") {
    body = `${data.senderName || "Someone"}: ${data.content || "Sent a message"}`;
    url = `/?conversation=${data.conversationId}`;
  }

  const options = {
    body: body,
    icon: icon,
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: {
      url: url,
    },
    actions: [
      { action: "open", title: "Open" },
      { action: "close", title: "Dismiss" },
    ],
    tag: data.tag || "general",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener("notificationclick", (event) => {
  console.log("Service Worker: Notification clicked");
  event.notification.close();

  if (event.action === "open" || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((windowClients) => {
        // Check if there is already a window for this URL
        for (let client of windowClients) {
          if (client.url === event.notification.data.url && "focus" in client) {
            return client.focus();
          }
        }
        // If not, open a new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      }),
    );
  }
});
