/* Hosted Crown checkout: all currency changes come from server wallet snapshots. */
(function (root) {
  "use strict";
  let current = null;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const terminal = order => order && ["confirmed", "expired"].includes(order.status);
  const money = pack => new Intl.NumberFormat(undefined, { style: "currency", currency: pack.currency }).format(pack.amountMinor / 100);
  const requestFor = order => ({ requestId: order.requestId, packId: order.packId, expectedAmountMinor: order.amountMinor,
    expectedCurrency: order.currency, expectedCrowns: order.crowns });
  function reset(uid) {
    if (current?.uid === uid) return;
    current?.dialog?.remove();
    for (const host of current?.roots || []) host.textContent = uid ? "Loading Crown packs…" : "Sign in to buy Crowns.";
    current = uid ? { uid, roots: new Set(), loaded: false, loading: true, busy: false, packs: [], error: "", order: null, request: null } : null;
  }
  function remember(session) {
    try {
      const key = `crownlands-stripe-${session.mode || "test"}:${session.uid}`;
      if (session.request) sessionStorage.setItem(key, JSON.stringify(session.request)); else sessionStorage.removeItem(key);
    } catch { /* Server order status remains recoverable if browser storage is unavailable. */ }
  }
  function refreshButtons(session) {
    for (const host of session.roots) {
      if (!host.isConnected) { session.roots.delete(host); continue; }
      host.replaceChildren();
      if (!session.enabled || !session.packs.length) {
        host.innerHTML = `<p role="status">${session.loading ? "Loading Crown packs…" : "Crown purchases are currently unavailable."}</p>`;
        continue;
      }
      for (const pack of session.packs) {
        const card = document.createElement("article"); card.className = "crown-pack";
        card.innerHTML = `<img src="assets/optimized/crown-coin-96x96-34224e7d7fb4.webp" width="96" height="96" alt="Crowns" draggable="false"><h2>${escape(pack.crowns.toLocaleString())} Crowns</h2><p>${session.mode === "live" ? "One-time purchase · Cosmetics only" : "Sandbox only · No usable Crowns"}</p><strong class="crown-pack-price">${escape(money(pack))} ${escape(pack.currency.toUpperCase())}</strong><button type="button" data-crown-checkout>${session.mode === "live" ? "Buy" : "Test checkout"}</button>`;
        card.querySelector("button").addEventListener("click", () => {
          if (current !== session) return;
          if (!session.request && (!session.order || terminal(session.order))) session.selected = pack.id;
          open(session);
        });
        host.append(card);
      }
    }
  }
  function render(session) {
    if (current !== session || !session.dialog) return;
    const order = session.order, pending = session.request || (order && !terminal(order));
    const selected = session.selected || session.packs[0]?.id;
    const live = session.mode === "live";
    const message = order?.reviewRequired ? "This payment needs manual review. Contact crownlandsmail@gmail.com with your order reference."
      : order?.status === "confirmed" ? (live ? `Payment confirmed: ${order.crowns.toLocaleString()} Crowns delivered to your account.` : `Test payment confirmed: ${order.crowns} test Crowns recorded. Your playable Crown balance is unchanged.`)
      : order?.status === "expired" ? (live ? "This checkout expired. No Crowns were credited by this check." : "This test checkout expired. No new test Crowns were credited by this check.")
      : order ? "Payment has not been confirmed. Check its status or continue the same checkout." : "";
    session.dialog.innerHTML = `<header><h2>${live ? "Buy Crowns" : "Buy Crowns — test checkout"}</h2><button type="button" data-crown-close aria-label="Close Crown checkout">Close</button></header>
      ${live ? `<p class="crown-purchase-notice">One-time purchase. The displayed US-dollar price includes any applicable tax. Crowns cannot be transferred or exchanged for money.</p><p>Refund requests are reviewed manually. Contact <a href="mailto:crownlandsmail@gmail.com">crownlandsmail@gmail.com</a>. Read our <a href="https://playcrownlands.com/terms.html#crown-purchases" target="_blank" rel="noopener">purchase terms</a> and <a href="https://playcrownlands.com/privacy.html#payments" target="_blank" rel="noopener">privacy policy</a>.</p>` : `<p class="crown-test-notice">Sandbox only. No real money is charged and no usable Crowns are granted.</p>`}
      <p>Crowns are for cosmetics. Checkout opens in a separate tab so you can return to your game.</p>
      <label>${live ? "Crown pack" : "Test Crown pack"}<select data-crown-pack ${pending || session.busy ? "disabled" : ""}>${session.packs.map(pack => `<option value="${escape(pack.id)}" ${pack.id === selected ? "selected" : ""}>${pack.crowns.toLocaleString()} Crowns — ${escape(money(pack))}</option>`).join("")}</select></label>
      ${order ? `<p class="crown-order-reference">${live ? "Order" : "Test order"}: ${escape(order.orderId)}</p>` : ""}
      <p role="status" aria-live="polite">${escape(session.error || message)}</p>
      <footer>${terminal(order) ? `<button type="button" data-crown-again>Choose another ${live ? "" : "test "}pack</button>`
        : `<button type="button" data-crown-pay ${session.busy || !session.packs.length ? "disabled" : ""}>${session.busy ? "Checking…" : pending ? (live ? "Continue checkout" : "Continue test checkout") : (live ? "Open Stripe checkout" : "Open Stripe test checkout")}</button>`}
      ${order ? `<button type="button" data-crown-check ${session.busy ? "disabled" : ""}>Check payment status</button>` : ""}</footer>`;
    session.dialog.querySelector("[data-crown-close]").onclick = () => session.dialog.close();
    session.dialog.querySelector("[data-crown-pack]").onchange = event => { session.selected = event.target.value; };
    session.dialog.querySelector("[data-crown-pay]")?.addEventListener("click", () => pay(session));
    session.dialog.querySelector("[data-crown-check]")?.addEventListener("click", () => check(session));
    session.dialog.querySelector("[data-crown-again]")?.addEventListener("click", () => {
      session.order = null; session.request = null; session.error = ""; remember(session); render(session);
    });
  }
  function open(session) {
    if (!session.dialog) {
      session.dialog = document.createElement("dialog"); session.dialog.className = "crown-payments-dialog";
      session.dialog.setAttribute("aria-label", session.mode === "live" ? "Buy Crowns" : "Buy Crowns test checkout"); document.body.append(session.dialog);
    }
    render(session); session.dialog.showModal();
  }
  async function pay(session) {
    if (current !== session || session.busy) return;
    const pack = session.packs.find(value => value.id === (session.selected || session.packs[0]?.id));
    if (!pack) return;
    if (!session.request) session.request = { requestId: `crown_${crypto.randomUUID().replaceAll("-", "")}`, packId: pack.id,
      expectedAmountMinor: pack.amountMinor, expectedCurrency: pack.currency, expectedCrowns: pack.crowns };
    remember(session);
    const popup = window.open("about:blank", "_blank");
    if (!popup) { session.error = "Allow a new tab for Stripe checkout, then retry."; render(session); return; }
    popup.opener = null;
    popup.document.title = "Opening Stripe checkout";
    popup.document.body.textContent = "Opening Stripe checkout…";
    session.busy = true; session.error = ""; render(session);
    try {
      const result = await session.api.createCrownCheckout(session.request);
      if (current !== session) { popup.close(); return; }
      if (result.order?.mode !== session.mode) throw Error("The checkout mode changed. Reopen the game before buying.");
      session.order = result.order;
      session.selected = result.order.packId;
      if (terminal(session.order)) { session.request = null; remember(session); }
      if (result.url) {
        const url = new URL(result.url);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.port || url.username || url.password) throw Error("Checkout returned an invalid address.");
        popup.location.replace(url.href);
      } else popup.close();
    } catch (error) {
      popup.close();
      if (current !== session) return;
      session.error = error.message || "Checkout could not be opened. Retry to recover the same order.";
      try {
        const recovered = await session.api.getCrownPaymentCatalog();
        if (current !== session) return;
        if (recovered.enabled) {
          session.packs = recovered.packs; session.order = recovered.latestOrder || null;
          session.request = session.order && !terminal(session.order) ? requestFor(session.order) : null;
          if (session.order) session.selected = session.order.packId;
          remember(session);
        }
      } catch { /* Preserve the same idempotent request until the server can be reached. */ }
    } finally {
      if (current === session) { session.busy = false; render(session); }
    }
  }
  async function check(session) {
    if (current !== session || session.busy || !session.order) return;
    session.busy = true; session.error = ""; render(session);
    try {
      const result = await session.api.getCrownCheckoutStatus({ orderId: session.order.orderId });
      if (current !== session) return;
      if (result.order?.mode !== session.mode) throw Error("The checkout mode changed. Reopen the game before buying.");
      session.order = result.order;
      if (terminal(session.order)) { session.request = null; remember(session); }
    } catch (error) { if (current === session) session.error = error.message || "Payment status is unavailable. Please retry."; }
    finally { if (current === session) { session.busy = false; render(session); } }
  }
  function mount(host, { uid, api }) {
    if (!host) return;
    reset(uid);
    if (!current || !api?.getCrownPaymentCatalog) {
      host.textContent = !uid ? "Sign in to buy Crowns." : "Crown purchases are currently unavailable.";
      return;
    }
    const session = current, mounted = session.roots.has(host); session.roots.add(host);
    if (session.loaded) { if (!mounted) refreshButtons(session); return; }
    session.api = api;
    session.loaded = true; session.loading = true; refreshButtons(session);
    void (async () => {
      if (api.getLiveCrownPaymentCatalog) {
        try {
          const live = await api.getLiveCrownPaymentCatalog();
          if (current !== session) return null;
          if (live.enabled === true && live.mode === "live") {
            session.api = { getCrownPaymentCatalog: api.getLiveCrownPaymentCatalog, createCrownCheckout: api.createLiveCrownCheckout, getCrownCheckoutStatus: api.getLiveCrownCheckoutStatus };
            return live;
          }
        } catch { /* Older deployments can still offer designated sandbox checkout. */ }
      }
      return api.getCrownPaymentCatalog();
    })().then(result => {
      if (current !== session || !result) return;
      session.loading = false;
      session.mode = result.mode;
      session.enabled = result.enabled === true && ["test", "live"].includes(result.mode);
      session.packs = session.enabled ? result.packs : [];
      session.order = result.latestOrder || null;
      if (session.order) session.selected = session.order.packId;
      if (session.order && !terminal(session.order)) session.request = requestFor(session.order);
      else if (!session.order) {
        try { session.request = JSON.parse(sessionStorage.getItem(`crownlands-stripe-${session.mode}:${uid}`) || "null"); } catch { /* Ignore corrupt browser storage. */ }
      }
      if (terminal(session.order)) { session.request = null; remember(session); }
      refreshButtons(session);
    }).catch(() => {
      if (current !== session) return;
      session.loading = false; session.loaded = false; refreshButtons(session);
    });
  }
  root.CrownlandsCrownPaymentsUI = Object.freeze({ mount, reset });
})(globalThis);
