/* Approved Shop presentation. Prices, inventory, purchase queues and rewarded ads remain server-backed. */
/* exported renderRoyalShopPanel, bindRoyalShopPresentation, patchRoyalShopSelection */
let royalShopSection = "provisions";
let royalShopRewardId = "gold";
let royalShopBoxPending = false;
const ROYAL_SHOP_GLYPHS = {
  store:'<path d="M5 13h22v16H5Z M3 12l3-9h20l3 9M3 12q3 6 6 0 3 6 6 0 3 6 6 0 4 6 8 0M12 29V19h8v10M10 3l-1 9m7-9v9m6-9 1 9"/>',
  bag:'<path d="M10 3h12l-3 6H13Z M12 10c-1 5-9 9-9 15 0 7 26 7 26 0 0-6-8-10-9-15Z M11 10h11M13 16l-3 9m12-9 1 9"/>',
  buy:'<path d="M7 3h17v26H7Z M11 8h9m-9 5h9m-9 5h5m-5 6h5M5 6H3v25h18M20 22l3 3 6-8"/>',
  play:'<path d="M5 4h22v24H5Z M13 10l8 6-8 6Z M8 4v24m16-24v24"/>'
};
const royalShopIcon = name => `<svg class="rs-ink-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${ROYAL_SHOP_GLYPHS[name] || ROYAL_SHOP_GLYPHS.bag}</svg>`;
const royalShopExact = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US");
const royalShopMoney = value => `<img src="assets/icons/royal-shop-gold-r1.svg" alt="">${formatNumber(value)}`;

function getRoyalShopSelection() {
  const rewards = royalShopSection === "rewards";
  const item = rewards ? REWARDED_AD_ITEMS.find(entry => entry.id === royalShopRewardId) : selectedShopItemId === COMMON_GEAR_BOX_ITEM.id ? COMMON_GEAR_BOX_ITEM : getShopItemById(selectedShopItemId);
  if (!item) return null;
  const purchase = rewards ? null : getShopPurchaseState(item.id);
  const availability = rewards ? getRewardedAdAvailability() : null;
  const boxPending = !rewards && item.id === COMMON_GEAR_BOX_ITEM.id && royalShopBoxPending;
  const category = rewards ? "Advertisement reward" : INVENTORY_CATEGORIES.find(([id]) => id === item.bagCategory)?.[1] || "Utility";
  const claimed = Math.max(0, Math.floor(Number(rewardedAdStatus?.claimedToday) || 0));
  const dailyLimit = Math.max(1, Math.floor(Number(rewardedAdStatus?.dailyLimit) || getRewardedAdClientConfig().dailyLimit));
  const amount = Math.max(0, Math.floor(Number(rewardedAdStatus?.previewRewards?.[item.id]) || 0));
  const note = rewards
    ? `${amount > 0 ? `Estimated reward: ${royalShopExact(amount)} ${item.rewardLabel}.` : "Exact reward calculated before the ad."} One shared 30-minute cooldown for both rewards.`
    : item.id === COMMON_GEAR_BOX_ITEM.id ? "Opens in your Bag. One box available from the Shop each UTC day." : `Daily purchase limit: ${purchase.purchaseLimit > 0 ? purchase.purchaseLimit : "Unlimited"}. Resets at 00:00 UTC.`;
  const status = rewards ? availability.text : boxPending ? "Confirming purchase…" : purchase.status;
  const heading = rewards ? availability.text : boxPending ? "Confirming…" : !purchase.canBuy ? purchase.buttonLabel === "Not Enough Gold" ? "Not enough Gold" : "Daily limit reached" : purchase.status ? "Purchase queued" : "Available";
  return { rewards, item, purchase, category, claimed, dailyLimit, note, status, heading,
    canAct: rewards ? availability.canWatch : purchase.canBuy && !boxPending,
    action: rewards ? "Watch Advertisement" : boxPending ? "Confirming…" : purchase.buttonLabel === "Purchased" ? "Daily Limit Reached" : purchase.buttonLabel };
}

function renderRoyalShopSelection() {
  const model = getRoyalShopSelection();
  if (!model) return "";
  const { rewards, item, purchase, category, claimed, dailyLimit, note, status, heading, canAct, action } = model;
  return `<section class="rs-shop-selection" data-shop-purchase-bar data-selected-shop-item="${escapeHtml(item.id)}" aria-label="Selected item">
    <div class="rs-selection-heading"><span>${rewards ? "Optional reward" : "Selected provision"}</span><span data-rs-heading class="${rewards ? "rewarded-ad-availability" : ""}">${escapeHtml(heading)}</span></div>
    <div class="rs-selection-scroll" tabindex="0" aria-label="${escapeHtml(item.label)} details"><div class="rs-selected-hero"><div class="rs-selected-art">${renderItemIcon(item)}</div><h2>${escapeHtml(item.label)}</h2><p class="rs-selected-category">${escapeHtml(category)}</p></div><div class="rs-decorative-rule" aria-hidden="true">◆</div><p class="rs-description shop-purchase-description">${escapeHtml(item.description)}</p><p class="rs-detail-note" data-rs-note>${escapeHtml(note)}</p><p class="rs-action-feedback ${rewards ? "rewarded-ad-availability" : ""}" data-rs-status role="status" ${status ? "" : "hidden"}>${escapeHtml(status)}</p></div>
    <footer class="rs-purchase-footer"><div class="rs-purchase-stats">${rewards ? `<span>Watched today <strong data-rs-watched>${claimed} / ${dailyLimit}</strong></span><span>UTC</span>` : `<span>Owned <strong data-shop-selected-owned>${royalShopExact(purchase.owned)}</strong></span><span>Daily <strong data-shop-selected-daily>${purchase.purchaseLimit > 0 ? `${purchase.purchaseCount} / ${purchase.purchaseLimit}` : "Unlimited"}</strong></span>`}</div><div class="rs-purchase-action"><div class="rs-price-total"><span>${rewards ? "Cost" : "Price · 1 item"}</span><strong data-shop-selected-price title="${rewards ? "No Gold required" : royalShopExact(purchase.price) + " Gold"}">${rewards ? "Free" : royalShopMoney(purchase.price)}</strong></div><button class="rs-buy-button" ${rewards ? `data-rewarded-ad-watch="${item.id}"` : `data-shop-purchase-selected="${escapeHtml(item.id)}"`} type="button" ${canAct ? "" : "disabled"}>${royalShopIcon(rewards ? "play" : "buy")}<span data-rs-action>${escapeHtml(action)}</span></button></div></footer>
  </section>`;
}

function renderRoyalShopCard(item, rewards = false) {
  const selected = rewards ? item.id === royalShopRewardId : item.id === selectedShopItemId;
  const price = rewards ? 0 : getShopPurchaseState(item.id).price;
  return `<button class="rs-item-tile ${rewards ? "rs-reward-tile" : ""}" ${rewards ? `data-rs-reward="${item.id}"` : `data-shop-item="${escapeHtml(item.id)}" data-shop-select="${escapeHtml(item.id)}"`} type="button" role="option" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" aria-label="${escapeHtml(item.label)}${rewards ? "" : `, ${royalShopExact(price)} Gold`}"><span class="rs-tile-art">${renderItemIcon(item)}</span><span class="rs-item-name">${escapeHtml(item.label)}</span>${rewards ? `<span class="rs-reward-caption">${escapeHtml(item.description)}</span><span class="rs-tile-price rewarded-ad-availability">${escapeHtml(getRewardedAdAvailability().text)}</span>` : `<span class="rs-tile-price" data-rs-card-price title="${royalShopExact(price)} Gold">${royalShopMoney(price)}</span>`}</button>`;
}

function renderRoyalShopPanel() {
  const rewards = royalShopSection === "rewards";
  const items = rewards ? REWARDED_AD_ITEMS : [...(COMMON_GEAR ? [COMMON_GEAR_BOX_ITEM] : []), ...SHOP_ITEMS];
  return `<div class="rs-shop-shell"><header class="rs-shop-header"><span class="rs-shop-seal" aria-hidden="true">${royalShopIcon("store")}</span><div class="rs-shop-heading"><p>The royal market</p><h1>Shop</h1></div><div class="rs-gold-balance"><span>Gold available</span><strong><img src="assets/icons/royal-shop-gold-r1.svg" alt=""><span data-shop-balance title="${royalShopExact(getProjectedGold())} Gold">${formatNumber(getProjectedGold())}</span></strong></div><span class="rs-close-space" aria-hidden="true"></span></header>
    <div class="rs-shop-body"><section class="rs-shop-catalog" data-section="${royalShopSection}" aria-label="Shop catalog"><nav id="royalShopSections" role="tablist" aria-label="Shop sections">${[["provisions", "Provisions", getSelectableShopItemIds().length], ["rewards", "Free boosts", REWARDED_AD_ITEMS.length]].map(([id, label, count]) => `<button id="royalShopTab-${id}" data-rs-section="${id}" type="button" role="tab" aria-selected="${id === royalShopSection}" tabindex="${id === royalShopSection ? "0" : "-1"}" aria-controls="royalShopCatalogPanel">${label} <span>${count}</span></button>`).join("")}</nav><div class="rs-catalog-heading"><h2>${rewards ? "Free .5h Boosts" : "The royal stores"}</h2><span>${rewards ? "Optional advertisements" : items.length + " provisions"}</span></div><div id="royalShopCatalogPanel" role="tabpanel" aria-labelledby="royalShopTab-${royalShopSection}"><div id="royalShopItemGrid" class="shop-items" role="listbox" aria-label="${rewards ? "Optional rewards" : "Shop items"}">${items.map(item => renderRoyalShopCard(item, rewards)).join("")}${rewards ? "" : `<div class="rs-tile-empty" aria-hidden="true">${royalShopIcon("bag")}<span>For your realm</span></div>`}</div></div><footer class="rs-catalog-footer"><span>${rewards ? "One shared 30-minute cooldown" : "Purchased items go to your Bag"}</span><span>${rewards ? "Daily reset · 00:00 UTC" : "One item per purchase"}</span></footer></section>${renderRoyalShopSelection()}</div></div>`;
}

function bindRoyalShopAction() {
  modalBody.querySelector("[data-shop-purchase-selected]")?.addEventListener("click", async event => {
    const id = event.currentTarget.dataset.shopPurchaseSelected;
    if (id !== COMMON_GEAR_BOX_ITEM.id) { buyShopItem(id); return; }
    if (royalShopBoxPending) return;
    royalShopBoxPending = true; patchRoyalShopSelection();
    try { await buyCommonGearBox(); } finally { royalShopBoxPending = false; patchRoyalShopSelection(); }
  });
  modalBody.querySelector("[data-rewarded-ad-watch]")?.addEventListener("click", event => startRewardedAdBoost(event.currentTarget.dataset.rewardedAdWatch, event.currentTarget));
}

function patchRoyalShopSelection() {
  const current = modalBody.querySelector(".rs-shop-selection");
  if (!current || !modal.open || !modal.classList.contains("shop-modal") || modal.classList.contains("rewarded-ad-confirmation-modal")) return;
  const model = getRoyalShopSelection();
  if (!model) return;
  if (current.dataset.selectedShopItem !== model.item.id) {
    current.outerHTML = renderRoyalShopSelection(); bindRoyalShopAction(); return;
  }
  const put = (selector, value) => setTextIfChanged(current.querySelector(selector), value);
  put("[data-rs-heading]", model.heading); put("[data-rs-note]", model.note); put("[data-rs-status]", model.status); put("[data-rs-action]", model.action);
  current.querySelector("[data-rs-status]").hidden = !model.status;
  current.querySelector(".rs-buy-button").disabled = !model.canAct;
  if (model.rewards) put("[data-rs-watched]", `${model.claimed} / ${model.dailyLimit}`);
  else {
    put("[data-shop-selected-owned]", royalShopExact(model.purchase.owned));
    put("[data-shop-selected-daily]", model.purchase.purchaseLimit > 0 ? `${model.purchase.purchaseCount} / ${model.purchase.purchaseLimit}` : "Unlimited");
    const price = current.querySelector("[data-shop-selected-price]");
    const title = royalShopExact(model.purchase.price) + " Gold";
    if (price.title !== title) { price.title = title; price.innerHTML = royalShopMoney(model.purchase.price); }
  }
  const balance = modalBody.querySelector("[data-shop-balance]");
  if (balance) { balance.title = royalShopExact(getProjectedGold()) + " Gold"; setTextIfChanged(balance, formatNumber(getProjectedGold())); }
  modalBody.querySelectorAll("[data-shop-select]").forEach(card => {
    const price = getShopPurchaseState(card.dataset.shopSelect)?.price;
    const well = card.querySelector("[data-rs-card-price]");
    const title = royalShopExact(price) + " Gold";
    if (well && well.title !== title) { well.title = title; well.innerHTML = royalShopMoney(price); card.setAttribute("aria-label", `${getShopPurchaseState(card.dataset.shopSelect).label}, ${title}`); }
  });
}

function bindRoyalShopPresentation() {
  bindShopItemSelection(); bindRoyalShopAction();
  modalBody.querySelectorAll("[data-rs-section]").forEach(button => button.addEventListener("click", () => {
    royalShopSection = button.dataset.rsSection; renderShopModal(); modalBody.querySelector(`[data-rs-section="${royalShopSection}"]`)?.focus({ preventScroll: true });
  }));
  modalBody.querySelector("#royalShopSections")?.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const next = event.key === "Home" ? "provisions" : event.key === "End" ? "rewards" : royalShopSection === "rewards" ? "provisions" : "rewards";
    modalBody.querySelector(`[data-rs-section="${next}"]`)?.click();
  });
  modalBody.querySelectorAll("[data-rs-reward]").forEach(button => {
    button.addEventListener("click", () => {
      royalShopRewardId = button.dataset.rsReward;
      modalBody.querySelectorAll("[data-rs-reward]").forEach(card => { const selected = card.dataset.rsReward === royalShopRewardId; card.setAttribute("aria-selected", String(selected)); card.tabIndex = selected ? 0 : -1; });
      patchRoyalShopSelection();
    });
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? "gold" : event.key === "End" ? "troops" : royalShopRewardId === "gold" ? "troops" : "gold";
      const card = modalBody.querySelector(`[data-rs-reward="${next}"]`); card?.click(); card?.focus({ preventScroll: true });
    });
  });
}
