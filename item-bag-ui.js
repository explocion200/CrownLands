/* Approved Item Bag presentation. Item eligibility and mutations remain in the existing action pipeline. */
/* exported renderItemBagPanel, bindItemBagPresentation */
const ITEM_BAG_ICONS={
  bag:'<path fill="currentColor" fill-opacity=".10" d="m10 9-3-6h18l-4 6c3 5 8 7 8 14 0 8-26 8-26 0 0-7 5-9 7-14Z"/><path d="M9 10h13M13 4l2 4m6-4-2 4m-6 7-2 8m9-8 2 8m-8 5h7"/>',
  boosts:'<path fill="currentColor" fill-opacity=".12" d="M6 13c3 3 17 3 20 0v12c-3 5-17 5-20 0Z"/><ellipse cx="16" cy="13" rx="10" ry="4"/><path d="m7 16 4 10 5-8 5 8 4-10M4 3l15 6M28 3l-12 6M6 24c4 4 16 4 20 0"/>',
  war:'<path fill="currentColor" fill-opacity=".12" d="M4 3 10 5 26 24l-3 3L5 10Zm24 0-6 2L6 24l3 3 18-17Z"/><path d="m5 21 6 6m10-6 6 6M4 29l4-4m20 4-4-4M7 6l13 15m5-15L12 21"/>',
  defense:'<path fill="currentColor" fill-opacity=".12" d="m16 3 11 4v9c0 7-6 12-11 14C11 28 5 23 5 16V7Z"/><path d="m16 7 7 3v6c0 4-3 8-7 10-4-2-7-6-7-10v-6Zm0 0v19M9 15h14"/><path fill="currentColor" fill-opacity=".2" stroke="none" d="M16 15h7c0 5-3 9-7 11Z"/>',
  utility:'<path fill="currentColor" fill-opacity=".12" d="M7 3h17c7 0 6 8 0 8H9M9 7v20h15V7M9 27H5c-5 0-4-7 0-7h14"/><path d="M12 11h7m-7 4h8m-8 4h5m0 5h5M7 3C2 3 2 9 7 9h2"/>',
  time:'<circle cx="16" cy="17" r="11"/><path d="M16 9v9l5 3M12 2h8m-4 0v4M6 7 3 4M26 7l3-3"/>',
  box:'<path fill="currentColor" fill-opacity=".12" d="M3 13c0-6 5-9 13-9s13 3 13 9v15H3Z"/><path d="M3 14h26M8 5v9m16-9v9M8 18v7m16-7v7M13 12h6v7h-6Z"/><path d="M15 15h2M5 25h3m16 0h3"/>',
  left:'<path d="m20 7-9 9 9 9m-9-9h16"/>',
  right:'<path d="m12 7 9 9-9 9m9-9H5"/>',
  check:'<path d="m6 17 6 6L26 8"/>'
};
const itemBagIcon=key=>`<svg class="ib-ink-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ITEM_BAG_ICONS[key]||ITEM_BAG_ICONS.bag}</svg>`;

let disposeItemBagPresentation = null;

function renderItemBagPanel(model, selectedEntry, activeRemaining, actionLabel, effectLabel) {
  const categoryLabel = INVENTORY_CATEGORIES.find(([id]) => id === model.category)?.[1] || "All";
  const selectedCategory = INVENTORY_CATEGORIES.find(([id]) => id === selectedEntry?.bagCategory)?.[1] || "";
  const activeText = activeRemaining > 0 ? `Active: ${formatDuration(activeRemaining)}` : "";
  const disabled = activeRemaining > 0 && !isStackableTimedInventoryItem(selectedEntry);
  const exactCount = Math.max(0, Math.floor(Number(selectedEntry?.ownedCount) || 0)).toLocaleString("en-US");
  const selection = selectedEntry ? `
    <div class="ib-selection-scroll" tabindex="0" aria-label="${escapeHtml(selectedEntry.label)} details">
      <div class="ib-selected-hero"><div class="ib-selected-art">${renderItemIcon(selectedEntry, "ib-selected-image")}</div><h2>${escapeHtml(selectedEntry.label)}</h2><p class="ib-selected-category">${escapeHtml(selectedCategory)}</p></div>
      <div class="ib-decorative-rule" aria-hidden="true">◆</div>
      <p class="ib-description">${escapeHtml(selectedEntry.description)}</p>
      ${effectLabel ? `<div class="ib-effect">${itemBagIcon(selectedEntry.id === COMMON_GEAR_BOX_ITEM.id ? "box" : "time")}<span>${escapeHtml(effectLabel)}</span></div>` : ""}
      <p class="ib-active-status" data-inventory-active ${activeText ? "" : "hidden"}>${activeText}</p>
    </div>
    <footer class="ib-selection-actions"><div class="ib-owned">Owned<strong data-inventory-owned class="${selectedEntry.ownedCount >= 100000 ? "ib-large-owned" : ""}">${exactCount}</strong></div><button class="ib-use-button inventory-use-btn" data-inventory-use="${escapeHtml(selectedEntry.id)}" type="button" ${disabled ? "disabled" : ""}>${itemBagIcon(selectedEntry.id === COMMON_GEAR_BOX_ITEM.id ? "box" : "check")}<span>${actionLabel.charAt(0) + actionLabel.slice(1).toLowerCase()}</span></button></footer>`
    : `<div class="ib-selection-empty">${itemBagIcon("utility")}<h2>Select an item</h2><p>Choose an item from your Bag to review its effect.</p></div>`;
  return `<div class="ib-bag-shell">
    <header class="ib-bag-header"><span class="ib-bag-seal" aria-hidden="true">${itemBagIcon("bag")}</span><div class="ib-bag-heading"><p>The royal stores</p><h1>Item Bag</h1></div><div class="ib-header-note">Provisions for your realm</div><span class="ib-close-space" aria-hidden="true"></span></header>
    <div class="ib-bag-body">
      <section class="ib-bag-inventory" aria-label="Owned items">
        <div class="ib-categories" role="tablist" aria-label="Item categories">${INVENTORY_CATEGORIES.map(([id, label]) => `<button id="inventoryTab-${id}" class="ib-category-tab" data-inventory-category="${id}" type="button" role="tab" aria-selected="${model.category === id ? "true" : "false"}" aria-controls="inventoryCarouselViewport" tabindex="${model.category === id ? "0" : "-1"}">${itemBagIcon(id === "all" ? "bag" : id)}<span>${label}</span></button>`).join("")}</div>
        <div class="ib-ledger-heading"><h2>${model.category === "all" ? "All items" : categoryLabel}</h2><span>${formatNumber(model.totalEntries)} ${model.totalEntries === 1 ? "stack" : "stacks"}</span></div>
        <div id="inventoryCarouselViewport" class="ib-item-viewport inventory-carousel-viewport" role="tabpanel" aria-labelledby="inventoryTab-${model.category}" aria-label="Item page ${model.page + 1} of ${model.pageCount}" tabindex="0">
          ${model.entries.length ? `<div class="ib-item-grid" role="group" aria-label="Owned items">${model.entries.map(entry => renderInventorySlot(entry, selectedInventoryEntryKey)).join("")}${Array.from({ length: Math.max(0, INVENTORY_SLOT_COUNT - model.entries.length) }, () => `<span class="ib-tile-empty" aria-hidden="true">${itemBagIcon("bag")}</span>`).join("")}</div>` : `<div class="ib-empty-bag">${itemBagIcon("bag")}<h3>${model.category === "all" ? "Your bag is empty" : "No items here"}</h3><p>${model.category === "all" ? "Collect or purchase an item to place it here." : "No owned items are in this category."}</p></div>`}
        </div>
        <footer class="ib-paging"><span class="ib-paging-hint">Your items, gathered in one place</span><div><button data-inventory-page="${model.page - 1}" type="button" aria-label="Previous item page" ${model.page <= 0 ? "disabled" : ""}>${itemBagIcon("left")}</button><span class="ib-page-status" aria-live="polite">Page ${model.page + 1} of ${model.pageCount}</span><button data-inventory-page="${model.page + 1}" type="button" aria-label="Next item page" ${model.page >= model.pageCount - 1 ? "disabled" : ""}>${itemBagIcon("right")}</button></div></footer>
      </section>
      <section class="ib-bag-selection" aria-label="Selected item"><div class="ib-selection-heading"><span>Selected item</span><span class="ib-heading-status" data-inventory-active ${activeText ? "" : "hidden"}>${activeText}</span></div>${selection}</section>
    </div>
  </div>`;
}

function bindItemBagPresentation() {
  disposeItemBagPresentation?.();
  const root = modalBody.querySelector(".ib-bag-shell");
  if (!root) return;
  const ownerState = state;
  const refresh = () => {
    if (!modal.open || !modal.classList.contains("inventory-modal") || !root.isConnected || state !== ownerState) { dispose(); return; }
    // Reuse projected inventory/effects so pending actions and server reconciliation remain authoritative.
    patchInventoryProjectedUi();
  };
  const timer = window.setInterval(refresh, 1000);
  const observer = new MutationObserver(() => {
    if (!modal.open || !modal.classList.contains("inventory-modal") || !root.isConnected) dispose();
  });
  function dispose() {
    window.clearInterval(timer);
    observer.disconnect();
    if (disposeItemBagPresentation === dispose) disposeItemBagPresentation = null;
  }
  disposeItemBagPresentation = dispose;
  observer.observe(modal, { attributes: true, attributeFilter: ["class", "open"] });
  observer.observe(modalBody, { childList: true });
  refresh();
}
