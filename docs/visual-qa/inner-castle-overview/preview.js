"use strict";
// Isolated review of synthetic, captured markup. No game or account code is loaded.
let snapshot, selectedKey = "great-hall", toastTimer;
const settings = { layout: new URLSearchParams(location.search).get("layout") === "current" ? "current" : "draft" };
const ordinals = ["I", "II", "III", "IV", "V", "VI"];
const draftHubArt = "docs/visual-qa/inner-castle-overview/art/royal-bailey-ink-wash-v1.png";
const mobileLandscape = matchMedia("(orientation: landscape) and (max-height: 550px)");
const signFrame = `<svg class="bailey-sign-frame" viewBox="0 0 160 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path class="sign-hangers" d="M32 3v17M128 3v17M29 4h6m90 0h6"/>
  <path class="sign-board" d="M12 15h136l-2 7 9 6-6 8 4 12-9 8H16l-9-8 4-12-6-8 9-6Z"/>
  <path class="sign-inlay" d="M20 20h120l-2 5 8 5-5 7 3 9-4 5H20l-4-5 3-9-5-7 8-5Z"/>
  <path class="sign-grain" d="M22 25h28m-25 4h18m63 17h29m-13-21h14M29 47h13m17-27h37M54 52h54"/>
  <circle class="sign-rivet" cx="24" cy="35" r="2"/><circle class="sign-rivet" cx="136" cy="35" r="2"/>
</svg>`;
const drawings = {
  treasury: '<path class="surface" d="M4 13h24v15H4ZM4 13V8l4-4h16l4 4v5Z"/><path class="shadow" d="M23 5h4v23h-4Z"/><path d="M4 13h24M9 5v23m14-23v23"/><path class="ink" d="M13 11h6v8h-6Z"/><path class="fine" d="M6 23h2m4 2h8m-7-4h3"/>',
  "great-hall": '<path class="surface" d="M3 28V9h3V5h4v4h3V5h6v4h3V5h4v4h3v19Z"/><path class="shadow" d="M24 10h5v18h-5ZM3 25h26v3H3Z"/><path d="M11 10v17M21 10v17M3 16h8m10 0h8"/><path class="ink" d="M13 27v-8c0-5 6-5 6 0v8ZM6 11h2v3H6Zm18 0h2v3h-2Z"/><path class="fine" d="M5 21h4m14 0h4M15 11h2"/>',
  barracks: '<path class="surface" d="M8 18v7l8 5 8-5v-7ZM6 16 8 9q3-6 8-6t8 6l2 7Z"/><path class="shadow" d="M18 4q6 3 7 12h-6ZM19 20h5v5l-8 5v-5Z"/><path class="ink" d="m5 14 22 1 3 3-1 2H3l-1-2ZM11 21h4v2h-4Zm6 0h4v2h-4Z"/><path d="m16 5-1 8m1 8v5"/><path class="fine" d="m10 25 2 2m7 0 2-2"/>',
  alehouse: '<path class="surface" d="M5 7h17l-1 22H6ZM22 10h5l2 3v9l-3 3h-5v-4h3l1-2v-4l-1-1h-2Z"/><path class="shadow" d="M17 8h5l-1 21h-5Z"/><path d="M5 11h17M6 25h15M10 12v12m7-12v12"/><path class="surface" d="M4 7q0-5 5-4 3-3 6 0 6-1 8 4Z"/><path class="fine" d="m12 15 1 6m-6-3 1 3"/>',
  gatehouse: '<path class="surface" d="M3 28V8h3V4h4v4h3V5h6v3h3V4h4v4h3v20Z"/><path class="shadow" d="M25 9h4v19h-4Z"/><path d="M11 9v18m10-18v18M3 17h8m10 0h8"/><path class="surface" d="M12 28V18a4 4 0 0 1 8 0v10Z"/><path d="M14 17v11m4-11v11m-6-7h8m-8 4h8"/><path class="fine" d="M5 11h3m16 0h3M5 22h4m14 0h4"/>',
  "royal-stables": '<path class="surface" d="M9 3C-1 12 3 29 16 30 29 29 33 12 23 3l-5 3c8 7 5 17-2 18C9 23 6 13 14 6Z"/><path class="shadow" d="M25 7c7 17-4 24-13 22 14 1 17-14 10-23Z"/><path d="m9 7 2 1m-5 5 2 1m-2 6 2-1m1 7 1-2m11-17 2-1m1 7 2-1m-2 6 2 1m-4 5 1 2"/>'
};
function icon(key) { return `<svg class="bailey-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${drawings[key]}</svg>`; }
function escapeText(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function toast(message) {
  clearTimeout(toastTimer);
  let node = document.querySelector(".draft-toast");
  if (!node) { node = document.createElement("div"); node.className = "draft-toast"; node.setAttribute("role", "status"); document.getElementById("modal").append(node); }
  node.textContent = message; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 3000);
}
function details(building) {
  return `<div class="bailey-building-heading"><span class="bailey-eyebrow">Selected building</span><h3>${icon(building.key)}${escapeText(building.label)}</h3></div>
    <img class="bailey-building-art" src="${building.artSrc}" alt="${escapeText(building.label)} artwork" draggable="false">
    <div class="bailey-building-copy"><p class="bailey-role">${escapeText(building.role)}</p>
    <p class="bailey-status${building.characterRole ? " available" : ""}">${building.characterRole ? `${escapeText(building.characterRole)} gear and bonuses` : "Not yet available"}</p>
    ${building.newGear ? '<p class="bailey-new-note"><b aria-hidden="true">!</b> New gear</p>' : ""}
    ${building.characterRole ? `<button type="button" class="bailey-manage" data-manage-common-gear="${building.key}">Manage Gear <span aria-hidden="true">→</span></button>` : ""}</div>`;
}
function draftMarkup() {
  const current = snapshot.buildings.find(building => building.key === selectedKey);
  return `<dialog id="modal" class="bailey-modal" aria-labelledby="baileyTitle"><div class="bailey-shell">
    <header class="bailey-header"><div class="bailey-seal">${icon("great-hall")}</div><div><p>${escapeText(snapshot.cityName)} <span>· Main City</span></p><h2 id="baileyTitle">Inner Castle</h2></div><button id="closeModalBtn" type="button" aria-label="Close Inner Castle">×</button></header>
    <div class="bailey-content"><section class="bailey-overview" aria-labelledby="baileySceneTitle">
      <div class="bailey-section-heading"><h3 id="baileySceneTitle">The Royal Bailey</h3><span>Select a building</span></div>
      <div class="bailey-map-space"><div class="bailey-scene"><img src="${draftHubArt}" alt="The Royal Bailey inside ${escapeText(snapshot.cityName)}" draggable="false">
      ${snapshot.buildings.map(building => `<button class="bailey-pin" type="button" data-building="${building.key}" aria-label="Preview ${escapeText(building.label)}${building.newGear ? "; new gear" : ""}" aria-controls="baileyDetails" aria-pressed="${building.key === selectedKey}" style="--x:${building.hotspot.left}%;--y:${building.hotspot.top}%">${signFrame}<span class="bailey-pin-name">${escapeText(building.label)}</span>${building.newGear ? '<b class="bailey-alert" aria-hidden="true">!</b>' : ""}</button>`).join("")}</div></div>
      <nav class="bailey-directory" aria-label="Inner Castle buildings">${snapshot.buildings.map((building, index) => `<button type="button" data-building="${building.key}" aria-controls="baileyDetails" aria-pressed="${building.key === selectedKey}"><span class="bailey-number" aria-hidden="true">${ordinals[index]}</span>${icon(building.key)}<span class="bailey-label">${escapeText(building.label)}</span>${building.newGear ? '<b class="bailey-directory-alert" aria-label="New gear">!</b>' : ""}</button>`).join("")}</nav>
    </section><aside class="bailey-detail-tray" aria-label="Selected building preview"><div id="baileyDetails" aria-live="polite" aria-atomic="true">${details(current)}</div></aside></div>
    <footer class="bailey-footer"><button type="button" data-inner-castle-back><span aria-hidden="true">←</span> Back to City Details</button><p>Explore the Royal Bailey. Building functions and upgrades will arrive in a future update.</p></footer>
  </div></dialog>`;
}
function arrangeLandscapeControls() {
  if (settings.layout !== "draft") return;
  const modal = document.getElementById("modal");
  if (!modal) return;
  const footer = modal.querySelector(".bailey-footer");
  const back = modal.querySelector("[data-inner-castle-back]");
  const notice = modal.querySelector(".bailey-notice") || footer.querySelector("p");
  notice.classList.add("bailey-notice");
  if (mobileLandscape.matches) {
    modal.querySelector(".bailey-header").insertBefore(back, modal.querySelector("#closeModalBtn"));
    modal.querySelector(".bailey-detail-tray").append(notice);
  } else {
    footer.append(back, notice);
  }
  footer.hidden = mobileLandscape.matches;
}
function selectBuilding(key) {
  const building = snapshot.buildings.find(item => item.key === key);
  if (!building) return;
  selectedKey = key;
  document.querySelectorAll("[data-building],[data-inner-castle-building]").forEach(button => {
    const selected = (button.dataset.building || button.dataset.innerCastleBuilding) === key;
    button.setAttribute("aria-pressed", String(selected)); button.classList.toggle("selected", selected);
  });
  const target = document.getElementById(settings.layout === "draft" ? "baileyDetails" : "innerCastlePreview");
  target.innerHTML = settings.layout === "draft" ? details(building) : building.preview;
}
function render() {
  if (!snapshot) return;
  document.documentElement.dataset.layout = settings.layout;
  document.body.innerHTML = snapshot.icons + (settings.layout === "draft" ? draftMarkup() : snapshot.html);
  arrangeLandscapeControls();
  const modal = document.getElementById("modal"); modal.removeAttribute("open"); modal.showModal();
  selectBuilding(selectedKey);
  modal.addEventListener("cancel", event => { event.preventDefault(); toast("Layout preview · use the comparison controls above."); });
}
document.addEventListener("click", event => {
  const button = event.target.closest("button,a"); if (!button) return;
  event.preventDefault();
  const key = button.dataset.building || button.dataset.innerCastleBuilding;
  if (key) { selectBuilding(key); return; }
  if (button.dataset.manageCommonGear) { toast("Layout preview · Manage Gear opens this building’s existing equipment screen in the game."); return; }
  if (button.hasAttribute("data-inner-castle-back")) { toast("Layout preview · returns to the City Details you entered from."); return; }
  toast("Layout preview · use the comparison controls above.");
});
document.addEventListener("submit", event => event.preventDefault());
mobileLandscape.addEventListener("change", arrangeLandscapeControls);
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== "castle-overview-preview") return;
  if (!["draft", "current"].includes(event.data.layout) || event.data.layout === settings.layout) return;
  settings.layout = event.data.layout; render();
});
fetch("docs/visual-qa/inner-castle-overview/snapshot.json").then(response => {
  if (!response.ok) throw Error("Could not load the local castle sample.");
  return response.json();
}).then(async data => {
  snapshot = data;
  document.head.insertAdjacentHTML("beforeend", data.styles.join(""));
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "docs/visual-qa/inner-castle-overview/draft.css"; document.head.append(css);
  await Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link => new Promise((resolve, reject) => {
    if (link.sheet) resolve(); else { link.onload = resolve; link.onerror = () => reject(Error("Could not load a preview stylesheet.")); }
  })));
  render(); document.documentElement.dataset.ready = "true";
}).catch(error => { document.body.textContent = error.message; });
