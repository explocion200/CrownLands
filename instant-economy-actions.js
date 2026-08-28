"use strict";
/* exported bindInventoryCarousel, bindInventoryCategoryControls, buyShopItem, buySkill, clearInstantEconomyActions, getCityUpgradeStableSortLevel, getInventoryEffectLabel, getPendingCityUpgradeCount, isServerCityUpgradeInFlight, refundSkill, renderInventorySlot, upgradeCity, useInventoryItem, useRecallHornOnMission, useSwiftMarchOrderOnMission */

const INSTANT_ECONOMY_ACTION_DELAY_MS = 125;
const INSTANT_ECONOMY_ITEM_BATCH_LIMIT = 25;
const toWhole = value => Math.max(0, Math.floor(Number(value) || 0));
const INVENTORY_CATEGORIES = Object.freeze([
  ["all", "All"],
  ["boosts", "Boosts"],
  ["war", "War"],
  ["defense", "Defense"],
  ["utility", "Utility"],
]);
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

function createCityUpgradeRequestId(cityId = "") {
  const randomPart = typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2, 14);
  return `city_${String(cityId || "upgrade").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32)}_${Date.now().toString(36)}_${randomPart}`.slice(0, 88);
}

function createSkillLevelAdjustmentRequestId() {
  const randomPart = typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2, 14);
  return `skill_${Date.now().toString(36)}_${randomPart}`.slice(0, 88);
}

function supportsInstantEconomyActionBatching() {
  return Number(verifiedRealmInfo?.capabilities?.instantEconomyActionsVersion || 0) >= 1;
}

function supportsAuthoritativeCityUpgradeModes() {
  return Number(verifiedRealmInfo?.capabilities?.cityUpgradeModesVersion || 0) >= 1;
}

function getCityUpgradeActionKey(cityOrId = "", regionId = "") {
  const city = typeof cityOrId === "object" ? cityOrId : null;
  const cityId = getKnownCityId(city?.id || cityOrId);
  if (!cityId) return "";
  return `${normalizeRegionId(regionId || (city ? getCityRegionId(city) : getActiveMapRegionId()))}:${cityId}`;
}

function getPendingCityUpgradeAction(cityOrId = "", regionId = "") {
  const key = getCityUpgradeActionKey(cityOrId, regionId);
  if (!key) return null;
  return getInstantEconomyPendingActions().find(action => action.type === "city" && action.key === key) || null;
}

function isServerCityUpgradeInFlight(cityOrId = "", regionId = "") {
  return serverCityUpgradeInFlightIds.has(getCityUpgradeActionKey(cityOrId, regionId));
}

function getInstantEconomyPendingActions() {
  return [instantEconomyActiveAction, ...instantEconomyActions].filter(Boolean);
}

function hasPendingServerCityUpgrade(cityId = "", regionId = "") {
  return Boolean(getPendingCityUpgradeAction(cityId, regionId));
}

function getPendingCityUpgradeCount(cityOrId = "", regionId = "") {
  const key = getCityUpgradeActionKey(cityOrId, regionId);
  if (!key) return 0;
  return getInstantEconomyPendingActions().filter(action => action.type === "city" && action.key === key).length;
}

function getCityUpgradeStableSortLevel(city) {
  if (!city) return 1;
  const pending = getPendingCityUpgradeAction(city, getCityRegionId(city));
  return clampCityLevel(pending?.sortLevel ?? city.level);
}

function getInstantEconomyReservedGold() {
  return getInstantEconomyPendingActions().reduce((total, action) => (
    total + toWhole(action.reservedGold)
  ), 0);
}

function getProjectedGold() {
  return Math.max(0, toWhole(state?.gold) - getInstantEconomyReservedGold());
}

function getInstantPendingItemDelta(itemId = "") {
  const normalizedItemId = String(itemId || "");
  return getInstantEconomyPendingActions().reduce((total, action) => {
    if (action.itemId !== normalizedItemId) return total;
    const quantity = toWhole(action.quantity);
    return total + (action.type === "shop" ? quantity : ["item", "swift", "recall"].includes(action.type) ? -quantity : 0);
  }, 0);
}

function getProjectedInventoryCount(itemId = "") {
  const owned = toWhole(ensureShopItems()?.[itemId]);
  return Math.max(0, owned + getInstantPendingItemDelta(itemId));
}

function getProjectedItemPurchaseCount(itemId = "") {
  const pending = getInstantEconomyPendingActions().reduce((total, action) => (
    action.type === "shop" && action.itemId === itemId
      ? total + toWhole(action.quantity)
      : total
  ), 0);
  return getItemPurchaseCount(itemId) + pending;
}

function getPendingCityUpgradeLevels(cityId = "", regionId = "") {
  const normalizedRegionId = regionId ? normalizeRegionId(regionId) : "";
  return getInstantEconomyPendingActions().reduce((total, action) => (
    action.type === "city" && action.cityId === cityId
      && (!normalizedRegionId || normalizeRegionId(action.regionId) === normalizedRegionId)
      ? total + toWhole(action.levels)
      : total
  ), 0);
}

function getProjectedCityForInstantActions(city) {
  if (!city) return null;
  const queuedLevels = getPendingCityUpgradeLevels(city.id, getCityRegionId(city));
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
  const count = toWhole(levels);
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
  scheduleInstantEconomyFlush(normalized.type === "city" ? 0 : INSTANT_ECONOMY_ACTION_DELAY_MS);
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
  const hasPendingCityUpgrade = getInstantEconomyPendingActions().some(action => action.type === "city");
  if (hasPendingCityUpgrade) setTextIfChanged(goldText, formatNumber(getProjectedGold()));
  else renderHud();
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
    card.classList.toggle("pending", getInstantPendingItemDelta(item.id) > 0);
  });
  patchShopPurchaseBar();
}

function patchInventoryProjectedUi() {
  modalBody?.querySelectorAll("[data-inventory-select]").forEach(slot => {
    const itemId = slot.dataset.inventoryItem || "";
    const count = getProjectedBagItemCount(itemId);
    const pending = getInstantPendingItemDelta(itemId) < 0;
    setTextIfChanged(slot.querySelector("[data-inventory-quantity]"), `x${formatNumber(count)}`);
    slot.disabled = count < 1;
    slot.classList.toggle("pending", pending);
    slot.setAttribute("aria-label", `${slot.dataset.inventoryLabel || itemId}, ${formatNumber(count)} owned`);
  });
  const useButton = modalBody?.querySelector("[data-inventory-use]");
  if (!useButton) return;
  const itemId = useButton.dataset.inventoryUse || "";
  const item = getShopItemById(itemId);
  const count = getProjectedBagItemCount(itemId);
  setTextIfChanged(modalBody.querySelector("[data-inventory-owned]"), `Owned: ${formatNumber(count)}`);
  const projectedExpiresAtMs = getProjectedItemEffectExpiresAtMs(item);
  const effectLine = modalBody.querySelector("[data-inventory-active]");
  if (effectLine && projectedExpiresAtMs > Date.now()) {
    setTextIfChanged(effectLine, `Active: ${formatDuration(Math.ceil((projectedExpiresAtMs - Date.now()) / 1000))}`);
  }
  useButton.disabled = count < 1 || (!isStackableTimedInventoryItem(item) && projectedExpiresAtMs > Date.now());
  useButton.classList.toggle("pending", getInstantPendingItemDelta(itemId) < 0);
}

// The projected Bag renderer lives with its queued item-action reconciliation.
function getProjectedBagItemCount(itemId) {
  return itemId === COMMON_GEAR_BOX_ITEM.id
    ? toWhole(state?.gear?.commonGearBoxes)
    : getProjectedInventoryCount(itemId);
}

function getInventoryGroups(category = selectedInventoryCategory) {
  const gearBoxCount = getProjectedBagItemCount(COMMON_GEAR_BOX_ITEM.id);
  return [
    ...(gearBoxCount ? [{ ...COMMON_GEAR_BOX_ITEM, count: gearBoxCount }] : []),
    ...SHOP_ITEMS.map(item => ({ ...item, count: getProjectedBagItemCount(item.id) })),
  ].filter(item => item.count > 0 && (category === "all" || item.bagCategory === category));
}

function getInventoryPageModel(category = selectedInventoryCategory, requestedPage = selectedInventoryPage) {
  const groups = getInventoryGroups(category);
  const totalEntries = groups.length;
  const pageCount = Math.max(1, Math.ceil(totalEntries / INVENTORY_SLOT_COUNT));
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(Number(requestedPage) || 0)));
  const start = page * INVENTORY_SLOT_COUNT;
  const entries = groups.slice(start, start + INVENTORY_SLOT_COUNT).map(group => ({
    ...group,
    ownedCount: group.count,
    entryKey: group.id,
  }));
  return { category, entries, totalEntries, page, pageCount };
}

function reconcileInventorySelectionAfterCountChange(itemId = selectedInventoryItemId) {
  const normalizedItemId = String(itemId || "");
  if (!normalizedItemId || selectedInventoryItemId !== normalizedItemId) return false;
  if (getProjectedBagItemCount(normalizedItemId) > 0) {
    selectedInventoryEntryKey = normalizedItemId;
    return false;
  }
  const orderedDefinitions = [
    ...(COMMON_GEAR ? [COMMON_GEAR_BOX_ITEM] : []),
    ...SHOP_ITEMS,
  ].filter(item => selectedInventoryCategory === "all" || item.bagCategory === selectedInventoryCategory);
  const removedIndex = orderedDefinitions.findIndex(item => item.id === normalizedItemId);
  const ownedGroups = getInventoryGroups(selectedInventoryCategory);
  const fallback = ownedGroups.find(group => orderedDefinitions.findIndex(item => item.id === group.id) > removedIndex)
    || [...ownedGroups].reverse().find(group => orderedDefinitions.findIndex(item => item.id === group.id) < removedIndex)
    || null;
  selectedInventoryItemId = fallback?.id || "";
  selectedInventoryEntryKey = fallback?.id || "";
  selectedInventoryPage = fallback
    ? Math.floor(ownedGroups.findIndex(group => group.id === fallback.id) / INVENTORY_SLOT_COUNT)
    : 0;
  return true;
}

function bindInventoryCategoryControls() {
  const buttons = [...modalBody.querySelectorAll("[data-inventory-category]")];
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const category = button.dataset.inventoryCategory || "all";
      if (!INVENTORY_CATEGORIES.some(([id]) => id === category)) return;
      selectedInventoryCategory = category;
      selectedInventoryPage = 0;
      inventoryPageDirection = 0;
      selectedInventoryItemId = "";
      selectedInventoryEntryKey = "";
      showInventoryModal();
    });
    button.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const target = buttons[(index + offset + buttons.length) % buttons.length];
      const targetCategory = target?.dataset.inventoryCategory || "all";
      target?.click();
      modalBody.querySelector(`[data-inventory-category="${targetCategory}"]`)?.focus();
    });
  });
}

function renderInventorySlot(entry, selectedEntryKey = "") {
  const selected = entry.entryKey === selectedEntryKey;
  return `
    <button class="inventory-slot filled ${selected ? "selected" : ""}" data-inventory-select="${escapeHtml(entry.entryKey)}" data-inventory-item="${escapeHtml(entry.id)}" data-inventory-label="${escapeHtml(entry.label)}" type="button" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(`${entry.label}, ${formatNumber(entry.ownedCount)} owned`)}">
      <span class="inventory-slot-count" data-inventory-quantity aria-hidden="true">x${formatNumber(entry.ownedCount)}</span>
      <span class="inventory-slot-icon ${entry.icon ? "has-image" : ""}" aria-hidden="true">${renderItemIcon(entry, "inventory-slot-image")}</span>
      <strong class="inventory-slot-name">${escapeHtml(entry.label)}</strong>
    </button>
  `;
}

function getInventoryEffectLabel(item) {
  if (item?.id === ROYAL_PEACE_SHIELD_ITEM_ID) return `Duration: ${formatDuration(ROYAL_PEACE_SHIELD_DURATION_MS / 1000)}`;
  if (item?.id === WAR_DRUMS_ITEM_ID) return `Adds: ${formatDuration(WAR_DRUMS_DURATION_MS / 1000)} per use`;
  if (item?.id === ROYAL_TAX_DECREE_ITEM_ID) return `Adds: ${formatDuration(ROYAL_TAX_DECREE_DURATION_MS / 1000)} per use`;
  if (item?.id === VEIL_OF_SILENCE_ITEM_ID) return `Duration: ${formatDuration(VEIL_OF_SILENCE_DURATION_MS / 1000)}`;
  if (item?.id === SWIFT_MARCH_ORDER_ITEM_ID) return "Effect: one eligible march";
  if (item?.id === RECALL_HORN_ITEM_ID) return "Effect: one active march";
  if (item?.id === COMMON_GEAR_BOX_ITEM.id) return "Contains: 3 Common gear pieces";
  return "";
}

function setInventoryPage(nextPage, restoreFocus = false) {
  const model = getInventoryPageModel(selectedInventoryCategory, nextPage);
  if (model.page === selectedInventoryPage) return;
  inventoryPageDirection = model.page > selectedInventoryPage ? 1 : -1;
  selectedInventoryPage = model.page;
  selectedInventoryItemId = "";
  selectedInventoryEntryKey = "";
  showInventoryModal();
  if (restoreFocus) modalBody.querySelector(".inventory-carousel-viewport")?.focus();
}

function bindInventoryCarousel(viewport) {
  if (!viewport) return;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  viewport.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
  });
  const releasePointer = event => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    pointerId = null;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
    event.preventDefault();
    inventorySuppressSelectionUntilMs = Date.now() + 350;
    setInventoryPage(selectedInventoryPage + (deltaX < 0 ? 1 : -1));
  };
  viewport.addEventListener("pointerup", releasePointer);
  viewport.addEventListener("pointercancel", () => { pointerId = null; });
  viewport.addEventListener("wheel", event => {
    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey ? event.deltaY : 0;
    if (Math.abs(horizontalDelta) < 20) return;
    event.preventDefault();
    if (Date.now() < inventoryHorizontalInputUntilMs) return;
    inventoryHorizontalInputUntilMs = Date.now() + 280;
    setInventoryPage(selectedInventoryPage + (horizontalDelta > 0 ? 1 : -1));
  }, { passive: false });
  viewport.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setInventoryPage(selectedInventoryPage + (event.key === "ArrowRight" ? 1 : -1), true);
  });
}

/* Common Gear Box reveal flow lives in common-gear-ui.js. */


function patchCityUpgradeUi() {
  const pendingCityActions = getInstantEconomyPendingActions().filter(action => action.type === "city");
  if (modal?.open && modal.classList.contains("city-list-modal")) {
    patchCityListUpgradeRows();
    return;
  }
  if (pendingCityActions.some(action => normalizeRegionId(action.regionId) === getActiveMapRegionId())) renderCities(true);
  const selectedCity = cityById(selectedSourceId || "");
  const wheel = cityLayer?.querySelector(".city-action-wheel .wheel-level");
  if (selectedCity && wheel) {
    const projectedCity = getProjectedCityForInstantActions(selectedCity);
    const cost = getLevelCost(projectedCity);
    const pending = hasPendingServerCityUpgrade(selectedCity.id, getCityRegionId(selectedCity));
    wheel.disabled = cityHasIncomingUpgradeBlocker(selectedCity) || !Number.isFinite(cost) || getProjectedGold() < cost;
    wheel.dataset.syncing = String(pending);
    setTextIfChanged(wheel.querySelector(".wheel-cost"), Number.isFinite(cost) ? `${formatNumber(cost)}g` : "Unavailable");
  }
  const panel = modalBody?.querySelector(".city-level-up-panel");
  if (!panel) return;
  const cityId = panel.dataset.cityUpgradeCity || "";
  const city = getOwnedCitySnapshotForUpgrade(cityId, panel.dataset.cityUpgradeRegion);
  if (!city) return;
  if (modal?.dataset?.cityInfoId === city.id && modalTitle) {
    const projectedCity = getProjectedCityForInstantActions(city) || city;
    modalTitle.textContent = `${city.name} - Level ${formatNumber(projectedCity.level)}`;
  }
  const holder = document.createElement("div");
  holder.innerHTML = renderCityLevelUpAction(city);
  const replacement = holder.firstElementChild;
  if (replacement) {
    panel.replaceWith(replacement);
    bindCityLevelUpButtons(city, modalBody);
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
  if (modal?.open && modal.classList.contains("inventory-modal")) showInventoryModal();
}

function discardQueuedCityUpgradeActions(actionKey = "") {
  if (!actionKey) return 0;
  let removed = 0;
  for (let index = instantEconomyActions.length - 1; index >= 0; index -= 1) {
    const action = instantEconomyActions[index];
    if (action?.type !== "city" || action.key !== actionKey) continue;
    instantEconomyActions.splice(index, 1);
    removed += 1;
  }
  return removed;
}

function revalidateInstantEconomyActions() {
  let availableGold = toWhole(state?.gold);
  const inventory = Object.fromEntries(SHOP_ITEMS.map(item => [item.id, toWhole(ensureShopItems()[item.id])]));
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
      const city = getOwnedCitySnapshotForUpgrade(action.cityId, action.regionId);
      if (!city || city.owner !== "player" || isStronghold(city) || getIncomingUpgradeBlockers(city).length) return;
      const cityKey = getCityUpgradeActionKey(city.id, action.regionId);
      const startLevel = (levelsByCity.get(cityKey) ?? city.level);
      const reduction = getCityUpgradeReductionPercent(city);
      const costs = [];
      const requestedLevels = action.mode === "max"
        ? Number.MAX_SAFE_INTEGER
        : Math.max(1, Math.floor(Number(action.requestedLevels || action.levels) || 1));
      for (let offset = 0; offset < requestedLevels; offset += 1) {
        const cost = getCityUpgradeCostAtLevel(startLevel + offset, reduction);
        if (!Number.isFinite(cost) || cost > availableGold - costs.reduce((sum, value) => sum + value, 0)) break;
        costs.push(cost);
      }
      if (action.mode === "exact" && costs.length !== requestedLevels) return;
      if (!costs.length) return;
      action.levels = costs.length;
      action.levelCosts = costs;
      action.reservedGold = costs.reduce((sum, value) => sum + value, 0);
      availableGold -= action.reservedGold;
      levelsByCity.set(cityKey, startLevel + costs.length);
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
      pendingSkillSpendAllocations.clear();
      skillPresetMarkupSignature = "";
      renderProfileSkills();
    }
    if (action.type === "city") discardQueuedCityUpgradeActions(action.key);
    if (!error?.cityUpgradeCancelled) {
      console.warn(`Instant ${action.type} action failed`, error);
      rejectGameAction(
        action.type === "city"
          ? getCityUpgradeFailureMessage(error, "That city upgrade was not confirmed by the server.")
          : error?.message || "That action was not confirmed by the server.",
        { allowCrossMap: true }
      );
    }
    instantEconomyActiveAction = null;
    await refreshInstantEconomyAfterFailure(action);
    return false;
  } finally {
    if (instantEconomyActiveAction === action) instantEconomyActiveAction = null;
    if (action.type === "city") serverCityUpgradeInFlightIds.delete(action.key);
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
  selectedInventoryEntryKey = "";
  addLog(`Bought ${formatNumber(confirmed)} ${item.label}${confirmed === 1 ? "" : "s"} for ${formatNumber(Number(result?.spentGold) || confirmedUnitPrice * confirmed)} gold.`);
  showToast(`${formatNumber(confirmed)} ${item.label}${confirmed === 1 ? "" : "s"} added to Bag.`);
  saveGame();
  if (action.quantity > 0) queueInstantEconomyRemainder(action, { reservedGold: confirmedUnitPrice * action.quantity });
}

async function executeInstantCityUpgrade(action) {
  const city = getOwnedCitySnapshotForUpgrade(action.cityId, action.regionId);
  if (!city) throw new Error("That city is no longer available.");
  const authoritativeMode = action.mode === "exact" || action.mode === "max";
  const chunkLevels = authoritativeMode ? 0 : Math.min(action.levels, SERVER_CITY_UPGRADE_LEVEL_CHUNK);
  const chunkCosts = authoritativeMode ? [] : action.levelCosts.slice(0, chunkLevels);
  serverCityUpgradeInFlightIds.add(action.key);
  const requestChunk = toWhole(action.requestChunk);
  const requestId = `${action.requestIdBase || createCityUpgradeRequestId(city.id)}_${requestChunk}`.slice(0, 96);
  const api = getOnlineApi();
  let acknowledgedRebuildSuppressedXp = toWhole(action.acknowledgedRebuildSuppressedXp);
  const submitUpgrade = () => authoritativeMode
    ? api.upgradeCity({
      cityId: city.id,
      regionId: action.regionId,
      mode: action.mode,
      ...(action.mode === "exact" ? { levels: action.requestedLevels } : {}),
      requestId: action.requestId,
      acknowledgedCapSuppressedXp: 0,
      acknowledgedRebuildSuppressedXp,
    })
    : api.upgradeCity({
      cityId: city.id,
      regionId: action.regionId,
      levels: chunkLevels,
      requestId,
      acknowledgedCapSuppressedXp: 0,
      acknowledgedRebuildSuppressedXp,
    });
  let result;
  try {
    result = await submitUpgrade();
  } catch (error) {
    const details = getCityUpgradeErrorDetails(error);
    const refreshedReceipt = details?.reason === "city-upgrade-xp-warning-required"
      ? details.cityUpgradeXp
      : null;
    if (!authoritativeMode || !refreshedReceipt) throw error;
    acknowledgedRebuildSuppressedXp = toWhole(refreshedReceipt.rebuildSuppressedXp);
    result = await submitUpgrade();
  }
  if (!isInstantEconomyActionCurrent(action)) return;
  const reportedUpgraded = toWhole(result?.upgraded);
  const upgraded = authoritativeMode ? reportedUpgraded : Math.min(chunkLevels, reportedUpgraded);
  if (upgraded < 1) throw new Error("The city upgrade was not confirmed by the server.");
  const xpReceipt = result?.cityUpgradeXp || {};
  const capSuppressedXp = toWhole(xpReceipt.capSuppressedXp);
  const rebuildSuppressedXp = toWhole(xpReceipt.rebuildSuppressedXp);
  if (authoritativeMode) {
    action.levels = 0;
    action.levelCosts = [];
    action.reservedGold = 0;
  } else {
    action.levels -= upgraded;
    action.requestIdBase = action.requestIdBase || requestId.replace(/_\d+$/, "");
    action.requestChunk = requestChunk + 1;
    action.acknowledgedCapSuppressedXp = Math.max(
      0,
      Math.floor(Number(action.acknowledgedCapSuppressedXp) || 0) - capSuppressedXp
    );
    action.acknowledgedRebuildSuppressedXp = Math.max(
      0,
      Math.floor(Number(action.acknowledgedRebuildSuppressedXp) || 0) - rebuildSuppressedXp
    );
    action.levelCosts = action.levelCosts.slice(upgraded);
    action.reservedGold = Math.max(0, action.reservedGold - chunkCosts.slice(0, upgraded).reduce((sum, cost) => sum + cost, 0));
  }
  const authoritativeFinalLevel = clampCityLevel(result?.finalLevel);
  const cityListOpen = Boolean(modal?.open && modal.classList.contains("city-list-modal"));
  applyServerEconomyResult(result, {
    renderCities: !cityListOpen,
    renderCityList: false,
    cityUpgradeFeedback: result?.replayed ? null : {
      cityId: city.id,
      regionId: action.regionId,
      mode: action.mode,
      startingLevel: clampCityLevel(authoritativeFinalLevel - upgraded),
      finalLevel: authoritativeFinalLevel,
      upgraded,
      spentGold: toWhole(result?.spentGold),
    },
  });
  revalidateInstantEconomyActions();
  const updatedCity = getOwnedCitySnapshotForUpgrade(city.id, action.regionId) || city;
  if (!result?.replayed) {
    addLog(`${updatedCity.name} upgraded ${upgraded === 1 ? "1 level" : `${formatNumber(upgraded)} levels`} to level ${formatNumber(updatedCity.level)}.`);
    showToast(`${updatedCity.name} upgraded`);
    playGameSound("level_up", { cooldownMs: 180, allowCrossMap: true, volumeScale: 1.35 });
    playCityUpgradeAnimation(action.vfxBefore, getCityVfxSnapshot(updatedCity));
  }
  if (!authoritativeMode && action.levels > 0) queueInstantEconomyRemainder(action, { vfxBefore: getCityVfxSnapshot(updatedCity) });
}

function getCityUpgradeErrorDetails(error = null) {
  return error?.details || error?.customData?.details || error?.data || {};
}

function getCityUpgradeFailureMessage(error = null, fallback = "Could not upgrade that city.") {
  const details = getCityUpgradeErrorDetails(error);
  if (details?.reason === "city-upgrade-client-update-required") {
    return "Update Crownlands to the latest version to continue upgrading cities.";
  }
  return error?.message || fallback;
}

function queueServerCityUpgrade(cityId, options = {}) {
  const requestCity = getOwnedCitySnapshotForUpgrade(cityId, options.regionId);
  if (!requestCity) {
    rejectGameAction("That city is no longer available. Refresh the City List and try again.", { allowCrossMap: true });
    return false;
  }
  const regionId = getCityRegionId(requestCity);
  const mode = options.mode === "max" ? "max" : options.mode === "exact" ? "exact" : "legacy";
  const requestedLevels = mode === "max"
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, Math.floor(Number(options.requestedLevels) || 1));
  const affordable = getProjectedAffordableCityUpgradeLevels(requestCity, requestedLevels);
  if (affordable < 1 || (mode === "exact" && affordable !== requestedLevels)) {
    rejectGameAction("Not enough gold");
    return false;
  }
  const costs = getInstantCityLevelCosts(requestCity, affordable);
  const authoritativeMode = mode === "exact" || mode === "max";
  const priorPending = getPendingCityUpgradeAction(requestCity, regionId);
  return enqueueInstantEconomyAction({
    type: "city",
    key: getCityUpgradeActionKey(requestCity, regionId),
    cityId: requestCity.id,
    regionId,
    mode,
    requestedLevels: mode === "max" ? 0 : requestedLevels,
    requestId: authoritativeMode ? createCityUpgradeRequestId(requestCity.id) : "",
    coalesce: mode === "legacy",
    levels: costs.length,
    levelCosts: costs,
    reservedGold: costs.reduce((sum, cost) => sum + cost, 0),
    vfxBefore: getCityVfxSnapshot(getProjectedCityForInstantActions(requestCity) || requestCity),
    sortLevel: priorPending?.sortLevel ?? clampCityLevel(requestCity.level),
    requestIdBase: authoritativeMode ? "" : createCityUpgradeRequestId(requestCity.id),
    requestChunk: 0,
    acknowledgedRebuildSuppressedXp: 0,
  });
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
  inventory[item.id] = toWhole(inventory[item.id]) + 1;
  recordItemPurchase(item.id);
  selectedInventoryItemId = item.id;
  selectedInventoryEntryKey = "";
  addLog(`Bought ${item.label} for ${formatNumber(price)} gold.`);
  saveGame();
  renderHud();
  patchShopProjectedUi();
  showToast(`${item.label} added to Bag.`);
  void flushOnlineSave(true);
  return true;
}

function upgradeCity(cityId, levels = 1, options) {
  options = options || {};
  const requestedMode = options?.mode === "max" ? "max" : options?.mode === "exact" ? "exact" : "legacy";
  const city = getOwnedCitySnapshotForUpgrade(cityId, options?.regionId);
  if (!city) {
    rejectGameAction("That city is no longer available. Refresh the City List and try again.", { allowCrossMap: true });
    return false;
  }
  if (city.owner !== "player" || isStronghold(city)) {
    rejectGameAction(city.owner !== "player" ? "You do not own that city." : "Strongholds cannot be upgraded.");
    return false;
  }
  const blockers = getIncomingUpgradeBlockers(city);
  if (blockers.length) {
    rejectGameAction(`${city.name} cannot be upgraded while an attack is incoming. Arrival: ${formatDuration(blockers[0].remaining)}.`);
    return false;
  }
  const requested = requestedMode === "max" ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(Number(levels) || 1));
  const affordable = getProjectedAffordableCityUpgradeLevels(city, requested);
  if (affordable < 1 || (requestedMode === "exact" && affordable !== requested)) {
    rejectGameAction("Not enough gold");
    patchInstantEconomyUi();
    return false;
  }
  if (usesServerEconomyAuthority()) {
    if (requestedMode !== "legacy" && !supportsAuthoritativeCityUpgradeModes()) {
      rejectGameAction("City upgrade controls need the current realm version. Refresh and try again.", { allowCrossMap: true });
      return false;
    }
    queueServerCityUpgrade(city.id, {
      regionId: getCityRegionId(city),
      mode: requestedMode,
      requestedLevels: requestedMode === "max" ? 0 : requested,
    });
    return true;
  }
  const vfxBefore = getCityVfxSnapshot(city);
  const localLevels = requestedMode === "exact" ? requested : affordable;
  const startingLevel = clampCityLevel(city.level);
  for (let offset = 0; offset < localLevels; offset += 1) {
    const cost = getLevelCost(city);
    state.gold -= cost;
    city.investedGold = toWhole(city.investedGold) + cost;
    city.level = clampCityLevel(city.level + 1);
  }
  addLog(`${city.name} upgraded to level ${city.level}.`);
  showToast(`${city.name} upgraded`);
  playGameSound("level_up", { cooldownMs: 180, allowCrossMap: true, volumeScale: 1.35 });
  markOwnedCityChanged(city);
  saveGame();
  setCityListUpgradeFeedback({
    cityId: city.id,
    regionId: getCityRegionId(city),
    mode: requestedMode,
    startingLevel,
    finalLevel: city.level,
    upgraded: localLevels,
  });
  renderAll();
  if (modal?.open && modal.classList.contains("city-list-modal")) renderCityListModal();
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
    const queued = enqueueInstantEconomyAction({ type: "item", key: item.id, itemId: item.id, quantity: 1 });
    if (queued && modal?.open && modal.classList.contains("inventory-modal")) {
      if (reconcileInventorySelectionAfterCountChange(item.id)) showInventoryModal();
      else patchInventoryProjectedUi();
    }
    return queued;
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
  pendingSkillSpendAllocations.forEach((levelDelta, skill) => {
    const currentLevel = getSkillLevel(skill);
    let keptDelta = 0;
    if (levelDelta > 0) {
      const requestedLevels = Math.min(levelDelta, Math.max(0, getSkillMaxLevel(skill) - currentLevel));
      while (keptDelta < requestedLevels) {
        const nextCost = getSkillPointCost(skill, currentLevel + keptDelta);
        if (nextCost < 1 || available < nextCost) break;
        available -= nextCost;
        keptDelta += 1;
      }
    } else if (levelDelta < 0) {
      const requestedLevels = Math.min(-levelDelta, currentLevel);
      while (-keptDelta < requestedLevels) {
        const levelBeingRemoved = currentLevel + keptDelta;
        available += getSkillPointCost(skill, levelBeingRemoved - 1);
        keptDelta -= 1;
      }
    }
    if (keptDelta !== 0) next.set(skill, keptDelta);
    if (keptDelta !== levelDelta) trimmed = true;
  });
  pendingSkillSpendAllocations.clear();
  next.forEach((levelDelta, skill) => pendingSkillSpendAllocations.set(skill, levelDelta));
  return trimmed;
}

async function adjustSkillLevelsWithSpendFallback(requestId = "", adjustments = []) {
  const api = getOnlineApi();
  if (!api?.adjustSkillLevels && !api?.spendSkillPoint) throw new Error("Skill changes require the Crownlands server.");
  if (api.adjustSkillLevels) {
    try {
      return await api.adjustSkillLevels({ requestId, adjustments });
    } catch (error) {
      if (!isMissingSkillBatchCallable(error)) throw error;
    }
  }
  if (adjustments.some(adjustment => adjustment.levelDelta < 0)) {
    throw new Error("Live skill refunds require the latest Crownlands server.");
  }
  if (!api?.spendSkillPoint) throw new Error("Skill upgrades require the Crownlands server.");
  const allocations = adjustments.map(adjustment => ({
    skillId: adjustment.skillId,
    points: adjustment.levelDelta,
  }));
  if (api.spendSkillPoints) {
    try {
      return await api.spendSkillPoints({ allocations });
    } catch (error) {
      if (!isMissingSkillBatchCallable(error)) throw error;
    }
  }
  let result = null;
  let spentSkillPoints = 0;
  for (const allocation of allocations) {
    for (let point = 0; point < allocation.points; point += 1) {
      result = await api.spendSkillPoint({ skillId: allocation.skillId });
      spentSkillPoints += Math.max(0, Math.floor(Number(result?.spentSkillPoints) || 0));
    }
  }
  return result ? { ...result, spentSkillPoints } : result;
}

function flushSkillSpendQueue() {
  if (!state || activeSkillSpendBatch || !pendingSkillSpendAllocations.size) return false;
  const adjustments = [...pendingSkillSpendAllocations.entries()]
    .filter(([, levelDelta]) => levelDelta !== 0)
    .map(([skillId, levelDelta]) => ({ skillId, levelDelta }));
  pendingSkillSpendAllocations.clear();
  if (!adjustments.length) return false;
  const requestId = createSkillLevelAdjustmentRequestId();
  activeSkillSpendBatch = { requestId, adjustments };
  enqueueInstantEconomyAction({ type: "skill", key: "skill", coalesce: false, requestId, adjustments });
  return true;
}

async function executeInstantSkillSpend(action) {
  const result = await adjustSkillLevelsWithSpendFallback(action.requestId, action.adjustments);
  if (!isInstantEconomyActionCurrent(action)) return;
  applyServerEconomyResult(result, { renderCities: false, renderProfile: false });
  activeSkillSpendBatch = null;
  const trimmed = trimPendingSkillSpendAllocations();
  action.adjustments.forEach(adjustment => addLog(
    `${SKILL_CONFIG[adjustment.skillId].label} ${adjustment.levelDelta > 0 ? "improved" : "reduced"} by ${formatNumber(Math.abs(adjustment.levelDelta))} to level ${getSkillLevel(adjustment.skillId)}.`
  ));
  const levelsAdded = action.adjustments.reduce((sum, adjustment) => sum + Math.max(0, adjustment.levelDelta), 0);
  const levelsRemoved = action.adjustments.reduce((sum, adjustment) => sum + Math.max(0, -adjustment.levelDelta), 0);
  const spentSkillPoints = Math.max(0, Math.floor(Number(result?.spentSkillPoints) || 0));
  const refundedSkillPoints = Math.max(0, Math.floor(Number(result?.refundedSkillPoints) || 0));
  const parts = [];
  if (levelsAdded) parts.push(`${formatNumber(levelsAdded)} added · ${formatNumber(spentSkillPoints)} ${spentSkillPoints === 1 ? "point" : "points"} spent`);
  if (levelsRemoved) parts.push(`${formatNumber(levelsRemoved)} removed · ${formatNumber(refundedSkillPoints)} ${refundedSkillPoints === 1 ? "point" : "points"} refunded`);
  showToast(parts.join(" · "));
  if (trimmed) showToast("Some queued skill changes were no longer valid.");
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
  const displayedLevel = getDisplayedSkillLevel(skill);
  const pointCost = getSkillPointCost(skill, displayedLevel);
  if (getDisplayedSkillPoints() < pointCost) {
    rejectGameAction(pointCost > 1
      ? `This final-tier upgrade costs ${pointCost} skill points.`
      : "Earn a hero level for another skill point.");
    return false;
  }
  if (usesServerEconomyAuthority() && getOnlineApi()?.spendSkillPoint) {
    pendingSkillSpendAllocations.set(skill, (pendingSkillSpendAllocations.get(skill) || 0) + 1);
    if (pendingSkillSpendAllocations.get(skill) === 0) pendingSkillSpendAllocations.delete(skill);
    state.skillPresets = setActiveSkillPresetSlot(state.skillPresets, 0);
    skillPresetMarkupSignature = "";
    renderProfileSkills();
    scheduleSkillSpendFlush();
    return true;
  }
  state.character.skillPoints -= pointCost;
  state.upgrades[skill] = getSkillLevel(skill) + 1;
  state.skillPresets = setActiveSkillPresetSlot(state.skillPresets, 0);
  addLog(`${config.label} improved to level ${state.upgrades[skill]}.`);
  saveGame();
  skillPresetMarkupSignature = "";
  renderHud();
  renderProfileSkills();
  return true;
}

function refundSkill(skill) {
  const config = SKILL_CONFIG[skill];
  if (!config || skillActionInFlight) return false;
  state.character = normalizeCharacterProgress(state.character);
  state.upgrades = normalizeUpgrades(state.upgrades, state.version);
  reconcileSkillPoints(state.character, state.upgrades);
  const displayedLevel = getDisplayedSkillLevel(skill);
  if (displayedLevel < 1) return false;
  if (usesServerEconomyAuthority() && getOnlineApi()?.spendSkillPoint) {
    if (!getOnlineApi()?.adjustSkillLevels) {
      rejectGameAction("Live skill refunds require the latest Crownlands server.");
      return false;
    }
    pendingSkillSpendAllocations.set(skill, (pendingSkillSpendAllocations.get(skill) || 0) - 1);
    if (pendingSkillSpendAllocations.get(skill) === 0) pendingSkillSpendAllocations.delete(skill);
    state.skillPresets = setActiveSkillPresetSlot(state.skillPresets, 0);
    skillPresetMarkupSignature = "";
    renderProfileSkills();
    scheduleSkillSpendFlush();
    return true;
  }
  const refundedPoints = getSkillPointCost(skill, displayedLevel - 1);
  state.upgrades[skill] = displayedLevel - 1;
  state.character.skillPoints = getAvailableSkillPoints(state.character, state.upgrades);
  state.skillPresets = setActiveSkillPresetSlot(state.skillPresets, 0);
  addLog(`${config.label} reduced to level ${state.upgrades[skill]}. Refunded ${formatNumber(refundedPoints)} skill ${refundedPoints === 1 ? "point" : "points"}.`);
  saveGame();
  skillPresetMarkupSignature = "";
  renderHud();
  renderProfileSkills();
  return true;
}
