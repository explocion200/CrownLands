/* Cosmetic ownership and Crowns are server-authoritative. Unapproved catalog art stays labeled. */
/* exported cosmeticOpenShopRequested, syncCosmeticsSession, applyCosmeticCityNode, updateCosmeticProfileNavigation, renderCosmeticPickupIcon */
const COSMETIC_CATALOG = globalThis.CrownlandsCosmetics;
let cosmeticState = null, cosmeticUid = "", cosmeticStop = null, cosmeticOwnerStop = null;
let cosmeticError = "", cosmeticBusy = false, cosmeticOffset = 0, cosmeticConfirmation = null;
let cosmeticPendingPurchase = null, cosmeticCategory = "all", cosmeticSelected = "halloween_city";
let cosmeticOwnerSignature = "", cosmeticOwnersDirty = false, cosmeticOpenShopRequested = false;
const cosmeticOwnerAppearances = new Map(), cosmeticNeededOwners = new Map();
const cosmeticFailedCityArt = new Set();
let cosmeticPreviewStage = 5;
let cosmeticMotion = null;
const cosmeticNow = () => Date.now() + cosmeticOffset;
const cosmeticRequestId = () => `skin_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;

function createCosmeticMotion() {
  const layers = new Map(); let frame = 0;
  function refresh() {
    cancelAnimationFrame(frame); frame = 0;
    const covered = document.getElementById("profileScreen")?.classList.contains("open") || document.getElementById("modal")?.open;
    // Keep compositor layers bounded even when many owned cities share a skin.
    const eligible = info => !document.hidden && info.visible && (info.preview || !covered);
    let visibleFrames = 0;
    for (const [layer, info] of layers) {
      if (!layer.isConnected) { observer?.unobserve(layer); layers.delete(layer); continue; }
      if (!info.preview && info.kind === "border" && eligible(info)) visibleFrames++;
    }
    // Reserve only visible frame slots, independent of which skin was applied first.
    let frameSlots = Math.min(visibleFrames, innerWidth <= 1000 ? 2 : 3);
    let mapSlots = (innerWidth <= 1000 ? 6 : 8) - frameSlots, troopSlots = innerWidth <= 1000 ? 6 : 8, previewSlots = 1;
    for (const [layer, info] of layers) {
      const active = eligible(info) && (info.preview ? previewSlots-- > 0 : info.kind === "troops" ? troopSlots-- > 0 : info.kind === "border" ? frameSlots-- > 0 : mapSlots-- > 0);
      const value = active ? "active" : "idle";
      if (layer.dataset.skinMotion !== value) layer.dataset.skinMotion = value;
    }
  }
  function schedule() { if (!frame && layers.size) frame = requestAnimationFrame(refresh); }
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    for (const entry of entries) { const info = layers.get(entry.target); if (info) info.visible = entry.isIntersecting && entry.intersectionRatio > 0; }
    schedule();
  }) : null;
  const mutations = new MutationObserver(schedule);
  for (const id of ["cityLayer", "armyLayer", "skinsView"]) {
    const root = document.getElementById(id); if (root) mutations.observe(root, { childList: true });
  }
  for (const id of ["profileScreen", "modal"]) {
    const root = document.getElementById(id); if (root) mutations.observe(root, { attributes: true, attributeFilter: ["class", "open"] });
  }
  mutations.observe(document.body, { childList: true });
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("resize", schedule, { passive: true });
  return {
    watch(layer, preview = false, kind = "city") {
      if (layers.has(layer)) return;
      layers.set(layer, { preview, kind, visible: false }); observer?.observe(layer); schedule();
    },
    forget(layer) { if (layer) { observer?.unobserve(layer); layers.delete(layer); schedule(); } },
    schedule,
  };
}

function removeCosmeticBats(layer) { cosmeticMotion?.forget(layer); layer?.remove(); }

function applyCosmeticResult(result) {
  const raw = result?.cosmetics || result?.state;
  if (raw && (!cosmeticState || Number(raw.revision) >= cosmeticState.revision)) cosmeticState = COSMETIC_CATALOG.normalize(raw);
  if (result?.serverNowMs) cosmeticOffset = result.serverNowMs - Date.now();
  refreshCosmeticPanels();
}

function syncCosmeticsSession() {
  const uid = getCurrentOnlineUid();
  if (uid === cosmeticUid) return;
  cosmeticStop?.(); cosmeticOwnerStop?.(); cosmeticStop = null; cosmeticOwnerStop = null;
  cosmeticUid = uid; cosmeticState = null; cosmeticBusy = false; cosmeticError = ""; cosmeticConfirmation = null;
  cosmeticOwnerAppearances.clear(); cosmeticNeededOwners.clear(); cosmeticOwnerSignature = "";
  cosmeticFailedCityArt.clear();
  cosmeticPendingPurchase = null;
  renderCosmeticHud();
  if (!uid) return;
  try { cosmeticPendingPurchase = JSON.parse(sessionStorage.getItem(`crownlands-cosmetic-purchase:${uid}`) || "null"); } catch { /* Storage may be unavailable. */ }
  const api = getOnlineApi();
  cosmeticStop = api?.subscribeCosmetics?.({
    onState: value => {
      if (cosmeticUid !== uid) return;
      try { const next = COSMETIC_CATALOG.normalize(value); if (cosmeticState && next.revision < cosmeticState.revision) return; cosmeticState = next; cosmeticError = ""; refreshCosmeticPanels(); renderCities(true); renderArmies(true); }
      catch (error) { cosmeticError = error.message; refreshCosmeticPanels(); }
    },
    onError: error => { if (cosmeticUid === uid) { cosmeticError = error.message || "Could not load your collection."; refreshCosmeticPanels(); } },
  });
  void reloadCosmetics();
}

async function reloadCosmetics() {
  const uid = cosmeticUid;
  if (!uid) return;
  try {
    const result = await getOnlineApi().getCosmeticsState();
    if (uid !== cosmeticUid) return;
    cosmeticError = ""; applyCosmeticResult(result);
  } catch (error) { if (uid === cosmeticUid) { cosmeticError = error.message || "Could not load your collection."; refreshCosmeticPanels(); } }
}

function cosmeticAppearance(uid) {
  if (!uid) return {};
  if (uid === cosmeticUid) return cosmeticState?.equipped || {};
  cosmeticNeededOwners.set(uid, Date.now()); cosmeticOwnersDirty = true;
  return cosmeticOwnerAppearances.get(uid) || {};
}

function syncCosmeticOwners() {
  if (!cosmeticUid || !cosmeticOwnersDirty) return;
  cosmeticOwnersDirty = false;
  const now = Date.now();
  for (const [uid, seen] of cosmeticNeededOwners) if (now - seen > 60000) cosmeticNeededOwners.delete(uid);
  const uids = [...cosmeticNeededOwners.keys()].sort();
  const signature = uids.join("|");
  if (signature === cosmeticOwnerSignature) return;
  cosmeticOwnerSignature = signature; cosmeticOwnerStop?.();
  const session = cosmeticUid;
  cosmeticOwnerStop = getOnlineApi()?.subscribeCosmeticOwners?.(uids, rows => {
    if (session !== cosmeticUid || signature !== cosmeticOwnerSignature) return;
    cosmeticOwnerAppearances.clear();
    rows.forEach(row => cosmeticOwnerAppearances.set(row.uid, row.equipped || {}));
    renderCities(true); renderArmies(true);
  });
}
setInterval(syncCosmeticOwners, 2000);

function cosmeticCityAttributes(city) {
  if (isStronghold(city)) return "";
  const appearance = cosmeticAppearance(city.ownerUid || (city.owner === "player" ? cosmeticUid : ""));
  return `${appearance.city || ""}:${appearance.border || ""}`;
}

function applyCosmeticCityNode(node, city) {
  const [skin, border] = cosmeticCityAttributes(city).split(":");
  if (node.dataset.citySkin !== (skin || "")) node.dataset.citySkin = skin || "";
  if (node.dataset.flagBorder !== (border || "")) node.dataset.flagBorder = border || "";
  if (border === "halloween_border") cosmeticMotion ||= createCosmeticMotion();
  globalThis.CrownlandsCityFlagSkins?.apply(node, border, cosmeticMotion);
  const stage = getCastleStage(city.level);
  const art = COSMETIC_CATALOG.item(skin)?.assets?.[stage];
  const image = node.querySelector(".city-art");
  const castle = node.querySelector(".city-castle");
  const availableArt = art && !cosmeticFailedCityArt.has(art);
  if (image) {
    const fallback = getCastleAsset(stage), target = availableArt ? art : fallback;
    if (image.getAttribute("src") !== target) {
      image.onerror = availableArt ? () => {
        image.onerror = null;
        cosmeticFailedCityArt.add(art);
        image.src = fallback;
        removeCosmeticBats(castle?.querySelector(".halloween-city-bats"));
      } : null;
      image.src = target;
    }
  }
  const bats = castle?.querySelector(".halloween-city-bats");
  if (skin === "halloween_city" && availableArt && image && castle) {
    const count = stage >= 4 ? 3 : 2;
    if (!bats || Number(bats.dataset.batCount) !== count) {
      removeCosmeticBats(bats);
      castle.insertAdjacentHTML("beforeend", cosmeticBats(stage));
      const phase = [...String(city.id || "")].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 8000, 0);
      castle.querySelector(".halloween-city-bats").style.setProperty("--bat-phase", `${-phase / 1000}s`);
    }
    (cosmeticMotion ||= createCosmeticMotion()).watch(castle.querySelector(".halloween-city-bats"));
  } else removeCosmeticBats(bats);
}

function cosmeticBats(stage) {
  const count = stage >= 4 ? 3 : 2;
  const svg = path => `<svg viewBox="0 0 70 48" focusable="false" aria-hidden="true"><path d="${path}"/></svg>`;
  const bat = `<span class="halloween-bat">
    <span class="halloween-bat-wing">${svg("M33 23C24 18 14 9 2 7C6 14 8 23 5 29C12 23 16 25 17 32C22 26 27 28 28 35L35 29ZM37 23C46 18 56 9 68 7C64 14 62 23 65 29C58 23 54 25 53 32C48 26 43 28 42 35L35 29Z")}</span>
    ${svg("M31 21L30 13L34 17Q35 16 36 17L40 13L39 22Q41 29 37 33L35 39L33 33Q29 29 31 21Z")}
  </span>`;
  return `<span class="halloween-city-bats" data-bat-count="${count}" aria-hidden="true">${Array.from({ length: count }, () => `<span class="halloween-bat-flight">${bat}</span>`).join("")}</span>`;
}

function cosmeticStagePicker(item) {
  if (item?.id !== "halloween_city" && item?.id !== "default_city") return "";
  return `<div class="skin-stage-picker" role="group" aria-label="Preview city level">${["1–24", "25–49", "50–74", "75–99", "100+"].map((label, index) => `<button type="button" data-skin-stage="${index + 1}" aria-pressed="${cosmeticPreviewStage === index + 1}" aria-label="Preview levels ${label}">${label}</button>`).join("")}</div>`;
}

function cosmeticPreview(item, detail = false) {
  const category = item?.category || "city";
  if (item?.id === "halloween_troops") return `<span class="skin-troop-preview" data-troop-preview="${detail ? "detail" : "card"}" aria-hidden="true"></span>`;
  if (item?.id === "halloween_city" || item?.id === "default_city") {
    const stage = detail ? cosmeticPreviewStage : 5;
    const halloween = item.id === "halloween_city";
    return `<span class="skin-city-preview" aria-hidden="true"><img src="${halloween ? item.assets[stage] : getCastleAsset(stage)}" alt="" draggable="false" decoding="async" data-skin-preview-art data-skin-preview-stage="${stage}">${detail && halloween ? cosmeticBats(stage) : ""}</span>`;
  }
  if (category === "border") return `<span class="skin-border-preview" aria-hidden="true"><span class="skin-border-marker" data-flag-frame-preview="${item.id}" data-frame-detail="${detail}"><span class="skin-border-center"><span class="kingdom-flag" data-border-heraldry><span class="flag-symbol"></span></span><span class="skin-border-level">50</span></span></span></span>`;
  const glyphs = { city: "♜", troops: "⚔", border: "◇", flag: "⚑", bundle: "♛" };
  if (category === "flag" && state?.flag) {
    const symbol = item.symbol || state.flag.symbol;
    return `<span class="kingdom-flag skin-flag-preview" data-skin-flag-symbol="${escapeHtml(symbol)}"><span class="flag-symbol"></span></span>`;
  }
  return `<span class="skin-art skin-art-${category}" aria-hidden="true">${glyphs[category] || "♛"}</span>`;
}

function cosmeticChoices(mode) {
  if (mode === "shop") return COSMETIC_CATALOG.OFFERS.filter(item => cosmeticCategory === "all" || item.category === cosmeticCategory);
  const category = ["city", "troops", "border"].includes(cosmeticCategory) ? cosmeticCategory : "city";
  const defaults = [{ id: `default_${category}`, category, name: category === "city" ? "Default City" : "Default", free: true, description: category === "city" ? "The original city appearance at every level. Restore it across all your regular cities for free, whenever you want." : "Restore the original appearance." }];
  return [...defaults, ...COSMETIC_CATALOG.ITEMS.filter(item => item.category === category && cosmeticState?.owned[item.id])];
}

function cosmeticEquipped(item) {
  return (cosmeticState?.equipped[item.category] || "") === (item.free ? "" : item.id);
}

function renderSkinsPanel(mode = "shop") {
  const library = mode === "profile";
  const choices = cosmeticChoices(mode);
  if (!choices.some(item => item.id === cosmeticSelected)) cosmeticSelected = choices[0]?.id || "";
  const selected = choices.find(item => item.id === cosmeticSelected);
  const categories = library ? Object.entries(COSMETIC_CATALOG.CATEGORIES).filter(([id]) => id !== "flag") : [["all", "All"], ...Object.entries(COSMETIC_CATALOG.CATEGORIES), ["bundle", "Bundles"]];
  const activeCategory = library ? choices[0].category : cosmeticCategory;
  const quote = !library && selected && cosmeticState ? COSMETIC_CATALOG.quote(selected.id, cosmeticState, cosmeticNow()) : null;
  const owned = library || quote?.missing.length === 0;
  const sale = COSMETIC_CATALOG.availability(cosmeticNow());
  const action = library ? cosmeticEquipped(selected || {}) ? "Applied" : "Apply" : owned ? selected?.category === "flag" ? "Open Flag Editor" : "View in My Skins" : quote?.onSale ? "Review Purchase" : "Available in October";
  const disabled = cosmeticBusy || !cosmeticState || (library ? cosmeticEquipped(selected || {}) : !owned && (!quote?.onSale || cosmeticState.crowns < quote.price));
  const feedback = cosmeticError || (cosmeticPendingPurchase ? "A purchase needs checking. Check its result before buying again." : "");
  if (cosmeticConfirmation && !cosmeticBusy && !cosmeticPendingPurchase && (!quote || cosmeticConfirmation.offerId !== quote.offerId || cosmeticConfirmation.price !== quote.price || !quote.onSale || cosmeticState.crowns < quote.price)) cosmeticConfirmation = null;
  const confirm = cosmeticConfirmation;
  const applyButton = `<button type="button" class="skin-primary" data-skin-action ${disabled ? "disabled" : ""}>${cosmeticBusy ? "Saving…" : action}</button>`;
  return `<section class="skins-panel" data-skins-mode="${mode}" aria-label="${library ? "My skins" : "Skin shop"}">
    <header class="skins-heading"><div><p>${library ? "Your collection" : "The royal wardrobe"}</p><h2>${library ? "My Skins" : "Halloween Collection"}</h2></div><div class="skins-wallet"><strong>${cosmeticState ? cosmeticState.crowns.toLocaleString("en-US") : "—"} Crowns</strong><span>Crown pickups: ${cosmeticState ? COSMETIC_CATALOG.countToday(cosmeticState, cosmeticNow()) : "—"} / 20 today</span><button type="button" data-skin-earn>Earn Crowns</button></div></header>
    <p class="skins-notice">${library ? "Select a skin, then press Apply. Switching is free." : `Permanent cosmetics · Free switching · ${sale.onSale ? "Sale ends November 1 at 00:00 UTC" : "Returns October 1 at 00:00 UTC"}.`}</p>
    <nav class="skins-filters" aria-label="Skin categories">${categories.map(([id,label]) => `<button type="button" data-skin-category="${id}" aria-pressed="${id === activeCategory}">${label}</button>`).join("")}</nav>
    ${feedback ? `<p class="skins-feedback" role="status">${escapeHtml(feedback)} <button type="button" data-skin-reload>${cosmeticPendingPurchase ? "Check Purchase" : "Retry"}</button></p>` : ""}
    ${!cosmeticUid ? '<p role="status">Sign in to load your permanent collection.</p>' : !cosmeticState && !cosmeticError ? '<p role="status">Loading your collection…</p>' : ""}
    <div class="skins-body"><div class="skins-grid" aria-label="Cosmetics">${choices.map(item => `<button type="button" class="skin-card" data-skin-select="${item.id}" aria-pressed="${item.id === cosmeticSelected}">${cosmeticPreview(item)}<strong>${escapeHtml(item.name)}</strong><span>${library ? cosmeticEquipped(item) ? "Applied" : item.id === cosmeticSelected ? "Selected" : item.free ? "Free" : "Owned" : cosmeticState && COSMETIC_CATALOG.quote(item.id,cosmeticState,cosmeticNow()).missing.length === 0 ? "Owned" : (cosmeticState ? COSMETIC_CATALOG.quote(item.id,cosmeticState,cosmeticNow()).price : item.price ?? 1200) + " Crowns"}</span></button>`).join("")}</div>
    <section class="skin-detail" aria-label="Selected cosmetic">${selected ? `<div class="skin-detail-content">${cosmeticPreview(selected, true)}${cosmeticStagePicker(selected)}<h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description)}</p>${selected.placeholder ? '<p class="skins-notice">Preview uses temporary artwork.</p>' : ""}${quote?.missing.length ? `<p><strong>${quote.price} Crowns</strong>${selected.itemIds ? " · 20% off unowned pieces" : ""}</p><ul>${quote.missing.map(id => `<li>${escapeHtml(COSMETIC_CATALOG.item(id).name)}</li>`).join("")}</ul>` : ""}</div>${library ? "" : confirm ? `<section class="skin-confirm" aria-label="Confirm purchase"><h3>Confirm purchase</h3><p>Unlock ${confirm.missing.length} item${confirm.missing.length === 1 ? "" : "s"} for <strong>${confirm.price} Crowns</strong>.</p><p>Balance after purchase: <strong>${cosmeticState.crowns - confirm.price} Crowns</strong></p><button type="button" data-skin-confirm ${cosmeticBusy ? "disabled" : ""}>${cosmeticBusy ? "Checking…" : "Confirm Purchase"}</button><button type="button" data-skin-cancel ${cosmeticBusy ? "disabled" : ""}>Cancel</button></section>` : `${applyButton}${quote && !owned && quote.onSale && cosmeticState.crowns < quote.price ? '<p>Not enough Crowns. Collect Crown pickups on the map.</p>' : ""}`}` : ""}</section></div>
    <footer class="skins-footer"><button type="button" data-skin-browse>${library ? "Browse Shop" : "My Skins"}</button>${library ? `<span class="skin-selection">Selected: <strong>${escapeHtml(selected?.name || "")}</strong></span>${applyButton}` : "<span>Appearance only · Owned items remain usable all year</span>"}</footer></section>`;
}

function bindSkinsPanel(root) {
  if (!root) return;
  cosmeticMotion?.schedule();
  root.querySelectorAll(".skin-detail .halloween-city-bats").forEach(layer => (cosmeticMotion ||= createCosmeticMotion()).watch(layer, true));
  root.querySelectorAll("[data-troop-preview]").forEach(element => globalThis.CrownlandsTroopSkins?.preview(element, element.dataset.troopPreview === "detail", cosmeticMotion ||= createCosmeticMotion()));
  root.querySelectorAll("[data-flag-frame-preview]").forEach(host => globalThis.CrownlandsCityFlagSkins?.preview(host, host.dataset.frameDetail === "true", cosmeticMotion ||= createCosmeticMotion()));
  root.querySelectorAll("[data-border-heraldry]").forEach(host => FlagRenderer.render(host, state.flag, { stableKey: cosmeticUid || "preview" }));
  const mode = root.dataset.skinsMode;
  root.querySelectorAll("[data-skin-stage]").forEach(button => button.addEventListener("click", () => {
    cosmeticPreviewStage = Number(button.dataset.skinStage); refreshCosmeticPanels();
  }));
  root.querySelectorAll("[data-skin-preview-art]").forEach(image => {
    image.onerror = () => {
      image.onerror = null;
      image.src = getCastleAsset(Number(image.dataset.skinPreviewStage));
      removeCosmeticBats(image.parentElement.querySelector(".halloween-city-bats"));
    };
  });
  root.querySelectorAll("[data-skin-flag-symbol]").forEach(element => FlagRenderer.render(element, { ...state.flag, symbol: element.dataset.skinFlagSymbol }, { stableKey: cosmeticUid || "preview" }));
  root.querySelectorAll("[data-skin-category]").forEach(button => button.addEventListener("click", () => { cosmeticCategory = button.dataset.skinCategory; cosmeticConfirmation = null; refreshCosmeticPanels(); }));
  root.querySelectorAll("[data-skin-select]").forEach(button => button.addEventListener("click", () => { if (cosmeticBusy) return; cosmeticSelected = button.dataset.skinSelect; cosmeticConfirmation = null; refreshCosmeticPanels(); }));
  root.querySelector("[data-skin-earn]")?.addEventListener("click", () => {
    modal.close(); closeProfileScreen(); showToast("Collect Crown pickups on the map: 1 Crown each, up to 20 per UTC day. Pickups rotate Gold → Troops → Crowns.");
  });
  root.querySelector("[data-skin-browse]")?.addEventListener("click", () => mode === "shop" ? openMySkins() : openSkinShop());
  root.querySelector("[data-skin-reload]")?.addEventListener("click", () => cosmeticPendingPurchase ? submitCosmeticPurchase() : reloadCosmetics());
  root.querySelector("[data-skin-cancel]")?.addEventListener("click", () => { cosmeticConfirmation = null; refreshCosmeticPanels(); });
  root.querySelector("[data-skin-confirm]")?.addEventListener("click", () => submitCosmeticPurchase());
  root.querySelector("[data-skin-action]")?.addEventListener("click", () => {
    if (mode === "profile") { void equipSelectedCosmetic(); return; }
    const quote = COSMETIC_CATALOG.quote(cosmeticSelected, cosmeticState, cosmeticNow());
    if (!quote.missing.length) {
      if (COSMETIC_CATALOG.item(cosmeticSelected)?.category === "flag") {
        modal.close(); showProfileScreen(); showFlagEditor(); setFlagEditorSection("symbol");
      } else openMySkins();
      return;
    }
    if (cosmeticPendingPurchase) { cosmeticError = "Check the pending purchase first."; refreshCosmeticPanels(); return; }
    cosmeticConfirmation = quote; refreshCosmeticPanels();
    document.querySelector("[data-skin-confirm]")?.focus();
  });
}

function renderCosmeticHud() {
  const counter = document.getElementById("crownsBalance");
  if (!counter) return;
  const balance = cosmeticUid && cosmeticState ? cosmeticState.crowns : null;
  const label = balance !== null ? `${balance.toLocaleString("en-US")} Crowns`
    : !cosmeticUid ? "Sign in to load Crowns" : cosmeticError ? "Crowns balance unavailable" : "Loading Crowns";
  setTextIfChanged(document.getElementById("crownsText"), balance === null ? "—" : formatNumber(balance));
  counter.setAttribute("aria-label", label);
  counter.title = label;
}

function refreshCosmeticPanels() {
  renderCosmeticHud();
  if (profileScreen.classList.contains("open") && !flagEditorView.hidden && flagDraft) {
    const scroll = flagEditorControlScroll.scrollTop, symbol = document.activeElement?.dataset.flagSymbol;
    renderFlagEditor();
    flagEditorControlScroll.scrollTop = scroll;
    if (symbol) flagSymbolOptions.querySelector(`[data-flag-symbol="${CSS.escape(symbol)}"]`)?.focus({ preventScroll: true });
  }
  document.querySelectorAll(".skins-panel").forEach(root => {
    if (root.dataset.skinsMode === "profile" && (activeProfileTab !== "skins" || !profileScreen.classList.contains("open"))) return;
    if (root.dataset.skinsMode === "shop" && !modal.open) return;
    const mode = root.dataset.skinsMode, scroll = root.querySelector(".skins-grid")?.scrollTop || 0;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const selector = focused ? [...focused.attributes].filter(attr => attr.name.startsWith("data-skin-")).map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join("") : "";
    const holder = root.parentElement; root.outerHTML = renderSkinsPanel(mode);
    const next = holder.querySelector(".skins-panel"); bindSkinsPanel(next);
    if (next?.querySelector(".skins-grid")) next.querySelector(".skins-grid").scrollTop = scroll;
    if (selector) next?.querySelector(selector)?.focus({ preventScroll: true });
  });
}

async function submitCosmeticPurchase() {
  if (cosmeticBusy || !cosmeticUid || (!cosmeticPendingPurchase && !cosmeticConfirmation)) return;
  const uid = cosmeticUid;
  const quote = cosmeticConfirmation;
  const request = cosmeticPendingPurchase || { offerId: quote.offerId, expectedPrice: quote.price, catalogVersion: quote.catalogVersion, requestId: cosmeticRequestId() };
  cosmeticPendingPurchase = request; cosmeticBusy = true; cosmeticError = "";
  try { sessionStorage.setItem(`crownlands-cosmetic-purchase:${uid}`, JSON.stringify(request)); } catch { /* Receipt also remains on the server. */ }
  refreshCosmeticPanels();
  try {
    const result = await getOnlineApi().purchaseCosmetic(request);
    if (uid !== cosmeticUid) return;
    cosmeticPendingPurchase = null; cosmeticConfirmation = null;
    applyCosmeticResult(result); showToast("Cosmetics unlocked.");
  } catch (error) {
    if (uid !== cosmeticUid) return;
    const definite = /(?:invalid-argument|failed-precondition|permission-denied|resource-exhausted|already-exists)$/.test(String(error.code));
    if (definite) { cosmeticPendingPurchase = null; cosmeticConfirmation = null; }
    cosmeticError = error.message || "Purchase result is uncertain. Check Purchase to reconcile it.";
    if (definite) {
      const message = cosmeticError; await reloadCosmetics(); cosmeticError = message;
    }
  } finally {
    if (uid === cosmeticUid) {
      cosmeticBusy = false;
      if (!cosmeticPendingPurchase) try { sessionStorage.removeItem(`crownlands-cosmetic-purchase:${uid}`); } catch { /* Optional browser storage. */ }
      refreshCosmeticPanels();
    }
  }
}

async function equipSelectedCosmetic() {
  if (cosmeticBusy || !cosmeticState) return;
  const selected = cosmeticChoices("profile").find(item => item.id === cosmeticSelected);
  if (!selected) return;
  const uid = cosmeticUid; cosmeticBusy = true; cosmeticError = ""; refreshCosmeticPanels();
  try {
    const result = await getOnlineApi().equipCosmetic({ category: selected.category, itemId: selected.free ? "" : selected.id, expectedRevision: cosmeticState.revision, expectedIdentityRevision: state.identityRevision || 0, requestId: cosmeticRequestId() });
    if (uid !== cosmeticUid) return;
    applyCosmeticResult(result);
    renderHud(); renderCities(true); renderArmies(true); showToast("Appearance applied.");
  } catch (error) { if (uid === cosmeticUid) { await reloadCosmetics(); cosmeticError = error.message || "Could not equip this cosmetic."; } }
  finally { if (uid === cosmeticUid) { cosmeticBusy = false; refreshCosmeticPanels(); } }
}

function showProfileSkins(options = {}) {
  if (!state) return;
  if (!options.force && !skillsView.hidden && isSelectedSkillPresetDraftDirty()) { requestSkillPresetDraftExit(() => showProfileSkins({ force: true })); return; }
  if (!options.force && !flagEditorView.hidden && isFlagEditorDirty()) { requestFlagEditorExit(() => showProfileSkins({ force: true })); return; }
  activeProfileTab = "skins";
  profileScreen.classList.remove("skills-active", "settings-active", "clan-active", "flag-editor-active");
  [profileView, skillsView, settingsView, clanView, flagEditorView].forEach(view => { view.hidden = true; });
  clearFlagEditorSession(); cancelProfileNameEdit();
  if (!["city", "troops", "border"].includes(cosmeticCategory)) cosmeticCategory = "city";
  cosmeticConfirmation = null; updateProfileTabHeader();
  const view = document.getElementById("skinsView"); view.innerHTML = renderSkinsPanel("profile"); bindSkinsPanel(view.querySelector(".skins-panel"));
  void reloadCosmetics();
}
function openMySkins() {
  cosmeticCategory = COSMETIC_CATALOG.item(cosmeticSelected)?.category || "city";
  modal.close(); profileScreen.classList.add("open"); profileScreen.setAttribute("aria-hidden", "false"); showProfileSkins();
}
function openSkinShop() {
  requestFlagEditorExit(() => { closeProfileScreen({ force: true }); cosmeticCategory = "all"; cosmeticConfirmation = null; cosmeticOpenShopRequested = true; showShopModal(); });
}

function updateCosmeticProfileNavigation() {
  window.CrownlandsPlayerProfileUI?.setOverview(activeProfileTab === "profile" && Boolean(flagEditorView?.hidden));
  const showingSkins = activeProfileTab === "skins";
  profileScreen.classList.toggle("skins-active", showingSkins);
  document.getElementById("skinsView").hidden = !showingSkins;
  document.getElementById("skinsTabBtn").classList.toggle("active", showingSkins);
  document.getElementById("skinsTabBtn").setAttribute("aria-selected", String(showingSkins));
  const showingSkills = activeProfileTab === "skills";
  const showingSettings = activeProfileTab === "settings";
  const showingClan = activeProfileTab === "clan";
  if (profileScreenTitle) profileScreenTitle.textContent = showingSkins ? "Skins" : showingSettings ? "Settings" : showingSkills ? "Skills" : showingClan ? "Clan" : "Profile";
  if (profileTabBtn) {
    profileTabBtn.classList.toggle("active", !showingSkins && !showingSkills && !showingSettings && !showingClan);
    profileTabBtn.setAttribute("aria-selected", String(!showingSkins && !showingSkills && !showingSettings && !showingClan));
  }
  if (clanTabBtn) {
    clanTabBtn.classList.toggle("active", showingClan);
    clanTabBtn.setAttribute("aria-selected", String(showingClan));
  }
  if (skillsTabBtn) {
    skillsTabBtn.classList.toggle("active", showingSkills);
    skillsTabBtn.setAttribute("aria-selected", String(showingSkills));
  }
  if (settingsTabBtn) {
    settingsTabBtn.classList.toggle("active", showingSettings);
    settingsTabBtn.setAttribute("aria-selected", String(showingSettings));
  }
}


function renderCosmeticPickupIcon(type) {
  if (type === "crowns") return `<img class="harvest-bonus-icon" src="assets/optimized/pickup-crowns-192x192-d4a7a7bc335c.webp" alt="" width="192" height="192" draggable="false">`;
  return normalizeHarvestBonusType(type) === "troops"
    ? `<img class="harvest-bonus-icon" src="${TROOP_PICKUP_ICON_SRC}" alt="" draggable="false">`
    : `<img class="harvest-bonus-icon" src="${GOLD_PICKUP_ICON_SRC}" alt="" draggable="false">`;
}
