"use strict";
/* exported renderCityDetailsPanel, renderCityDetailsUpgrade, bindCityDetailsPanel, patchCityDetailsPanel, recordCityDetailsFailure */

// Presentation only. Costs, projections, visibility and actions remain game-owned.
const cityDetailsIcons = {
    coin: `<path class="engraving-surface" d="M16 3 23 5 28 10 29 17 26 24 20 28 12 29 6 25 3 19 3 12 8 6Z"/>
      <path class="engraving-shadow" d="M27 11 27 18 24 24 18 27 11 27 6 23 9 27 16 30 24 27 29 20 30 14Z"/>
      <path class="engraving-detail" d="M10 8 16 6 23 9M7 12l-1 5 3 6M22 24l3-4"/>
      <path class="engraving-ink" d="m9 11 4 3 3-6 3 6 4-3-2 10H11Z"/>
      <path d="M12 24h8"/>`,
    city: `<path class="engraving-surface" d="M3 28V9h3V5h4v4h3V5h6v4h3V5h4v4h3v19Z"/>
      <path class="engraving-shadow" d="M24 10h5v18h-5ZM3 25h26v3H3Z"/>
      <path d="M11 10v17M21 10v17M3 16h8m10 0h8"/>
      <path class="engraving-ink" d="M13 27v-8c0-5 6-5 6 0v8ZM6 11h2v3H6Zm18 0h2v3h-2Z"/>
      <path class="engraving-detail engraving-fine" d="M5 21h4m14 0h4M15 11h2M6 17v3m20-3v3"/>`,
    troops: `<path class="engraving-surface" d="M8 18v7l8 5 8-5v-7ZM6 16 8 9q3-6 8-6t8 6l2 7Z"/>
      <path class="engraving-shadow" d="M18 4q6 3 7 12h-6ZM19 20h5v5l-8 5v-5Z"/>
      <path class="engraving-ink" d="m5 14 22 1 3 3-1 2H3l-1-2ZM11 21h4v2h-4Zm6 0h4v2h-4Z"/>
      <path d="m16 5-1 8m1 8v5"/>
      <path class="engraving-detail engraving-fine" d="m10 25 2 2m0-3 2 2m5 1 2-2m-9-15 1-2"/>`,
    wall: `<path class="engraving-surface" d="M3 28 4 6h6v6h3V5h6v7h3V6h6l1 22Z"/>
      <path class="engraving-shadow" d="m25 7 3-1 1 22H3v-4h22Z"/>
      <path d="M4 18h24M5 24h23M9 12v6m9-6v6m-5 0v6m9-6v6M8 24v3m10-3v3"/>
      <path class="engraving-detail engraving-fine" d="m6 8 2-1m7 0h2M6 21h3m8-1h2"/>`,
    ledger: `<path class="engraving-surface" d="m5 7 18-4 5 3v21l-19 3-4-3Z"/>
      <path class="engraving-shadow" d="m5 7 4 2v21l-4-3Zm4 18 19-3v5L9 30Z"/>
      <path d="m5 7 4 2 19-3M9 9v20"/>
      <path class="engraving-ink" d="m10 16 17-3v4l-17 3Z"/>
      <path class="engraving-surface" d="m19 14 5-1v5l-5 1Z"/>
      <path class="engraving-detail engraving-fine" d="m12 12 5-1m-5 12 3-.5M6 12l2 1m-2 9 2 1"/>`,
    upgrade: `<path class="engraving-surface" d="m4 6 3-2 19 20 1 5-5-2Z"/>
      <path class="engraving-shadow" d="m6 7 18 19 3 3-5-2L4 8Z"/>
      <path class="engraving-surface" d="m16 11 4 4L7 30l-4-3Z"/>
      <path class="engraving-shadow" d="m18 14 2 1L7 30l-2-2Z"/>
      <path class="engraving-surface" d="m10 7 6-5 14 12-6 6Z"/>
      <path class="engraving-ink" d="m25 10 5 4-6 6-5-4Z"/>
      <path class="engraving-detail" d="m13 8 9 8M15 6l5 4"/>`,
    close: `<path class="engraving-ink" d="m7 5 9 9 9-9 2 2-9 9 9 9-2 2-9-9-9 9-2-2 9-9-9-9Z"/>
      <path class="engraving-detail" d="m6 5-1 2m20-2 2 2M5 25l2 2m18 0 2-2"/>`,
    allegiance: `<path class="engraving-surface" d="m5 4 11-1 11 1-1 14q-2 7-10 12Q8 26 6 18Z"/>
      <path class="engraving-ink" d="M14 4h4v9h8v4h-8v10l-2 2-2-2V17H6v-4h8Z"/>`
  };

function cityDetailsNumber(value) {
  return Math.floor(Number(value) || 0).toLocaleString("en-US");
}

function cityDetailsIcon(name) {
  return `<span class="cd-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false">${cityDetailsIcons[name] || ""}</svg></span>`;
}

function cityDetailsRow(key, label, value, icon, help = "") {
  if (help === "No active stat bonuses") help = "";
  return `<div class="cd-row"><dt>${icon ? cityDetailsIcon(icon) : ""}<span>${label}</span></dt><dd data-cd-value="${key}">${value}</dd>${help ? `<small>${help}</small>` : ""}</div>`;
}

function getCityDetailsValues(city) {
  const projected = getProjectedCityForInstantActions(city) || city;
  const stats = getCityStats(projected);
  const confirmedStats = getCityStats(city);
  return {
    level: formatNumber(projected.level),
    troops: cityDetailsNumber(city.troops),
    gold: formatBaseAndBonusStat(stats.baseGoldProductionPerHour, stats.goldProductionPerHour, "/h"),
    production: formatBaseAndBonusStat(stats.baseTroopProductionPerHour, stats.troopProductionPerHour, "/h"),
    walls: formatBaseAndBonusStat(stats.baseCityWalls, stats.cityWalls),
    invested: cityDetailsNumber(city.investedGold || 0),
    defense: formatNumber(supportsSiegeCombat() ? getCityFortificationDisplay(city, confirmedStats).totalDefensePower : confirmedStats.totalDefense),
    soldiers: formatNumber(stats.troopDefense),
    art: getCastleAsset(getCastleStage(projected.level)),
  };
}

function renderCityDetailsPanel(city, { mainCityBlock = "", upgradeMarkup = "", onboardingMarkup = "", foreignMarkup = "" } = {}) {
  const owned = city.owner === "player";
  const mainCity = getMainCityReference();
  const projected = owned ? getProjectedCityForInstantActions(city) || city : city;
  const stats = getCityStats(city);
  const values = owned ? getCityDetailsValues(city) : null;
  const relation = owned ? (isMainCityForList(city) ? "Your main city" : "Your city") : isClanAllyCity(city) ? "Clan ally" : city.owner === "neutral" ? "Neutral city" : "Rival city";
  const owner = renderPlayerNameLink(city.ownerUid || getCurrentOnlineUid(), getCityOwnerDisplayName(city));
  const overview = owned ? `
    <div class="cd-garrison">${cityDetailsIcon("troops")}<span>Garrison<strong><span data-cd-value="troops" data-live-city-garrison="${escapeHtml(city.id)}">${values.troops}</span> <small>troops</small></strong></span></div>
    <dl class="cd-stats">
      ${cityDetailsRow("gold", "Gold production", values.gold, "coin", getCityStatBonusSources(stats, "gold"))}
      ${cityDetailsRow("production", "Troop production", values.production, "troops", getCityStatBonusSources(stats, "troops"))}
      ${cityDetailsRow("walls", "City walls", values.walls, "wall", getCityStatBonusSources(stats, "walls"))}
      ${cityDetailsRow("invested", "Invested gold", values.invested, "ledger", "Clears when captured")}
    </dl>
    <div class="cd-management">${mainCityBlock}${renderRelinquishCityAction(city)}</div>
    ${renderHoldingReinforcementPanel(city)}` : foreignMarkup;
  return `<section class="cd-panel" data-city-details="${escapeHtml(city.id)}" data-cd-region="${escapeHtml(getCityRegionId(city))}" data-cd-scope="${escapeHtml(getOnlineRequestScope())}" data-cd-owned="${owned}">
    <div class="cd-ledger">
      <section class="cd-portrait"><img data-cd-art src="${escapeHtml(getCastleAsset(getCastleStage(projected.level)))}" alt=""><div><p class="cd-relation">${relation}</p><span class="cd-level">Level <b data-cd-value="level">${formatNumber(projected.level)}</b></span><div class="cd-owner">${owner}</div><span class="cd-allegiance">${cityDetailsIcon("allegiance")}${owned ? "Your kingdom" : relation}</span></div></section>
      ${canEnterInnerCastle(mainCity) ? `<button id="enterInnerCastleBtn" class="inner-castle-entry-btn" type="button" title="Open your main city's Inner Castle">${cityDetailsIcon("city")}Enter Inner Castle</button>` : ""}
      ${onboardingMarkup}
      ${owned ? `<div class="cd-tabs" role="tablist" aria-label="City information"><button id="cdOverviewTab" type="button" role="tab" aria-selected="true" aria-controls="cdOverview">Overview</button><button id="cdDefencesTab" type="button" role="tab" aria-selected="false" aria-controls="cdDefences" tabindex="-1">Defences</button></div>` : ""}
      <section id="cdOverview" ${owned ? 'role="tabpanel" aria-labelledby="cdOverviewTab"' : 'aria-label="City information"'}>${overview}</section>
      ${owned ? `<section id="cdDefences" role="tabpanel" aria-labelledby="cdDefencesTab" hidden><h3>Walls &amp; garrison</h3><dl class="cd-stats">
        ${cityDetailsRow("defense", "Estimated live defense", values.defense, "wall", supportsSiegeCombat() ? "Current wall power plus locally estimated garrison defense" : getCityStatBonusSources(stats, "defense"))}
        ${cityDetailsRow("soldiers", "Soldier defense", values.soldiers, "troops", `${BASE_TROOP_DEFENSE_POWER.toFixed(2)} base per soldier · ${getCityStatBonusSources(stats, "defense")}`)}
        </dl><div class="cd-fortification">${renderCityFortificationStatus(city, stats)}</div><p class="cd-note">Live defense uses confirmed city data. Pending levels appear in the overview while upgrades sync.</p></section>` : ""}
    </div>${upgradeMarkup}
  </section>`;
}

function renderCityDetailsUpgrade(city) {
  return `<footer class="cd-actions" data-city-upgrade-city="${escapeHtml(city.id)}" data-city-upgrade-region="${escapeHtml(getCityRegionId(city))}">
    <div class="cd-upgrade-heading">${cityDetailsIcon("upgrade")}<span><strong>Develop this city</strong><small id="cdUpgradeHint"></small></span></div>
    <div class="cd-amounts" role="group" aria-label="City upgrade amount"><button type="button" data-cd-amount="0" aria-pressed="true">+1</button><button type="button" data-cd-amount="1" aria-pressed="false">+5</button><button type="button" data-cd-amount="2" aria-pressed="false">MAX</button></div>
    <button class="cd-upgrade" type="button" data-city-upgrade-mode="exact" data-city-upgrade-levels="1" data-city-upgrade-city="${escapeHtml(city.id)}" data-city-upgrade-region="${escapeHtml(getCityRegionId(city))}" data-audio-effect="none" aria-describedby="cdUpgradeHint cdFeedback"><span data-cd-upgrade-label></span><span class="cd-price">${cityDetailsIcon("coin")}<b data-cd-cost></b></span></button>
    <div id="cdFeedback" class="cd-feedback"><span data-cd-feedback-icon>${cityDetailsIcon("coin")}</span><div><strong data-cd-feedback-title role="status" aria-atomic="true"></strong><span data-cd-feedback-balance></span></div></div>
  </footer>`;
}

function bindCityDetailsPanel(city) {
  const root = modalBody.querySelector(".cd-panel");
  if (!root) return;
  root.querySelector("#enterInnerCastleBtn")?.addEventListener("click", () => {
    const mainCity = getMainCityReference();
    if (mainCity) openInnerCastle(mainCity.id, city.id);
  });
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const selectTab = tab => tabs.forEach(candidate => {
    const selected = candidate === tab;
    candidate.setAttribute("aria-selected", String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    root.querySelector(`#${candidate.getAttribute("aria-controls")}`).hidden = !selected;
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[1 - index];
      selectTab(next);
      next.focus();
    });
  });
  root.querySelectorAll("[data-cd-amount]").forEach(button => button.addEventListener("click", () => {
    root.dataset.cdAmount = button.dataset.cdAmount;
    patchCityDetailsPanel();
  }));
  root.querySelector(".cd-upgrade")?.addEventListener("click", () => {
    delete root.dataset.cdFailure;
    // The existing action listener runs next, synchronously reserving Gold.
    queueMicrotask(() => { if (root.isConnected) patchCityDetailsPanel(); });
  });
  if (city.owner === "player") patchCityDetailsPanel(true);
}

// Called before the legacy selected-map-city filter. Gold can change elsewhere.
// No subtree replacement here: controls, selection and scrolling keep identity.
function patchCityDetailsPanel(initialRender = false) {
  if (!modal?.open && !initialRender) return false;
  const root = modalBody?.querySelector('.cd-panel[data-cd-owned="true"]');
  if (!root) return false;
  const city = getOwnedCitySnapshotForUpgrade(root.dataset.cityDetails, root.dataset.cdRegion);
  const current = root.dataset.cdScope === getOnlineRequestScope();
  const button = root.querySelector(".cd-upgrade");
  if (!current || !city || city.owner !== "player" || isStronghold(city)) {
    if (button) button.disabled = true;
    root.querySelector("[data-cd-feedback-title]").textContent = "City no longer available";
    root.querySelector("[data-cd-feedback-balance]").textContent = "Reopen City Details to refresh.";
    return true;
  }
  const optionState = getCityUpgradeOptionState(city);
  if (!optionState || !button) return true;
  const values = getCityDetailsValues(city);
  root.querySelectorAll("[data-cd-value]").forEach(element => {
    const value = values[element.dataset.cdValue];
    if (value !== undefined && element.innerHTML !== value) element.innerHTML = value;
  });
  const art = root.querySelector("[data-cd-art]");
  if (art.getAttribute("src") !== values.art) art.setAttribute("src", values.art);
  const fortification = root.querySelector(".cd-fortification");
  const fortificationMarkup = renderCityFortificationStatus(city, getCityStats(city));
  // This block contains only passive wall/repair information, never controls.
  if (fortification && fortification.innerHTML !== fortificationMarkup) fortification.innerHTML = fortificationMarkup;
  const amount = Math.min(2, Math.max(0, Number(root.dataset.cdAmount) || 0));
  const option = optionState.options[amount];
  const pending = getPendingCityUpgradeCount(city, optionState.regionId);
  const recovery = Boolean(instantEconomySyncRecovery);
  const confirmed = getCityListUpgradeFeedback(city);
  if (pending && !recovery && root.dataset.cdFailure !== String(optionState.pendingAction?.id)) delete root.dataset.cdFailure;
  const failed = Boolean(root.dataset.cdFailure);
  const affordable = !option.disabled && !recovery;
  const levels = option.levels;
  const cost = Number.isFinite(option.cost) ? option.cost : optionState.options[0].cost;
  const put = (selector, text) => {
    const node = root.querySelector(selector);
    if (node.textContent !== text) node.textContent = text;
  };
  root.querySelectorAll("[data-cd-amount]").forEach(candidate => candidate.setAttribute("aria-pressed", String(Number(candidate.dataset.cdAmount) === amount)));
  button.disabled = !affordable;
  button.dataset.cityUpgradeMode = option.mode;
  button.dataset.cityUpgradeLevels = String(levels);
  put("#cdUpgradeHint", levels > 0 ? `Level ${formatNumber(optionState.currentLevel)} → ${formatNumber(optionState.currentLevel + levels)} · +${formatNumber(levels)} level${levels === 1 ? "" : "s"}` : `Level ${formatNumber(optionState.currentLevel)} · No affordable levels`);
  put("[data-cd-upgrade-label]", failed && affordable ? "Retry upgrade" : `Upgrade${levels > 0 ? ` to level ${formatNumber(optionState.currentLevel + levels)}` : " city"}`);
  put("[data-cd-cost]", Number.isFinite(cost) ? cityDetailsNumber(cost) : "—");
  let title = "Ready to develop", icon = "coin", status = "ready";
  if (recovery) { title = "Checking city & gold…"; icon = "ledger"; status = "pending"; }
  else if (pending) { title = `${formatNumber(pending)} level${pending === 1 ? "" : "s"} syncing…`; icon = "upgrade"; status = "pending"; }
  else if (option.reason === "Incoming" || option.reason === "Refresh") {
    title = option.reason === "Incoming" ? "Incoming attack · upgrade blocked" : "Refresh to upgrade"; status = "disabled";
  }
  else if (failed) { title = "Upgrade not confirmed"; icon = "ledger"; status = "error"; }
  else if (confirmed) { title = `Level ${formatNumber(confirmed.finalLevel)} reached`; icon = "city"; status = "success"; }
  else if (option.disabled) {
    status = "disabled";
    title = Number.isFinite(cost) && cost > optionState.availableGold ? `Need ${cityDetailsNumber(cost - optionState.availableGold)} more gold` : "Upgrade unavailable";
  }
  root.dataset.cdStatus = status;
  put("[data-cd-feedback-title]", title);
  put("[data-cd-feedback-balance]", recovery ? "Refreshing confirmed balance…" : `${pending ? "After reservations" : confirmed && !failed ? "Remaining" : "Available"}: ${cityDetailsNumber(optionState.availableGold)} gold`);
  const iconNode = root.querySelector("[data-cd-feedback-icon]");
  if (iconNode.dataset.icon !== icon) { iconNode.innerHTML = cityDetailsIcon(icon); iconNode.dataset.icon = icon; }
  return true;
}

function recordCityDetailsFailure(action) {
  // Feedback must never affect queue settlement, including during navigation.
  try {
    const root = modal?.open && modalBody?.querySelector('.cd-panel[data-cd-owned="true"]');
    if (root && root.dataset.cdScope === getOnlineRequestScope() && action.generation === instantEconomyGeneration
      && action.key === getCityUpgradeActionKey(root.dataset.cityDetails, root.dataset.cdRegion)) root.dataset.cdFailure = String(action.id);
  } catch (error) {
    console.warn("Could not present city detail feedback", error);
  }
}
