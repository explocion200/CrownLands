"use strict";
/* exported buyShopItem, buySkill, clearInstantEconomyActions, upgradeCity, useInventoryItem, useRecallHornOnMission, useSwiftMarchOrderOnMission */

const INSTANT_ECONOMY_ACTION_DELAY_MS = 125;
const INSTANT_ECONOMY_ITEM_BATCH_LIMIT = 25;
const instantEconomyActions = [];
const swiftMarchOrderRequests = new Set();
const recallHornRequests = new Set();
const pendingSkillSpendAllocations = new Map();
let activeSkillSpendBatch = null;
let skillSpendFlushTimer = 0;
let skillActionInFlight = false;
let instantEconomyActiveAction = null;
let instantEconomyFlushTimer = 0;
let instantEconomyGeneration = 1;
let instantEconomyActionSequence = 0;
let serverCityUpgradeInFlightIds = new Set();

function supportsInstantEconomyActionBatching() {
  return Number(verifiedRealmInfo?.capabilities?.instantEconomyActionsVersion || 0) >= 1;
}

function getInstantEconomyPendingActions() {
  return [instantEconomyActiveAction, ...instantEconomyActions].filter(Boolean);
}

function getInstantEconomyReservedGold() {
  return getInstantEconomyPendingActions().reduce((total, action) => (
    total + Math.max(0, Math.floor(Number(action.reservedGold) || 0))
  ), 0);
}

function getProjectedGold() {
  return Math.max(0, Math.floor(Number(state?.gold) || 0) - getInstantEconomyReservedGold());
}

function getInstantPendingItemDelta(itemId = "") {
  const normalizedItemId = String(itemId || "");
  return getInstantEconomyPendingActions().reduce((total, action) => {
    if (action.itemId !== normalizedItemId) return total;
    const quantity = Math.max(0, Math.floor(Number(action.quantity) || 0));
    return total + (action.type === "shop" ? quantity : ["item", "swift", "recall"].includes(action.type) ? -quantity : 0);
  }, 0);
}

function getProjectedInventoryCount(itemId = "") {
  const owned = Math.max(0, Math.floor(Number(ensureShopItems()?.[itemId]) || 0));
  return Math.max(0, owned + getInstantPendingItemDelta(itemId));
}

function getProjectedItemPurchaseCount(itemId = "") {
  const pending = getInstantEconomyPendingActions().reduce((total, action) => (
    action.type === "shop" && action.itemId === itemId
      ? total + Math.max(0, Math.floor(Number(action.quantity) || 0))
      : total
  ), 0);
  return getItemPurchaseCount(itemId) + pending;
}

function getPendingCityUpgradeLevels(cityId = "") {
  return getInstantEconomyPendingActions().reduce((total, action) => (
    action.type === "city" && action.cityId === cityId
      ? total + Math.max(0, Math.floor(Number(action.levels) || 0))
      : total
  ), 0);
}

function getProjectedCityForInstantActions(city) {
  if (!city) return null;
  const queuedLevels = getPendingCityUpgradeLevels(city.id);
  return queuedLevels > 0
    ? { ...city, level: clampCityLevel((Number(city.level) || 1) + queuedLevels) }
    : city;
}

function getProjectedItemEffectExpiresAtMs(item = null) {
  if (!item) return 0;
  let expiresAtMs = item.id === WAR_DRUMS_ITEM_ID
    ? getActiveWarDrumsExpiresAtMs()
    : item.id === ROYAL_TAX_DECREE_ITEM_ID
      ? getActiveRoyalTaxDecreeExpiresAtMs()
      : item.id === ROYAL_PEACE_SHIELD_ITEM_ID
        ? getActivePeaceShieldExpiresAtMs()
        : item.id === VEIL_OF_SILENCE_ITEM_ID
          ? getActiveVeilOfSilenceExpiresAtMs()
          : 0;
  const durationMs = item.id === WAR_DRUMS_ITEM_ID
    ? WAR_DRUMS_DURATION_MS
    : item.id === ROYAL_TAX_DECREE_ITEM_ID
      ? ROYAL_TAX_DECREE_DURATION_MS
      : 0;
  if (durationMs > 0) {
    const quantity = getInstantEconomyPendingActions().reduce((total, action) => (
      action.type === "item" && action.itemId === item.id ? total + action.quantity : total
    ), 0);
    if (quantity > 0) expiresAtMs = Math.max(Date.now(), expiresAtMs) + durationMs * quantity;
  } else {
    const pending = getInstantEconomyPendingActions().some(action => action.type === "item" && action.itemId === item.id);
    if (pending && expiresAtMs <= Date.now()) {
      const singleDurationMs = item.id === ROYAL_PEACE_SHIELD_ITEM_ID
        ? ROYAL_PEACE_SHIELD_DURATION_MS
        : item.id === VEIL_OF_SILENCE_ITEM_ID
          ? VEIL_OF_SILENCE_DURATION_MS
          : 0;
      expiresAtMs = Date.now() + singleDurationMs;
    }
  }
  return expiresAtMs;
}

function getProjectedAffordableCityUpgradeLevels(city, levelLimit = Number.POSITIVE_INFINITY) {
  if (!state || !city || city.owner !== "player" || isStronghold(city)) return 0;
  const projectedCity = getProjectedCityForInstantActions(city);
  const rawLimit = Number.isFinite(Number(levelLimit)) ? Math.floor(Number(levelLimit)) : Number.MAX_SAFE_INTEGER;
  const maxLevels = Math.max(0, rawLimit);
  const availableGold = getProjectedGold();
  const reductionPercent = getCityUpgradeReductionPercent(projectedCity);
  let affordableLevels = 0;
  let spentGold = 0;
  while (affordableLevels < maxLevels) {
    const cost = getCityUpgradeCostAtLevel(projectedCity.level + affordableLevels, reductionPercent);
    if (!Number.isFinite(cost) || cost > availableGold - spentGold) break;
    spentGold += cost;
    affordableLevels += 1;
  }
  return affordableLevels;
}

function getInstantCityLevelCosts(city, levels = 1) {
  const projectedCity = getProjectedCityForInstantActions(city);
  if (!projectedCity) return [];
  const count = Math.max(0, Math.floor(Number(levels) || 0));
  const reductionPercent = getCityUpgradeReductionPercent(projectedCity);
  const costs = [];
  for (let offset = 0; offset < count; offset += 1) {
    const cost = getCityUpgradeCostAtLevel(projectedCity.level + offset, reductionPercent);
    if (!Number.isFinite(cost)) break;
    costs.push(cost);
  }
  return costs;
}

function scheduleInstantEconomyFlush(delayMs = INSTANT_ECONOMY_ACTION_DELAY_MS) {
  if (instantEconomyFlushTimer || instantEconomyActiveAction || !instantEconomyActions.length) return;
  instantEconomyFlushTimer = window.setTimeout(() => {
    instantEconomyFlushTimer = 0;
    void flushInstantEconomyActions();
  }, Math.max(0, delayMs));
}

function enqueueInstantEconomyAction(action) {
  if (!action) return false;
  const normalized = {
    ...action,
    id: ++instantEconomyActionSequence,
    generation: instantEconomyGeneration,
  };
  const previous = instantEconomyActions.at(-1);
  if (previous && previous.type === normalized.type && previous.key === normalized.key && normalized.coalesce !== false) {
    previous.quantity = Math.max(0, Number(previous.quantity) || 0) + Math.max(0, Number(normalized.quantity) || 0);
    previous.levels = Math.max(0, Number(previous.levels) || 0) + Math.max(0, Number(normalized.levels) || 0);
    previous.reservedGold = Math.max(0, Number(previous.reservedGold) || 0) + Math.max(0, Number(normalized.reservedGold) || 0);
    if (normalized.levelCosts?.length) previous.levelCosts.push(...normalized.levelCosts);
  } else {
    instantEconomyActions.push(normalized);
  }
  patchInstantEconomyUi();
  scheduleInstantEconomyFlush();
  return true;
}

function clearInstantEconomyActions() {
  instantEconomyGeneration += 1;
  if (instantEconomyFlushTimer) window.clearTimeout(instantEconomyFlushTimer);
  if (skillSpendFlushTimer) window.clearTimeout(skillSpendFlushTimer);
  instantEconomyFlushTimer = 0;
  skillSpendFlushTimer = 0;
  instantEconomyActions.length = 0;
  pendingSkillSpendAllocations.clear();
  activeSkillSpendBatch = null;
  swiftMarchOrderRequests.clear();
  recallHornRequests.clear();
  serverCityUpgradeInFlightIds.clear();
  instantEconomyActiveAction = null;
}

function patchInstantEconomyUi() {
  if (!state) return;
  renderHud();
  if (modal?.open && modal.classList.contains("shop-modal")) patchShopProjectedUi();
  if (modal?.open && modal.classList.contains("inventory-modal")) patchInventoryProjectedUi();
  if (modal?.open && modal.classList.contains("outgoing-attack-modal")) patchMarchItemActionUi();
  patchCityUpgradeUi();
}

function patchShopProjectedUi() {
  setTextIfChanged(modalBody?.querySelector("[data-shop-balance]"), formatNumber(getProjectedGold()));
  modalBody?.querySelectorAll("[data-shop-item]").forEach(card => {
    const item = getShopItemById(card.dataset.shopItem);
    if (!item) return;
    const price = getShopItemPrice(item);
    const count = getProjectedInventoryCount(item.id);
    const purchaseCount = getProjectedItemPurchaseCount(item.id);
    const purchaseLimit = getItemDailyPurchaseLimit(item.id);
    setTextIfChanged(card.querySelector("[data-shop-owned]"), `Owned: ${formatNumber(count)}`);
    setTextIfChanged(card.querySelector("[data-shop-card-price]"), `${formatNumber(price)} gold`);
    setTextIfChanged(card.querySelector("[data-shop-purchase-count]"), `Purchased: ${formatNumber(purchaseCount)}/${formatNumber(purchaseLimit)} today (UTC)`);
    card.classList.toggle("pending", getInstantPendingItemDelta(item.id) > 0);
  });
  patchShopPurchaseBar();
}

function patchInventoryProjectedUi() {
  modalBody?.querySelectorAll("[data-inventory-select]").forEach(slot => {
    const itemId = slot.dataset.inventorySelect || "";
    const count = getProjectedInventoryCount(itemId);
    setTextIfChanged(slot.querySelector(".inventory-slot-count"), `x${formatNumber(count)}`);
    slot.disabled = count < 1;
    slot.classList.toggle("pending", getInstantPendingItemDelta(itemId) < 0);
  });
  const useButton = modalBody?.querySelector("[data-inventory-use]");
  if (!useButton) return;
  const itemId = useButton.dataset.inventoryUse || "";
  const item = getShopItemById(itemId);
  const count = getProjectedInventoryCount(itemId);
  setTextIfChanged(modalBody.querySelector("[data-inventory-owned]"), `Owned: ${formatNumber(count)}`);
  const projectedExpiresAtMs = getProjectedItemEffectExpiresAtMs(item);
  const effectLine = modalBody.querySelector("[data-inventory-active]");
  if (effectLine && projectedExpiresAtMs > Date.now()) {
    setTextIfChanged(effectLine, `Active: ${formatDuration(Math.ceil((projectedExpiresAtMs - Date.now()) / 1000))}`);
  }
  useButton.disabled = count < 1 || (!isStackableTimedInventoryItem(item) && projectedExpiresAtMs > Date.now());
  useButton.classList.toggle("pending", getInstantPendingItemDelta(itemId) < 0);
}

function patchCityUpgradeUi() {
  const selectedCity = cityById(selectedSourceId || "");
  const wheel = cityLayer?.querySelector(".city-action-wheel .wheel-level");
  if (selectedCity && wheel) {
    const projectedCity = getProjectedCityForInstantActions(selectedCity);
    const cost = getLevelCost(projectedCity);
    wheel.disabled = cityHasIncomingUpgradeBlocker(selectedCity) || !Number.isFinite(cost) || getProjectedGold() < cost;
    setTextIfChanged(wheel.querySelector(".wheel-cost"), Number.isFinite(cost) ? `${formatNumber(cost)}g` : "Unavailable");
  }
  const panel = modalBody?.querySelector(".city-level-up-panel");
  if (!panel) return;
  const cityId = panel.dataset.cityUpgradeCity || "";
  const city = cityById(cityId);
  if (!city) return;
  const holder = document.createElement("div");
  holder.innerHTML = renderCityLevelUpAction(city);
  const replacement = holder.firstElementChild;
  if (replacement) {
    panel.replaceWith(replacement);
    bindCityLevelUpButtons(city);
  }
}

function patchMarchItemActionUi() {
  modalBody?.querySelectorAll("[data-swift-march-order]").forEach(button => {
    const pending = swiftMarchOrderRequests.has(button.dataset.swiftMarchOrder || "");
    button.disabled = pending || getProjectedInventoryCount(SWIFT_MARCH_ORDER_ITEM_ID) < 1;
    if (pending) button.textContent = "Applying Swift Order...";
  });
  modalBody?.querySelectorAll("[data-recall-horn]").forEach(button => {
    const pending = recallHornRequests.has(button.dataset.recallHorn || "");
    button.disabled = pending || getProjectedInventoryCount(RECALL_HORN_ITEM_ID) < 1;
    if (pending) button.textContent = "Sounding Recall...";
  });
}

function queueInstantEconomyRemainder(action, patch) {
  const remainder = { ...action, ...patch, id: ++instantEconomyActionSequence };
  if ((remainder.quantity || remainder.levels) > 0) instantEconomyActions.push(remainder);
}

async function refreshInstantEconomyAfterFailure(action) {
  await Promise.resolve(refreshServerEconomy(true, { renderCities: action.type === "city" }));
  if (action.type === "city") await Promise.resolve(refreshAllOwnedCities(true));
  revalidateInstantEconomyActions();
}

function revalidateInstantEconomyActions() {
  let availableGold = Math.max(0, Math.floor(Number(state?.gold) || 0));
  const inventory = Object.fromEntries(SHOP_ITEMS.map(item => [item.id, Math.max(0, Math.floor(Number(ensureShopItems()[item.id]) || 0))]));
  const purchases = Object.fromEntries(SHOP_ITEMS.map(item => [item.id, getItemPurchaseCount(item.id)]));
  const levelsByCity = new Map();
  const kept = [];
  instantEconomyActions.forEach(action => {
    if (action.generation !== instantEconomyGeneration) return;
    if (action.type === "shop") {
      const item = getShopItemById(action.itemId);
      const limit = getItemDailyPurchaseLimit(action.itemId);
      const unitCost = item ? getShopItemPrice(item) : 0;
      const affordable = unitCost > 0 ? Math.floor(availableGold / unitCost) : 0;
      const limitRoom = limit > 0 ? Math.max(0, limit - purchases[action.itemId]) : action.quantity;
      const quantity = Math.min(action.quantity, affordable, limitRoom);
      if (quantity < 1) return;
      action.quantity = quantity;
      action.unitCost = unitCost;
      action.reservedGold = unitCost * quantity;
      availableGold -= action.reservedGold;
      inventory[action.itemId] += quantity;
      purchases[action.itemId] += quantity;
    } else if (action.type === "item" || action.type === "swift" || action.type === "recall") {
      const item = getShopItemById(action.itemId);
      if (!item) return;
      if (action.type === "item" && !isStackableTimedInventoryItem(item) && getInventoryItemActiveRemainingSeconds(item) > 0) return;
      if (action.type === "swift") {
        const mission = getOutgoingAttacks().find(entry => getOnlineArmyResolutionId(entry) === action.armyId);
        if (!mission || !isSwiftMarchOrderEligible(mission)) return;
        action.mission = mission;
      }
      if (action.type === "recall") {
        const mission = getOutgoingAttacks().find(entry => getOnlineArmyResolutionId(entry) === action.armyId);
        if (!mission || !isRecallHornEligible(mission)) return;
        action.mission = mission;
      }
      const quantity = Math.min(action.quantity, inventory[action.itemId] || 0);
      if (quantity < 1) return;
      action.quantity = quantity;
      inventory[action.itemId] -= quantity;
    } else if (action.type === "city") {
      const city = cityById(action.cityId);
      if (!city || city.owner !== "player" || isStronghold(city) || getIncomingUpgradeBlockers(city.id).length) return;
      const startLevel = (levelsByCity.get(city.id) ?? city.level);
      const reduction = getCityUpgradeReductionPercent(city);
      const costs = [];
      for (let offset = 0; offset < action.levels; offset += 1) {
        const cost = getCityUpgradeCostAtLevel(startLevel + offset, reduction);
        if (!Number.isFinite(cost) || cost > availableGold - costs.reduce((sum, value) => sum + value, 0)) break;
        costs.push(cost);
      }
      if (!costs.length) return;
      action.levels = costs.length;
      action.levelCosts = costs;
      action.reservedGold = costs.reduce((sum, value) => sum + value, 0);
      availableGold -= action.reservedGold;
      levelsByCity.set(city.id, startLevel + costs.length);
    }
    kept.push(action);
  });
  instantEconomyActions.length = 0;
  instantEconomyActions.push(...kept);
  patchInstantEconomyUi();
}

async function flushInstantEconomyActions() {
  if (instantEconomyActiveAction || !instantEconomyActions.length) return false;
  const action = instantEconomyActions.shift();
  if (!action || action.generation !== instantEconomyGeneration || !state) {
    scheduleInstantEconomyFlush(0);
    return false;
  }
  instantEconomyActiveAction = action;
  patchInstantEconomyUi();
  try {
    await executeInstantEconomyAction(action);
    return true;
  } catch (error) {
    if (action.generation !== instantEconomyGeneration) return false;
    if (action.type === "skill") {
      activeSkillSpendBatch = null;
      trimPendingSkillSpendAllocations();
      skillPresetMarkupSignature = "";
      renderProfileSkills();
    }
    console.warn(`Instant ${action.type} action failed`, error);
    rejectGameAction(error?.message || "That action was not confirmed by the server.", { allowCrossMap: true });
    instantEconomyActiveAction = null;
    await refreshInstantEconomyAfterFailure(action);
    return false;
  } finally {
    if (instantEconomyActiveAction === action) instantEconomyActiveAction = null;
    if (action.type === "city") serverCityUpgradeInFlightIds.delete(action.cityId);
    if (action.type === "swift") swiftMarchOrderRequests.delete(action.armyId);
    if (action.type === "recall") recallHornRequests.delete(action.armyId);
    patchInstantEconomyUi();
    if (pendingSkillSpendAllocations.size && !activeSkillSpendBatch) scheduleSkillSpendFlush();
    scheduleInstantEconomyFlush(0);
  }
}

function isInstantEconomyActionCurrent(action) {
  return Boolean(action && action.generation === instantEconomyGeneration && instantEconomyActiveAction === action && state);
}

async function executeInstantEconomyAction(action) {
  if (action.type === "shop") return executeInstantShopPurchase(action);
  if (action.type === "city") return executeInstantCityUpgrade(action);
  if (action.type === "item") return executeInstantInventoryActivation(action);
  if (action.type === "swift") return executeInstantSwiftMarch(action);
  if (action.type === "recall") return executeInstantRecall(action);
  if (action.type === "skill") return executeInstantSkillSpend(action);
  throw new Error("Unknown queued action.");
}

async function executeInstantShopPurchase(action) {
  const item = getShopItemById(action.itemId);
  const quantity = supportsInstantEconomyActionBatching() ? action.quantity : 1;
  const quotedPrice = Math.max(0, Math.floor(Number(action.unitCost) || getShopItemPrice(item)));
  const result = await getOnlineApi().purchaseShopItem({ itemId: item.id, cost: quotedPrice, quantity });
  if (!isInstantEconomyActionCurrent(action)) return;
  const confirmed = Math.max(1, Math.min(quantity, Math.floor(Number(result?.purchasedQuantity) || quantity)));
  const confirmedUnitPrice = Math.max(0, Math.floor(Number(result?.unitPrice) || quotedPrice));
  action.quantity -= confirmed;
  action.unitCost = confirmedUnitPrice;
  action.reservedGold = Math.max(0, action.reservedGold - confirmedUnitPrice * confirmed);
  applyServerEconomyResult(result);
  selectedInventoryItemId = item.id;
  addLog(`Bought ${formatNumber(confirmed)} ${item.label}${confirmed === 1 ? "" : "s"} for ${formatNumber(Number(result?.spentGold) || confirmedUnitPrice * confirmed)} gold.`);
  showToast(`${formatNumber(confirmed)} ${item.label}${confirmed === 1 ? "" : "s"} added to Bag.`);
  saveGame();
  if (action.quantity > 0) queueInstantEconomyRemainder(action, { reservedGold: confirmedUnitPrice * action.quantity });
}

async function executeInstantCityUpgrade(action) {
  const city = cityById(action.cityId);
  if (!city) throw new Error("That city is no longer available.");
  const chunkLevels = Math.min(action.levels, SERVER_CITY_UPGRADE_LEVEL_CHUNK);
  const chunkCosts = action.levelCosts.slice(0, chunkLevels);
  serverCityUpgradeInFlightIds.add(action.cityId);
  const result = await getOnlineApi().upgradeCity({ cityId: city.id, regionId: action.regionId, levels: chunkLevels });
  if (!isInstantEconomyActionCurrent(action)) return;
  const upgraded = Math.min(chunkLevels, Math.max(0, Math.floor(Number(result?.upgraded) || 0)));
  if (upgraded < 1) throw new Error("The city upgrade was not confirmed by the server.");
  action.levels -= upgraded;
  action.levelCosts = action.levelCosts.slice(upgraded);
  action.reservedGold = Math.max(0, action.reservedGold - chunkCosts.slice(0, upgraded).reduce((sum, cost) => sum + cost, 0));
  applyServerEconomyResult(result);
  const updatedCity = cityById(city.id) || city;
  addLog(`${updatedCity.name} upgraded ${upgraded === 1 ? "1 level" : `${formatNumber(upgraded)} levels`} to level ${formatNumber(updatedCity.level)}.`);
  showToast(`${updatedCity.name} upgraded ${upgraded === 1 ? "1 level" : `${formatNumber(upgraded)} levels`}`);
  playGameSound("level_up", { cooldownMs: 180, allowCrossMap: true, volumeScale: 1.35 });
  playCityUpgradeAnimation(action.vfxBefore, getCityVfxSnapshot(updatedCity));
  if (action.levels > 0) queueInstantEconomyRemainder(action, { vfxBefore: getCityVfxSnapshot(updatedCity) });
}

async function executeInstantInventoryActivation(action) {
  const item = getShopItemById(action.itemId);
  const quantity = supportsInstantEconomyActionBatching() && isStackableTimedInventoryItem(item)
    ? Math.min(action.quantity, INSTANT_ECONOMY_ITEM_BATCH_LIMIT)
    : 1;
  const result = await getOnlineApi().activateInventoryItem({ itemId: item.id, quantity });
  if (!isInstantEconomyActionCurrent(action)) return;
  const confirmed = Math.max(1, Math.min(quantity, Math.floor(Number(result?.activatedQuantity) || quantity)));
  action.quantity -= confirmed;
  applyServerEconomyResult(result);
  settleConfirmedInventoryItem(item, result, confirmed);
  if (action.quantity > 0) queueInstantEconomyRemainder(action, {});
}

async function executeInstantSwiftMarch(action) {
  const result = await getOnlineApi().useSwiftMarchOrder({ armyId: action.armyId });
  if (!isInstantEconomyActionCurrent(action)) return;
  action.quantity = 0;
  settleConfirmedSwiftMarchOrder(action, result);
}

async function executeInstantRecall(action) {
  const result = await getOnlineApi().useRecallHorn({ armyId: action.armyId });
  if (!isInstantEconomyActionCurrent(action)) return;
  action.quantity = 0;
  settleConfirmedRecallHorn(action, result);
}

function buyShopItem(itemId) {
  if (!state) return false;
  const item = getShopItemById(itemId);
  if (!item) return false;
  const price = getShopItemPrice(item);
  const purchaseLimit = getItemDailyPurchaseLimit(item.id);
  if (purchaseLimit > 0 && getProjectedItemPurchaseCount(item.id) >= purchaseLimit) {
    rejectGameAction(`${item.label} resets at 00:00 UTC, in ${getItemPurchaseCooldownText(item.id)}.`);
    return false;
  }
  if (getProjectedGold() < price) {
    rejectGameAction(`${item.label} costs ${formatNumber(price)} gold.`);
    return false;
  }
  if (usesServerEconomyAuthority()) {
    return enqueueInstantEconomyAction({
      type: "shop", key: item.id, itemId: item.id, quantity: 1, unitCost: price, reservedGold: price,
    });
  }
  const inventory = ensureShopItems();
  state.gold = getProjectedGold() - price;
  inventory[item.id] = Math.max(0, Math.floor(Number(inventory[item.id]) || 0)) + 1;
  recordItemPurchase(item.id);
  selectedInventoryItemId = item.id;
  addLog(`Bought ${item.label} for ${formatNumber(price)} gold.`);
  saveGame();
  renderHud();
  patchShopProjectedUi();
  showToast(`${item.label} added to Bag.`);
  void flushOnlineSave(true);
  return true;
}

function upgradeCity(cityId, levels = 1) {
  const city = cityById(cityId);
  if (!city) return false;
  if (city.owner !== "player" || isStronghold(city)) {
    rejectGameAction(city.owner !== "player" ? "You do not own that city." : "Strongholds cannot be upgraded.");
    return false;
  }
  const blockers = getIncomingUpgradeBlockers(city.id);
  if (blockers.length) {
    rejectGameAction(`${city.name} cannot be upgraded while an attack is incoming. Arrival: ${formatDuration(blockers[0].remaining)}.`);
    return false;
  }
  const requested = Math.max(1, Math.floor(Number(levels) || 1));
  const affordable = getProjectedAffordableCityUpgradeLevels(city, requested);
  if (affordable < 1) {
    rejectGameAction("Not enough gold");
    patchInstantEconomyUi();
    return false;
  }
  if (usesServerEconomyAuthority()) {
    const costs = getInstantCityLevelCosts(city, affordable);
    return enqueueInstantEconomyAction({
      type: "city",
      key: `${getCityRegionId(city)}:${city.id}`,
      cityId: city.id,
      regionId: getCityRegionId(city),
      levels: costs.length,
      levelCosts: costs,
      reservedGold: costs.reduce((sum, cost) => sum + cost, 0),
      vfxBefore: getCityVfxSnapshot(city),
    });
  }
  const vfxBefore = getCityVfxSnapshot(city);
  for (let offset = 0; offset < affordable; offset += 1) {
    const cost = getLevelCost(city);
    state.gold -= cost;
    city.investedGold = Math.max(0, Math.floor(Number(city.investedGold) || 0)) + cost;
    city.level = clampCityLevel(city.level + 1);
  }
  addLog(`${city.name} upgraded to level ${city.level}.`);
  showToast(`${city.name} upgraded`);
  playGameSound("level_up", { cooldownMs: 180, allowCrossMap: true, volumeScale: 1.35 });
  markOwnedCityChanged(city);
  saveGame();
  renderAll();
  playCityUpgradeAnimation(vfxBefore, getCityVfxSnapshot(city));
  return true;
}

function useInventoryItem(itemId) {
  if (!state) return false;
  const item = getShopItemById(itemId);
  if (!item) return false;
  if (item.id === SWIFT_MARCH_ORDER_ITEM_ID || item.id === RECALL_HORN_ITEM_ID) {
    const eligible = getOutgoingAttacks().filter(item.id === SWIFT_MARCH_ORDER_ITEM_ID ? isSwiftMarchOrderEligible : isRecallHornEligible);
    if (modal?.open && modal.classList.contains("inventory-modal")) modal.close();
    if (!eligible.length) {
      rejectGameAction(item.id === SWIFT_MARCH_ORDER_ITEM_ID
        ? "No eligible troop transfers or Stronghold reinforcements are active."
        : "No eligible troop marches are active.");
      return false;
    }
    showOutgoingAttacksModal();
    return true;
  }
  if (getProjectedInventoryCount(item.id) < 1) {
    rejectGameAction(`You do not have ${item.label}.`);
    return false;
  }
  const projectedActive = getProjectedItemEffectExpiresAtMs(item);
  if (!isStackableTimedInventoryItem(item) && projectedActive > Date.now()) {
    rejectGameAction(`${item.label} is already active for ${formatDuration(Math.ceil((projectedActive - Date.now()) / 1000))}.`);
    return false;
  }
  if (usesServerEconomyAuthority()) {
    return enqueueInstantEconomyAction({ type: "item", key: item.id, itemId: item.id, quantity: 1 });
  }
  const localAction = item.id === ROYAL_PEACE_SHIELD_ITEM_ID
    ? useRoyalPeaceShield
    : item.id === WAR_DRUMS_ITEM_ID
      ? useWarDrums
      : item.id === ROYAL_TAX_DECREE_ITEM_ID
        ? useRoyalTaxDecree
        : item.id === VEIL_OF_SILENCE_ITEM_ID
          ? useVeilOfSilence
          : null;
  if (!localAction) return false;
  void localAction(item).catch(error => rejectGameAction(error?.message || `Could not activate ${item.label}.`));
  return true;
}

function useSwiftMarchOrderOnMission(armyId = "") {
  const normalizedArmyId = String(armyId || "").trim();
  if (!normalizedArmyId || swiftMarchOrderRequests.has(normalizedArmyId)) return false;
  const mission = getOutgoingAttacks().find(entry => getOnlineArmyResolutionId(entry) === normalizedArmyId);
  if (!mission || !isSwiftMarchOrderEligible(mission) || getProjectedInventoryCount(SWIFT_MARCH_ORDER_ITEM_ID) < 1) {
    rejectGameAction(!mission || !isSwiftMarchOrderEligible(mission)
      ? "That troop transfer or Stronghold reinforcement is no longer eligible for a Swift March Order."
      : "You do not have a Swift March Order.");
    return false;
  }
  if (!usesServerArmyAuthority() || !getOnlineApi()?.useSwiftMarchOrder) {
    rejectGameAction("Swift March Orders require the online Crownlands server.");
    return false;
  }
  swiftMarchOrderRequests.add(normalizedArmyId);
  return enqueueInstantEconomyAction({
    type: "swift", key: normalizedArmyId, coalesce: false, armyId: normalizedArmyId,
    itemId: SWIFT_MARCH_ORDER_ITEM_ID, quantity: 1, mission,
  });
}

function useRecallHornOnMission(armyId = "") {
  const normalizedArmyId = String(armyId || "").trim();
  if (!normalizedArmyId || recallHornRequests.has(normalizedArmyId)) return false;
  const mission = getOutgoingAttacks().find(entry => getOnlineArmyResolutionId(entry) === normalizedArmyId);
  if (!mission || !isRecallHornEligible(mission) || getProjectedInventoryCount(RECALL_HORN_ITEM_ID) < 1) {
    rejectGameAction(!mission || !isRecallHornEligible(mission)
      ? "That troop march is no longer eligible for a Recall Horn."
      : "You do not have a Recall Horn.");
    return false;
  }
  if (!usesServerArmyAuthority() || !getOnlineApi()?.useRecallHorn) {
    rejectGameAction("Recall Horns require the online Crownlands server.");
    return false;
  }
  recallHornRequests.add(normalizedArmyId);
  return enqueueInstantEconomyAction({
    type: "recall", key: normalizedArmyId, coalesce: false, armyId: normalizedArmyId,
    itemId: RECALL_HORN_ITEM_ID, quantity: 1, mission,
  });
}

function isMissingSkillBatchCallable(error = null) {
  const code = String(error?.code || "").toLowerCase().replace(/^functions\//, "");
  return code === "not-found" || code === "unimplemented";
}

function scheduleSkillSpendFlush(delayMs = INSTANT_ECONOMY_ACTION_DELAY_MS) {
  if (skillSpendFlushTimer || activeSkillSpendBatch || !pendingSkillSpendAllocations.size) return;
  skillSpendFlushTimer = window.setTimeout(() => {
    skillSpendFlushTimer = 0;
    void flushSkillSpendQueue();
  }, Math.max(0, delayMs));
}

function trimPendingSkillSpendAllocations() {
  if (!state || !pendingSkillSpendAllocations.size) return false;
  let available = getAvailableSkillPoints(state.character, state.upgrades);
  let trimmed = false;
  const next = new Map();
  pendingSkillSpendAllocations.forEach((points, skill) => {
    const kept = Math.min(points, Math.max(0, getSkillMaxLevel(skill) - getSkillLevel(skill)), available);
    if (kept > 0) {
      next.set(skill, kept);
      available -= kept;
    }
    if (kept !== points) trimmed = true;
  });
  pendingSkillSpendAllocations.clear();
  next.forEach((points, skill) => pendingSkillSpendAllocations.set(skill, points));
  return trimmed;
}

async function spendSkillBatchWithLegacyFallback(allocations = []) {
  const api = getOnlineApi();
  if (!api?.spendSkillPoint) throw new Error("Skill upgrades require the Crownlands server.");
  if (api.spendSkillPoints) {
    try {
      return await api.spendSkillPoints({ allocations });
    } catch (error) {
      if (!isMissingSkillBatchCallable(error)) throw error;
    }
  }
  let result = null;
  for (const allocation of allocations) {
    for (let point = 0; point < allocation.points; point += 1) result = await api.spendSkillPoint({ skillId: allocation.skillId });
  }
  return result;
}

function flushSkillSpendQueue() {
  if (!state || activeSkillSpendBatch || !pendingSkillSpendAllocations.size) return false;
  const allocations = [...pendingSkillSpendAllocations.entries()].map(([skillId, points]) => ({ skillId, points }));
  pendingSkillSpendAllocations.clear();
  activeSkillSpendBatch = { allocations };
  enqueueInstantEconomyAction({ type: "skill", key: "skill", coalesce: false, allocations });
  return true;
}

async function executeInstantSkillSpend(action) {
  const result = await spendSkillBatchWithLegacyFallback(action.allocations);
  if (!isInstantEconomyActionCurrent(action)) return;
  applyServerEconomyResult(result, { renderCities: false, renderProfile: false });
  activeSkillSpendBatch = null;
  const trimmed = trimPendingSkillSpendAllocations();
  action.allocations.forEach(allocation => addLog(`${SKILL_CONFIG[allocation.skillId].label} improved by ${formatNumber(allocation.points)} to level ${getSkillLevel(allocation.skillId)}.`));
  const total = action.allocations.reduce((sum, allocation) => sum + allocation.points, 0);
  showToast(`${formatNumber(total)} skill ${total === 1 ? "point" : "points"} applied`);
  if (trimmed) showToast("Some queued skill points were no longer available.");
  skillPresetMarkupSignature = "";
  renderProfileSkills();
}

function buySkill(skill) {
  const config = SKILL_CONFIG[skill];
  if (!config || skillActionInFlight) return false;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  reconcileSkillPoints(state.character, state.upgrades);
  if (isDisplayedSkillAtCap(skill)) {
    rejectGameAction(`${config.label} is capped at ${config.maxPercent}%.`);
    return false;
  }
  if (getDisplayedSkillPoints() < 1) {
    rejectGameAction("Earn a hero level for another skill point.");
    return false;
  }
  if (usesServerEconomyAuthority() && getOnlineApi()?.spendSkillPoint) {
    pendingSkillSpendAllocations.set(skill, (pendingSkillSpendAllocations.get(skill) || 0) + 1);
    skillPresetMarkupSignature = "";
    renderProfileSkills();
    scheduleSkillSpendFlush();
    return true;
  }
  state.character.skillPoints -= 1;
  state.upgrades[skill] = getSkillLevel(skill) + 1;
  state.skillPresets = setActiveSkillPresetSlot(state.skillPresets, 0);
  addLog(`${config.label} improved to level ${state.upgrades[skill]}.`);
  saveGame();
  skillPresetMarkupSignature = "";
  renderHud();
  renderProfileSkills();
  return true;
}
