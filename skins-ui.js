/* Cosmetic ownership and Crowns are server-authoritative. All launch art is a labeled placeholder. */
/* exported cosmeticOpenShopRequested, syncCosmeticsSession, applyCosmeticCityNode, updateCosmeticProfileNavigation, renderCosmeticPickupIcon */
const COSMETIC_CATALOG = globalThis.CrownlandsCosmetics;
let cosmeticState = null, cosmeticUid = "", cosmeticStop = null, cosmeticOwnerStop = null;
let cosmeticError = "", cosmeticBusy = false, cosmeticOffset = 0, cosmeticConfirmation = null;
let cosmeticPendingPurchase = null, cosmeticCategory = "all", cosmeticSelected = "halloween_city";
let cosmeticOwnerSignature = "", cosmeticOwnersDirty = false, cosmeticOpenShopRequested = false;
const cosmeticOwnerAppearances = new Map(), cosmeticNeededOwners = new Map();
const cosmeticNow = () => Date.now() + cosmeticOffset;
const cosmeticRequestId = () => `skin_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;

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
  cosmeticPendingPurchase = null;
  if (!uid) return;
  try { cosmeticPendingPurchase = JSON.parse(sessionStorage.getItem(`crownlands-cosmetic-purchase:${uid}`) || "null"); } catch { /* Storage may be unavailable. */ }
  const api = getOnlineApi();
  cosmeticStop = api?.subscribeCosmetics?.({
    onState: value => {
      if (cosmeticUid !== uid) return;
      try { const next = COSMETIC_CATALOG.normalize(value); if (cosmeticState && next.revision < cosmeticState.revision) return; cosmeticState = next; cosmeticError = ""; refreshCosmeticPanels(); renderCities(true); }
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
    if (session !== cosmeticUid) return;
    cosmeticOwnerAppearances.clear();
    rows.forEach(row => cosmeticOwnerAppearances.set(row.uid, row.equipped || {}));
    renderCities(true);
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
  node.dataset.citySkin = skin || ""; node.dataset.flagBorder = border || "";
  const art = COSMETIC_CATALOG.item(skin)?.assets?.[getCastleStage(city.level)];
  const image = node.querySelector(".city-art");
  if (art && image && image.getAttribute("src") !== art) {
    const fallback = image.src; image.onerror = () => { image.onerror = null; image.src = fallback; }; image.src = art;
  }
}

function cosmeticPreview(item) {
  const category = item?.category || "city";
  const glyphs = { city: "♜", troops: "⚑", border: "◇", flag: "⚑", bundle: "♛" };
  if (category === "flag" && state?.flag) {
    const symbol = item.symbol || state.flag.symbol;
    return `<span class="skin-flag-preview" data-skin-flag-symbol="${escapeHtml(symbol)}"><span class="flag-symbol"></span></span>`;
  }
  return `<span class="skin-art skin-art-${category}" aria-hidden="true">${glyphs[category] || "♛"}</span>`;
}

function cosmeticChoices(mode) {
  const category = cosmeticCategory === "all" || cosmeticCategory === "bundle" ? "city" : cosmeticCategory;
  if (mode === "shop") return COSMETIC_CATALOG.OFFERS.filter(item => cosmeticCategory === "all" || item.category === cosmeticCategory);
  const defaults = category === "flag"
    ? PLAYER_FLAG_CONFIG.SELECTABLE_SYMBOLS.map(option => ({ id: `free_${option.key}`, category: "flag", name: option.label, symbol: option.key, free: true, description: "Free flag symbol. Your colors and pattern are preserved." }))
    : [{ id: `default_${category}`, category, name: "Default", free: true, description: "Restore the original appearance." }];
  return [...defaults, ...COSMETIC_CATALOG.ITEMS.filter(item => item.category === category && cosmeticState?.owned[item.id])];
}

function cosmeticEquipped(item) {
  if (item.category === "flag") return state?.flag?.symbol === item.symbol;
  return (cosmeticState?.equipped[item.category] || "") === (item.free ? "" : item.id);
}

function renderSkinsPanel(mode = "shop") {
  const library = mode === "profile";
  const choices = cosmeticChoices(mode);
  if (!choices.some(item => item.id === cosmeticSelected)) cosmeticSelected = choices[0]?.id || "";
  const selected = choices.find(item => item.id === cosmeticSelected);
  const categories = library ? Object.entries(COSMETIC_CATALOG.CATEGORIES) : [["all", "All"], ...Object.entries(COSMETIC_CATALOG.CATEGORIES), ["bundle", "Bundles"]];
  const activeCategory = library && ["all", "bundle"].includes(cosmeticCategory) ? "city" : cosmeticCategory;
  const quote = !library && selected && cosmeticState ? COSMETIC_CATALOG.quote(selected.id, cosmeticState, cosmeticNow()) : null;
  const owned = library || quote?.missing.length === 0;
  const sale = COSMETIC_CATALOG.availability(cosmeticNow());
  let action = library ? cosmeticEquipped(selected || {}) ? "Equipped" : selected?.free ? "Restore Default" : "Equip" : owned ? "View in My Skins" : quote?.onSale ? "Review Purchase" : "Available in October";
  if (library && selected?.category === "flag" && selected.free && !cosmeticEquipped(selected)) action = "Equip";
  const disabled = cosmeticBusy || !cosmeticState || (library ? cosmeticEquipped(selected || {}) : !owned && (!quote?.onSale || cosmeticState.crowns < quote.price));
  const feedback = cosmeticError || (cosmeticPendingPurchase ? "A purchase needs checking. Check its result before buying again." : "");
  if (cosmeticConfirmation && !cosmeticBusy && !cosmeticPendingPurchase && (!quote || cosmeticConfirmation.offerId !== quote.offerId || cosmeticConfirmation.price !== quote.price || !quote.onSale || cosmeticState.crowns < quote.price)) cosmeticConfirmation = null;
  const confirm = cosmeticConfirmation;
  return `<section class="skins-panel" data-skins-mode="${mode}" aria-label="${library ? "My skins" : "Skin shop"}">
    <header class="skins-heading"><div><p>${library ? "Your collection" : "The royal wardrobe"}</p><h2>${library ? "My Skins" : "Halloween Collection"}</h2></div><div class="skins-wallet"><strong>${cosmeticState ? cosmeticState.crowns.toLocaleString("en-US") : "—"} Crowns</strong><span>Crown pickups: ${cosmeticState ? COSMETIC_CATALOG.countToday(cosmeticState, cosmeticNow()) : "—"} / 20 today</span><button type="button" data-skin-earn>Earn Crowns</button></div></header>
    <p class="skins-notice">Permanent cosmetics · Free switching · ${sale.onSale ? "Sale ends November 1 at 00:00 UTC" : "Returns October 1 at 00:00 UTC"}. <strong>Placeholder artwork — final designs pending.</strong></p>
    <nav class="skins-filters" aria-label="Skin categories">${categories.map(([id,label]) => `<button type="button" data-skin-category="${id}" aria-pressed="${id === activeCategory}">${label}</button>`).join("")}</nav>
    ${feedback ? `<p class="skins-feedback" role="status">${escapeHtml(feedback)} <button type="button" data-skin-reload>${cosmeticPendingPurchase ? "Check Purchase" : "Retry"}</button></p>` : ""}
    ${!cosmeticUid ? '<p role="status">Sign in to load your permanent collection.</p>' : !cosmeticState && !cosmeticError ? '<p role="status">Loading your collection…</p>' : ""}
    <div class="skins-body"><div class="skins-grid" aria-label="Cosmetics">${choices.map(item => `<button type="button" class="skin-card" data-skin-select="${item.id}" aria-pressed="${item.id === cosmeticSelected}">${cosmeticPreview(item)}<strong>${escapeHtml(item.name)}</strong><span>${library ? cosmeticEquipped(item) ? "Equipped" : item.free ? "Free" : "Owned" : cosmeticState && COSMETIC_CATALOG.quote(item.id,cosmeticState,cosmeticNow()).missing.length === 0 ? "Owned" : (cosmeticState ? COSMETIC_CATALOG.quote(item.id,cosmeticState,cosmeticNow()).price : item.price ?? 1200) + " Crowns"}</span></button>`).join("")}</div>
    <section class="skin-detail" aria-label="Selected cosmetic">${selected ? `${cosmeticPreview(selected)}<h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description)}</p>${selected.placeholder ? '<p class="skins-notice">Preview uses temporary artwork.</p>' : ""}${quote?.missing.length ? `<p><strong>${quote.price} Crowns</strong>${selected.itemIds ? " · 20% off unowned pieces" : ""}</p><ul>${quote.missing.map(id => `<li>${escapeHtml(COSMETIC_CATALOG.item(id).name)}</li>`).join("")}</ul>` : ""}${confirm ? `<section class="skin-confirm" aria-label="Confirm purchase"><h3>Confirm purchase</h3><p>Unlock ${confirm.missing.length} item${confirm.missing.length === 1 ? "" : "s"} for <strong>${confirm.price} Crowns</strong>.</p><p>Balance after purchase: <strong>${cosmeticState.crowns - confirm.price} Crowns</strong></p><button type="button" data-skin-confirm ${cosmeticBusy ? "disabled" : ""}>${cosmeticBusy ? "Checking…" : "Confirm Purchase"}</button><button type="button" data-skin-cancel ${cosmeticBusy ? "disabled" : ""}>Cancel</button></section>` : `<button type="button" class="skin-primary" data-skin-action ${disabled ? "disabled" : ""}>${cosmeticBusy ? "Saving…" : action}</button>${quote && !owned && quote.onSale && cosmeticState.crowns < quote.price ? '<p>Not enough Crowns. Collect Crown pickups on the map.</p>' : ""}`}` : ""}</section></div>
    <footer class="skins-footer"><button type="button" data-skin-browse>${library ? "Browse Shop" : "My Skins"}</button>${library && activeCategory === "flag" ? '<button type="button" data-skin-editor>Open Flag Editor</button>' : ""}<span>Appearance only · Owned items remain usable all year</span></footer></section>`;
}

function bindSkinsPanel(root) {
  if (!root) return;
  const mode = root.dataset.skinsMode;
  root.querySelectorAll("[data-skin-flag-symbol]").forEach(element => FlagRenderer.render(element, { ...state.flag, symbol: element.dataset.skinFlagSymbol }, { stableKey: cosmeticUid || "preview" }));
  root.querySelectorAll("[data-skin-category]").forEach(button => button.addEventListener("click", () => { cosmeticCategory = button.dataset.skinCategory; cosmeticConfirmation = null; refreshCosmeticPanels(); }));
  root.querySelectorAll("[data-skin-select]").forEach(button => button.addEventListener("click", () => { if (cosmeticBusy) return; cosmeticSelected = button.dataset.skinSelect; cosmeticConfirmation = null; refreshCosmeticPanels(); }));
  root.querySelector("[data-skin-earn]")?.addEventListener("click", () => {
    modal.close(); closeProfileScreen(); showToast("Collect Crown pickups on the map: 1 Crown each, up to 20 per UTC day. Pickups rotate Gold → Troops → Crowns.");
  });
  root.querySelector("[data-skin-browse]")?.addEventListener("click", () => mode === "shop" ? openMySkins() : openSkinShop());
  root.querySelector("[data-skin-editor]")?.addEventListener("click", () => { showProfileView(); showFlagEditor(); });
  root.querySelector("[data-skin-reload]")?.addEventListener("click", () => cosmeticPendingPurchase ? submitCosmeticPurchase() : reloadCosmetics());
  root.querySelector("[data-skin-cancel]")?.addEventListener("click", () => { cosmeticConfirmation = null; refreshCosmeticPanels(); });
  root.querySelector("[data-skin-confirm]")?.addEventListener("click", () => submitCosmeticPurchase());
  root.querySelector("[data-skin-action]")?.addEventListener("click", () => {
    if (mode === "profile") { void equipSelectedCosmetic(); return; }
    const quote = COSMETIC_CATALOG.quote(cosmeticSelected, cosmeticState, cosmeticNow());
    if (!quote.missing.length) { openMySkins(); return; }
    if (cosmeticPendingPurchase) { cosmeticError = "Check the pending purchase first."; refreshCosmeticPanels(); return; }
    cosmeticConfirmation = quote; refreshCosmeticPanels();
    document.querySelector("[data-skin-confirm]")?.focus();
  });
}

function refreshCosmeticPanels() {
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
    applyCosmeticResult(result); showToast("Cosmetics added to My Skins.");
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
    if (selected.free && selected.category === "flag") {
      await saveOnlinePlayerIdentity({ flag: { ...state.flag, symbol: selected.symbol } });
    } else {
      const result = await getOnlineApi().equipCosmetic({ category: selected.category, itemId: selected.free ? "" : selected.id, expectedRevision: cosmeticState.revision, expectedIdentityRevision: state.identityRevision || 0, requestId: cosmeticRequestId() });
      if (uid !== cosmeticUid) return;
      applyCosmeticResult(result);
      if (result.flag) { state.flag = result.flag; state.identityRevision = result.identityRevision; }
    }
    if (uid !== cosmeticUid) return;
    if (selected.category === "flag") { rememberCurrentPlayerIdentity(); void syncPlayerIdentityToAllOwnedCities({ forceLeaderboard: true }).catch(error => console.warn("Flag projection refresh pending", error)); }
    renderHud(); renderCities(true); showToast("Appearance equipped.");
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
  if (["all", "bundle"].includes(cosmeticCategory)) cosmeticCategory = "city";
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
  if (type === "crowns") return `<span class="harvest-bonus-icon" aria-hidden="true">♛</span>`;
  return normalizeHarvestBonusType(type) === "troops"
    ? `<img class="harvest-bonus-icon" src="${TROOP_PICKUP_ICON_SRC}" alt="" draggable="false">`
    : `<img class="harvest-bonus-icon" src="${GOLD_PICKUP_ICON_SRC}" alt="" draggable="false">`;
}
