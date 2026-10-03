/* Shared dialog presentation. Gameplay and action authority remain in game.js. */
/* exported confirmPeaceShieldOrder, getOpenCityInfoId, refreshOpenCityInfoModal, captureCommonGearRefresh, captureItemBagRefresh, captureHoldingDetailsRefresh, captureClanViewRefresh, captureUiRefreshState, patchOperationModalText, patchCityListPanel, formatCityListCost, installGameModalLifecycle, updateOnboardingMapTipVisibility, observeOnboardingOverlays */

// Return false until the player explicitly approves this exact shield-breaking
// order. Retry the normal submit handler so all current permissions are checked.
function confirmPeaceShieldOrder(source, target, kind, troops, confirmation, retry) {
  if (document.getElementById("peaceShieldOrderDialog")) return false;
  const expiresAt = getActivePeaceShieldExpiresAtMs();
  const breaksShield = kind === "reinforce"
    || (kind === "attack" && shouldDeactivatePeaceShieldForPlayerAttack(target));
  if (!expiresAt || !breaksShield) return true;
  const scope = getOnlineSessionRequestScope();
  const key = JSON.stringify([scope, source.id, target.id, getCityRegionId(source), getCityRegionId(target),
    source.ownerUid, target.ownerUid, target.owner, target.ownershipRevision, kind, troops, expiresAt]);
  if (confirmation?.key === key) return true;
  const view = modalBody.firstElementChild;
  const currentState = state;
  const focused = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.id = "peaceShieldOrderDialog";
  dialog.className = "peace-shield-order-dialog";
  dialog.setAttribute("aria-labelledby", "peaceShieldOrderTitle");
  dialog.setAttribute("aria-describedby", "peaceShieldOrderDescription");
  dialog.innerHTML = `
    <header><h2 id="peaceShieldOrderTitle">Sending will remove your shield</h2><button type="button" data-shield-cancel aria-label="Cancel sending">&times;</button></header>
    <div class="peace-shield-order-copy">
      <p id="peaceShieldOrderDescription">Sending these troops will end your Royal Peace Shield. Your cities will lose its protection.</p>
      <p class="peace-shield-order-route"><strong>${formatMarchesNumber(troops)} troops</strong> from ${escapeHtml(source.name)} to <strong>${escapeHtml(target.name)}</strong></p>
      <p class="peace-shield-order-time">Shield time remaining: <strong>${escapeHtml(formatDuration(getPeaceShieldRemainingSeconds()))}</strong></p>
    </div>
    <footer><button type="button" data-shield-cancel autofocus>Cancel</button><button type="button" data-shield-continue>Continue sending</button></footer>`;
  let settled = false;
  const finish = accepted => {
    if (settled) return;
    settled = true;
    modal.removeEventListener("close", parentClosed);
    const current = modal.open && modalBody.firstElementChild === view
      && state === currentState && getOnlineSessionRequestScope() === scope;
    dialog.close();
    dialog.remove();
    if (current && focused?.isConnected) focused.focus({ preventScroll: true });
    if (accepted && current) retry({ key });
  };
  const parentClosed = () => {
    // A queued close for the preceding view must not dismiss a new warning.
    if (!modal.open || modalBody.firstElementChild !== view) finish(false);
  };
  modal.addEventListener("close", parentClosed);
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish(false);
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
  dialog.addEventListener("close", () => finish(false));
  dialog.addEventListener("click", event => { if (event.target === dialog) finish(false); });
  dialog.querySelectorAll("[data-shield-cancel]").forEach(button => button.addEventListener("click", () => finish(false)));
  dialog.querySelector("[data-shield-continue]").addEventListener("click", () => finish(true));
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("footer [data-shield-cancel]").focus();
  return false;
}

function getOpenCityInfoId() {
  // Profile links replace the dialog in place, without its close cleanup.
  return modal?.open && modalBody?.querySelector(".cd-panel,.stronghold-legacy-info-panel,.crown-citadel-info-panel")
    ? String(modal.dataset.cityInfoId || "") : "";
}

function refreshOpenCityInfoModal() {
  const cityId = getOpenCityInfoId();
  if (cityId) showCityInfoModal(cityId);
}

// Call only when rebuilding the same view/session. Restore interaction state,
// while keeping newly rendered permissions, prices and available actions.
function captureUiRefreshState(root, { scrollSelectors = [], focusAttributes = [], draftSelector = "" } = {}) {
  if (!root) return () => {};
  const identify = element => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const form = element.parentElement?.closest("form");
    const formSelector = form && identify(form);
    if (formSelector && element.name) return `${formSelector} [name="${CSS.escape(element.name)}"]`;
    const attributes = focusAttributes.filter(name => name !== "aria-label" && element.hasAttribute(name));
    if (attributes.length) return attributes.map(name => `[${name}="${CSS.escape(element.getAttribute(name))}"]`).join("");
    return focusAttributes.includes("aria-label") && element.hasAttribute("aria-label")
      ? `[aria-label="${CSS.escape(element.getAttribute("aria-label"))}"]` : "";
  };
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const focusSelector = active ? identify(active) : "";
  const selection = active && typeof active.selectionStart === "number"
    ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;
  const scroll = [
    { selector: "", index: 0, top: root.scrollTop, left: root.scrollLeft },
    ...scrollSelectors.flatMap(selector => [...root.querySelectorAll(selector)].map((element, index) => ({
      selector, index, top: element.scrollTop, left: element.scrollLeft,
    }))),
  ];
  // Drafts are opt-in; never copy authoritative values or action attributes.
  const drafts = draftSelector ? [...root.querySelectorAll(draftSelector)].map(element => ({ selector: identify(element), value: element.value })) : [];
  return (updatedRoot = root) => {
    if (!updatedRoot) return;
    drafts.forEach(draft => {
      const field = draft.selector && updatedRoot.querySelector(draft.selector);
      if (field && !field.disabled) field.value = draft.value;
    });
    const focus = active && updatedRoot.contains(active) ? active : focusSelector && updatedRoot.querySelector(focusSelector);
    if (focus && !focus.disabled) {
      focus.focus({ preventScroll: true });
      if (selection && typeof focus.setSelectionRange === "function" && typeof focus.selectionStart === "number") focus.setSelectionRange(...selection);
    }
    scroll.forEach(saved => {
      const element = saved.selector ? updatedRoot.querySelectorAll(saved.selector)[saved.index] : updatedRoot;
      if (element) { element.scrollTop = saved.top; element.scrollLeft = saved.left; }
    });
  };
}

function captureHoldingDetailsRefresh(city) {
  const key = JSON.stringify([getOnlineSessionRequestScope(), getCityRegionId(city), city.id, city.owner, city.ownerUid]);
  const previous = modal.open && modalBody.querySelector(".gold-camp-info-panel");
  const sameView = previous && previous.dataset.refreshView === key;
  const tabId = sameView && previous.querySelector('[role="tab"][aria-selected="true"]')?.id;
  const folds = sameView ? [...previous.querySelectorAll(".detail-fold")].map(fold => fold.open) : [];
  const restore = sameView ? captureUiRefreshState(modalBody, {
    scrollSelectors: [".identity-column", ".details-column", ".camp-info-tab-panel", ".citadel-reign-list"],
    focusAttributes: ["data-player-profile-uid", "data-return-clan-reinforcement", "aria-label"],
  }) : () => {};
  return () => {
    const root = modalBody.querySelector(".gold-camp-info-panel");
    if (!root) return;
    root.dataset.refreshView = key;
    const selected = tabId && root.querySelector(`#${CSS.escape(tabId)}`);
    if (selected) {
      root.querySelectorAll('[role="tab"]').forEach(tab => {
        const active = tab === selected;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        const panel = root.querySelector(`#${CSS.escape(tab.getAttribute("aria-controls"))}`);
        if (panel) panel.hidden = !active;
      });
      const footer = root.querySelector(".holding-footer");
      if (footer) footer.hidden = selected.getAttribute("aria-controls") !== root.querySelector(".overview-panel")?.id;
    }
    root.querySelectorAll(".detail-fold").forEach((fold, index) => { if (folds[index] !== undefined) fold.open = folds[index]; });
    restore();
  };
}

function captureClanViewRefresh() {
  const viewKey = JSON.stringify([getOnlineSessionRequestScope(), state?.clanId, state?.clanRole, activeClanMobileSection,
    activeClanBrowserSection, activeClanRewardSection, clanShieldEditorOpen, clanRenameEditorOpen]);
  const restore = clanContent.dataset.refreshView === viewKey ? captureUiRefreshState(clanView, {
    scrollSelectors: [".description-scroll", ".activity-scroll", ".scroll-region", ".clan-roster", ".clan-list",
      ".clan-browser-panel", ".clan-rename-card", ".clan-shield-editor-preview", ".clan-shield-editor-controls"],
    focusAttributes: ["data-clan-form", "data-clan-action", "data-member-id", "data-clan-rally", "data-reward-id",
      "data-clan-section", "data-clan-browser-section", "data-clan-reward", "aria-label"],
    draftSelector: '.clan-browser form input, .clan-browser form textarea, .clan-browser form select',
  }) : () => {};
  return () => {
    clanContent.dataset.refreshView = viewKey;
    restore();
  };
}

function captureItemBagRefresh(model, selectedEntry) {
  const refreshKey = JSON.stringify([getOnlineSessionRequestScope(), model.category, model.page, selectedEntry?.entryKey || ""]);
  const previousBag = modal.open && modalBody.querySelector(".ib-bag-shell");
  const restore = previousBag && previousBag.dataset.refreshView === refreshKey ? captureUiRefreshState(modalBody, {
    scrollSelectors: [".ib-selection-scroll", ".ib-item-viewport", ".ib-categories"],
    focusAttributes: ["data-inventory-select", "data-inventory-use", "data-inventory-page", "aria-label"],
  }) : () => {};
  return () => {
    const root = modalBody.querySelector(".ib-bag-shell");
    if (root) root.dataset.refreshView = refreshKey;
    restore();
  };
}

function captureCommonGearRefresh(viewModel) {
  const refreshKey = JSON.stringify([getCommonGearActionScope(), viewModel.buildingId, viewModel.selectedSlot,
    viewModel.selected?.instanceId || "", selectedCommonGearBagFilter, commonGearMergeConfirmOpen]);
  const previous = modal.open && modalBody.querySelector("[data-common-gear-screen]");
  const restore = previous && previous.dataset.refreshView === refreshKey ? captureUiRefreshState(modalBody, {
    scrollSelectors: ['[data-gear-panel="details"]', "[data-gear-bag-scroll]"],
    focusAttributes: ["data-gear-slot", "data-gear-instance", "data-gear-panel", "data-gear-equip", "data-gear-merge", "data-gear-merge-cancel", "data-gear-merge-confirm", "aria-label"],
  }) : () => {};
  return () => {
    const root = modalBody.querySelector("[data-common-gear-screen]");
    if (root) root.dataset.refreshView = refreshKey;
    restore();
  };
}

const formatCityListCost = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format;

function patchCityListPanel(host, markup, preserve) {
  const rendered = document.createElement("div");
  rendered.innerHTML = markup;
  const panel = preserve ? host.querySelector(".city-list-panel") : null;
  if (!panel) {
    host.replaceChildren(rendered.firstElementChild);
    return [host];
  }
  const changedRows = [];
  // Keep the scroller attached so refreshes cannot cancel a native swipe.
  for (const section of [...rendered.firstElementChild.children]) {
    const current = panel.querySelector(`:scope > .${section.classList[0]}`);
    if (current && section.classList.contains("city-list-rows")) {
      const previousRows = new Map([...current.children].map(row => [row.dataset.cityListRowKey || "", row]));
      const keptRows = new Set();
      [...section.children].forEach((row, index) => {
        const previous = previousRows.get(row.dataset.cityListRowKey || "");
        const next = previous?.isEqualNode(row) ? previous : row;
        if (next !== previous) {
          if (previous) previous.replaceWith(next);
          changedRows.push(next);
        }
        if (current.children[index] !== next) current.insertBefore(next, current.children[index] || null);
        keptRows.add(next);
      });
      [...current.children].forEach(row => { if (!keptRows.has(row)) row.remove(); });
    } else if (current) current.replaceWith(section);
    else panel.append(section);
  }
  return changedRows;
}

// Preserve pressed controls during countdown/quantity changes. Identity,
// permissions, busy state, or structure changes use the normal rebind path.
function patchOperationModalText(host, markup) {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const updates = [];
  function compare(current, next) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) return false;
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) updates.push([current, next.nodeValue]);
      return true;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return current.nodeValue === next.nodeValue;
    if (current.attributes.length !== next.attributes.length) return false;
    for (const attribute of next.attributes) {
      if (current.getAttribute(attribute.name) !== attribute.value) return false;
    }
    return compareChildren(current, next);
  }
  function compareChildren(current, next) {
    if (current.childNodes.length !== next.childNodes.length) return false;
    return [...current.childNodes].every((child, index) => compare(child, next.childNodes[index]));
  }
  if (!compareChildren(host, template.content)) return false;
  for (const [node, value] of updates) node.nodeValue = value;
  return true;
}

function installGameModalLifecycle(dialog, onClose) {
  let closeHandled = false;
  const showNative = dialog.showModal.bind(dialog);
  const closeNative = dialog.close.bind(dialog);
  function cleanup() {
    if (dialog.open || closeHandled) return;
    closeHandled = true;
    onClose();
  }
  dialog.showModal = (...args) => {
    const result = showNative(...args);
    closeHandled = false;
    return result;
  };
  dialog.close = (...args) => {
    const wasOpen = dialog.open;
    const result = closeNative(...args);
    // Retire the old view before a caller can open its successor. A queued
    // native event must not repeat cleanup on the new view or its requests.
    if (wasOpen) cleanup();
    return result;
  };
  // Escape/native dismissal still needs cleanup when it bypasses our method.
  dialog.addEventListener("close", cleanup);
}

function updateOnboardingMapTipVisibility() {
  const host = document.getElementById("onboardingMapTip");
  if (!host) return;
  // A page-wide :has(...) rule makes unrelated HUD text updates invalidate
  // styles throughout the game. Read only the actual overlay visibility here.
  const hidden = !host.dataset.guidanceMarkup || Boolean(
    document.querySelector("dialog[open]")
    || document.getElementById("profileScreen")?.classList.contains("open")
    || document.getElementById("toast")?.classList.contains("visible")
    || document.getElementById("setupScreen")?.classList.contains("visible")
  );
  if (host.hidden !== hidden) host.hidden = hidden;
}

function observeOnboardingOverlays(onChange) {
  const observer = new MutationObserver(onChange);
  document.querySelectorAll("dialog").forEach(dialog => {
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });
  document.querySelectorAll("#profileScreen, #toast, #setupScreen").forEach(panel => {
    observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
  });
}
