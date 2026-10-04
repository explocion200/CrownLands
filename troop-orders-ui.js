/* Approved order presentation. The existing slider, route and send handlers own all actions. */
/* exported renderTroopOrderLocation, decorateTroopOrderView, updateTroopOrderPower, mountHoldingTowerTroopOrderView, updateHoldingTowerTroopOrderView, mountTroopOrderSelection, refreshTroopOrderSelection, getTroopOrderSelection */
function parseTroopOrderCount(text, maximum) {
  const raw = String(text).trim();
  const amount = Number(raw.replaceAll(",", ""));
  let error = "";
  if (maximum < 1) error = "No troops are available to send.";
  else if (!raw) error = "Enter the number of troops to send.";
  else if ((!/^\d+$/.test(raw) && !/^\d{1,3}(,\d{3})+$/.test(raw)) || !Number.isSafeInteger(amount)) error = "Use a whole troop count, such as 125,000.";
  else if (amount < 1 || amount > maximum) error = `Choose between 1 and ${formatMarchesNumber(maximum)} troops.`;
  return { amount, error };
}
function getTroopOrderSelection(maximum) {
  const input = modalBody.querySelector("#troopExactAmount");
  return input ? parseTroopOrderCount(input.value, maximum) : null;
}
function refreshTroopOrderSelection(maximum) {
  const input = modalBody.querySelector("#troopExactAmount");
  if (!input) return null;
  const { amount, error } = parseTroopOrderCount(input.value, maximum);
  input.setAttribute("aria-invalid", String(Boolean(error)));
  const message = modalBody.querySelector("#troopAmountError");
  message.textContent = error;
  message.hidden = !error;
  modalBody.querySelectorAll("[data-troop-fraction]").forEach(button => {
    const fraction = Number(button.dataset.troopFraction);
    button.disabled = maximum < 1;
    button.setAttribute("aria-pressed", String(!error && amount === Math.max(1, Math.floor(maximum * fraction)) && (maximum > 1 || fraction === 1)));
  });
  return { amount, error };
}
function mountTroopOrderSelection(getMaximum, onRefresh) {
  const panel = modalBody.querySelector(".troop-slider-panel");
  const slider = panel?.querySelector("#troopAmountSlider");
  if (!slider || panel.querySelector("#troopExactAmount")) return;
  panel.classList.add("precise-troop-selection");
  modal.classList.add("precise-troop-selection");
  panel.querySelector(".order-columns").classList.add("selection-layout");
  panel.querySelector("#troopSliderAmount").hidden = true;
  panel.querySelector(".force-readout").insertAdjacentHTML("beforeend", `<label class="exact-amount"><span class="sr-only">Exact troop count</span><input id="troopExactAmount" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="troopSelectionHint troopAmountError" value="${formatMarchesNumber(Number(slider.value))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15Z"/></svg></label>`);
  panel.querySelector(".force-summary").insertAdjacentHTML("afterend", `<div class="selection-tools"><div class="quick-amounts" role="group" aria-label="Quick troop selection"><button type="button" data-troop-fraction="0.25">25%</button><button type="button" data-troop-fraction="0.5">50%</button><button type="button" data-troop-fraction="1">Max</button></div><p id="troopSelectionHint" class="selection-hint">Tap the count to edit.<br>Shortcuts use the permitted maximum.</p></div><p id="troopAmountError" class="amount-error" role="alert" hidden></p>`);
  const input = panel.querySelector("#troopExactAmount");
  let exactInput = false, originalAmount = slider.value;
  const applyInput = () => {
    if (!panel.isConnected) return;
    const maximum = getMaximum();
    const { amount, error } = parseTroopOrderCount(input.value, maximum);
    if (error) { onRefresh(); return; }
    slider.max = String(maximum);
    slider.value = String(amount);
    exactInput = true;
    try { slider.dispatchEvent(new Event("input", { bubbles: true })); }
    finally { exactInput = false; }
  };
  // Installed before the existing range handler so every explicit slider choice
  // replaces a stale/invalid typed intent before the host refreshes its guards.
  slider.addEventListener("input", () => {
    if (!exactInput) input.value = formatMarchesNumber(Number(slider.value));
  });
  input.addEventListener("focus", () => {
    originalAmount = slider.value;
    if (!getTroopOrderSelection(getMaximum()).error) input.value = input.value.replaceAll(",", "");
    input.select();
  });
  input.addEventListener("input", applyInput);
  input.addEventListener("blur", () => {
    if (!panel.isConnected) return;
    const result = parseTroopOrderCount(input.value, getMaximum());
    if (!result.error) input.value = formatMarchesNumber(result.amount);
    onRefresh();
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") input.value = originalAmount;
    applyInput();
    if (!getTroopOrderSelection(getMaximum()).error) input.blur();
  });
  panel.querySelectorAll("[data-troop-fraction]").forEach(button => button.addEventListener("click", () => {
    const maximum = getMaximum();
    if (maximum < 1) { onRefresh(); return; }
    input.value = String(Math.max(1, Math.floor(maximum * Number(button.dataset.troopFraction))));
    applyInput();
    if (document.activeElement !== input) input.value = formatMarchesNumber(Number(slider.value));
  }));
  refreshTroopOrderSelection(getMaximum());
}
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
function decorateTroopOrderView(source, target, orderKind, commandLabel, amountSelected = selectedTroopAmount) {
  const panel = modalBody.querySelector(".troop-slider-panel");
  panel.classList.add("report-shell");
  panel.dataset.orderKind = orderKind;
  const attack = orderKind === "attack", transfer = orderKind === "transfer";
  const rally = orderKind === "rally_create" || orderKind === "rally_join";
  const oldRoute = panel.querySelector(".troop-route-summary");
  const destinationNote = oldRoute.querySelector(".destination small").textContent.split(" · ").slice(1).join(" · ");
  const remaining = oldRoute.querySelector("#troopSliderRemaining").parentElement;
  remaining.innerHTML = `<b id="troopSliderRemaining">${formatMarchesNumber(source.troops - amountSelected)}</b> of <span id="troopSliderSourceTotal">${formatMarchesNumber(source.troops)}</span> ${rally ? "available at source" : "remain at source"}`;
  remaining.className = "remaining";
  const control = panel.querySelector(".troop-slider-control");
  control.className = "force-column";
  const readout = control.querySelector(".troop-slider-readout");
  readout.className = "force-summary";
  const label = readout.querySelector("span").textContent;
  const amount = readout.querySelector("strong");
  readout.innerHTML = `<div><p class="force-label">${label}</p><div class="force-readout"><img src="assets/optimized/troops-helmet-192x192-8c144647d31b.webp" alt=""></div></div>`;
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
function updateTroopOrderPower(amount = selectedTroopAmount, forecastPreview = activeCombatForecastPreview) {
  const element = modalBody.querySelector("#troopOrderPower");
  if (!element) return;
  const forecast = normalizeCombatForecast(forecastPreview);
  const skillPercent = forecast ? forecast.swordmasteryPercent : getSkillPercent("swordmastery");
  const gearPercent = forecast ? forecast.attackStrengthPercent : Math.max(0, Number(getCommonGearBonuses().attackStrength) || 0);
  const perTroop = forecast ? forecast.attackPowerPerTroop : getAttackPower(1, "player");
  const base = amount * BASE_TROOP_ATTACK_POWER;
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
    ["assets/optimized/troops-helmet-192x192-8c144647d31b.webp", "Base troop power", `${BASE_TROOP_ATTACK_POWER} power per troop`, base, false],
    ["assets/icons/skills/swordmastery.svg", "Swordmastery", `Level ${skillLevel} · +${troopOrderNumber(skillPercent)}% attack`, base * skillPercent / 100, true],
    [definition?.art || "assets/optimized/gear-barracks-weapon-192x192-204241e66c5f.webp", weaponName, weaponNote, base * gearPercent / 100, true],
  ];
  element.innerHTML = `<header><div><span>YOUR ATTACK POWER${localOnly ? " · ESTIMATE" : ""}</span><strong>${formatMarchesNumber(Math.floor(amount * perTroop))}</strong></div><img src="assets/icons/skills/swordmastery.svg" alt=""></header>${rows.map(([art, name, note, value, signed], index) => `<div class="power-source"><img class="${index === 2 ? "common-item" : ""}" src="${escapeHtml(art)}" alt=""><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(note)}</small></div><b>${troopOrderContribution(value, signed)}</b></div>`).join("")}<p class="power-equation"><span>${troopOrderNumber(perTroop)} power / troop</span><strong>+${troopOrderNumber(skillPercent + gearPercent)}% total bonus</strong></p><p class="power-note">Bonuses add to base power. Final total rounds down to whole points.${localOnly ? " Based on your current local profile; the server confirms at launch." : ""}</p>`;
}

function getHoldingTowerTroopOrderLocations(tower, mode, candidate) {
  const personalTower = { ...getHoldingTowerVisual(tower.id), ...tower, owner: "player", troops: Math.max(0, Math.floor(Number(tower.ownStationedTroops) || 0)) };
  return mode === "reinforce" ? { source: candidate, target: personalTower } : { source: personalTower, target: candidate };
}

function mountHoldingTowerTroopOrderView(tower, mode, candidate, maxTroops, session) {
  const { source, target } = getHoldingTowerTroopOrderLocations(tower, mode, candidate);
  const attack = mode === "attack-from";
  decorateTroopOrderView(source, target, attack ? "attack" : "transfer", attack ? "Attack" : mode === "reinforce" ? "Send" : "Transfer", Math.max(1, Math.floor(maxTroops / 2)));
  mountTroopOrderSelection(() => Number(modalBody.querySelector("[data-tower-order-troops]")?.max) || 0, updateHoldingTowerOrderAvailability);
  // Tower launch uses its own authoritative callable. Its city-only preview endpoints
  // cannot verify a Tower origin; show clearly labelled local estimates instead.
  session.route = createInstantOrderRoute(source, target);
  void findRouteAsync(source, target).then(route => {
    if (!isHoldingTowerModalSessionCurrent(session) || session.onlineSession !== onlineSessionGeneration) return;
    if (route?.points?.length) session.route = route;
    updateHoldingTowerOrderAvailability();
  }).catch(() => {
    // Keep the initial estimate; dispatch still validates the route on the server.
  });
}

function updateHoldingTowerTroopOrderView(session, tower, candidate, amount, maximum) {
  const { source, target } = getHoldingTowerTroopOrderLocations(tower, session.mode, candidate);
  const orderKind = session.mode === "attack-from" ? "attack" : "transfer";
  modalBody.querySelector("#troopSliderAmount").textContent = formatMarchesNumber(amount);
  modalBody.querySelector("#troopSliderRemaining").textContent = formatMarchesNumber(Math.max(0, maximum - amount));
  modalBody.querySelector("#troopSliderSourceTotal").textContent = formatMarchesNumber(maximum);
  modalBody.querySelector("#troopSliderMaxLabel").textContent = `Max ${formatMarchesNumber(maximum)}`;
  updateTroopOrderPower(amount, null);
  const retaliationId = orderKind === "attack" ? getTargetRetaliation(target)?.id || "" : "";
  const attackProtection = retaliationId ? { version: ATTACK_PROTECTION_VERSION, mode: "normal" } : createAttackProtectionSnapshot(source, target, amount, "player");
  const notice = modalBody.querySelector("#troopSliderActionNotice");
  notice.textContent = "";
  notice.hidden = true;
  const route = session.route;
  const duration = route?.points?.length ? travelTime(source, target, "player", route.length, amount, orderKind) : null;
  const bonus = Math.max(0, (getTravelSpeedMultiplier("player", orderKind) - 1) * 100);
  const travelSummary = `<div class="travel-time-summary"><span>Travel bonus</span><strong>${formatStackedBonusPercent(bonus)}%</strong><span>Travel time</span><strong>${duration === null ? "Confirmed at dispatch" : `Estimated ${formatDuration(duration)}`}</strong></div>`;
  updateTroopOrderPreview(source, target, route, { orderKind, amount, attackProtection, combatForecast: null, retaliationId, travelSummary });
}
