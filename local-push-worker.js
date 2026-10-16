"use strict";
// Notification-only worker, scoped to the private game. It intercepts no fetch
// requests, imports no SDK, and never controls or opens the live /play/ game.
const PRIVATE_GAME = "https://playcrownlands.com/api/local-game/rehearsal/";
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    if (self.registration.scope !== PRIVATE_GAME) return;
    let payload; try { payload = event.data?.json(); } catch { return; }
    if (!payload?.data || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return;
    const data = payload.data;
    if (data.type !== "incoming_army" || !["attack", "scout", "reinforce"].includes(data.kind)) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(PRIVATE_GAME)) client.postMessage({ type: "CROWNLANDS_LOCAL_PUSH", payload });
    }
    await self.registration.showNotification(String(data.title || "Crownlands private test").slice(0, 80), {
      body: String(data.body || "A new army is marching.").slice(0, 180),
      tag: "crownlands-private-" + String(data.armyId || "incoming").slice(0, 96),
      renotify: false, requireInteraction: data.kind === "attack",
      icon: PRIVATE_GAME + "assets/optimized/report-reports-ink-384x384-05cfed23ee0e.webp",
      badge: PRIVATE_GAME + "assets/icons/crownlands-icon-192.png",
      data: { ...data, url: PRIVATE_GAME, expiresAt: payload.expiresAt },
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    if (self.registration.scope !== PRIVATE_GAME || !(event.notification.data?.expiresAt > Date.now())) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const game = windows.find(client => client.url.startsWith(PRIVATE_GAME));
    if (game) { await game.focus(); game.postMessage({ type: "CROWNLANDS_NOTIFICATION_CLICK", notification: event.notification.data }); }
    else {
      const target = new URL(PRIVATE_GAME), data = event.notification.data;
      if (data.type === "incoming_army" && data.cityId) {
        target.searchParams.set("notification", "incoming_army");
        target.searchParams.set("notificationCity", String(data.cityId).slice(0, 96));
        if (data.targetRegionId) target.searchParams.set("notificationRegion", String(data.targetRegionId).slice(0, 80));
      }
      await self.clients.openWindow(target.href);
    }
  })());
});
