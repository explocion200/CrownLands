/* Crownlands officer equipment view model, renderer, and interaction flow. */
let commonGearBagFilterOpen = false;

function getCommonGearInstances(buildingId, slot = "") {
  return Object.values(state?.gear?.instances || {})
    .filter(instance => instance.buildingId === buildingId && (!slot || instance.slot === slot))
    .sort((a, b) => b.level - a.level || a.acquiredAtMs - b.acquiredAtMs || a.instanceId.localeCompare(b.instanceId));
}

function titleCaseCommonGearLabel(value = "") {
  const text = String(value || "").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function createCommonGearDescription(definition, instance) {
  if (!definition || !instance) return "Select an item to inspect its craftsmanship and kingdom bonus.";
  const role = definition.characterRole || "royal officer";
  const slot = titleCaseCommonGearLabel(definition.slot);
  const effect = titleCaseCommonGearLabel(definition.statLabel);
  const subject = definition.category === "armor"
    ? `This ${slot.toLowerCase()} armor is fitted for the ${role}`
    : definition.isToolInsteadOfWeapon
      ? `This instrument of office is entrusted to the ${role}`
      : definition.category === "weapon"
        ? `This field-tested weapon is carried by the ${role}`
        : `This royal insignia marks the authority of the ${role}`;
  return `${subject}. At Level ${instance.level}, its Crownlands craftsmanship grants +${COMMON_GEAR.getBonusPercent(instance).toFixed(2)}% ${effect.toLowerCase()}.`;
}

function createCommonGearBagGroups(instances = [], selectedSlot = "head", selectedInstanceId = "") {
  const groups = new Map();
  instances.forEach(instance => {
    const displayBucket = instance.isEquipped ? "equipped" : "stored";
    const key = `${instance.gearKey}:${instance.level}:${displayBucket}`;
    const group = groups.get(key) || {
      key,
      gearKey: instance.gearKey,
      level: instance.level,
      displayBucket,
      instances: [],
    };
    group.instances.push(instance);
    groups.set(key, group);
  });
  const slotOrder = new Map(COMMON_GEAR.SLOTS.map((slot, index) => [slot, index]));
  return [...groups.values()].map(group => {
    group.instances.sort((a, b) => a.acquiredAtMs - b.acquiredAtMs || a.instanceId.localeCompare(b.instanceId));
    const representative = group.instances.find(instance => instance.instanceId === selectedInstanceId)
      || group.instances.find(instance => instance.isEquipped)
      || group.instances[0];
    const definition = COMMON_GEAR.getDefinition(group.gearKey);
    return {
      key: group.key,
      gearKey: group.gearKey,
      level: group.level,
      count: group.instances.length,
      instanceIds: group.instances.map(instance => instance.instanceId),
      representative,
      representativeInstanceId: representative.instanceId,
      definition,
      isEquipped: group.instances.some(instance => instance.isEquipped),
      isNew: group.instances.some(instance => instance.isNew),
      isSelected: group.instances.some(instance => instance.instanceId === selectedInstanceId),
      isCompatible: representative.slot === selectedSlot,
      oldestAcquiredAtMs: group.instances[0]?.acquiredAtMs || 0,
    };
  }).sort((a, b) => Number(b.isEquipped) - Number(a.isEquipped)
    || b.level - a.level
    || (slotOrder.get(a.representative.slot) ?? 99) - (slotOrder.get(b.representative.slot) ?? 99)
    || a.oldestAcquiredAtMs - b.oldestAcquiredAtMs
    || a.key.localeCompare(b.key));
}

function getCommonGearUpgradePreview(instance, instances = Object.values(state?.gear?.instances || {})) {
  if (!instance) {
    return {
      requirement: null,
      duplicateCount: 0,
      upgradeGold: 0,
      canUpgrade: false,
      reason: "Select an item to upgrade.",
    };
  }
  const requirement = COMMON_GEAR.getUpgradeRequirement(instance.level);
  if (!requirement) {
    return {
      requirement: null,
      duplicateCount: 0,
      upgradeGold: 0,
      canUpgrade: false,
      reason: "Maximum level reached.",
    };
  }
  const duplicateCount = instances.filter(candidate => candidate.instanceId !== instance.instanceId
    && candidate.gearKey === instance.gearKey
    && candidate.level === 1
    && !candidate.isEquipped).length;
  const upgradeGold = Math.max(0, Math.floor(
    Math.max(0, Number(state?.globalStats?.baseGoldPerHour) || 0) * requirement.baseGoldHours
  ));
  const issues = [];
  if (duplicateCount < requirement.duplicates) {
    issues.push(`Need ${requirement.duplicates} unequipped Level 1 duplicate${requirement.duplicates === 1 ? "" : "s"}; ${duplicateCount} owned.`);
  }
  if (Math.max(0, Number(state?.gold) || 0) < upgradeGold) {
    issues.push(`Need ${formatNumber(upgradeGold)} gold; ${formatNumber(state?.gold)} available.`);
  }
  return {
    requirement,
    duplicateCount,
    upgradeGold,
    canUpgrade: issues.length === 0,
    reason: issues.join(" "),
  };
}

function createCommonGearViewModel(buildingId) {
  const building = COMMON_GEAR?.BUILDINGS?.[buildingId];
  if (!building || !state) return null;
  selectedCommonGearSlot = COMMON_GEAR.SLOTS.includes(selectedCommonGearSlot) ? selectedCommonGearSlot : "head";
  const instances = getCommonGearInstances(buildingId);
  let selected = state.gear.instances?.[selectedCommonGearInstanceId] || null;
  if (!selected || selected.buildingId !== buildingId) {
    const equippedId = state.gear.equipped?.[buildingId]?.[selectedCommonGearSlot] || "";
    selected = state.gear.instances?.[equippedId]
      || instances.find(instance => instance.slot === selectedCommonGearSlot)
      || null;
  }
  if (selected) selectedCommonGearSlot = selected.slot;
  selectedCommonGearInstanceId = selected?.instanceId || "";

  const definition = selected ? COMMON_GEAR.getDefinition(selected.gearKey) : null;
  const upgradePreview = getCommonGearUpgradePreview(selected, instances);
  const { requirement, duplicateCount, upgradeGold } = upgradePreview;
  const bagGroups = createCommonGearBagGroups(instances, selectedCommonGearSlot, selectedCommonGearInstanceId);
  bagGroups.forEach(group => {
    group.isUpgradeReady = !group.isEquipped
      && getCommonGearUpgradePreview(group.representative, instances).canUpgrade;
  });
  const filteredBagGroups = selectedCommonGearBagFilter === "all"
    ? bagGroups
    : bagGroups.filter(group => group.representative.slot === selectedCommonGearBagFilter);
  const slots = COMMON_GEAR.SLOTS.map(slot => {
    const equippedId = state.gear.equipped?.[buildingId]?.[slot] || "";
    const equipped = state.gear.instances?.[equippedId] || null;
    return {
      slot,
      label: titleCaseCommonGearLabel(slot),
      equipped,
      equippedDefinition: equipped ? COMMON_GEAR.getDefinition(equipped.gearKey) : null,
      isSelected: slot === selectedCommonGearSlot,
      isUpgradeReady: Boolean(equipped && getCommonGearUpgradePreview(equipped, instances).canUpgrade),
    };
  });
  return {
    buildingId,
    building,
    officerName: building.characterRole,
    instances,
    slots,
    leftSlots: ["head", "pants", "gloves", "weapon"].map(slot => slots.find(item => item.slot === slot)),
    rightSlots: ["chest", "boots", "belt", "necklace"].map(slot => slots.find(item => item.slot === slot)),
    selectedSlot: selectedCommonGearSlot,
    selected,
    definition,
    requirement,
    currentBonus: selected ? COMMON_GEAR.getBonusPercent(selected) : 0,
    nextBonus: requirement ? COMMON_GEAR.BONUS_BY_LEVEL[selected.level + 1] : null,
    duplicateCount,
    upgradeGold,
    canMerge: upgradePreview.canUpgrade,
    mergeReason: upgradePreview.reason,
    canEquip: Boolean(selected),
    description: createCommonGearDescription(definition, selected),
    bagGroups,
    filteredBagGroups,
    bagOwnedCount: instances.length,
    bagStackCount: bagGroups.length,
    bagFilter: selectedCommonGearBagFilter,
    actionInFlight: commonGearActionInFlight,
    mergeConfirmOpen: commonGearMergeConfirmOpen,
  };
}

function renderCommonGearSlot(slotModel) {
  const { slot, label, equipped, equippedDefinition, isSelected, isUpgradeReady } = slotModel;
  const accessibleLabel = `${label}${equipped ? `, ${equippedDefinition.gearName}, Level ${equipped.level}` : ", empty"}${isUpgradeReady ? ", upgrade ready" : ""}`;
  return `<button class="common-gear-slot${isSelected ? " selected" : ""}${equipped ? " filled" : " empty"}${isUpgradeReady ? " upgrade-ready" : ""}" type="button" data-gear-slot="${escapeHtml(slot)}" aria-pressed="${isSelected ? "true" : "false"}" aria-label="${escapeHtml(accessibleLabel)}">
    <span class="common-gear-slot-art" aria-hidden="true">${equippedDefinition ? `<img src="${escapeHtml(equippedDefinition.art)}" alt="" draggable="false" onerror="this.hidden=true" />` : "+"}</span>
    <span class="common-gear-slot-copy"><b>${escapeHtml(label)}</b><small>${equipped ? `Level ${equipped.level}` : "Empty"}</small></span>
    ${isUpgradeReady ? `<span class="common-gear-upgrade-ready common-gear-slot-upgrade-ready" aria-label="Upgrade ready">!</span>` : ""}
  </button>`;
}

function renderCommonGearBagTile(group) {
  const item = group.representative;
  const def = group.definition;
  if (!item || !def) return "";
  const rarity = String(def.rarity || "common").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `<button class="common-gear-mini-card common-gear-bag-tile rarity-${rarity}${group.isSelected ? " selected" : ""}${group.isCompatible ? " compatible" : ""}${group.isEquipped ? " equipped" : ""}${group.isUpgradeReady ? " upgrade-ready" : ""}" type="button" data-gear-instance="${escapeHtml(group.representativeInstanceId)}" data-gear-stack-key="${escapeHtml(group.key)}" aria-pressed="${group.isSelected ? "true" : "false"}" title="${escapeHtml(`${def.gearName} · Level ${item.level} · ${group.count} owned${group.isUpgradeReady ? " · Upgrade ready" : ""}`)}">
    <span class="common-gear-bag-slot" aria-hidden="true">${escapeHtml(item.slot.charAt(0).toUpperCase())}</span>
    ${group.isNew ? `<span class="common-gear-bag-new">New</span>` : ""}
    ${group.isEquipped ? `<span class="common-gear-bag-equipped" aria-label="Equipped">E</span>` : ""}
    ${group.isUpgradeReady && !group.isEquipped ? `<span class="common-gear-upgrade-ready common-gear-bag-upgrade-ready" aria-label="Upgrade ready">!</span>` : ""}
    <img src="${escapeHtml(def.art)}" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.hidden=true" />
    <span class="common-gear-bag-level">L${item.level}</span>
    ${group.count > 1 ? `<span class="common-gear-bag-count">×${group.count}</span>` : ""}
    <span class="common-gear-bag-name">${escapeHtml(def.gearName)}</span>
  </button>`;
}

function getCommonGearBagFilterOptions() {
  return [
    { value: "all", label: "All Slots" },
    ...COMMON_GEAR.SLOTS.map(slot => ({ value: slot, label: titleCaseCommonGearLabel(slot) })),
  ];
}

function renderCommonGearBagFilter(viewModel) {
  const options = getCommonGearBagFilterOptions();
  const selectedOption = options.find(option => option.value === viewModel.bagFilter) || options[0];
  return `<div class="common-gear-bag-filter${commonGearBagFilterOpen ? " open" : ""}" data-gear-bag-filter>
    <button class="common-gear-bag-filter-button" type="button" data-gear-bag-filter-button aria-haspopup="listbox" aria-expanded="${commonGearBagFilterOpen ? "true" : "false"}" aria-controls="commonGearBagFilterList" aria-label="Filter equipment bag: ${escapeHtml(selectedOption.label)}">
      <span>${escapeHtml(selectedOption.label)}</span><b aria-hidden="true">▾</b>
    </button>
    <div class="common-gear-bag-filter-menu" id="commonGearBagFilterList" role="listbox" aria-label="Equipment slots" data-gear-bag-filter-list${commonGearBagFilterOpen ? "" : " hidden"}>
      ${options.map(option => `<button type="button" role="option" data-gear-bag-filter-option="${escapeHtml(option.value)}" aria-selected="${option.value === viewModel.bagFilter ? "true" : "false"}"${option.value === viewModel.bagFilter ? " class=\"selected\"" : ""}>${escapeHtml(option.label)}</button>`).join("")}
    </div>
  </div>`;
}

function setCommonGearBagFilterOpen(screen, open, { focusSelectedOption = false } = {}) {
  const filter = screen?.querySelector?.("[data-gear-bag-filter]");
  const button = filter?.querySelector?.("[data-gear-bag-filter-button]");
  const menu = filter?.querySelector?.("[data-gear-bag-filter-list]");
  commonGearBagFilterOpen = Boolean(open && filter && button && menu);
  filter?.classList.toggle("open", commonGearBagFilterOpen);
  button?.setAttribute("aria-expanded", commonGearBagFilterOpen ? "true" : "false");
  if (menu) menu.hidden = !commonGearBagFilterOpen;
  if (commonGearBagFilterOpen && focusSelectedOption) {
    window.requestAnimationFrame(() => {
      filter.querySelector('[data-gear-bag-filter-option][aria-selected="true"]')?.focus();
    });
  }
}

function renderCommonGearSelectedPanel(viewModel) {
  const { selected, definition, requirement } = viewModel;
  if (!selected || !definition) {
    return `<section class="common-gear-detail-panel common-gear-selected-panel" data-gear-panel="details">
      <div class="common-gear-empty-selection">
        <span aria-hidden="true">◇</span>
        <strong>No ${escapeHtml(titleCaseCommonGearLabel(viewModel.selectedSlot))} gear selected</strong>
        <small>Choose an equipped slot or an item from the officer's equipment bag.</small>
      </div>
    </section>`;
  }
  const progressPercent = Math.max(0, Math.min(100, selected.level / COMMON_GEAR.MAX_LEVEL * 100));
  const mergeCopy = requirement
    ? `${requirement.duplicates} Level 1 duplicate${requirement.duplicates === 1 ? "" : "s"} (${viewModel.duplicateCount} owned) + ${formatNumber(viewModel.upgradeGold)} gold`
    : "This item has reached its maximum level.";
  return `<section class="common-gear-detail-panel common-gear-selected-panel" data-gear-panel="details">
    <span class="common-gear-detail-eyebrow">${escapeHtml(viewModel.officerName)}'s</span>
    <strong class="common-gear-detail-name">${escapeHtml(definition.gearName)}</strong>
    <span class="common-gear-rarity rarity-${escapeHtml(definition.rarity)}">${escapeHtml(definition.rarity)} · L${selected.level}/${COMMON_GEAR.MAX_LEVEL} · ${escapeHtml(selected.slot)}</span>
    <img class="common-gear-detail-art" src="${escapeHtml(definition.art)}" alt="" draggable="false" onerror="this.hidden=true" />
    <div class="common-gear-level-progress" role="progressbar" aria-label="Item level" aria-valuemin="1" aria-valuemax="${COMMON_GEAR.MAX_LEVEL}" aria-valuenow="${selected.level}">
      <span aria-hidden="true">★</span><i><b style="width:${progressPercent.toFixed(0)}%"></b></i><em>${selected.level}/${COMMON_GEAR.MAX_LEVEL}</em>
    </div>
    <div class="common-gear-effect-copy">
      <strong>+${viewModel.currentBonus.toFixed(2)}% ${escapeHtml(definition.statLabel)}</strong>
      ${viewModel.nextBonus !== null ? `<small>Next level: +${viewModel.nextBonus.toFixed(2)}%</small>` : `<small>Maximum bonus reached</small>`}
    </div>
    <div class="common-gear-merge-cost">
      <span>Upgrade requirements</span><strong>${escapeHtml(mergeCopy)}</strong><small>You have ${formatNumber(state.gold)} gold</small>
    </div>
    <div class="common-gear-actions">
      <button class="common-gear-equip-btn" type="button" data-gear-equip ${viewModel.actionInFlight ? "disabled" : ""}>${viewModel.actionInFlight ? "Working…" : selected.isEquipped ? "Unequip" : "Equip"}</button>
      <button class="common-gear-merge-btn" type="button" data-gear-merge ${viewModel.actionInFlight || !viewModel.canMerge ? "disabled" : ""}>${requirement ? "Upgrade" : "Max Level"}</button>
    </div>
    ${viewModel.mergeReason ? `<small class="common-gear-action-reason">${escapeHtml(viewModel.mergeReason)}</small>` : ""}
  </section>`;
}

function renderCommonGearBottomInfo(viewModel) {
  const { selected, definition } = viewModel;
  if (!selected || !definition) {
    return `<section class="common-gear-bottom-info empty"><div><strong>Select an equipment piece</strong><p>Its description, role, bonus, and upgrade requirements will appear here.</p></div></section>`;
  }
  const nextEffect = viewModel.nextBonus !== null ? `Next +${viewModel.nextBonus.toFixed(2)}%` : "Maximum level";
  return `<section class="common-gear-bottom-info">
    <img src="${escapeHtml(definition.art)}" alt="" draggable="false" onerror="this.hidden=true" />
    <div class="common-gear-bottom-copy">
      <strong>${escapeHtml(definition.gearName)}</strong>
      <p>${escapeHtml(viewModel.description)}</p>
      <div class="common-gear-bottom-tags"><span>${escapeHtml(definition.rarity)}</span><span>${escapeHtml(definition.category)}</span><span>${escapeHtml(titleCaseCommonGearLabel(definition.slot))}</span><span>Level ${selected.level}</span><span>+${viewModel.currentBonus.toFixed(2)}%</span><span>${selected.isEquipped ? "Equipped" : "In bag"}</span></div>
    </div>
    <dl class="common-gear-info-meta">
      <div><dt>Officer</dt><dd>${escapeHtml(definition.characterRole)}</dd></div>
      <div><dt>Equip slot</dt><dd>${escapeHtml(titleCaseCommonGearLabel(definition.slot))}</dd></div>
      <div><dt>Current effect</dt><dd>+${viewModel.currentBonus.toFixed(2)}%</dd></div>
      <div><dt>Upgrade</dt><dd>${escapeHtml(nextEffect)}</dd></div>
      <div><dt>Binding</dt><dd>Not tradeable</dd></div>
      <div><dt>State</dt><dd>${selected.isEquipped ? "Equipped" : "In bag"}</dd></div>
    </dl>
  </section>`;
}

function renderCommonGearMergeConfirmation(viewModel) {
  const { selected, definition, requirement } = viewModel;
  if (!viewModel.mergeConfirmOpen || !selected || !definition || !requirement) return "";
  return `<div class="common-gear-confirm-backdrop">
    <section class="common-gear-confirm" role="alertdialog" aria-modal="true" aria-labelledby="commonGearMergeTitle" aria-describedby="commonGearMergeCopy">
      <span class="common-gear-confirm-icon" aria-hidden="true">⚒</span>
      <strong id="commonGearMergeTitle">Upgrade ${escapeHtml(definition.gearName)}?</strong>
      <p id="commonGearMergeCopy">Upgrade Level ${selected.level} to Level ${selected.level + 1}. This consumes ${requirement.duplicates} unequipped Level 1 duplicate${requirement.duplicates === 1 ? "" : "s"} and ${formatNumber(viewModel.upgradeGold)} gold.</p>
      <small>This cannot be undone.</small>
      <div>
        <button class="safe-action" type="button" data-gear-merge-cancel>Cancel</button>
        <button type="button" data-gear-merge-confirm>Confirm Upgrade</button>
      </div>
    </section>
  </div>`;
}

function restoreCommonGearFocus() {
  if (!commonGearPendingFocusSelector) return;
  const selector = commonGearPendingFocusSelector;
  commonGearPendingFocusSelector = "";
  window.requestAnimationFrame(() => {
    const target = modalBody.querySelector(selector);
    if (!target) return;
    const bagScroll = modalBody.querySelector("[data-gear-bag-scroll]");
    const preservedBagScrollTop = bagScroll?.scrollTop ?? commonGearBagScrollTop;
    try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    if (bagScroll) bagScroll.scrollTop = preservedBagScrollTop;
  });
}

function isCommonGearBuildingOpen(buildingId) {
  return modal.classList.contains("common-gear-building-modal")
    && modal.dataset.commonGearBuildingId === buildingId;
}

async function runCommonGearAction(buildingId, action, instanceId) {
  if (commonGearActionInFlight || !instanceId) return;
  const instance = state?.gear?.instances?.[instanceId];
  const definition = instance ? COMMON_GEAR.getDefinition(instance.gearKey) : null;
  if (!instance || !definition) return showToast("That gear piece is no longer available.");
  const previousLevel = instance.level;
  commonGearActionInFlight = true;
  commonGearMergeConfirmOpen = false;
  commonGearViewRequestId += 1;
  if (isCommonGearBuildingOpen(buildingId)) renderCommonGearBuilding(buildingId);
  try {
    const api = getOnlineApi();
    let result = null;
    if (action === "unequip") {
      if (!api?.unequipCommonGear) throw new Error("Connect to the realm to change this loadout.");
      result = await api.unequipCommonGear({ instanceId });
    } else if (action === "equip") {
      if (!api?.equipCommonGear) throw new Error("Connect to the realm to change this loadout.");
      result = await api.equipCommonGear({ instanceId });
    } else {
      if (!api?.upgradeCommonGear) throw new Error("Connect to the realm to upgrade equipment.");
      result = await api.upgradeCommonGear({ instanceId });
    }
    applyServerEconomyResult(result);
    const settledInstance = state?.gear?.instances?.[instanceId];
    if (action === "merge") showToast(`${definition.gearName} upgraded to Level ${settledInstance?.level || previousLevel + 1}.`);
    else showToast(`${definition.gearName} ${action === "equip" ? "equipped" : "returned to the bag"}.`);
  } catch (error) {
    showToast(error?.message || (action === "merge" ? "The gear upgrade could not be completed." : "The gear loadout could not be changed."));
  } finally {
    commonGearActionInFlight = false;
    if (isCommonGearBuildingOpen(buildingId)) renderCommonGearBuilding(buildingId);
  }
}

function bindCommonGearScreen(viewModel) {
  const screen = modalBody.querySelector("[data-common-gear-screen]");
  const bagScroll = modalBody.querySelector("[data-gear-bag-scroll]");
  if (!screen) return;
  if (bagScroll) {
    bagScroll.scrollTop = commonGearBagScrollTop;
    bagScroll.addEventListener("scroll", () => { commonGearBagScrollTop = bagScroll.scrollTop; }, { passive: true });
  }
  screen.addEventListener("keydown", event => {
    const filterButton = event.target.closest?.("[data-gear-bag-filter-button]");
    if (filterButton && event.key === "ArrowDown") {
      event.preventDefault();
      setCommonGearBagFilterOpen(screen, true, { focusSelectedOption: true });
      return;
    }
    const option = event.target.closest?.("[data-gear-bag-filter-option]");
    if (!option) return;
    const options = [...screen.querySelectorAll("[data-gear-bag-filter-option]")];
    const currentIndex = options.indexOf(option);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = Math.min(options.length - 1, currentIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setCommonGearBagFilterOpen(screen, false);
      filterButton?.focus();
      screen.querySelector("[data-gear-bag-filter-button]")?.focus();
      return;
    } else return;
    event.preventDefault();
    options[nextIndex]?.focus();
  });
  screen.addEventListener("focusout", event => {
    const filter = event.target.closest?.("[data-gear-bag-filter]");
    if (!filter || filter.contains(event.relatedTarget)) return;
    setCommonGearBagFilterOpen(screen, false);
  });
  screen.addEventListener("click", event => {
    const filterButton = event.target.closest?.("[data-gear-bag-filter-button]");
    if (filterButton) {
      setCommonGearBagFilterOpen(screen, !commonGearBagFilterOpen);
      return;
    }
    const filterOption = event.target.closest?.("[data-gear-bag-filter-option]");
    if (filterOption) {
      const value = filterOption.dataset.gearBagFilterOption;
      selectedCommonGearBagFilter = value === "all" || COMMON_GEAR.SLOTS.includes(value) ? value : "all";
      commonGearBagFilterOpen = false;
      commonGearPendingFocusSelector = "[data-gear-bag-filter-button]";
      renderCommonGearBuilding(viewModel.buildingId);
      return;
    }
    if (commonGearBagFilterOpen && !event.target.closest?.("[data-gear-bag-filter]")) {
      setCommonGearBagFilterOpen(screen, false);
    }
    const slotButton = event.target.closest?.("[data-gear-slot]");
    if (slotButton) {
      selectedCommonGearSlot = COMMON_GEAR.SLOTS.includes(slotButton.dataset.gearSlot) ? slotButton.dataset.gearSlot : "head";
      const equippedId = state.gear.equipped?.[viewModel.buildingId]?.[selectedCommonGearSlot] || "";
      selectedCommonGearInstanceId = state.gear.instances?.[equippedId]?.instanceId
        || getCommonGearInstances(viewModel.buildingId, selectedCommonGearSlot)[0]?.instanceId
        || "";
      commonGearMergeConfirmOpen = false;
      commonGearPendingFocusSelector = `[data-gear-slot="${selectedCommonGearSlot}"]`;
      renderCommonGearBuilding(viewModel.buildingId);
      return;
    }
    const itemButton = event.target.closest?.("[data-gear-instance]");
    if (itemButton) {
      const instance = state.gear.instances?.[itemButton.dataset.gearInstance];
      if (!instance || instance.buildingId !== viewModel.buildingId) return;
      selectedCommonGearInstanceId = instance.instanceId;
      selectedCommonGearSlot = instance.slot;
      commonGearMergeConfirmOpen = false;
      commonGearPendingFocusSelector = `[data-gear-instance="${instance.instanceId}"]`;
      renderCommonGearBuilding(viewModel.buildingId);
      return;
    }
    if (event.target.closest?.("[data-gear-back]")) {
      const cityId = modal.dataset.innerCastleCityId || state.mainCityId;
      delete modal.dataset.commonGearBuildingId;
      modal.classList.remove("common-gear-building-modal");
      modal.classList.add("inner-castle-modal");
      commonGearMergeConfirmOpen = false;
      commonGearBagFilterOpen = false;
      commonGearPendingFocusSelector = "";
      commonGearViewRequestId += 1;
      renderInnerCastle(cityId);
      return;
    }
    if (event.target.closest?.("[data-gear-equip]")) {
      const selected = state.gear.instances?.[selectedCommonGearInstanceId];
      if (selected) void runCommonGearAction(viewModel.buildingId, selected.isEquipped ? "unequip" : "equip", selected.instanceId);
      return;
    }
    if (event.target.closest?.("[data-gear-merge]")) {
      if (!viewModel.canMerge || commonGearActionInFlight) return;
      commonGearMergeConfirmOpen = true;
      commonGearPendingFocusSelector = "[data-gear-merge-cancel]";
      renderCommonGearBuilding(viewModel.buildingId);
      return;
    }
    if (event.target.closest?.("[data-gear-merge-cancel]")) {
      commonGearMergeConfirmOpen = false;
      commonGearPendingFocusSelector = "[data-gear-merge]";
      renderCommonGearBuilding(viewModel.buildingId);
      return;
    }
    if (event.target.closest?.("[data-gear-merge-confirm]")) {
      commonGearPendingFocusSelector = "[data-gear-merge]";
      void runCommonGearAction(viewModel.buildingId, "merge", selectedCommonGearInstanceId);
    }
  });
}

function renderCommonGearBuilding(buildingId) {
  const building = COMMON_GEAR?.BUILDINGS?.[buildingId];
  if (!building || !state) return false;
  const existingBag = modal.dataset.commonGearBuildingId === buildingId
    ? modalBody.querySelector("[data-gear-bag-scroll]")
    : null;
  if (existingBag) commonGearBagScrollTop = existingBag.scrollTop;
  const viewModel = createCommonGearViewModel(buildingId);
  if (!viewModel) return false;
  modal.classList.remove("inner-castle-modal");
  modal.classList.add("common-gear-building-modal");
  modal.dataset.commonGearBuildingId = buildingId;
  modalTitle.textContent = `${building.name} — ${building.characterRole}`;
  modalBody.innerHTML = `<section class="common-gear-building-shell common-gear-screen" data-common-gear-screen>
    <div class="common-gear-main">
      <section class="common-gear-loadout-panel" data-gear-panel="loadout" data-gear-officer="${escapeHtml(buildingId)}">
        <header><span aria-hidden="true">♜</span><strong>Equipment</strong><small>${escapeHtml(building.name)}</small></header>
        <div class="common-gear-loadout-grid">
          <div class="common-gear-slot-column">${viewModel.leftSlots.map(renderCommonGearSlot).join("")}</div>
          <figure class="common-gear-character-panel"><img src="${escapeHtml(building.characterArt)}" alt="${escapeHtml(building.characterRole)}" draggable="false" /></figure>
          <div class="common-gear-slot-column">${viewModel.rightSlots.map(renderCommonGearSlot).join("")}</div>
        </div>
        <footer><span>${escapeHtml(building.characterRole)}</span><small>Eight-slot royal loadout</small></footer>
      </section>
      ${renderCommonGearSelectedPanel(viewModel)}
      <section class="common-gear-bag-panel" data-gear-panel="bag">
        <header><strong>Equipment Bag</strong>${renderCommonGearBagFilter(viewModel)}</header>
        <div class="common-gear-bag-scroll" data-gear-bag-scroll>
          <div class="common-gear-bag-grid">${viewModel.filteredBagGroups.map(renderCommonGearBagTile).join("") || `<div class="common-gear-bag-empty"><strong>No equipment here</strong><small>${viewModel.instances.length ? "Change the bag filter to see this officer's other gear." : "Open Common Gear Boxes to find gear for this officer."}</small></div>`}</div>
        </div>
        <footer><span>◆ ${formatNumber(viewModel.bagOwnedCount)} owned</span><small>${formatNumber(viewModel.filteredBagGroups.length)} shown · ${formatNumber(viewModel.bagStackCount)} stacks · matching slots glow</small></footer>
      </section>
    </div>
    <footer class="common-gear-footer">
      <button class="common-gear-back" type="button" data-gear-back><span aria-hidden="true">‹</span> Back to Inner Castle</button>
      ${renderCommonGearBottomInfo(viewModel)}
    </footer>
    ${renderCommonGearMergeConfirmation(viewModel)}
  </section>`;
  bindCommonGearScreen(viewModel);
  restoreCommonGearFocus();
  return true;
}

function showCommonGearBuilding(buildingId) {
  if (!COMMON_GEAR?.BUILDINGS?.[buildingId]) return;
  selectedCommonGearSlot = COMMON_GEAR.SLOTS.includes(selectedCommonGearSlot) ? selectedCommonGearSlot : "head";
  selectedCommonGearInstanceId = "";
  selectedCommonGearBagFilter = "all";
  commonGearBagFilterOpen = false;
  commonGearBagScrollTop = 0;
  commonGearMergeConfirmOpen = false;
  state.gear = normalizeCommonGearState(state.gear);
  state.gear.newMarkers[buildingId] = false;
  const requestId = ++commonGearViewRequestId;
  getOnlineApi()?.viewCommonGearBuilding?.({ buildingId }).then(result => {
    if (requestId !== commonGearViewRequestId || !result?.gear) return;
    state.gear = normalizeCommonGearState(result.gear);
    if (isCommonGearBuildingOpen(buildingId)) renderCommonGearBuilding(buildingId);
  }).catch(() => {});
  renderCommonGearBuilding(buildingId);
}

function canEnterInnerCastle(city) {
  return Boolean(
    city
    && city.owner === "player"
    && !isStronghold(city)
    && isMainCityForList(city)
  );
}

function getInnerCastleBuilding(buildingKey) {
  return INNER_CASTLE_BUILDINGS.find(building => building.key === buildingKey) || null;
}

function renderInnerCastlePreview(building) {
  if (!building) return "";
  const gearBuilding = COMMON_GEAR?.BUILDINGS?.[building.key];
  return `
    <img class="inner-castle-preview-art" src="${building.artSrc}" alt="${escapeHtml(building.label)} placeholder artwork" loading="lazy" decoding="async" draggable="false" />
    <div class="inner-castle-preview-copy">
      <strong>${escapeHtml(building.label)}</strong>
      <span>${escapeHtml(building.role)}</span>
      <small>${gearBuilding ? `${escapeHtml(gearBuilding.characterRole)} gear and bonuses` : "Not yet available"}</small>
      ${gearBuilding ? `<button class="inner-castle-manage-gear" type="button" data-manage-common-gear="${escapeHtml(building.key)}">Manage Gear</button>` : ""}
    </div>`;
}

function bindInnerCastlePreviewActions() {
  modalBody.querySelector("[data-manage-common-gear]")?.addEventListener("click", event => {
    showCommonGearBuilding(event.currentTarget.dataset.manageCommonGear);
  });
}

function clearInnerCastleModalState() {
  innerCastleSelectedBuildingKey = "";
  delete modal.dataset.innerCastleCityId;
  delete modal.dataset.commonGearBuildingId;
  modal.classList.remove("inner-castle-modal", "common-gear-building-modal");
  commonGearMergeConfirmOpen = false;
  commonGearBagFilterOpen = false;
  commonGearPendingFocusSelector = "";
  commonGearViewRequestId += 1;
}

function selectInnerCastleBuilding(buildingKey) {
  if (!modal.classList.contains("inner-castle-modal")) return;
  const building = getInnerCastleBuilding(buildingKey);
  if (!building) return;
  innerCastleSelectedBuildingKey = building.key;
  modalBody.querySelectorAll("[data-inner-castle-building]").forEach(button => {
    const selected = button.dataset.innerCastleBuilding === building.key;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  const preview = modalBody.querySelector("#innerCastlePreview");
  if (preview) preview.innerHTML = renderInnerCastlePreview(building);
  bindInnerCastlePreviewActions();
}

/* Officer equipment rendering and actions live in common-gear-ui.js. */

function renderInnerCastle(cityId) {
  const city = cityById(cityId);
  if (!canEnterInnerCastle(city)) return false;
  const selectedBuilding = getInnerCastleBuilding(innerCastleSelectedBuildingKey)
    || getInnerCastleBuilding("great-hall")
    || INNER_CASTLE_BUILDINGS[0];
  innerCastleSelectedBuildingKey = selectedBuilding.key;
  modalTitle.textContent = `${city.name} — Inner Castle`;
  modalBody.innerHTML = `
    <section class="inner-castle-shell" aria-label="${escapeHtml(city.name)} Inner Castle">
      <p class="inner-castle-intro">Explore the Royal Bailey. Building functions and upgrades will arrive in a future update.</p>
      <div class="inner-castle-layout">
        <div class="inner-castle-stage">
          <div class="inner-castle-scene">
            <img class="inner-castle-hub-art" src="${INNER_CASTLE_HUB_ART_SRC}" alt="The Royal Bailey inside ${escapeHtml(city.name)}" loading="lazy" decoding="async" draggable="false" />
            <div class="inner-castle-hotspots" aria-label="Inner Castle buildings">
              ${INNER_CASTLE_BUILDINGS.map(building => `
                <button
                  class="inner-castle-hotspot${building.key === selectedBuilding.key ? " selected" : ""}"
                  type="button"
                  data-inner-castle-building="${building.key}"
                  aria-controls="innerCastlePreview"
                  aria-pressed="${building.key === selectedBuilding.key ? "true" : "false"}"
                  aria-label="Preview ${escapeHtml(building.label)}"
                  style="--hotspot-left:${building.hotspot.left}%;--hotspot-top:${building.hotspot.top}%;"
                ><span>${state?.gear?.newMarkers?.[building.key] ? `<b class="inner-castle-hotspot-alert" aria-label="New gear">!</b>` : ""}${escapeHtml(building.label)}</span></button>`).join("")}
            </div>
          </div>
        </div>
        <aside class="inner-castle-preview-tray" aria-label="Selected building preview">
          <div id="innerCastlePreview" class="inner-castle-preview" role="status" aria-live="polite" aria-atomic="true">
            ${renderInnerCastlePreview(selectedBuilding)}
          </div>
          <button class="inner-castle-back-btn" type="button" data-inner-castle-back>
            <span aria-hidden="true">${renderCrownlandsIcon("back")}</span>
            Back to City Details
          </button>
        </aside>
      </div>
    </section>`;

  modalBody.querySelectorAll("[data-inner-castle-building]").forEach(button => {
    button.addEventListener("click", () => selectInnerCastleBuilding(button.dataset.innerCastleBuilding));
  });
  modalBody.querySelector("[data-inner-castle-back]")?.addEventListener("click", () => {
    const originCityId = modal.dataset.innerCastleCityId;
    clearInnerCastleModalState();
    if (originCityId && cityById(originCityId)) {
      showCityInfoModal(originCityId);
      modalBody.querySelector("#enterInnerCastleBtn")?.focus();
    }
    else if (modal.open) modal.close();
  });
  return true;
}

function openInnerCastle(cityId) {
  const city = cityById(cityId);
  if (!canEnterInnerCastle(city)) {
    showToast("The Inner Castle is available only in your main city.");
    return;
  }
  clearInnerCastleModalState();
  delete modal.dataset.cityInfoId;
  modal.dataset.innerCastleCityId = city.id;
  modal.classList.add("inner-castle-modal");
  innerCastleSelectedBuildingKey = "great-hall";
  if (!renderInnerCastle(city.id)) {
    clearInnerCastleModalState();
    return;
  }
  if (!modal.open) modal.showModal();
  modalBody
    .querySelector('[data-inner-castle-building][aria-pressed="true"]')
    ?.focus();
}

function getCommonGearBoxShopPrice() {
  return Math.max(0, Math.floor(Number(COMMON_GEAR?.SHOP_PRICE_GOLD) || 1_000_000_000));
}

function renderCommonGearShopItem() {
  if (!COMMON_GEAR) return "";
  const purchase = state?.gear?.shopPurchase || {};
  const purchasedToday = purchase.utcDate === currentDailyDateKey() && Number(purchase.purchaseCount) >= 1;
  const price = getCommonGearBoxShopPrice();
  return `<article class="shop-item common-gear-shop-item" data-shop-item="common_gear_box">
    <div class="shop-item-image-placeholder has-image" aria-hidden="true">${renderItemIcon(COMMON_GEAR_BOX_ITEM, "shop-item-image")}</div>
    <div class="shop-item-copy"><strong>Common Gear Box</strong><span>${formatNumber(price)} gold</span>
      <small>Owned: ${formatNumber(state?.gear?.commonGearBoxes || 0)}</small><small>Limit: 1 per UTC day · fixed price</small></div>
    <button class="shop-buy-btn" data-buy-common-gear-box type="button" ${purchasedToday || getProjectedGold() < price ? "disabled" : ""}>${purchasedToday ? "Purchased" : "Buy"}</button>
  </article>`;
}

async function buyCommonGearBox() {
  const api = getOnlineApi();
  if (!api?.purchaseCommonGearBox) return showToast("Connect to the realm to purchase server-secured Gear Boxes.");
  const button = modalBody.querySelector("[data-buy-common-gear-box]");
  if (button) button.disabled = true;
  try {
    const result = await api.purchaseCommonGearBox();
    applyServerEconomyResult(result);
    showToast("Common Gear Box added to your Bag.");
  } catch (error) {
    showToast(error?.message || "The Common Gear Box could not be purchased.");
  }
  renderShopModal();
}

function renderCommonGearCard(instanceId) {
  const instance = state?.gear?.instances?.[instanceId];
  const definition = instance ? COMMON_GEAR?.getDefinition(instance.gearKey) : null;
  if (!instance || !definition) return "";
  return `<article class="common-gear-reveal-card">
    <img src="${escapeHtml(definition.art)}" alt="" draggable="false" onerror="this.hidden=true" />
    <span class="common-gear-rarity">Common · Level ${instance.level}</span>
    <strong>${escapeHtml(definition.gearName)}</strong>
    <small>${escapeHtml(definition.buildingName)} · ${escapeHtml(definition.characterRole)} · ${escapeHtml(definition.slot)}</small>
    <b>+${COMMON_GEAR.getBonusPercent(instance).toFixed(2)}%</b>
    <small>${escapeHtml(definition.statLabel)}</small>
  </article>`;
}

function showCommonGearBoxReveal(receipt = null) {
  if (!state || !COMMON_GEAR) return;
  modal.className = "common-gear-box-modal modal";
  modalTitle.textContent = receipt ? "Common Gear Found" : "Common Gear Box";
  const revealedIds = receipt?.instanceIds || [];
  modalBody.innerHTML = receipt ? `
    <section class="common-gear-reveal-shell revealed">
      <div class="common-gear-reveal-cards">${revealedIds.map(renderCommonGearCard).join("")}</div>
      <div class="modal-actions">
        <button class="safe-action" type="button" data-gear-later>Equip Later</button>
        <button type="button" data-gear-castle>Go to Inner Castle</button>
      </div>
    </section>` : `
    <section class="common-gear-reveal-shell">
      <button class="common-gear-box-open" type="button" data-open-common-gear aria-label="Open Common Gear Box">
        <span class="common-gear-box-art" aria-hidden="true">
          <img class="gear-box-closed-state" src="${COMMON_GEAR_BOX_ITEM.icon}" alt="" draggable="false" />
          <img class="gear-box-open-state" src="${COMMON_GEAR_BOX_OPEN_ART}" alt="" draggable="false" />
          <span class="gear-box-latch"></span>
        </span>
        <strong>Tap to open</strong>
        <small>Exactly 3 Common pieces</small>
      </button>
    </section>`;
  modalBody.querySelector("[data-open-common-gear]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (!getOnlineApi()?.openCommonGearBox) {
      showToast("Connect to the realm to open this server-secured Gear Box.");
      return;
    }
    button.disabled = true;
    button.classList.add("opening");
    try {
      const result = await getOnlineApi().openCommonGearBox({ requestId: createDailyMissionRequestId("gear-box") });
      state.gear = normalizeCommonGearState(result.gear);
      window.setTimeout(() => showCommonGearBoxReveal(result.receipt), 420);
    } catch (error) {
      button.disabled = false;
      button.classList.remove("opening");
      showToast(error?.message || "The Gear Box could not be opened.");
    }
  });
  modalBody.querySelector("[data-gear-later]")?.addEventListener("click", () => modal.close());
  modalBody.querySelector("[data-gear-castle]")?.addEventListener("click", () => {
    const mainCity = cityById(state.mainCityId);
    if (mainCity) openInnerCastle(mainCity.id);
    else showToast("Your main city is not available on this map.");
  });
  if (!modal.open) modal.showModal();
}
