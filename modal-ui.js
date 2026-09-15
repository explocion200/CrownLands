/* Shared dialog presentation. Gameplay and action authority remain in game.js. */
/* exported patchOperationModalText, installGameModalLifecycle, updateOnboardingMapTipVisibility, observeOnboardingOverlays */

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
