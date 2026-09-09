"use strict";
(() => {
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  // City-only woodcut pictograms: solid silhouettes, shallow ink washes and
  // restrained hatching. All marks inherit the existing semantic text colour.
  const icons = {
    coin: `<path class="engraving-surface" d="M16 3 23 5 28 10 29 17 26 24 20 28 12 29 6 25 3 19 3 12 8 6Z"/>
      <path class="engraving-shadow" d="M27 11 27 18 24 24 18 27 11 27 6 23 9 27 16 30 24 27 29 20 30 14Z"/>
      <path class="engraving-detail" d="M10 8 16 6 23 9M7 12l-1 5 3 6M22 24l3-4"/>
      <path class="engraving-ink" d="m9 11 4 3 3-6 3 6 4-3-2 10H11Z"/>
      <path d="M12 24h8"/>`,
    city: `<path class="engraving-surface" d="M3 28V9h3V5h4v4h3V5h6v4h3V5h4v4h3v19Z"/>
      <path class="engraving-shadow" d="M24 10h5v18h-5ZM3 25h26v3H3Z"/>
      <path d="M11 10v17M21 10v17M3 16h8m10 0h8"/>
      <path class="engraving-ink" d="M13 27v-8c0-5 6-5 6 0v8ZM6 11h2v3H6Zm18 0h2v3h-2Z"/>
      <path class="engraving-detail engraving-fine" d="M5 21h4m14 0h4M15 11h2M6 17v3m20-3v3"/>`,
    troops: `<path class="engraving-surface" d="M8 18v7l8 5 8-5v-7ZM6 16 8 9q3-6 8-6t8 6l2 7Z"/>
      <path class="engraving-shadow" d="M18 4q6 3 7 12h-6ZM19 20h5v5l-8 5v-5Z"/>
      <path class="engraving-ink" d="m5 14 22 1 3 3-1 2H3l-1-2ZM11 21h4v2h-4Zm6 0h4v2h-4Z"/>
      <path d="m16 5-1 8m1 8v5"/>
      <path class="engraving-detail engraving-fine" d="m10 25 2 2m0-3 2 2m5 1 2-2m-9-15 1-2"/>`,
    wall: `<path class="engraving-surface" d="M3 28 4 6h6v6h3V5h6v7h3V6h6l1 22Z"/>
      <path class="engraving-shadow" d="m25 7 3-1 1 22H3v-4h22Z"/>
      <path d="M4 18h24M5 24h23M9 12v6m9-6v6m-5 0v6m9-6v6M8 24v3m10-3v3"/>
      <path class="engraving-detail engraving-fine" d="m6 8 2-1m7 0h2M6 21h3m8-1h2"/>`,
    ledger: `<path class="engraving-surface" d="m5 7 18-4 5 3v21l-19 3-4-3Z"/>
      <path class="engraving-shadow" d="m5 7 4 2v21l-4-3Zm4 18 19-3v5L9 30Z"/>
      <path d="m5 7 4 2 19-3M9 9v20"/>
      <path class="engraving-ink" d="m10 16 17-3v4l-17 3Z"/>
      <path class="engraving-surface" d="m19 14 5-1v5l-5 1Z"/>
      <path class="engraving-detail engraving-fine" d="m12 12 5-1m-5 12 3-.5M6 12l2 1m-2 9 2 1"/>`,
    upgrade: `<path class="engraving-surface" d="m4 6 3-2 19 20 1 5-5-2Z"/>
      <path class="engraving-shadow" d="m6 7 18 19 3 3-5-2L4 8Z"/>
      <path class="engraving-surface" d="m16 11 4 4L7 30l-4-3Z"/>
      <path class="engraving-shadow" d="m18 14 2 1L7 30l-2-2Z"/>
      <path class="engraving-surface" d="m10 7 6-5 14 12-6 6Z"/>
      <path class="engraving-ink" d="m25 10 5 4-6 6-5-4Z"/>
      <path class="engraving-detail" d="m13 8 9 8M15 6l5 4"/>`,
    close: `<path class="engraving-ink" d="m7 5 9 9 9-9 2 2-9 9 9 9-2 2-9-9-9 9-2-2 9-9-9-9Z"/>
      <path class="engraving-detail" d="m6 5-1 2m20-2 2 2M5 25l2 2m18 0 2-2"/>`,
    allegiance: `<path class="engraving-surface" d="m5 4 11-1 11 1-1 14q-2 7-10 12Q8 26 6 18Z"/>
      <path class="engraving-ink" d="M14 4h4v9h8v4h-8v10l-2 2-2-2V17H6v-4h8Z"/>`
  };
  all("[data-icon]").forEach(element => {
    element.setAttribute("aria-hidden", "true");
    element.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">${icons[element.dataset.icon]}</svg>`;
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
