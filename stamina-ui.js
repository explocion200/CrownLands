(function (root) {
  "use strict";
  const M = root.CrownlandsMarauders;
  const connectionError = "Stamina unavailable. Reconnect to continue.";
  let session = null;
  const number = value => Number(value).toLocaleString("en-US");
  function remember(s) {
    try { const key = `crownlands-stamina-refill:${s.uid}`;
      if (s.pending) sessionStorage.setItem(key, JSON.stringify(s.pending)); else sessionStorage.removeItem(key);
    } catch { /* The same in-memory request remains safe to retry. */ }
  }
  function value() {
    if (!session?.state) return null;
    try { return M.view(session.state, Date.now() + session.offset); } catch { return null; }
  }
  function wallet(crowns, revision) {
    if (!session || !Number.isSafeInteger(crowns) || !Number.isSafeInteger(revision) || revision < session.walletRevision) return;
    session.crowns = crowns; session.walletRevision = revision; tick();
  }
  function accept(s, result) {
    if (session !== s) return;
    if (result.state && (!s.state || result.state.revision >= s.state.revision)) s.state = result.state;
    if (result.state?.serverNowMs) s.offset = result.state.serverNowMs - Date.now();
    if (typeof result.huntingEnabled === "boolean") s.enabled = result.huntingEnabled;
    if (Number.isSafeInteger(result.crowns) && result.walletRevision >= s.walletRevision) {
      s.crowns = result.crowns; s.walletRevision = result.walletRevision;
      s.onWallet?.(result.crowns, result.walletRevision);
    }
    s.offer = result.offer || null;
    tick();
  }
  async function refresh(s) {
    try { const result = await s.api.getStaminaState(); if (session !== s) return;
      s.error = ""; accept(s, result);
      const check = s.shopCheck = (s.shopCheck || 0) + 1;
      s.shopAvailable = false;
      const state = value(), price = state ? M.refillPrice(state.value) : null;
      if (s.enabled && price > 0 && s.crowns < price && !state.paidRefillsToday && s.api.getLiveCrownPaymentCatalog) {
        s.shopAvailable = null; tick();
        try { const catalog = await s.api.getLiveCrownPaymentCatalog();
          if (session === s && s.shopCheck === check) s.shopAvailable = catalog.enabled === true && catalog.mode === "live" && catalog.packs?.length > 0;
        } catch { if (session === s && s.shopCheck === check) s.shopAvailable = false; }
      }
      if (session === s) tick();
    } catch (error) { if (session === s) { s.error = error.message || "Stamina unavailable. Try again."; tick(); } }
  }
  function sync({ uid, api, onWallet }) {
    if (session?.uid === uid) return;
    session?.stop?.(); session?.closeShop?.(); session?.dialog?.close(); session?.dialog?.remove(); session = null;
    if (!uid || !api?.getStaminaState) { tick(); return; }
    const s = session = { uid, api, onWallet, state: null, crowns: null, walletRevision: -1,
      enabled: false, offset: 0, error: "", busy: false, offer: null, pending: null, dialog: null };
    try { const saved = JSON.parse(sessionStorage.getItem(`crownlands-stamina-refill:${uid}`) || "null");
      if (saved?.requestId && saved?.offer) s.pending = saved;
    } catch { /* Ignore corrupt local draft; it has no currency authority. */ }
    s.stop = api.subscribeStamina?.({ onState: raw => {
      if (session !== s || !raw || (s.state && raw.revision < s.state.revision)) return;
      if (s.error === connectionError) s.error = "";
      s.state = raw; tick();
    }, onError: () => { if (session === s) { s.state = null; s.error = connectionError; tick(); } } });
    tick(); void refresh(s);
  }
  function duration(until) {
    return root.CrownlandsCombatTimersUI?.remaining(until, Date.now() + (session?.offset || 0)) || "—";
  }
  function tick() {
    const state = value(), card = document.getElementById("staminaButton");
    if (card) {
      card.querySelector("[data-stamina-value]").textContent = state ? `${state.value}/100` : "—/100";
      card.querySelector("[data-stamina-fill]").style.width = `${state?.value || 0}%`;
      card.classList.toggle("stamina-low", Boolean(state && state.value < 10));
      card.setAttribute("aria-label", state ? `Stamina ${state.value} of 100. Refill stamina.` : "Stamina unavailable. Open refill review.");
    }
    document.querySelectorAll("[data-hunt-stamina]").forEach(element => {
      const cost = Number(element.dataset.huntStamina) === M.BOSS_HUNT_COST ? M.BOSS_HUNT_COST : M.HUNT_COST;
      element.textContent = `Stamina ${state ? `${state.value}/100` : "—/100"} · Cost ${cost}`;
      element.classList.toggle("stamina-low", Boolean(state && state.value < cost));
    });
    const s = session, dialog = s?.dialog;
    if (!dialog?.open) return;
    const price = state ? M.refillPrice(state.value) : null, cost = `${price} ${price === 1 ? "Crown" : "Crowns"}`;
    const set = (selector, text) => { dialog.querySelector(selector).textContent = text; };
    set("[data-panel-value]", state ? `${state.value}/100` : "—/100");
    const progress = dialog.querySelector("progress"); progress.value = state?.value || 0;
    progress.setAttribute("aria-label", state ? `Stamina ${state.value} of 100` : "Stamina unavailable");
    set("[data-hunts]", state ? number(state.hunts) : "—");
    set("[data-boss-hunts]", state ? number(state.bossHunts) : "—");
    set("[data-refill-stamina]", state ? `${state.value} → 100 · Restores ${100 - state.value}` : "—");
    set("[data-refill-crowns]", s.crowns === null ? "—" : `${number(s.crowns)}${price > 0 && s.crowns >= price ? ` → ${number(s.crowns - price)}` : ""}`);
    set("[data-refill-used]", state ? `${state.paidRefillsToday}/1` : "—/1");
    const unavailable = !state || s.crowns === null ? "Loading stamina…" : !s.enabled ? "Hunting not available yet"
      : state.value === 100 ? "Stamina full" : state.paidRefillsToday ? "Refill used today" : s.crowns < price ? "Not enough Crowns" : "";
    const reviewed = s.offer && state && s.offer.version === M.REFILL_VERSION && s.offer.price === price
      && s.offer.stamina === state.value && s.offer.staminaRevision === state.revision
      && s.offer.walletRevision === s.walletRevision && s.offer.utcDay === M.day(Date.now() + s.offset);
    const needsCrowns = unavailable === "Not enough Crowns" && !s.pending;
    const canShop = needsCrowns && s.shopAvailable === true;
    const buy = dialog.querySelector("[data-refill-buy]");
    buy.disabled = s.busy || (!s.pending && !canShop && Boolean(unavailable || !reviewed));
    buy.dataset.action = canShop ? "shop" : "refill";
    buy.textContent = s.busy ? "Checking refill…" : s.pending ? "Check pending refill" : canShop ? "Buy Crowns" : unavailable || `Refill to 100 — ${cost}`;
    dialog.querySelector("[data-stamina-refresh]").hidden = Boolean(reviewed && !s.error && (!needsCrowns || canShop));
    dialog.querySelector("[data-stamina-refresh]").disabled = s.busy;
    dialog.querySelector("[data-stamina-close]").disabled = s.busy;
    set("[data-stamina-feedback]", s.error || (s.success || (state?.paidRefillsToday ? `Next paid refill at 00:00 UTC · ${duration(state.resetsAtMs)} remaining.`
      : needsCrowns ? `Your refill costs ${cost}. You need ${price - s.crowns} more. ${s.shopAvailable === null ? "Checking Crown purchases…" : canShop ? "Buy Crowns in the Shop, then return here to refill." : "Crown purchases are currently unavailable."}` : !reviewed && state ? "Your balance changed. Refresh this review before buying." : "30 Crowns per 100 stamina · Rounded up · Once per UTC day.")));
  }
  async function purchase(s) {
    if (session !== s || s.busy) return;
    if (!s.pending) s.pending = { requestId: crypto.randomUUID(), offer: s.offer };
    remember(s); s.busy = true; s.error = ""; s.success = ""; tick();
    try {
      const result = await s.api.refillStamina(s.pending);
      if (session !== s) return;
      s.pending = null; remember(s); accept(s, result);
      s.success = `Refill confirmed. ${result.receipt.restored} stamina restored for ${result.receipt.price} ${result.receipt.price === 1 ? "Crown" : "Crowns"}.`;
    } catch (error) {
      if (session !== s) return;
      if (/failed-precondition|invalid-argument|permission-denied|unauthenticated/.test(error.code || "")) { s.pending = null; remember(s); }
      s.error = error.message || "The result is unknown. Check the same pending refill to avoid another charge.";
      const message = s.error; await refresh(s); s.error = message;
    } finally { if (session === s) { s.busy = false; tick(); } }
  }
  function open(opener = document.activeElement) {
    const s = session;
    if (!s) return;
    if (!s.dialog) {
      const dialog = s.dialog = document.createElement("dialog"); dialog.className = "stamina-panel";
      dialog.setAttribute("aria-labelledby", "stamina-panel-title");
      dialog.innerHTML = `<header><h2 id="stamina-panel-title">Stamina &amp; hunts</h2><button type="button" data-stamina-close aria-label="Close stamina refill">×</button></header><div class="stamina-panel-layout"><section class="stamina-refill" aria-label="Stamina refill"><div class="stamina-panel-body">
        <h3>Your stamina <strong data-panel-value>—/100</strong></h3><progress max="100" value="0"></progress>
        <h3>Refill stamina</h3><p class="stamina-offer" data-refill-stamina>—</p><dl><div><dt>Crowns</dt><dd data-refill-crowns>—</dd></div><div><dt>Paid refills today</dt><dd data-refill-used>—/1</dd></div></dl>
        <p data-stamina-feedback role="status"></p><button type="button" data-stamina-refresh>Refresh review</button>
        <div data-stamina-shop-loading hidden></div><details><summary>Hunt costs &amp; refill rules</summary><p>Solo hunts: <strong data-hunts>—</strong> · 10 stamina each<br>Boss rallies: <strong data-boss-hunts>—</strong> · 20 stamina per member</p>
        <p>Stamina does not recover automatically. Refill with Crowns once per UTC day.</p></details></div>
        <footer><button type="button" data-refill-buy disabled>Loading stamina…</button></footer></section><section data-enemy-search aria-label="Find enemies"></section></div>`;
      document.body.append(dialog);
      s.search = root.installMarauderSearch?.(dialog, { isCurrent: () => session === s && dialog.open,
        canNavigate: () => !s.busy, onLocated: () => dialog.close() });
      dialog.querySelector("[data-refill-buy]").addEventListener("click", event => {
        if (event.currentTarget.disabled) return;
        if (event.currentTarget.dataset.action !== "shop") { void purchase(s); return; }
        const host = dialog.querySelector("[data-stamina-shop-loading]"), request = s.shopLoad = (s.shopLoad || 0) + 1;
        host.hidden = false;
        const enter = () => {
          if (session !== s || !dialog.open || request !== s.shopLoad) return;
          host.hidden = true;
          if (dialog.querySelector("[data-refill-buy]").dataset.action !== "shop") return;
          s.shop = true; dialog.close();
          s.closeShop = root.openCrownShop({ isCurrent: () => session === s, onReturn: restored => {
            s.shop = false; s.closeShop = null; if (restored) open(s.opener);
          } });
        };
        if (root.ensureOptionalUiScripts("shop", host, enter)) enter();
      });
      dialog.querySelector("[data-stamina-refresh]").addEventListener("click", () => { void refresh(s); });
      dialog.querySelector("[data-stamina-close]").addEventListener("click", () => dialog.close());
      dialog.addEventListener("cancel", event => { if (s.busy) event.preventDefault(); });
      dialog.addEventListener("close", () => { if (!dialog.open) { s.shopLoad = (s.shopLoad || 0) + 1; s.search?.stop(); } if (!s.shop && !dialog.open && s.opener?.isConnected) s.opener.focus({ preventScroll: true }); });
    }
    if (!s.dialog.open) {
      s.shopLoad = (s.shopLoad || 0) + 1;
      const host = s.dialog.querySelector("[data-stamina-shop-loading]"); host.hidden = true; host.replaceChildren();
      s.search?.stop();
      s.opener = opener; s.dialog.showModal(); s.dialog.querySelector("[data-stamina-close]").focus();
    }
    s.success = ""; tick(); void refresh(s);
  }
  document.addEventListener("click", event => { const opener = event.target.closest("#staminaButton,[data-open-stamina]"); if (opener) open(opener); });
  root.CrownlandsStaminaUI = Object.freeze({ sync, tick, wallet, open, value });
})(globalThis);
