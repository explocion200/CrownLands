/* Shared dialog presentation. Gameplay and action authority remain in game.js. */
/* exported captureUiRefreshState, patchOperationModalText, patchCityListPanel, formatCityListCost, installGameModalLifecycle, updateOnboardingMapTipVisibility, observeOnboardingOverlays */

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
