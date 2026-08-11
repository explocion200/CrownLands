const CACHE_VERSION = "20260810-daily-mission-camp-fix-v1";
const CACHE_NAME = `crownlands-cache-${CACHE_VERSION}`;
const APP_BASE_URL = new URL("./", self.location.href);

function resolveAppUrl(path = "") {
  const value = String(path || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value.replace(/^\/+/, ""), APP_BASE_URL).href;
}

const STATIC_CACHE_URLS = [
  "/index.html",
  "/manifest.webmanifest",
  "/styles.css?v=20260810-daily-mission-camp-fix-v1",
  "/release-config.js",
  "/patch-notes.js?v=20260807-login-resilience-v1",
  "/world-config.js",
  "/economy-config.js?v=20260805-linear-walls-v1",
  "/common-gear.js?v=20260811-common-gear-v1",
  "/functions/clanQuestPeriod.js?v=20260729-weekly-clan-quests-v2",
  "/firebaseClient.js?v=20260810-daily-mission-camp-fix-v1",
  "/audio-manager.js?v=20260729-starter-sound-pack-v1",
  "/animation-manager.js?v=20260810-daily-mission-camp-fix-v1",
  "/instant-economy-actions.js?v=20260810-instant-economy-actions-v1",
  "/game.js?v=20260810-daily-mission-camp-fix-v1",
  "/route-worker.js?v=20260721-structure-route-clearance",
  "/assets/map-editor-data.js?v=20260723-utc-responsive-v1",
  "/assets/optimized/login-background-1448x1086-cec197d384ba.webp",
  "/assets/optimized/loading-ring-256x256-d14e6c09f495.webp",
  "/assets/optimized/loading-crown-256x256-9eab5c3ca27d.webp"
];

const IMAGE_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0b111d"/></svg>`;

try {
  self.window = self;
  importScripts(resolveAppUrl("firebase-config.js"));
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
      const tag = data.armyId
        ? `crownlands-${data.armyId}`
        : "crownlands-incoming-army";

      self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        requireInteraction: data.kind === "attack",
        icon: resolveAppUrl("assets/optimized/hud-report-192x192-c712b2f6c417.webp"),
        badge: resolveAppUrl("assets/optimized/hud-report-192x192-c712b2f6c417.webp"),
        data: {
          ...data,
          url: resolveAppUrl(data.url || ""),
        },
      });
    });
  }
} catch (error) {
  console.warn("[Crownlands] Firebase messaging worker setup skipped.", error);
}

function isCacheableResponse(response) {
  return Boolean(
    response
    && response.status === 200
    && (response.type === "basic" || response.type === "default")
  );
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
      || url.pathname.startsWith("/audio/")
      || /\.(?:css|js|json|webmanifest|ogg|wav|mp3|png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)
    )
  );
}

function isAudioMediaRequest(url) {
  return (
    url.origin === self.location.origin
    && url.pathname.startsWith("/audio/")
    && /\.(?:mp3|ogg|wav)$/i.test(url.pathname)
  );
}

function isWorldMapImageRequest(url) {
  return (
    url.origin === self.location.origin
    && (
      url.pathname.includes("/assets/worlds/")
      || /\/assets\/(?:center|north|south|east|west)-island\.webp$/i.test(url.pathname)
    )
    && !url.pathname.includes("/thumbnails/")
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
  if (!isCacheableResponse(response)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return true;
  } catch (error) {
    console.warn("[Crownlands] Static cache write skipped.", error);
    return false;
  }
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
  const requests = STATIC_CACHE_URLS.map(url => new Request(resolveAppUrl(url), { cache: "reload" }));
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
  if (request.headers.has("range")) return;
  const url = new URL(request.url);

  if (isApiOrServerRequest(url)) return;
  if (isAudioMediaRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, resolveAppUrl("index.html")));
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
        // A decoded 64x64 placeholder looks like a successfully loaded world map
        // to the client. Surface map failures so the previous island stays visible
        // and the normal retry state can take over.
        if (isWorldMapImageRequest(url)) return Response.error();
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
  const notificationData = event.notification?.data || {};
  event.notification.close();
  const url = resolveAppUrl(notificationData.url || "");
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
      sameOriginClient.postMessage({
        type: "CROWNLANDS_NOTIFICATION_CLICK",
        notification: notificationData,
      });
      return;
    }
    await clients.openWindow(url);
  })());
});
