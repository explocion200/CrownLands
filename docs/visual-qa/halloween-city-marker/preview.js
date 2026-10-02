"use strict";
// Preview only: state choices exercise existing colors, not new power rules.
const markerStates = {
  owned: { label: "Your city", color: "--cl-player-owned", ink: "--cl-text" },
  main: { label: "Your main city", color: "--cl-main-city" },
  clan: { label: "Clan ally", color: "--cl-clan" },
  weaker: { label: "Weaker / protected", color: "--cl-enemy-weaker" },
  equal: { label: "In range", color: "--cl-enemy-equal" },
  stronger: { label: "Stronger", color: "--cl-enemy-stronger" },
  unknown: { label: "Strength unknown", color: "#817665" },
  neutral: { label: "Neutral", color: "--cl-neutral" },
};
const markerRoot = document.querySelector("main");
const markerControls = Object.fromEntries(["relationship", "primary", "secondary", "symbol", "level", "border"].map(id => [id, document.getElementById(id)]));
function markerColor(token) { return token.startsWith("--") ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : token; }
function updateMarkerPreview() {
  const selected = markerControls.relationship.value;
  const level = Math.max(1, Math.min(999, Math.round(Number(markerControls.level.value) || 1)));
  markerRoot.querySelectorAll(".marker").forEach(host => {
    const state = markerStates[host.dataset.state || selected];
    host.style.setProperty("--city-tone", markerColor(state.color));
    host.style.setProperty("--level-ink", markerColor(state.ink || "--cl-text-bright"));
    for (const id of ["primary", "secondary", "symbol"]) host.style.setProperty(`--flag-${id}`, markerControls[id].value);
    host.querySelector("[data-city-level]").textContent = String(level);
    host.querySelector("[data-halloween-border]").style.display = markerControls.border.checked ? "" : "none";
  });
  document.getElementById("state-label").textContent = markerStates[selected].label + " · Player flag colors are independent";
}
(async () => {
  const response = await fetch("marker.svg");
  if (!response.ok) throw Error("Marker draft could not be loaded");
  const source = await response.text();
  const examples = document.getElementById("color-examples");
  for (const state of ["owned", "clan", "weaker", "equal", "stronger"]) {
    const example = document.createElement("div"); example.className = "example";
    const marker = document.createElement("div"); marker.className = "marker"; marker.dataset.state = state;
    const label = document.createElement("span"); label.textContent = markerStates[state].label;
    example.append(marker, label); examples.append(example);
  }
  markerRoot.querySelectorAll(".marker").forEach((host, index) => { host.innerHTML = source.replaceAll("hcm-", `hcm${index}-`); });
  Object.values(markerControls).forEach(control => control.addEventListener("input", updateMarkerPreview));
  updateMarkerPreview(); document.documentElement.dataset.previewReady = "true";
})().catch(error => { document.getElementById("state-label").textContent = error.message; document.documentElement.dataset.previewReady = "error"; });
