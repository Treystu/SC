// Service Worker for Sovereign Communications PWA
const CACHE_NAME = "sovereign-comm-v2";
const ASSETS_TO_CACHE = ["/", "/index.html", "/manifest.json", "/join.html"];

// Store for active invite shares
let activeInvite = null;

// Install event - cache assets
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching assets");
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
      fetch(event.request)
        .then((response) => {
          // Update cache with new version
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(event.request).then((response) => {
            return response || caches.match("/index.html");
          });
        }),
    );
  } else {
    // Cache First for everything else (JS, CSS, Images)
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest)
          .then((response) => {
            // Check if valid response
            if (
              !response ||
              response.status !== 200 ||
              response.type !== "basic"
            ) {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the fetched response if it's a GET request
            if (event.request.method === "GET") {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }

            return response;
          })
          .catch(() => {
            // Return offline page if fetch fails
            return caches.match("/index.html");
          });
      }),
    );
  }
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
