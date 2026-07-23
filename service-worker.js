const CACHE_VERSION = "20260723-economy-v1";
const CACHE_NAME = `crownlands-cache-${CACHE_VERSION}`;
const STATIC_CACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/styles.css?v=20260723-utc-responsive-v1",
  "/world-config.js",
  "/firebase-config.js?v=20260703-vapid-key",
  "/firebaseClient.js?v=20260723-utc-responsive-v1",
  "/game.js?v=20260723-economy-v1",
  "/route-worker.js?v=20260721-structure-route-clearance",
  "/assets/map-editor-data.js?v=20260723-utc-responsive-v1",
  "/assets/game-menu-background.jpg?v=20260702-login-page",
  "/assets/loading-ring.png",
  "/assets/loading-crown.png",
  "/assets/royal-tax-decree-icon.webp?v=20260721-tax-decree",
  "/assets/icons/crownlands-icon-192.png",
  "/assets/icons/crownlands-icon-512.png",
  "/assets/icons/crownlands-maskable-192.png",
  "/assets/icons/crownlands-maskable-512.png"
];

const IMAGE_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0b111d"/></svg>`;

try {
  self.window = self;
  importScripts("/firebase-config.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

  const config = self.CROWNLANDS_FIREBASE_CONFIG || {};

  if (config.apiKey && config.projectId && self.firebase?.apps?.length === 0) {
    firebase.initializeApp(config);
  }

  if (self.firebase?.messaging) {
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(payload => {
      const data = payload?.data || {};
      const notification = payload?.notification || {};
      const title = notification.title || data.title || "Crownlands alert";
      const body = notification.body || data.body || "A new army is marching.";
      const tag = data.armyId ? `crownlands-${data.armyId}` : "crownlands-incoming-army";

      self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        requireInteraction: data.kind === "attack",
        icon: "/assets/report-icon.png",
        badge: "/assets/report-icon.png",
        data: {
          url: data.url || "/",
          ...data,
        },
      });
    });
  }
} catch (error) {
  console.warn("[Crownlands] Firebase messaging worker setup skipped.", error);
}

function isCacheableResponse(response) {
  return Boolean(response && response.ok && (response.type === "basic" || response.type === "default"));
}

function isApiOrServerRequest(url) {
  return (
    url.origin !== self.location.origin
    || url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/.netlify/functions/")
    || url.pathname.startsWith("/__/")
    || url.pathname.includes("/google.firestore.")
    || url.pathname.includes("/identitytoolkit/")
  );
}

function isStaticAssetRequest(url) {
  return (
    url.origin === self.location.origin
    && (
      url.pathname.startsWith("/assets/")
      || /\.(?:css|js|json|webmanifest|png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)
    )
  );
}

function isNetworkFirstAsset(url) {
  return (
    url.pathname === "/"
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith(".js")
    || url.pathname.endsWith(".css")
    || url.pathname.endsWith(".json")
    || url.pathname.endsWith(".webmanifest")
  );
}

async function putInCache(request, response) {
  if (!isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putInCache(request, response);
  return response;
}

async function networkFirst(request, fallbackUrl = "/index.html") {
  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = fallbackUrl ? await caches.match(fallbackUrl) : null;
    if (fallback) return fallback;
    throw error;
  }
}

async function precacheStaticAssets() {
  const cache = await caches.open(CACHE_NAME);
  const requests = STATIC_CACHE_URLS.map(url => new Request(url, { cache: "reload" }));
  await Promise.allSettled(requests.map(async request => {
    const response = await fetch(request);
    if (isCacheableResponse(response)) await cache.put(request, response);
  }));
}

self.addEventListener("install", event => {
  event.waitUntil(precacheStaticAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("crownlands-cache-") && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
    const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windowClients.forEach(client => client.postMessage({
      type: "CROWNLANDS_UPDATE_READY",
      buildId: CACHE_VERSION,
    }));
  })());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isApiOrServerRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  if (!isStaticAssetRequest(url)) return;

  if (isNetworkFirstAsset(url)) {
    event.respondWith(networkFirst(request, null));
    return;
  }

  event.respondWith(
    cacheFirst(request).catch(() => {
      if (request.destination === "image") {
        return new Response(IMAGE_FALLBACK_SVG, {
          headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
        });
      }
      return Response.error();
    })
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOriginClient = windowClients.find(client => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch (_error) {
        return false;
      }
    });
    if (sameOriginClient) {
      await sameOriginClient.focus();
      return;
    }
    await clients.openWindow(url);
  })());
});
