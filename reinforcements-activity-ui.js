/* Approved Reinforcements presentation. Existing server return actions remain authoritative. */
/* exported renderReinforcementsActivityHeader, renderReinforcementsActivityFooter, captureReinforcementsActivityView, bindReinforcementsActivityView, setReinforcementActivityError, getReinforcementActivityError */
const reinforcementActivityErrors = new Map();
function setReinforcementActivityError(id, message = "") {
  const key = `${getCurrentOnlineUid()}:${id}`;
  if (message) reinforcementActivityErrors.set(key, String(message));
  else reinforcementActivityErrors.delete(key);
  while (reinforcementActivityErrors.size > 50) reinforcementActivityErrors.delete(reinforcementActivityErrors.keys().next().value);
}
function getReinforcementActivityError(id) {
  return reinforcementActivityErrors.get(`${getCurrentOnlineUid()}:${id}`) || "";
}
function renderReinforcementsActivityHeader() {
  return `<header class="window-header"><img class="heading-art" src="assets/icons/skills/marchOrders.svg" alt=""><div class="heading"><p>ORDERS OF THE REALM</p><h2>Kingdom Activity</h2></div><div class="support-heading"><img src="assets/icons/skills/shieldwallDiscipline.svg" alt=""><span>Clan support</span></div><button class="close-button" data-close-marches type="button" aria-label="Close Kingdom Activity">×</button></header>`;
}
function renderReinforcementsActivityFooter() {
  return '<footer class="report-footer"><span>Stationed troops remain until returned, invalidated or lost in battle.</span><span>Scroll for all support</span></footer>';
}
function captureReinforcementsActivityView() {
  const ledger = modalBody.querySelector(".support-ledger");
  if (!ledger) return null;
  const focused = modalBody.contains(document.activeElement) ? document.activeElement : null;
  const attribute = ["data-return-clan-reinforcement", "data-support-jump", "data-player-profile-uid", "data-close-marches", "data-active-operations-tab"].find(name => focused?.hasAttribute(name));
  const value = attribute ? focused.getAttribute(attribute) : null;
  return {
    scroll: ledger.scrollTop, attribute, value,
    index: attribute ? [...modalBody.querySelectorAll(`[${attribute}]`)].filter(element => element.getAttribute(attribute) === value).indexOf(focused) : -1,
    scrollFocused: focused === ledger,
  };
}
function bindReinforcementsActivityView(previous) {
  const ledger = modalBody.querySelector(".support-ledger");
  if (!ledger) return;
  modalBody.querySelectorAll("[data-support-jump]").forEach(button => button.addEventListener("click", () => {
    modalBody.querySelector(`#support-${button.dataset.supportJump}`)?.scrollIntoView({ block: "start", behavior: "instant" });
    ledger.focus({ preventScroll: true });
  }));
  if (!previous) return;
  ledger.scrollTop = previous.scroll;
  if (previous.attribute) {
    const replacement = [...modalBody.querySelectorAll(`[${previous.attribute}]`)].filter(element => element.getAttribute(previous.attribute) === previous.value)[previous.index];
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
    else ledger.focus({ preventScroll: true });
  } else if (previous.scrollFocused) ledger.focus({ preventScroll: true });
}
