/* Approved Reinforcements presentation. Existing server return actions remain authoritative. */
/* exported renderReinforcementsActivityHeader, renderReinforcementsActivityFooter, captureReinforcementsActivityView, bindReinforcementsActivityView, setReinforcementActivityError, getReinforcementActivityError, renderReinforcementsPanelView, renderTravelingSupportView, renderStationedSupportView */
const reinforcementActivityErrors = new Map();
function setReinforcementActivityError(id, message = "") {
  const key = `${getCurrentOnlineUid()}:${id}`;
  if (message) reinforcementActivityErrors.set(key, String(message));
  else reinforcementActivityErrors.delete(key);
  while (reinforcementActivityErrors.size > 50) reinforcementActivityErrors.delete(reinforcementActivityErrors.keys().next().value);
}
function getReinforcementActivityError(id) {
  return reinforcementActivityErrors.get(`${getCurrentOnlineUid()}:${id}`) || "";
}
function renderReinforcementsActivityHeader() {
  return `<header class="window-header"><img class="heading-art" src="assets/icons/skills/atlas-v1/marchOrders.webp" alt=""><div class="heading"><p>ORDERS OF THE REALM</p><h2>Kingdom Activity</h2></div><div class="support-heading"><img src="assets/icons/skills/atlas-v1/shieldwallDiscipline.webp" alt=""><span>Clan support</span></div><button class="close-button" data-close-marches type="button" aria-label="Close Kingdom Activity">×</button></header>`;
}
function renderReinforcementsActivityFooter() {
  return '<footer class="report-footer"><span>Stationed troops remain until returned, invalidated or lost in battle.</span><span>Scroll for all support</span></footer>';
}
function captureReinforcementsActivityView() {
  const ledger = modalBody.querySelector(".support-ledger");
  if (!ledger) return null;
  const focused = modalBody.contains(document.activeElement) ? document.activeElement : null;
  const attribute = ["data-support-location", "data-return-clan-reinforcement", "data-support-jump", "data-player-profile-uid", "data-close-marches", "data-active-operations-tab"].find(name => focused?.hasAttribute(name));
  const value = attribute ? focused.getAttribute(attribute) : null;
  return {
    scroll: ledger.scrollTop, attribute, value,
    index: attribute ? [...modalBody.querySelectorAll(`[${attribute}]`)].filter(element => element.getAttribute(attribute) === value).indexOf(focused) : -1,
    scrollFocused: focused === ledger,
  };
}
function bindReinforcementsActivityView(previous) {
  const ledger = modalBody.querySelector(".support-ledger");
  if (!ledger) return;
  modalBody.querySelectorAll("[data-support-jump]").forEach(button => button.addEventListener("click", () => {
    modalBody.querySelector(`#support-${button.dataset.supportJump}`)?.scrollIntoView({ block: "start", behavior: "instant" });
    ledger.focus({ preventScroll: true });
  }));
  modalBody.querySelectorAll("[data-support-location]").forEach(button => button.addEventListener("click", () => {
    void focusReinforcementLocation(button.dataset.supportLocation);
  }));
  if (!previous) return;
  ledger.scrollTop = previous.scroll;
  if (previous.attribute) {
    const replacement = [...modalBody.querySelectorAll(`[${previous.attribute}]`)].filter(element => element.getAttribute(previous.attribute) === previous.value)[previous.index];
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
    else ledger.focus({ preventScroll: true });
  } else if (previous.scrollFocused) ledger.focus({ preventScroll: true });
}

function reinforcementLocationKey(entry) {
  return `${entry.stationed ? "stationed" : "march"}:${entry.key || entry.onlineId || entry.id || ""}`;
}

function renderReinforcementLocationButton(entry) {
  const label = entry.stationed ? `Show ${entry.targetName || "reinforced holding"} on map` : "Show current troop location on map";
  return `<button class="support-location" data-support-location="${escapeHtml(reinforcementLocationKey(entry))}" type="button" aria-label="${escapeHtml(label)}"><span aria-hidden="true">⌖</span>Location</button>`;
}

async function focusReinforcementLocation(key) {
  const scope = getOnlineSessionRequestScope();
  const clanId = state?.clanId;
  const current = () => scope === getOnlineSessionRequestScope() && clanId === state?.clanId;
  try {
    // Re-read after loading a map: the army can move, return or finish meanwhile.
    for (let attempt = 0; attempt < 2 && current(); attempt++) {
      const entry = getActiveOperationsSnapshot().reinforcements.find(item => reinforcementLocationKey(item) === key);
      if (!entry) { showToast("That reinforcement is no longer active."); return false; }
      const target = entry.stationed ? getArmyTargetById(entry.targetId) : null;
      const location = entry.stationed
        ? { regionId: entry.targetRegionId || (target && getCityRegionId(target)), point: target }
        : getMissionPointAtProgress(entry, getArmyTravelProgress(entry));
      if (!location?.regionId) break;
      const regionId = normalizeRegionId(location.regionId);
      if (regionId !== getActiveMapRegionId()) {
        if (!await switchOnlineIsland(regionId, { preserveModal: true })) break;
        continue;
      }
      if (!location.point || (entry.stationed && getCityRegionId(target) !== regionId)
        || !Number.isFinite(location.point.x) || !Number.isFinite(location.point.y)) break;
      if (!centerOnWorldPoint(location.point, regionId)) break;
      if (modal.open) modal.close();
      clearSelection();
      if (!entry.stationed) renderArmies(true);
      showToast(entry.stationed ? `Viewing ${target.name || "reinforced holding"}` : "Viewing current troop location");
      return true;
    }
  } catch {
    // Leave the ledger available for retry when the map connection fails.
  }
  if (current()) showToast("That reinforcement location is unavailable. Try again once the map syncs.");
  return false;
}

function renderReinforcementsPanelView(groups, count, help) {
  if (!count) return `<div class="reinforcements-panel"><main class="support-ledger is-empty" tabindex="0" aria-label="All reinforcement assignments"><section class="empty-state"><div class="empty-emblem"><img src="assets/icons/skills/atlas-v1/shieldwallDiscipline.webp" alt=""></div><h3>No active clan support</h3><p>Reinforce a clan ally from their holding on the map. Traveling and stationed support will appear here.</p><button data-close-marches type="button">Return to map</button></section></main></div>`;
  return `<div class="reinforcements-panel"><nav class="support-nav" aria-label="Reinforcement sections"><div class="support-total" title="${escapeHtml(help)}"><strong>${formatMarchesNumber(count)}</strong><span>support assignments</span></div>${groups.map(group => `<button data-support-jump="${group.id}" type="button" ${group.entries.length ? "" : "disabled"}><span>${group.title}</span><b>${formatMarchesNumber(group.entries.length)}</b></button>`).join("")}</nav>
    <main class="support-ledger" tabindex="0" aria-label="All reinforcement assignments">${groups.map(group => !group.entries.length ? "" : `<section class="support-group" id="support-${group.id}" aria-labelledby="support-heading-${group.id}"><header class="group-heading"><img src="${group.icon}" alt=""><div><h3 id="support-heading-${group.id}">${group.title}</h3><p>${group.description}</p></div><strong aria-label="${group.entries.length} assignments">${formatMarchesNumber(group.entries.length)}</strong></header>${group.entries.map(renderReinforcementOperationCard).join("")}</section>`).join("")}</main></div>`;
}

function renderTravelingSupportView({ entry, returning, label, destination, fromName, toName, fromRegion, toRegion, relationship, force }) {
    return `<article class="support-row traveling ${returning ? "returning" : ""}" data-support-row="${escapeHtml(entry.key || entry.onlineId || entry.id || "")}"><img class="company-art" src="assets/icons/skills/atlas-v1/marchOrders.webp" alt=""><div class="route-copy"><span class="row-eyebrow">${label}</span><div class="support-route"><div><small>From</small><strong>${escapeHtml(fromName)}</strong><span class="map-name">${escapeHtml(fromRegion ? getRegionLabel(fromRegion) : "")}</span></div><span class="route-arrow" aria-hidden="true">→</span><div><small>${returning ? "Returning to" : "To"}</small><strong>${escapeHtml(toName)}</strong><span class="map-name">${escapeHtml(toRegion ? getRegionLabel(toRegion) : "")}</span></div></div><div class="ruler-note">${relationship}</div></div>${force}<div class="arrival"><strong>${entry.isResolving ? "Arriving" : formatDuration(entry.remaining)}</strong><small>${entry.isResolving ? "Confirming arrival" : "Until arrival"}</small>${renderReinforcementLocationButton(entry)}${destination?.usedMainCityFallback ? '<p class="fallback">Main City fallback</p>' : ""}</div></article>`;
}

function renderStationedSupportView({ entry, holderView, pending, destination, error, action, objective, targetName, relationship, troopsArt }) {
  return `<article class="support-row ${holderView ? "defending" : "allies"} ${pending ? "pending" : ""} ${error ? "retry" : ""}" data-support-row="${escapeHtml(entry.id)}" aria-busy="${pending}"><img class="company-art" src="${objective ? "assets/clan-heraldry/art-set-v1/svg/full/fortress-keep.svg" : "assets/icons/skills/atlas-v1/shieldwallDiscipline.webp"}" alt=""><div class="holding-copy"><span class="row-eyebrow">${holderView ? "Allied garrison" : "Stationed"}</span><h4>${escapeHtml(targetName)}</h4><span class="map-name">${escapeHtml(entry.targetRegionId ? getRegionLabel(entry.targetRegionId) : "")}</span><div class="ruler-note">${relationship}</div></div><div class="support-force ${Number(entry.troops) > 9999999 ? "large" : ""}"><img src="${troopsArt}" alt=""><strong>${formatMarchesNumber(entry.troops)}</strong><small>Troops</small></div><div class="return-copy"><small>Returns to</small><strong>${escapeHtml(destination.name)}</strong><p class="${destination.usedMainCityFallback ? "fallback" : ""}">${destination.usedMainCityFallback ? "Via Main City fallback" : "Redirects to Main City if captured"}</p></div><div class="support-command">${renderReinforcementLocationButton(entry)}<button class="return-button ${holderView ? "send-home" : ""}" data-return-clan-reinforcement="${escapeHtml(entry.id)}" type="button" aria-label="${action}: ${escapeHtml(targetName)}" ${pending ? "disabled" : ""}><span class="return-arrow" aria-hidden="true">↶</span><span>${pending ? "Returning…" : action}</span></button>${pending ? "<small>Sending return order…</small>" : ""}</div>${error ? `<p class="row-feedback" role="status">${escapeHtml(error)}</p>` : ""}</article>`;
}
