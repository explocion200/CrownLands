"use strict";
(() => {
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const icons = {
    coin: '<ellipse cx="10" cy="8" rx="6" ry="3"/><path d="M4 8v7c0 4 12 4 12 0V8M4 12c0 4 12 4 12 0M17 8c5 0 6 6 3 9-1 1-2 2-4 2"/>',
    city: '<path d="M3 21V9h5v12m8 0V9h5v12M8 21V7l4-5 4 5v14M2 9l3-5 4 5m6 0 3-5 4 5M1 21h22M10 21v-5a2 2 0 0 1 4 0v5M11 9h2m-2 3h2M5 12v3m14-3v3"/>',
    troops: '<path d="M8 9V6a4 4 0 0 1 8 0v3M7 9h10v3H7zM9 12v3l3 2 3-2v-3M8 16l-4 2v4m12-6 4 2v4M9 19l3 2 3-2M12 2v6"/>',
    wall: '<path d="M3 21V6h4v4h3V6h4v4h3V6h4v15ZM3 15h18M8 10v5m8 0v6M8 18v3"/>',
    ledger: '<path d="M5 3h13l2 2v16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 0v18m3-13h7m-7 4h7m-7 4h4"/>',
    upgrade: '<path d="m4 16 9-9m-2-4 3-2 7 7-2 3-4-4M3 16l4 4-3 3-3-3ZM14 15v7m-4-3 4-4 4 4"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>'
  };
  all("[data-icon]").forEach(element => {
    element.setAttribute("aria-hidden", "true");
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[element.dataset.icon]}</svg>`;
  });
  const cityPanel = $("#cityPanel");
  const landscape = matchMedia("(orientation: landscape)");
  function openCity() {
    if (!landscape.matches || cityPanel.open) return;
    cityPanel.showModal();
    $("#closeCity").focus({ preventScroll: true });
  }
  $("#reopenCity").addEventListener("click", openCity);
  $("#closeCity").addEventListener("click", () => cityPanel.close());
  cityPanel.addEventListener("close", () => {
    if (landscape.matches) $("#reopenCity").focus({ preventScroll: true });
  });
  $("#innerCastle").addEventListener("click", () => {
    const notice = $("#cityNotice");
    notice.textContent = "This entry leads to Inner Castle in the game. This design study covers City Details only.";
    notice.hidden = false;
    notice.scrollIntoView({ block: "nearest" });
  });
  const tabs = all(".ledger-tabs [role=tab]");
  function selectTab(tab) {
    tabs.forEach(candidate => {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      $(`#${candidate.getAttribute("aria-controls")}`).hidden = !selected;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[1 - index];
      selectTab(next);
      next.focus();
    });
  });
  // Synthetic interaction values only; these are not game economy rules.
  const query = new URLSearchParams(location.search);
  const states = new Set(["ready", "pending", "success", "error", "disabled"]);
  const initialState = states.has(query.get("state")) ? query.get("state") : "ready";
  let state = initialState;
  let gold = state === "disabled" ? 320 : 84620;
  let level = 24;
  let amount = "1";
  const sampleCost = 640;
  function levelsToAdd() {
    return amount === "max"
      ? Math.max(0, Math.min(50 - level, Math.floor(gold / sampleCost)))
      : Math.min(Number(amount), 50 - level);
  }
  function renderUpgrade() {
    const count = levelsToAdd();
    const cost = count * sampleCost;
    const insufficient = cost > gold || count === 0;
    const pending = state === "pending";
    const available = gold.toLocaleString("en-US");
    cityPanel.dataset.state = state;
    $("#cityLevel").textContent = level;
    $("#upgradeCost").textContent = cost.toLocaleString("en-US");
    $("#upgradeLabel").textContent = pending ? "Developing…"
      : level === 50 ? "Sample limit reached"
      : insufficient ? "More gold needed"
      : state === "error" ? "Try upgrade again"
      : `Upgrade to level ${level + count}`;
    $("#upgradeButton").disabled = pending || insufficient;
    $("#upgradeButton").setAttribute("aria-busy", String(pending));
    all("[data-amount]").forEach(button => {
      button.disabled = pending || level === 50;
      button.setAttribute("aria-pressed", String(button.dataset.amount === amount));
    });
    // Keep affordability visible within City Details after removing the HUD.
    $("#actionFeedback").textContent = pending ? `Developing… Available: ${available} gold.`
      : state === "error" ? `Upgrade failed. Gold unchanged: ${available}.`
      : state === "success" ? `City now level ${level}. Available: ${available} gold.`
      : insufficient ? level === 50 ? `Study limit reached. Available: ${available} gold.`
      : `Not enough gold. Available: ${available}.`
      : `Available: ${available} gold.`;
  }
  all("[data-amount]").forEach(button => button.addEventListener("click", () => {
    amount = button.dataset.amount;
    state = initialState === "error" ? "error" : "ready";
    renderUpgrade();
  }));
  $("#upgradeButton").addEventListener("click", () => {
    if ($("#upgradeButton").disabled) return;
    const count = levelsToAdd();
    state = "pending";
    renderUpgrade();
    setTimeout(() => {
      if (initialState === "error") state = "error";
      else { gold -= count * sampleCost; level += count; state = "success"; }
      renderUpgrade();
    }, 650);
  });
  if (initialState === "success") { level = 25; gold -= sampleCost; }
  renderUpgrade();
  let restoreCity = true;
  function orientationChanged() {
    $("#previewSurface").inert = !landscape.matches;
    if (!landscape.matches) {
      restoreCity = cityPanel.open || restoreCity;
      if (cityPanel.open) cityPanel.close();
      $("#orientation").focus({ preventScroll: true });
    } else if (restoreCity) { openCity(); restoreCity = false; }
  }
  landscape.addEventListener("change", orientationChanged);
  orientationChanged();
})();
