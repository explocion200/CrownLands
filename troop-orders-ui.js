/* Approved order presentation. The existing slider, route and send handlers own all actions. */
/* exported renderTroopOrderLocation, decorateTroopOrderView, updateTroopOrderPower */
function troopOrderNumber(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
}
function troopOrderContribution(value, signed = false) {
  const precision = Math.abs(value) < 1 ? 6 : 2;
  const rounded = Number(value.toFixed(precision));
  return `${Math.abs(value - rounded) > 0.000001 ? "≈" : ""}${signed ? "+" : ""}${troopOrderNumber(rounded)}`;
}
function renderTroopOrderLocation(city, label, description, showLevel) {
  const tower = isHoldingTowerTarget(city);
  const camp = isRewardCampTarget(city);
  const level = isStronghold(city) ? getStrongholdDefenseLevel(city) : clampCityLevel(city.level || 1);
  const art = tower ? city.artSrc || CLAN_TOWER_MAP_ART : camp ? city.artSrc || getCampConfigForType(city.campType).artSrc : isStronghold(city) ? getStrongholdArtSrc(city) : getCastleAsset(getCastleStage(level));
  return `<div class="order-location ${label === "To" ? "destination" : ""}"><img class="location-art" src="${escapeHtml(art)}" alt=""><div class="location-copy"><span class="location-label">${label}</span><div class="location-title"><h2>${escapeHtml(city.name)}</h2>${showLevel && !camp && !tower ? `<span class="location-level">Level ${formatNumber(level)}</span>` : ""}</div><p>${escapeHtml(getRegionLabel(getCityRegionId(city)))}</p>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div></div>`;
}
function decorateTroopOrderView(source, target, orderKind, commandLabel) {
  const panel = modalBody.querySelector(".troop-slider-panel");
  panel.classList.add("report-shell");
  panel.dataset.orderKind = orderKind;
  const attack = orderKind === "attack", transfer = orderKind === "transfer";
  const rally = orderKind === "rally_create" || orderKind === "rally_join";
  const oldRoute = panel.querySelector(".troop-route-summary");
  const destinationNote = oldRoute.querySelector(".destination small").textContent.split(" · ").slice(1).join(" · ");
  const remaining = oldRoute.querySelector("#troopSliderRemaining").parentElement;
  remaining.innerHTML = `<b id="troopSliderRemaining">${formatMarchesNumber(source.troops - selectedTroopAmount)}</b> of <span id="troopSliderSourceTotal">${formatMarchesNumber(source.troops)}</span> ${rally ? "available at source" : "remain at source"}`;
  remaining.className = "remaining";
  const control = panel.querySelector(".troop-slider-control");
  control.className = "force-column";
  const readout = control.querySelector(".troop-slider-readout");
  readout.className = "force-summary";
  const label = readout.querySelector("span").textContent;
  const amount = readout.querySelector("strong");
  readout.innerHTML = `<div><p class="force-label">${label}</p><div class="force-readout"><img src="assets/icons/daily-login-troops-r1.svg" alt=""></div></div>`;
  readout.querySelector(".force-readout").append(amount);
  readout.append(remaining);
  control.querySelector("input[type=range]").className = "troop-amount-slider troop-range";
  control.querySelector(".troop-slider-limits").classList.add("range-labels");
  control.querySelector(".rally-troop-number")?.classList.add("contribution");
  const actions = panel.querySelector(".troop-slider-actions");
  const notice = panel.querySelector("#troopSliderActionNotice");
  actions.className = "order-actions";
  notice.className = "order-action-notice";
  actions.prepend(notice);
  const cancel = actions.querySelector("#troopSliderCancel"), confirm = actions.querySelector("#troopSliderConfirm");
  cancel.className = "cancel-order";
  confirm.className = `confirm-order ${attack ? "" : "friendly"}`;
  confirm.textContent = commandLabel;
  actions.append(cancel, confirm);
  const preview = panel.querySelector("#troopSliderPreview");
  const swift = panel.querySelector(".swift-march-launch-option");
  const notes = [...panel.children].filter(element => ![oldRoute, control, actions, preview, swift].includes(element));
  const header = document.createElement("header"); header.className = "window-header";
  header.innerHTML = `<img class="heading-art" src="assets/icons/${attack ? "skills/swordmastery.svg" : orderKind === "reinforce" ? "skills/shieldwallDiscipline.svg" : "troop-orders/marching-banner.svg"}" alt=""><div class="heading"><p>MILITARY ORDERS</p><h2>${commandLabel}${rally ? "" : " troops"}</h2></div><span class="order-kind">${rally ? "Clan rally" : attack ? "Attack order" : "Friendly movement"}</span><button type="button" class="close-button" aria-label="Close Troop Orders">×</button>`;
  header.querySelector("button").addEventListener("click", () => modal.close());
  const body = document.createElement("main"); body.className = "order-body"; body.tabIndex = 0; body.setAttribute("aria-label", "Order details");
  body.innerHTML = `<div class="order-route">${renderTroopOrderLocation(source, "From", "", attack)}<svg class="order-arrow" viewBox="0 0 44 24" aria-hidden="true"><path d="M2 12h37M29 3l11 9-11 9M3 8h13M3 16h13"/></svg>${renderTroopOrderLocation(target, "To", destinationNote, attack)}</div><div class="order-columns ${attack ? "selection-layout attack-layout" : transfer ? "selection-layout transfer-layout" : ""}"></div>`;
  const columns = body.querySelector(".order-columns");
  columns.append(control);
  if (attack) {
    const power = document.createElement("section"); power.id = "troopOrderPower"; power.className = "attack-power-sheet"; power.setAttribute("aria-label", "Your attack power breakdown"); columns.append(power);
  }
  if (transfer) {
    const details = document.createElement("div"); details.className = "transfer-details";
    details.append(preview);
    if (swift) {
      swift.classList.add("transfer-card", "transfer-options");
      swift.querySelector(".swift-march-launch-copy strong").innerHTML = `<img src="${escapeHtml(getShopItemById(SWIFT_MARCH_ORDER_ITEM_ID).icon)}" alt="">Swift March Order`;
      details.append(swift);
    } else details.classList.add("without-swift");
    columns.append(details);
  } else {
    const intelligence = document.createElement("section"); intelligence.className = "intelligence-column";
    intelligence.append(preview); columns.append(intelligence);
  }
  if (notes.length) {
    const noteList = document.createElement("div"); noteList.className = "order-notes";
    notes.forEach(note => { note.classList.add("order-note"); noteList.append(note); }); body.append(noteList);
  }
  panel.replaceChildren(header, body, actions);
}
function updateTroopOrderPower() {
  const element = modalBody.querySelector("#troopOrderPower");
  if (!element) return;
  const forecast = normalizeCombatForecast(activeCombatForecastPreview);
  const skillPercent = forecast ? forecast.swordmasteryPercent : getSkillPercent("swordmastery");
  const gearPercent = forecast ? forecast.attackStrengthPercent : Math.max(0, Number(getCommonGearBonuses().attackStrength) || 0);
  const perTroop = forecast ? forecast.attackPowerPerTroop : getAttackPower(1, "player");
  const base = selectedTroopAmount * BASE_TROOP_ATTACK_POWER;
  const gear = normalizeCommonGearState(state.gear);
  const weapon = gear.instances[gear.equipped?.barracks?.weapon];
  const definition = weapon ? COMMON_GEAR?.getDefinition(weapon.gearKey) : null;
  // A forecast snapshot can precede a Gear change. Never label its bonus with a mismatching local item.
  const matches = definition?.statType === "attackStrength" && Math.abs(COMMON_GEAR.getBonusPercent(weapon) - gearPercent) < 0.000001;
  const localOnly = !forecast && usesServerArmyAuthority();
  const weaponName = matches ? definition.gearName : "War Captain weapon";
  const weaponNote = matches ? `Equipped · Level ${weapon.level} · +${troopOrderNumber(gearPercent)}%` : gearPercent > 0 ? `Forecast bonus · +${troopOrderNumber(gearPercent)}%` : "No attack bonus equipped";
  const skillLevel = forecast ? forecast.swordmasteryLevel : getSkillLevel("swordmastery");
  const rows = [
    ["assets/icons/daily-login-troops-r1.svg", "Base troop power", `${BASE_TROOP_ATTACK_POWER} power per troop`, base, false],
    ["assets/icons/skills/swordmastery.svg", "Swordmastery", `Level ${skillLevel} · +${troopOrderNumber(skillPercent)}% attack`, base * skillPercent / 100, true],
    [definition?.art || "assets/optimized/gear-barracks-weapon-192x192-b7b87ac61ab5.webp", weaponName, weaponNote, base * gearPercent / 100, true],
  ];
  element.innerHTML = `<header><div><span>YOUR ATTACK POWER${localOnly ? " · ESTIMATE" : ""}</span><strong>${formatMarchesNumber(Math.floor(selectedTroopAmount * perTroop))}</strong></div><img src="assets/icons/skills/swordmastery.svg" alt=""></header>${rows.map(([art, name, note, value, signed], index) => `<div class="power-source"><img class="${index === 2 ? "common-item" : ""}" src="${escapeHtml(art)}" alt=""><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(note)}</small></div><b>${troopOrderContribution(value, signed)}</b></div>`).join("")}<p class="power-equation"><span>${troopOrderNumber(perTroop)} power / troop</span><strong>+${troopOrderNumber(skillPercent + gearPercent)}% total bonus</strong></p><p class="power-note">Bonuses add to base power. Final total rounds down to whole points.${localOnly ? " Based on your current local profile; the server confirms at launch." : ""}</p>`;
}
