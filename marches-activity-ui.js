/* Marches presentation helpers. Existing game data and action handlers stay authoritative. */
/* exported captureMarchesListView, restoreMarchesListView, renderMarchesHeader, getArmyTokenParts, createArmyTokenElement */
function captureMarchesListView() {
  const previousMarchList = modalBody.querySelector(".march-list");
  const previousScroll = previousMarchList?.scrollTop || 0;
  const focusedControl = modalBody.contains(document.activeElement) ? document.activeElement : null;
  const focusedAction = ["data-outgoing-march", "data-swift-march-order", "data-recall-horn", "data-player-profile-uid", "data-close-marches", "data-active-operations-tab"]
    .find(attribute => focusedControl?.hasAttribute(attribute));
  const focusedValue = focusedAction ? focusedControl.getAttribute(focusedAction) : null;
  return { previousMarchList, previousScroll, focusedControl, focusedAction, focusedValue };
}

function restoreMarchesListView({ previousMarchList, previousScroll, focusedControl, focusedAction, focusedValue }) {
  const marchList = modalBody.querySelector(".march-list");
  if (marchList && previousMarchList) {
    marchList.scrollTop = previousScroll;
    if (focusedAction) {
      const replacement = [...modalBody.querySelectorAll(`[${focusedAction}]`)]
        .find(control => control.getAttribute(focusedAction) === focusedValue);
      if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
      else marchList.focus({ preventScroll: true });
    } else if (focusedControl === previousMarchList) marchList.focus({ preventScroll: true });
  }
}

function renderMarchesHeader() {
  return `<header class="window-header"><img class="heading-art" src="assets/icons/skills/marchOrders.svg" alt=""><div class="heading"><p>ORDERS OF THE REALM</p><h2>Kingdom Activity</h2></div><div class="carried-items" aria-label="March items in your bag"><span>${renderItemIcon(getShopItemById(SWIFT_MARCH_ORDER_ITEM_ID))}<span>Swift Orders <strong>${formatMarchesNumber(getProjectedInventoryCount(SWIFT_MARCH_ORDER_ITEM_ID))}</strong></span></span><span>${renderItemIcon(getShopItemById(RECALL_HORN_ITEM_ID))}<span>Recall Horns <strong>${formatMarchesNumber(getProjectedInventoryCount(RECALL_HORN_ITEM_ID))}</strong></span></span></div><button class="close-button" data-close-marches type="button" aria-label="Close Kingdom Activity">×</button></header>`;
}
function getArmyTokenParts(token) {
  if (token.armyTokenParts) return token.armyTokenParts;
  token.armyTokenParts = {
    icon: token.querySelector(".army-token-icon"),
    count: token.querySelector(".army-token-count"),
    time: token.querySelector(".army-token-time"),
    navigation: token.querySelector(".army-token-nav"),
    fromButton: token.querySelector('[data-army-endpoint="from"]'),
    toButton: token.querySelector('[data-army-endpoint="to"]'),
  };
  return token.armyTokenParts;
}
function createArmyTokenElement(attack) {
  const position = document.createElement("div");
  position.className = "army-position";
  const token = document.createElement("div");
  position.appendChild(token);
  token.dataset.armyTokenId = getArmyTokenId(attack);
  token.setAttribute("role", "button");
  token.setAttribute("tabindex", "0");
  token.setAttribute("aria-expanded", "false");
  token.innerHTML = `
    <span class="army-token-icon"></span>
    <strong class="army-token-count"></strong>
    <small class="army-token-time"></small>
    <span class="army-token-nav" hidden>
      <button type="button" data-army-endpoint="from" title="Go to march origin" aria-label="Go to march origin"><span aria-hidden="true">${renderCrownlandsIcon("back")}</span><small>From</small></button>
      <button type="button" data-army-endpoint="to" title="Go to march destination" aria-label="Go to march destination"><span aria-hidden="true">${renderCrownlandsIcon("forward")}</span><small>To</small></button>
    </span>`;
  getArmyTokenParts(token).position = position;
  token.addEventListener("click", event => {
    event.stopPropagation();
    if (suppressMapClick || token.dataset.endpointInteractionDisabled === "true") return;
    const endpointButton = event.target.closest("[data-army-endpoint]");
    if (endpointButton) {
      focusArmyEndpoint(token.dataset.armyTokenId, endpointButton.dataset.armyEndpoint);
      return;
    }
    selectedArmyTokenId = selectedArmyTokenId === token.dataset.armyTokenId
      ? ""
      : token.dataset.armyTokenId;
    updateArmyTokenNavigationSelection();
  });
  token.addEventListener("keydown", event => {
    if (event.target !== token || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    token.click();
  });
  return token;
}
