/* Approved Incoming Threats presentation. Army visibility and navigation remain game-owned. */
/* exported renderIncomingThreatsLedger, renderIncomingThreatRow */
let incomingThreatsNavigationPending = false;
function incomingThreatNumber(value) {
  const amount = Number(value);
  return value == null || !Number.isFinite(amount) ? "Unknown" : Math.max(0, Math.floor(amount)).toLocaleString("en-US");
}
function incomingThreatIcon(name) {
  return `<svg aria-hidden="true"><use href="assets/icons/battle-reports-ledger-r1.svg#${name}"></use></svg>`;
}
function incomingThreatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return value >= 3600 ? `${Math.floor(value / 3600)}h ${String(Math.floor(value % 3600 / 60)).padStart(2, "0")}m` : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function renderIncomingThreatRow(row) {
  const scout = row.kind === "scout", legion = row.kind === "legion";
  const label = scout ? "Scout" : legion ? "Legion" : "Attack";
  const stats = row.pending ? '<p class="pending-note">Details refresh when this map opens.</p>' : `<div class="city-stats"><span><strong>${incomingThreatNumber(row.troops)}</strong> troops</span><span><strong>${incomingThreatNumber(row.defense)}</strong> defense</span></div>`;
  return `<article class="threat-row ${row.kind}${row.remaining <= 60 ? " urgent" : ""}" data-threat="${escapeHtml(row.key)}" aria-label="${label} approaching ${escapeHtml(row.name)}">
    <div class="arrival"><time aria-label="Time until arrival">${incomingThreatTime(row.remaining)}</time><span class="kind-label">${incomingThreatIcon(scout ? "scout" : legion ? "realm" : "attack")}${label}</span>${row.remaining <= 60 ? '<small class="urgency">Arriving soon</small>' : ""}</div>
    <div class="attacker"><span class="attacker-label">${legion ? "Citadel force" : scout ? "Scouting ruler" : "Attacking ruler"}</span>${row.identity}<p class="origin">From <strong>${escapeHtml(row.origin)}</strong></p></div>
    <div class="city"><span class="city-region">${escapeHtml(row.regionName)}</span><div class="city-title"><h3>${escapeHtml(row.name)}</h3>${!row.pending && row.regularCity ? `<span class="level">Lv ${formatNumber(row.level)}</span>` : ""}</div>${stats}</div>
    <div class="force${!scout && !row.force ? " unknown" : ""}"><span>${scout ? "Incoming" : "Estimated"}</span><strong>${escapeHtml(scout ? "1" : row.force || "Unknown")}</strong><small>${scout ? "scout" : "troops"}</small></div>
    <button class="locate" data-incoming-city="${escapeHtml(row.id)}" data-incoming-region="${escapeHtml(row.regionId)}" type="button" aria-label="Locate ${escapeHtml(row.name)} in ${escapeHtml(row.regionName)}"${incomingThreatsNavigationPending ? " disabled" : ""}>${incomingThreatIcon("map")}<span>${row.regularCity ? "Locate City" : "Locate"}</span></button>
  </article>`;
}
function renderIncomingThreatsLedger(incoming) {
  modal.classList.add("incoming-threats-ledger");
  const previousList = modalBody.querySelector(".threat-list");
  const scroll = previousList?.scrollTop || 0;
  const active = modalBody.contains(document.activeElement) ? document.activeElement : null;
  const focusAttribute = ["data-incoming-city", "data-player-profile-uid", "data-incoming-filter", "data-close-incoming"].find(attribute => active?.hasAttribute(attribute));
  const focusValue = focusAttribute ? active.getAttribute(focusAttribute) : "";
  const focusRegion = active?.getAttribute("data-incoming-region");
  const focusRow = active?.closest("[data-threat]")?.getAttribute("data-threat");
  const filter = modalBody.querySelector(".incoming-ledger")?.dataset.filter || "all";
  const attacks = incoming.filter(attack => attack.kind !== "scout").length;
  const scouts = incoming.length - attacks;
  const holdings = new Set(incoming.map(attack => `${attack.targetRegionId || getCityRegionId(attack.target)}:${attack.target.id}`)).size;
  const onlyCities = incoming.every(attack => !isRewardCampTarget(attack.target) && !isHoldingTowerTarget(attack.target) && !isStronghold(attack.target) && !isCrownCitadel(attack.target));
  const visible = incoming.filter(attack => filter === "all" || (filter === "attack" ? attack.kind !== "scout" : attack.kind === "scout"));
  const first = incoming[0];
  const markup = `<section class="incoming-ledger ledger" data-filter="${filter}">
    <header class="window-header">${incomingThreatIcon("defense-defeat")}<div class="heading"><p>THE WATCHMAN'S LEDGER</p><h2>Incoming Threats</h2></div><span class="header-note">Keep watch over your ${onlyCities ? "cities" : "holdings"}</span><button class="close-button" data-close-incoming type="button" aria-label="Close Incoming Threats">×</button></header>
    <section class="summary${incoming.length ? "" : " all-clear"}" aria-label="Incoming threat summary"><div class="summary-copy"><strong class="summary-number">${formatNumber(incoming.length)}</strong><div><h2>${incoming.length ? "Incoming threats" : "All clear"}</h2><p>${incoming.length ? `${holdings} ${onlyCities ? (holdings === 1 ? "city" : "cities") : (holdings === 1 ? "holding" : "holdings")} watched · ${attacks} ${attacks === 1 ? "attack" : "attacks"} · ${scouts} ${scouts === 1 ? "scout" : "scouts"}` : "No incoming attacks or scouts"}</p></div></div>${first ? `<div class="next-arrival"><div><span>Next arrival</span><small>${escapeHtml(first.target.name)}</small></div><strong>${incomingThreatTime(first.remaining)}</strong></div>` : ""}</section>
    <nav class="filters" aria-label="Filter incoming threats">${[["all","All",incoming.length],["attack","Attacks",attacks],["scout","Scouts",scouts]].map(([id,label,count]) => `<button data-incoming-filter="${id}" aria-pressed="${filter === id}" type="button">${id === "all" ? "" : incomingThreatIcon(id)}${label}<span>${count}</span></button>`).join("")}<span class="sort-note">Soonest arrival first</span></nav>
    <div class="column-labels" aria-hidden="true"><span>Arrival</span><span>Attacker &amp; origin</span><span>Your ${onlyCities ? "city" : "holding"}</span><span>Incoming force</span><span>Location</span></div>
    <main class="threat-list" tabindex="0" aria-label="Incoming attacks and scouts">${visible.length ? visible.map(renderIncomingAttackCard).join("") : `<div class="empty-state">${incomingThreatIcon("defense")}<h2>${incoming.length ? `No incoming ${filter === "attack" ? "attacks" : "scouts"}` : "The watch is quiet"}</h2><p>${incoming.length ? "Use All to view the other approaching threats." : "No active incoming attacks or scouts."}</p><button ${incoming.length ? 'data-incoming-filter="all"' : "data-close-incoming"} type="button">${incoming.length ? "Show all threats" : "Return to map"}</button></div>`}</main>
    <footer class="ledger-footer"><span role="status">${incomingThreatsNavigationPending ? "Opening location…" : "Keeping watch across your kingdom"}</span><span>${visible.length} of ${incoming.length} shown</span></footer>
  </section>`;
  if (patchOperationModalText(modalBody, markup)) return;
  modalBody.innerHTML = markup;
  const list = modalBody.querySelector(".threat-list");
  list.scrollTop = scroll;
  if (focusAttribute) {
    const replacement = [...modalBody.querySelectorAll(`[${focusAttribute}]`)].find(control => control.getAttribute(focusAttribute) === focusValue && (!focusRegion || control.getAttribute("data-incoming-region") === focusRegion) && (!focusRow || control.closest("[data-threat]")?.getAttribute("data-threat") === focusRow));
    if (replacement && !replacement.disabled) replacement.focus({preventScroll:true});
    else list.focus({preventScroll:true});
  } else if (active === previousList) list.focus({preventScroll:true});
  modalBody.querySelectorAll("[data-close-incoming]").forEach(button => button.addEventListener("click", () => modal.close()));
  modalBody.querySelectorAll("[data-incoming-filter]").forEach(button => button.addEventListener("click", () => {
    modalBody.querySelector(".incoming-ledger").dataset.filter = button.dataset.incomingFilter;
    list.scrollTop = 0;
    renderIncomingAttacksModalContent();
  }));
  modalBody.querySelectorAll("[data-incoming-city]").forEach(button => button.addEventListener("click", async () => {
    if (incomingThreatsNavigationPending) return;
    const uid = getCurrentOnlineUid();
    incomingThreatsNavigationPending = true;
    renderIncomingAttacksModalContent();
    try {
      await focusIncomingAttackCity(button.dataset.incomingCity, button.dataset.incomingRegion);
    } finally {
      incomingThreatsNavigationPending = false;
      if (uid === getCurrentOnlineUid() && modal.open && modal.classList.contains("incoming-attack-modal")) renderIncomingAttacksModalContent();
    }
  }));
}
