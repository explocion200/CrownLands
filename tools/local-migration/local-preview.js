(function privateGamePreview() {
  "use strict";
  if (location.origin !== "https://playcrownlands.com" || !location.pathname.startsWith("/api/local-game/rehearsal/")) throw Error("Private game preview path required");
  // A private copy must never overwrite the live game's device saves,
  // installation ID, active-session ID or pending operation receipts.
  const prefix = "crownlands-private-rehearsal:";
  for (const name of ["localStorage", "sessionStorage"]) {
    const original = window[name];
    const keys = () => Array.from({ length: original.length }, (_, index) => original.key(index)).filter(key => key.startsWith(prefix));
    const scoped = Object.freeze({
      get length() { return keys().length; }, key: index => keys()[index]?.slice(prefix.length) ?? null,
      getItem: key => original.getItem(prefix + key), setItem: (key, value) => original.setItem(prefix + key, value),
      removeItem: key => original.removeItem(prefix + key), clear: () => keys().forEach(key => original.removeItem(key)),
    });
    Object.defineProperty(window, name, { value: scoped, configurable: false });
  }
  Object.defineProperty(window, "CROWNLANDS_LOCAL_BACKEND", { value: Object.freeze({ mode: "rehearsal" }) });
  addEventListener("DOMContentLoaded", () => {
    const notice = document.createElement("div");
    notice.id = "privateRehearsalNotice"; notice.setAttribute("role", "status");
    notice.textContent = "Private test — changes here do not affect the live game";
    Object.assign(notice.style, { position: "fixed", bottom: "0", left: "0", right: "0", padding: "4px 8px", font: "12px system-ui", textAlign: "center", background: "#482b13", color: "#fff5da", zIndex: "2147483647", pointerEvents: "none" });
    document.body.append(notice);
  });
})();
