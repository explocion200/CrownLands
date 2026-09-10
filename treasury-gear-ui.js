/* Approved Treasury presentation; values and actions stay in the shared Common Gear flow. */
/* exported renderTreasuryGearScreen */
const formatTreasuryGearNumber = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const formatTreasuryGearPercent = value => Number(value).toFixed(2);
const getTreasuryGearShortName=value=>value.replace("Master of Coin's ","");
const renderTreasuryGearArt=(src,alt="")=>`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" draggable="false" onerror="this.hidden=true">`;
const TREASURY_GEAR_ICONS={
  treasury:'<path d="M4 13h24v15H4V8l4-4h16l4 4v5M4 13h24M9 5v23M23 5v23"/><path d="M13 11h6v8h-6z"/>',
  coins:'<ellipse cx="13" cy="10" rx="9" ry="4"/><path d="M4 10v5c0 5 18 5 18 0v-5M4 15v5c0 4 9 5 13 3M22 11c8 0 8 7 0 7s-8-7 0-7m-6 4v10c0 5 13 5 13 0V15m-13 5c0 5 13 5 13 0"/>',
  bag:'<path d="M10 9 7 3h18l-4 6M10 9c-2 5-7 7-7 14 0 8 26 8 26 0 0-7-5-9-8-14ZM9 10h13m-8 5-2 6m7-6 2 6"/>',
  needle:'<path d="m7 26 16-20c4-5 8 0 4 4L7 26l-3 2zM22 9l3-3M10 23c4 11 20 6 13-1"/>',
  check:'<path d="m6 16 6 6L27 7"/>',
  scroll:'<path d="M9 4h16c7 0 4 8 0 8H9M9 4C3 4 3 11 9 11v16h16V8M9 27H5c-4 0-3-6 1-6h14M12 15h9m-9 4h7"/>',
  plus:'<path d="M16 7v18M7 16h18"/>'
};
const renderTreasuryGearIcon=key=>`<svg class="tg-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${TREASURY_GEAR_ICONS[key]||TREASURY_GEAR_ICONS.scroll}</svg>`;
function renderTreasuryGearSlot(slot){return `<button type="button" class="tg-slot${slot.equipped?"":" is-empty"}" data-gear-slot="${slot.slot}" data-rarity="${escapeHtml(slot.equippedDefinition?.rarity||"")}" aria-pressed="${slot.isSelected}" aria-label="${escapeHtml(slot.label+(slot.equipped?`, ${slot.equippedDefinition.gearName}, Level ${slot.equipped.level}`:", empty"))}"><span class="tg-slot-art">${slot.equipped?renderTreasuryGearArt(slot.equippedDefinition.art):renderTreasuryGearIcon("plus")}</span><span>${slot.label}<small>${slot.equipped?"Lv. "+slot.equipped.level:"Empty"}</small></span>${slot.isUpgradeReady?'<b class="tg-ready" title="Matching upgrade material available">!</b>':""}</button>`;}
function renderTreasuryGearBagTile(group){const item=group.representative,def=group.definition;return `<button type="button" class="tg-item${group.isEquipped?" equipped":""}${group.isCompatible?" compatible":""}" data-gear-instance="${escapeHtml(group.representativeInstanceId)}" data-gear-stack-key="${escapeHtml(group.key)}" data-rarity="${escapeHtml(def.rarity)}" aria-pressed="${group.isSelected}" aria-label="${escapeHtml(`${def.gearName}, Level ${item.level}, ${group.count} owned${group.isEquipped?", equipped":""}${group.isNew?", new":""}`)}" title="${escapeHtml(def.gearName)}"><span class="tg-item-mark">${group.isEquipped?renderTreasuryGearIcon("check"):group.isNew?'<b>New</b>':""}</span>${renderTreasuryGearArt(def.art)}<span class="tg-item-level">Lv. ${item.level}</span>${group.count>1?`<span class="tg-item-count">×${group.count}</span>`:""}<span class="tg-item-name">${escapeHtml(getTreasuryGearShortName(def.gearName))}</span>${group.isUpgradeReady&&!group.isEquipped?'<b class="tg-ready" title="Matching upgrade material available">!</b>':""}</button>`;}
function renderTreasuryGearDetails(vm){
  if(!vm.selected)return `<section class="tg-details" aria-labelledby="tgDetailsTitle"><header class="tg-section-heading"><h3 id="tgDetailsTitle">Selected equipment</h3></header><div class="tg-empty"><span>${renderTreasuryGearIcon("scroll")}</span><h4>No ${escapeHtml(vm.selectedSlot)} gear selected</h4><p>Choose an equipped slot or an item from the Master of Coin’s equipment bag.</p></div></section>`;
  const {selected:item,definition:def,requirement:req}=vm;
  const gold=state.gold,lowGold=req&&gold<vm.upgradeGold;
  const allowed=vm.canMerge&&!lowGold&&!vm.actionInFlight;
  return `<section class="tg-details" aria-labelledby="tgDetailsTitle">
    <header class="tg-section-heading"><h3 id="tgDetailsTitle">Selected equipment</h3><span>${item.isEquipped?"Equipped":"In bag"}</span></header>
    <div class="tg-detail-scroll" data-gear-panel="details" tabindex="0" aria-label="Item description and upgrade requirements">
      <div class="tg-item-hero"><div class="tg-inspected-art" data-rarity="${escapeHtml(def.rarity)}">${renderTreasuryGearArt(def.art)}</div><div><p class="tg-eyebrow">Master of Coin’s</p><h4>${escapeHtml(getTreasuryGearShortName(def.gearName))}</h4><p class="tg-item-meta">${titleCaseCommonGearLabel(def.rarity)} · ${titleCaseCommonGearLabel(item.slot)} · Level ${item.level} / ${COMMON_GEAR.MAX_LEVEL}</p><div class="tg-levels" role="img" aria-label="Level ${item.level} of ${COMMON_GEAR.MAX_LEVEL}">${Array.from({length:COMMON_GEAR.MAX_LEVEL},(_,i)=>i+1).map(n=>`<i class="${n<=item.level?"filled":""}"></i>`).join("")}</div></div></div>
      <div class="tg-effect"><strong>+${formatTreasuryGearPercent(vm.currentBonus)}%</strong><span>${escapeHtml(titleCaseCommonGearLabel(def.statLabel))}</span></div>
      ${req?`<p class="tg-next">Next level <strong>+${formatTreasuryGearPercent(vm.nextBonus)}%</strong><span>+${formatTreasuryGearPercent(vm.nextBonusIncrease)}% increase</span></p>`:'<p class="tg-next">Maximum bonus reached</p>'}
      <div class="tg-requirements"><h5>${renderTreasuryGearIcon("needle")} ${req?"Upgrade to Level "+(item.level+1):`Level ${COMMON_GEAR.MAX_LEVEL} complete`}</h5>${req?`<dl><div><dt>Matching Level ${item.level} copy</dt><dd class="${vm.duplicateCount>=req.duplicates?"ready":"short"}">${vm.duplicateCount} / ${req.duplicates} available</dd></div><div><dt>Gold cost</dt><dd class="${lowGold?"short":""}">${formatTreasuryGearNumber(vm.upgradeGold)}</dd></div><div><dt>Raw production</dt><dd>${req.baseGoldHours} ${req.baseGoldHours===1?"hour":"hours"}</dd></div><div><dt>Your gold</dt><dd>${formatTreasuryGearNumber(gold)}</dd></div></dl>`:'<p>This item has reached its maximum level.</p>'}</div>
      ${lowGold?'<p class="tg-warning">Insufficient gold for this upgrade.</p>':vm.mergeReason&&req?`<p class="tg-warning">${escapeHtml(vm.mergeReason)}</p>`:""}
      <div class="tg-description"><h5>Item record</h5><p>${escapeHtml(vm.description)}</p><dl><div><dt>Officer</dt><dd>Master of Coin</dd></div><div><dt>Category / slot</dt><dd>${titleCaseCommonGearLabel(def.category)} / ${titleCaseCommonGearLabel(item.slot)}</dd></div><div><dt>Binding</dt><dd>Not tradeable</dd></div><div><dt>State</dt><dd>${item.isEquipped?"Equipped":"In bag"}</dd></div><div><dt>Full Level ${vm.progressionLevel} path</dt><dd>${vm.progressionBaseCopies} Level 1 copies · ${vm.progressionGoldHours}h raw production</dd></div></dl></div>
    </div><footer class="tg-actions"><button class="tg-secondary" type="button" data-gear-equip ${vm.actionInFlight?"disabled":""}>${vm.actionInFlight?"Working…":item.isEquipped?"Unequip":"Equip"}</button><button class="tg-primary" type="button" data-gear-merge ${allowed?"":"disabled"}>${req?"Upgrade":"Max Level"}${req?renderTreasuryGearIcon("needle"):""}</button></footer>
  </section>`;
}

function renderTreasuryGearConfirmation(vm) {
  const { selected, definition, requirement } = vm;
  if (!vm.mergeConfirmOpen || !selected || !definition || !requirement) return "";
  return `<div class="tg-confirm-backdrop">
    <section class="tg-confirm" role="alertdialog" aria-modal="true" aria-labelledby="commonGearMergeTitle" aria-describedby="commonGearMergeCopy"><div>
      ${renderTreasuryGearIcon("needle")}<p class="tg-eyebrow">Treasury workshop</p>
      <h2 id="commonGearMergeTitle">Upgrade ${escapeHtml(getTreasuryGearShortName(definition.gearName))}?</h2>
      <div class="tg-combine"><span class="tg-confirm-art" data-rarity="${escapeHtml(definition.rarity)}">${renderTreasuryGearArt(definition.art)}</span><span>Level ${selected.level}<br>+ ${requirement.duplicates} matching copy</span><b aria-hidden="true">→</b><span>Level ${selected.level + 1}<strong>+${formatTreasuryGearPercent(vm.nextBonus)}%</strong></span></div>
      <p id="commonGearMergeCopy">Combine this Level ${selected.level} item with ${requirement.duplicates} unequipped matching Level ${selected.level} copy. Both inputs are consumed to create one new Level ${selected.level + 1} item.</p>
      <dl><div><dt>Gold cost</dt><dd>${formatTreasuryGearNumber(vm.upgradeGold)}</dd></div><div><dt>Raw production</dt><dd>${formatStackedBonusPercent(requirement.baseGoldHours)}h</dd></div></dl>
      <p class="tg-warning">This two-to-one upgrade cannot be undone.</p>
      <footer><button type="button" data-gear-merge-cancel>Cancel</button><button class="tg-primary" type="button" data-gear-merge-confirm ${vm.actionInFlight || !vm.canMerge ? "disabled" : ""}>Confirm Upgrade</button></footer>
    </div></section>
  </div>`;
}

function renderTreasuryGearScreen(vm) {
  const groups = vm.filteredBagGroups;
  return `<section class="tg-shell" data-common-gear-screen>
    <header class="tg-header" ${vm.mergeConfirmOpen?"inert":""}><div class="tg-seal">${renderTreasuryGearIcon("treasury")}</div><div class="tg-heading"><p>Inner Castle <span>· Master of Coin</span></p><h2 id="tgTitle">Treasury</h2></div><div class="tg-gold">${renderTreasuryGearIcon("coins")}<span><small>Gold</small>${formatTreasuryGearNumber(state.gold)}</span></div><button type="button" class="tg-back" data-gear-back><span aria-hidden="true">←</span><span>Back to Inner Castle</span></button><span class="tg-close-space" aria-hidden="true"></span></header>
    <main class="tg-main" ${vm.mergeConfirmOpen?"inert":""}><section class="tg-loadout" aria-labelledby="tgOfficerTitle"><header class="tg-section-heading"><h3 id="tgOfficerTitle">Master of Coin</h3><span>Equipment</span></header><div class="tg-loadout-grid"><div class="tg-slot-column">${vm.leftSlots.map(renderTreasuryGearSlot).join("")}</div><figure class="tg-officer">${renderTreasuryGearArt(vm.building.characterArt,"Master of Coin")}<figcaption>Keeper of the treasury</figcaption></figure><div class="tg-slot-column">${vm.rightSlots.map(renderTreasuryGearSlot).join("")}</div></div><footer class="tg-loadout-footer"><span>${vm.slots.filter(s=>s.equipped).length} / 8 slots equipped</span><span><b>!</b> Upgrade material ready</span></footer></section>
    <section class="tg-bag" aria-labelledby="tgBagTitle"><header class="tg-section-heading"><h3 id="tgBagTitle">${renderTreasuryGearIcon("bag")} Equipment Bag</h3><span>${vm.bagOwnedCount} owned</span></header><div class="tg-bag-controls"><label for="tgFilter">Show</label><select data-gear-bag-select id="tgFilter" aria-label="Filter equipment bag"><option value="all">All slots</option>${COMMON_GEAR.SLOTS.map(s=>`<option value="${s}" ${vm.bagFilter===s?"selected":""}>${titleCaseCommonGearLabel(s)}</option>`).join("")}</select></div><div class="tg-bag-scroll" data-gear-bag-scroll tabindex="0" aria-label="Equipment inventory"><div class="tg-items">${groups.map(renderTreasuryGearBagTile).join("")||`<div class="tg-empty"><h4>No equipment here</h4><p>${vm.instances.length?"Change the filter to see the Master of Coin’s other gear.":"Open Common Gear Boxes to find gear for the Master of Coin."}</p></div>`}</div></div><footer class="tg-bag-footer"><span>${groups.length} shown · ${vm.bagStackCount} stacks</span><span>${renderTreasuryGearIcon("check")} Equipped <b class="tg-legend-ready">!</b> Ready</span></footer></section>
    ${renderTreasuryGearDetails(vm)}</main>${renderTreasuryGearConfirmation(vm)}</section>`;
}
