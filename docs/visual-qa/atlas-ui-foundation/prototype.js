"use strict";
(() => {
  const $ = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const fixture = window.ATLAS_FIXTURE;
  const asset = path => `../../../${path}`;
  const paths = {
    coin: '<ellipse cx="10" cy="8" rx="6" ry="3"/><path d="M4 8v7c0 4 12 4 12 0V8M4 12c0 4 12 4 12 0M17 8c5 0 6 6 3 9-1 1-2 2-4 2"/>',
    city: '<path d="M3 21V9h5v12m8 0V9h5v12M8 21V7l4-5 4 5v14M2 9l3-5 4 5m6 0 3-5 4 5M1 21h22M10 21v-5a2 2 0 0 1 4 0v5M11 9h2m-2 3h2M5 12v3m14-3v3"/>',
    troops: '<path d="M8 9V6a4 4 0 0 1 8 0v3M7 9h10v3H7zM9 12v3l3 2 3-2v-3M8 16l-4 2v4m12-6 4 2v4M9 19l3 2 3-2M12 2v6"/>',
    wall: '<path d="M3 21V6h4v4h3V6h4v4h3V6h4v15ZM3 15h18M8 10v5m8 0v6M8 18v3"/>',
    ledger: '<path d="M5 3h13l2 2v16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 0v18m3-13h7m-7 4h7m-7 4h4"/>',
    upgrade: '<path d="m4 16 9-9m-2-4 3-2 7 7-2 3-4-4M3 16l4 4-3 3-3-3ZM14 15v7m-4-3 4-4 4 4"/>',
    map: '<path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3Zm6-3v17M16 5v17m-6-10 4 3m-4 0 4-3"/>',
    scroll: '<path d="M6 4h13a3 3 0 0 1 0 6h-2V7M6 4a3 3 0 0 0-3 3h11v12a3 3 0 0 1-6 0H2a3 3 0 0 0 3 3h6m-5-15v9m2-5h3m-3 3h3"/>',
    shield: '<path d="M3 4 12 1l9 3v7c0 6-9 12-9 12S3 17 3 11ZM12 5v13M7 9h10"/>',
    bag: '<path d="m8 7-2-5 6 2 6-2-2 5m-8 0h8M8 9c-8 10-5 13 4 13S24 19 16 9M9 11h6M12 13v6m-2-2h4"/>',
    scale: '<path d="M12 2v19M6 22h12M3 7l9-3 9 3M5 7l-4 8h8Zm14 0-4 8h8ZM1 15c0 4 8 4 8 0m6 0c0 4 8 4 8 0"/>',
    quill: '<path d="M3 22C6 15 10 8 20 2c3 7-4 15-11 14M5 18l12-12m-5 3 3 2m-6 1 3 2M3 22h14"/>',
    home: '<path d="m2 11 10-9 10 9M5 9v13h14V9M9 22v-9h6v9M3 5h5"/>',
    route: '<path d="M4 20c15 0 15-8 8-8S4 4 19 4m-4-3 4 3-4 3"/><circle cx="4" cy="20" r="2"/>',
    attack: '<path d="m3 2 5 2 10 13-3 2L4 7Zm11 17 6-5m-1 4 3 4M21 2l-5 2-5 6m-3 5-2 3 3 2m-6-6 7 6m-5-2-3 4"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9 8c0-4 7-4 7 0 0 3-4 3-4 6m0 4h.01"/>',
    fullscreen: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>'
  };
  all("[data-icon]").forEach(element => {
    element.setAttribute("aria-hidden", "true");
    element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[element.dataset.icon] || paths.map}</svg>`;
  });
  const world = $("#world");
  world.style.backgroundImage = `url("${asset(fixture.map)}")`;
  for (const item of fixture.scenery) {
    const image = document.createElement("img");
    image.className = "scenery";
    image.alt = "";
    image.src = asset(item.asset);
    Object.assign(image.style, { left: `${item.x}px`, top: `${item.y}px`, width: `${item.w}px`, height: `${item.h}px` });
    world.append(image);
  }
  const markers = fixture.cities.map((city, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `map-city ${city.owned ? "owned" : "neutral"}${index === 0 ? " selected" : ""}`;
    button.setAttribute("aria-label", `${city.name}, level ${city.level}, ${city.owned ? "your main city" : "neutral city"}`);
    button.style.left = `${city.x}px`;
    button.style.top = `${city.y}px`;
    button.innerHTML = `<span class="city-ring" aria-hidden="true"></span><img src="${asset(fixture.stages[city.stage])}" alt=""><span class="map-city-level">${city.level}</span><span class="map-city-name"></span>`;
    button.querySelector(".map-city-name").textContent = city.name;
    button.addEventListener("click", () => index === 0 ? openCity() : showNote(city.name, "This neutral city is a sample map marker. Its conquest panel will be explored in the next design study."));
    world.append(button);
    return button;
  });
  $("#detailArt").src = asset(fixture.stages[3]);
  const cityPanel = $("#cityPanel");
  const notePanel = $("#notePanel");
  const landscape = matchMedia("(orientation: landscape)");
  let camera = { x: 0, y: 0, scale: 1 };
  function drawMap() {
    camera.x = Math.min(0, Math.max(innerWidth - fixture.width * camera.scale, camera.x));
    camera.y = Math.min(0, Math.max(innerHeight - fixture.height * camera.scale, camera.y));
    world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
  }
  function home() {
    camera.scale = Math.max(innerWidth / fixture.width, innerHeight / fixture.height, .72);
    const clearWidth = cityPanel.open && innerWidth > 680 ? innerWidth - (innerWidth < 1100 || innerHeight < 650 ? 358 : 410) : innerWidth;
    camera.x = clearWidth * .55 - fixture.cities[0].x * camera.scale;
    camera.y = innerHeight * .49 - fixture.cities[0].y * camera.scale;
    drawMap();
  }
  function zoom(multiplier) {
    const oldScale = camera.scale;
    camera.scale = Math.max(innerWidth / fixture.width, innerHeight / fixture.height, Math.min(2.3, oldScale * multiplier));
    camera.x = innerWidth / 2 - (innerWidth / 2 - camera.x) * camera.scale / oldScale;
    camera.y = innerHeight / 2 - (innerHeight / 2 - camera.y) * camera.scale / oldScale;
    drawMap();
  }
  $("#zoomIn").addEventListener("click", () => zoom(1.2));
  $("#zoomOut").addEventListener("click", () => zoom(1 / 1.2));
  $("#homeButton").addEventListener("click", home);
  $("#rulerButton").addEventListener("click", openCity);
  $("#citiesButton").addEventListener("click", openCity);
  let drag;
  $("#mapViewport").addEventListener("pointerdown", event => {
    if (event.target.closest("button") || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  $("#mapViewport").addEventListener("pointermove", event => {
    if (!drag) return;
    camera.x = drag.cameraX + event.clientX - drag.x;
    camera.y = drag.cameraY + event.clientY - drag.y;
    drawMap();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) $("#mapViewport").addEventListener(event, () => { drag = null; });
  $("#mapViewport").addEventListener("wheel", event => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  let returnFocus;
  function openCity() {
    if (!landscape.matches || cityPanel.open) return;
    returnFocus = document.activeElement;
    cityPanel.showModal();
    $("#closeCity").focus({ preventScroll: true });
    home();
  }
  $("#closeCity").addEventListener("click", () => cityPanel.close());
  cityPanel.addEventListener("close", () => {
    home();
    if (returnFocus && returnFocus !== document.body) returnFocus.focus({ preventScroll: true });
    else $("#citiesButton").focus({ preventScroll: true });
  });
  const noteCopy = {
    incoming: ["Incoming attack", "One sample army is approaching Wyvernmarket Mead. The alert combines a crossed-swords icon, explicit text and a burgundy edge. The countdown is static in this study."],
    outgoing: ["Armies on the road", "Two sample armies are marching. Their destinations, recall controls and arrival states belong to the next panel study."],
    reports: ["Reports", "Three sample reports are waiting. Combat reports and the report list have not been redesigned yet."],
    clan: ["Clan", "The clan screen is part of the later UI audit rollout. This button previews its navigation icon and touch target."],
    bag: ["Bag", "Inventory, item artwork and item actions are planned as a separate study after the shared HUD and city controls."],
    shop: ["Shop", "The shop is outside this study. No purchase or game connection is available here."],
    chat: ["Realm chronicle", "The message strip contains invented sample text. Chat input, moderation and message history are outside this study."],
    help: ["Explore the study", "Drag the map or use the zoom buttons. Open your city with its marker or Cities. Try the city tabs, upgrade amounts and feedback states. All values are invented; nothing is saved or sent to the game."],
    castle: ["Inner Castle", "This link establishes the route from City Details. The castle interior and its artwork will receive their own study after this foundation is reviewed."]
  };
  function showNote(title, copy) {
    $("#noteTitle").textContent = title;
    $("#noteBody").replaceChildren();
    const paragraph = document.createElement("p");
    paragraph.textContent = copy;
    $("#noteBody").append(paragraph);
    notePanel.showModal();
    $("#closeNote").focus({ preventScroll: true });
  }
  all("[data-popover]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.popover === "map") return home();
    showNote(...noteCopy[button.dataset.popover]);
  }));
  $("#helpButton").addEventListener("click", () => showNote(...noteCopy.help));
  $("#innerCastle").addEventListener("click", () => showNote(...noteCopy.castle));
  $("#closeNote").addEventListener("click", () => notePanel.close());
  $("#fullscreenButton").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { showNote("Open at full size", "Use Open at full size in the review toolbar. This embedded preview does not have permission to enter fullscreen."); }
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
      selectTab(next); next.focus();
    });
  });
  // Intentionally synthetic interaction math; these are NOT game economy rules.
  const query = new URLSearchParams(location.search);
  const states = new Set(["ready", "pending", "success", "error", "disabled"]);
  const initialState = states.has(query.get("state")) ? query.get("state") : "ready";
  let state = initialState;
  let gold = state === "disabled" ? 320 : 84620;
  let level = 24;
  let amount = "1";
  let completed = 0;
  const sampleCost = 640;
  function levelsToAdd() { return amount === "max" ? Math.max(0, Math.min(50 - level, Math.floor(gold / sampleCost))) : Math.min(Number(amount), 50 - level); }
  function renderUpgrade() {
    const count = levelsToAdd();
    const cost = count * sampleCost;
    const insufficient = cost > gold || count === 0;
    const pending = state === "pending";
    cityPanel.dataset.state = state;
    $("#goldCount").textContent = gold.toLocaleString("en-US");
    $("#cityLevel").textContent = level;
    markers[0].querySelector(".map-city-level").textContent = level;
    markers[0].setAttribute("aria-label", `Wyvernmarket Mead, level ${level}, your main city`);
    $("#upgradeCost").textContent = cost.toLocaleString("en-US");
    $("#upgradeLabel").textContent = pending ? "Developing…" : level === 50 ? "Sample limit reached" : insufficient ? "More gold needed" : state === "error" ? "Try upgrade again" : `Upgrade to level ${level + count}`;
    $("#upgradeButton").disabled = pending || insufficient;
    $("#upgradeButton").setAttribute("aria-busy", String(pending));
    all("[data-amount]").forEach(button => {
      button.disabled = pending || level === 50;
      button.setAttribute("aria-pressed", String(button.dataset.amount === amount));
    });
    $("#actionFeedback").textContent = pending ? "Sample request in progress…" : state === "error" ? "Sample request failed. Your gold was not spent." : state === "success" ? `Added ${completed} ${completed === 1 ? "level" : "levels"}. Your city is now level ${level}.` : insufficient ? level === 50 ? "This study stops at level 50." : `Sample treasury: ${gold.toLocaleString("en-US")} gold. Not enough for an upgrade.` : "Gold is available in your treasury.";
  }
  all("[data-amount]").forEach(button => button.addEventListener("click", () => { amount = button.dataset.amount; state = initialState === "error" ? "error" : "ready"; renderUpgrade(); }));
  $("#upgradeButton").addEventListener("click", () => {
    if ($("#upgradeButton").disabled) return;
    const count = levelsToAdd();
    state = "pending"; renderUpgrade();
    setTimeout(() => {
      if (initialState === "error") state = "error";
      else { gold -= count * sampleCost; level += count; completed = count; state = "success"; }
      renderUpgrade();
    }, 650);
  });
  if (initialState === "success") { level = 25; gold -= sampleCost; completed = 1; }
  renderUpgrade();
  let restoreCity = query.get("view") !== "map";
  function orientationChanged() {
    if (!landscape.matches) {
      restoreCity = cityPanel.open || restoreCity;
      if (notePanel.open) notePanel.close();
      if (cityPanel.open) cityPanel.close();
      $(".orientation").setAttribute("role", "status");
    } else if (restoreCity) { openCity(); restoreCity = false; }
    home();
  }
  landscape.addEventListener("change", orientationChanged);
  addEventListener("resize", home);
  orientationChanged();
})();
