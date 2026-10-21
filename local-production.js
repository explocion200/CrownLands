(function prepareLocalProduction(root) {
  "use strict";
  const config = root.CROWNLANDS_LOCAL_BACKEND;
  if (root.location.origin !== "https://playcrownlands.com"
    || !["/play/", "/play/index.html", "/index.html"].includes(root.location.pathname)
    || !config || config.mode !== "production" || config.protocol !== 1
    || !/^[a-f0-9]{32}$/.test(config.epoch || "")
    || !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey || "")) throw Error("Local game configuration is unavailable.");
  // Keep pre-transfer device saves and pending operations intact, but never
  // upload them into the new authority. This namespace survives static updates.
  const prefix = "crownlands-local-" + config.epoch + ":";
  for (const name of ["localStorage", "sessionStorage"]) {
    const original = root[name];
    const keys = () => Array.from({ length: original.length }, (_, index) => original.key(index)).filter(key => key?.startsWith(prefix));
    Object.defineProperty(root, name, { configurable: false, value: Object.freeze({
      get length() { return keys().length; }, key: index => keys()[index]?.slice(prefix.length) ?? null,
      getItem: key => original.getItem(prefix + key), setItem: (key, value) => original.setItem(prefix + key, value),
      removeItem: key => original.removeItem(prefix + key), clear: () => keys().forEach(key => original.removeItem(key)),
    }) });
  }
  Object.defineProperty(root, "CROWNLANDS_LOCAL_BACKEND", { configurable: false, writable: false,
    value: Object.freeze({ ...config, ready: true }) });
  const world = root.document.createElement("script"); world.src = "/world/bootstrap.js?v=continuous-v1"; world.async = true;
  root.document.head.append(world);
})(window);
