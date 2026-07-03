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
