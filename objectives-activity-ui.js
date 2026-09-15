/* Presentation for held objectives; ownership, timers and map actions stay in game.js. */
function renderObjectivesActivityHeader(strongholds) {
  return `<header class="window-header"><img class="heading-art" src="assets/icons/skills/marchOrders.svg" alt=""><div class="heading"><p>ORDERS OF THE REALM</p><h2>Kingdom Activity</h2></div><span class="hold-heading">${strongholds ? "Held strongholds" : "Held camps"}</span><button class="close-button" data-close-marches type="button" aria-label="Close Kingdom Activity">×</button></header>`;
}
function renderObjectivesActivityFooter(strongholds) {
  return `<footer class="report-footer"><span>${strongholds ? "Bonuses remain active while you hold the objective." : "Hold timers follow the realm’s confirmed reward state."}</span><span>Scroll for all holdings</span></footer>`;
}
function captureObjectivesActivityView() {
  const ledger = modalBody.querySelector(".objective-ledger");
  return ledger ? { scroll: ledger.scrollTop, focused: document.activeElement?.dataset.operationLocation, scrollFocused: document.activeElement === ledger } : null;
}
function restoreObjectivesActivityView(previous) {
  const ledger = modalBody.querySelector(".objective-ledger");
  if (!ledger || !previous) return;
  ledger.scrollTop = previous.scroll;
  const button = [...ledger.querySelectorAll("[data-operation-location]")].find(element => element.dataset.operationLocation === previous.focused);
  if (button) button.focus({ preventScroll: true });
  else if (previous.focused || previous.scrollFocused) ledger.focus({ preventScroll: true });
}
function renderObjectiveMapButton(target, stronghold) {
  return renderActiveOperationLocationButton(target, stronghold ? "stronghold" : "camp")
    .replace('class="incoming-attack-locate"', `class="locate-${stronghold ? "hold" : "camp"}"`)
    .replace("</button>", "<span>Map</span></button>");
}
function renderHeldObjectivesView(holdings, strongholds) {
  const prefix = strongholds ? "hold" : "camp";
  const title = strongholds ? "Strongholds" : "Camps";
  const maps = new Set(holdings.map(getCityRegionId)).size;
  const next = holdings.filter(holding => holding.payoutAtMs > Date.now()).sort((a, b) => a.payoutAtMs - b.payoutAtMs)[0];
  const timer = next ? formatDuration(Math.max(0, Math.ceil((next.payoutAtMs - Date.now()) / 1000))) : holdings.some(holding => holding.payoutAtMs > 0) ? "Resolving" : "Syncing";
  const contested = holdings.filter(holding => holding.state === "contested").length;
  const crown = strongholds && holdings.some(isCrownCitadel);
  return `<div class="objectives-panel"><section class="${prefix}-summary"><strong class="held-count">${formatMarchesNumber(holdings.length)}</strong><div><h2>${title} under your control</h2><p>${maps} ${maps === 1 ? "map" : "maps"} · ${strongholds ? "Bonuses remain active while held" : contested ? `${contested} contested` : "Your held objectives"}</p></div>${!holdings.length ? "" : strongholds ? `<div class="hold-summary-note ${crown ? "is-royal" : ""}"><img src="assets/icons/${crown ? "reward-achievements-r1.svg" : "skills/shieldwallDiscipline.svg"}" alt=""><span>${crown ? "Crown Citadel held" : "Regional strongholds"}</span></div>` : `<div class="next-reward"><small>Next camp reward</small><strong>${timer}</strong></div>`}</section>
    ${holdings.length ? `<div class="${prefix}-columns" aria-hidden="true"><span>${strongholds ? "Stronghold & map" : "Camp & map"}</span><span>${strongholds ? "Specialization" : "Hold reward"}</span><span>Garrison</span><span>${strongholds ? "Level" : "Reward timer"}</span><span>Locate</span></div>` : ""}
    <main class="${prefix}-ledger objective-ledger ${holdings.length ? "" : "is-empty"}" tabindex="0" aria-label="All held ${title.toLowerCase()}">${holdings.length ? holdings.map(strongholds ? renderHeldStrongholdOperationCard : renderHeldCampOperationCard).join("") : `<section class="empty-state"><h2>No ${title.toLowerCase()} under your control</h2><p>Your held objectives will appear here.</p><button data-close-marches type="button">Return to map</button></section>`}</main></div>`;
}
function renderHeldCampView(camp) {
  const config = getRewardCampConfig(camp);
  const seconds = camp.payoutAtMs > 0 ? Math.max(0, Math.ceil((camp.payoutAtMs - Date.now()) / 1000)) : null;
  const contested = camp.state === "contested";
  const troops = camp.currentGarrison ?? camp.troops ?? 0;
  const type = config?.rewardType;
  const icon = type === "city" ? "skills/guildCharters.svg" : type === "item" ? "reward-daily-quests-r1.svg" : type === "troops" ? "daily-login-troops-r1.svg" : "royal-shop-gold-r1.svg";
  const art = camp.artSrc || getCampConfigForType(camp.campType).artSrc;
  return `<article class="camp-row ${contested ? "is-contested" : ""} ${troops >= 10000000 ? "large-force" : ""}" data-kind="${escapeHtml(camp.campType || "gold")}"><div class="camp-identity"><img class="camp-art" src="${escapeHtml(art)}" alt=""><div class="camp-name"><h3>${escapeHtml(camp.name)}</h3><p>${escapeHtml(getRegionLabel(getCityRegionId(camp)))}</p></div></div><div class="camp-reward ${type === "city" || type === "item" ? "random" : ""}"><img src="assets/icons/${icon}" alt=""><div><small>${type === "city" || type === "item" ? "Hold reward" : "Base hold reward"}</small><strong>${escapeHtml(formatHeldCampReward(camp))}</strong></div></div><div class="camp-garrison"><strong class="garrison-number">${formatMarchesNumber(troops)}</strong><span class="garrison-label">troops stationed</span><span class="control-label ${contested ? "contested" : ""}">${contested ? "Control contested" : "Controlled by you"}</span></div><div class="camp-timer ${seconds === null || seconds === 0 ? "is-state" : seconds < 60 ? "is-soon" : ""}"><strong>${seconds === null ? "Syncing" : seconds === 0 ? "Resolving" : formatDuration(seconds)}</strong><small>${seconds === null ? "Reward timer" : seconds === 0 ? "Awaiting result" : "Until reward"}</small></div>${renderObjectiveMapButton(camp, false)}</article>`;
}
function renderHeldStrongholdView(holding) {
  const crown = isCrownCitadel(holding);
  const kind = crown ? "crown" : isTrainingStronghold(holding) ? "training" : isSpeedStronghold(holding) ? "speed" : isDefenseStronghold(holding) ? "defense" : "gold";
  const icon = { gold: "royal-shop-gold-r1.svg", training: "daily-login-troops-r1.svg", speed: "skills/marchOrders.svg", defense: "skills/shieldwallDiscipline.svg" }[kind];
  const benefits = [[CROWN_CITADEL_GOLD_BONUS_PERCENT, "Base gold production"], [CROWN_CITADEL_TROOP_BONUS_PERCENT, "Base troop production"], [CROWN_CITADEL_MARCH_SPEED_BONUS_PERCENT, "March speed"], [CROWN_CITADEL_DEFENSE_BONUS_PERCENT, "Soldier defense"], [-CROWN_CITADEL_UPGRADE_COST_REDUCTION_PERCENT, "Upgrade cost"]];
  const bonus = crown ? `<div class="hold-bonus crown-bonus"><span class="bonus-title">CROWN SPECIALIZATIONS</span><div class="crown-benefits">${benefits.map(([value, label]) => `<div class="crown-benefit"><strong>${value >= 0 ? "+" : "−"}${Math.abs(value)}%</strong><span>${label}</span></div>`).join("")}</div></div>` : `<div class="hold-bonus"><img src="assets/icons/${icon}" alt=""><div><small>Objective specialization</small><div class="bonus-main"><strong>+${formatNumber(getStrongholdBonusPercent(holding))}%</strong><span>${escapeHtml(getStrongholdProductionLabel(holding))}</span></div></div></div>`;
  return `<article class="hold-row ${crown ? "is-crown" : ""} ${holding.troops >= 100000000 ? "large-force" : ""}" data-kind="${kind}"><div class="hold-identity"><img class="hold-art" src="${escapeHtml(getStrongholdArtSrc(holding))}" alt=""><div class="hold-name"><span class="holding-kind">${crown ? "Royal seat" : `${kind === "speed" ? "Movement" : kind[0].toUpperCase() + kind.slice(1)} Stronghold`}</span><h3>${escapeHtml(holding.name)}</h3><p>Map · ${escapeHtml(getRegionLabel(getCityRegionId(holding)))}</p></div></div>${bonus}<div class="hold-garrison"><strong class="garrison-number">${formatMarchesNumber(holding.troops || 0)}</strong><span class="garrison-label">troops stationed</span><span class="control-label">Held by you</span></div><div class="hold-level"><img src="assets/icons/skills/stoneworks.svg" alt=""><strong>${formatNumber(getStrongholdDefenseLevel(holding))}</strong><small>Defense level</small></div>${renderObjectiveMapButton(holding, true)}</article>`;
}
