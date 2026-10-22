(function (root) {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const time = ms => `${Math.max(0, Math.ceil(ms / 60000))}m`;
  // No private snapshots persist in localStorage, public clan state or chat caches.
  function mount(host, options) {
    const identity = options.identity(), operations = new Map();
    let alive = true, busy = false, board = null, detail = null, error = "", sequence = 0, offset = 0;
    const current = () => alive && host.isConnected && identity === options.identity();
    const now = () => Date.now() + offset;
    function clear(message) { board = detail = null; error = message; render(); }
    function render() {
      if (!alive) return;
      if (!current()) { clearAccess(); return; }
      const entries = (board?.entries || []).filter(e => e.expiresAtMs > now());
      if (detail && !entries.some(e => e.key === detail.key && e.scoutedAtMs === detail.scoutedAtMs)) detail = null;
      host.innerHTML = `<div class="intel-toolbar"><strong>${board ? `${entries.length} / ${board.capacity} reports` : "Clan intelligence"}</strong><button type="button" data-intel-refresh ${busy ? "disabled" : ""}>${busy ? "Loading…" : "Refresh"}</button></div><p class="rules-note">Private clan snapshots. Intelligence expires ten minutes after the original scout.</p>${error ? `<p role="status">${esc(error)}</p>` : ""}${detail ? `<button type="button" data-intel-back>← All intelligence</button><h3>${esc(detail.targetName)}</h3><p>Scouted by ${esc(detail.scoutName)} · ${esc(new Date(detail.scoutedAtMs).toLocaleTimeString())} · expires in <span data-intel-expiry="${detail.expiresAtMs}">${time(detail.expiresAtMs - now())}</span></p>${options.renderSnapshot(detail)}${actions(detail)}` : entries.map(entry => `<article class="intel-entry"><div><button type="button" class="intel-target" data-intel-detail="${entry.key}">${esc(entry.targetName)}</button><small>${esc(entry.location.targetType)} · ${esc(entry.scoutName)} · ${esc(new Date(entry.scoutedAtMs).toLocaleTimeString())}</small><span>${entry.troops == null ? "Troops not recorded" : `${Number(entry.troops).toLocaleString()} troops observed`} · <span data-intel-expiry="${entry.expiresAtMs}">${time(entry.expiresAtMs - now())}</span> left</span></div>${actions(entry)}</article>`).join("") || (!busy && board ? '<p>No active shared intelligence. Open a successful scout report and choose “Share with clan”.</p>' : "")}`;
    }
    function actions(entry) { return `<div class="intel-actions"><button type="button" data-intel-locate="${entry.key}" aria-label="Locate ${esc(entry.targetName)}">Location</button>${entry.canRemove ? `<button type="button" data-intel-remove="${entry.key}" ${busy ? "disabled" : ""}>Remove</button>` : ""}</div>`; }
    function clearAccess() { board = detail = null; host.textContent = "Clan intelligence access ended."; cleanup(); }
    async function request(input = { action: "list" }) {
      if (!current() || busy) return;
      busy = true; error = ""; const token = ++sequence; render();
      try {
        const result = await options.api.clanIntelligence(input);
        if (!current() || token !== sequence) return;
        if (result.towerId !== options.tower.id || result.ownershipRevision !== options.tower.ownershipRevision || result.clanId !== options.tower.clanId) throw Error("Tower ownership changed. Reopen the Scout Lodge.");
        offset = result.serverTimeMs - Date.now();
        if (input.action === "list") board = result;
        else if (input.action === "detail") detail = result.entry;
        else { operations.delete(input.key); detail = null; board = null; }
      } catch (failure) { if (current() && token === sequence) clear(failure.message || "Intelligence unavailable. Retry after reconnecting."); }
      finally {
        if (current() && token === sequence) {
          busy = false; render();
          if (input.action === "remove" && !error) void request();
        }
      }
    }
    const click = event => {
      const b = event.target.closest("button"); if (!b || b.disabled || !current()) return;
      const entry = [detail, ...(board?.entries || [])].find(e => e?.key === (b.dataset.intelLocate || b.dataset.intelRemove));
      if (b.hasAttribute("data-intel-refresh")) void request();
      if (b.hasAttribute("data-intel-back")) { detail = null; render(); }
      if (b.dataset.intelDetail) void request({ action: "detail", key: b.dataset.intelDetail });
      if (b.dataset.intelLocate && entry?.expiresAtMs > now()) options.onLocate(entry);
      if (b.dataset.intelRemove && entry?.canRemove) {
        if (!operations.has(entry.key)) operations.set(entry.key, root.crypto.randomUUID());
        void request({ action: "remove", key: entry.key, operationId: operations.get(entry.key) });
      }
    };
    host.addEventListener("click", click);
    const clock = root.setInterval(() => {
      if (!current()) return clearAccess();
      if ((board?.entries || []).some(e => e.expiresAtMs <= now())) { board.entries = board.entries.filter(e => e.expiresAtMs > now()); render(); }
      host.querySelectorAll("[data-intel-expiry]").forEach(n => n.textContent = time(Number(n.dataset.intelExpiry) - now()));
    }, 250);
    const refresh = root.setInterval(() => { if (current() && !host.hidden) void request(); }, 5000);
    const unsubscribe = options.api.subscribeClanIntelligence?.(options.tower.clanId, () => void request(), failure => { if (current()) { sequence++; busy = false; clear(failure?.message || "Clan intelligence access unavailable."); } }, { towerId: options.tower.id, ownershipRevision: options.tower.ownershipRevision });
    function cleanup() { alive = false; sequence++; board = detail = null; operations.clear(); root.clearInterval(clock); root.clearInterval(refresh); unsubscribe?.(); host.removeEventListener("click", click); }
    void request();
    return cleanup;
  }
  root.CrownlandsClanIntelligenceUi = Object.freeze({ mount });
})(window);
