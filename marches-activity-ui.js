/* Marches presentation helpers. Existing game data and action handlers stay authoritative. */
/* exported captureMarchesListView, restoreMarchesListView, renderMarchesHeader */
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
