(function localWebPush(root) {
  "use strict";
  const BASE = "/api/local-game/rehearsal/", WORKER = "local-push-worker.js";
  function configuration() {
    const config = root.CROWNLANDS_LOCAL_PUSH;
    if (root.location.origin !== "https://playcrownlands.com" || !root.location.pathname.startsWith(BASE)
      || root.CROWNLANDS_LOCAL_BACKEND?.mode !== "rehearsal" || !config
      || !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey || "") || !Number.isFinite(Date.parse(config.expiresAt))
      || Date.parse(config.expiresAt) <= Date.now()) return null;
    return config;
  }
  function create() {
    let registration;
    const listeners = new Set(), workerUrl = root.location.origin + BASE + WORKER;
    const fail = () => { throw Error("Private browser notifications are unavailable."); };
    const message = event => {
      if (!configuration() || event.source?.scriptURL !== workerUrl || event.data?.type !== "CROWNLANDS_LOCAL_PUSH") return;
      for (const listener of listeners) listener(event.data.payload);
    };
    root.navigator?.serviceWorker?.addEventListener("message", message);
    async function register() {
      if (!configuration()) fail();
      registration = await root.navigator.serviceWorker.register(workerUrl, { scope: BASE, updateViaCache: "none" });
      if (registration.scope !== root.location.origin + BASE) fail();
      if (!registration.active) await new Promise((resolve, reject) => {
        const worker = registration.installing || registration.waiting;
        if (!worker) { reject(Error("Private notification worker is unavailable.")); return; }
        const timer = root.setTimeout(() => { worker.removeEventListener("statechange", check); reject(Error("Private notification worker did not start.")); }, 10000);
        function check() {
          if (["activated", "redundant"].includes(worker.state)) {
            root.clearTimeout(timer); worker.removeEventListener("statechange", check);
            if (worker.state === "activated") resolve(); else reject(Error("Private notification worker did not start."));
          }
        }
        worker.addEventListener("statechange", check); check();
      });
      if (!configuration() || registration.active?.scriptURL !== workerUrl) fail();
      return registration;
    }
    return {
      isSupported: async () => Boolean(configuration() && root.isSecureContext && root.Notification && root.PushManager && root.navigator?.serviceWorker),
      getMessaging: () => ({}), getServiceWorkerRegistration: register,
      getToken: async (_messaging, options) => {
        const config = configuration();
        if (!config || options.vapidKey !== config.publicKey || root.Notification.permission !== "granted") fail();
        const selected = options.serviceWorkerRegistration;
        if (selected !== registration || selected.scope !== root.location.origin + BASE || selected.active?.scriptURL !== workerUrl) fail();
        const key = Uint8Array.from(root.atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));
        let subscription = await selected.pushManager.getSubscription();
        if (subscription && String(new Uint8Array(subscription.options.applicationServerKey || [])) !== String(key)) {
          if (!await subscription.unsubscribe()) fail(); subscription = null;
        }
        if (!configuration()) fail();
        if (!subscription) subscription = await selected.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        if (!configuration()) { await subscription.unsubscribe(); fail(); }
        const json = subscription.toJSON();
        const token = "clwp1." + root.btoa(JSON.stringify([json.endpoint, json.keys?.p256dh, json.keys?.auth, config.publicKey]))
          .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (token.length > 2048) { await subscription.unsubscribe(); fail(); }
        return token;
      },
      deleteToken: async () => {
        const selected = registration || await root.navigator.serviceWorker.getRegistration(BASE);
        if (!selected || selected.scope !== root.location.origin + BASE || selected.active?.scriptURL !== workerUrl) return true;
        const subscription = await selected.pushManager.getSubscription();
        if (subscription && !await subscription.unsubscribe()) fail();
        return true;
      },
      onMessage: (_messaging, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      dispose: () => { listeners.clear(); root.navigator?.serviceWorker?.removeEventListener("message", message); },
    };
  }
  root.CrownlandsLocalPush = { configuration, create };
})(typeof window !== "undefined" ? window : globalThis);
