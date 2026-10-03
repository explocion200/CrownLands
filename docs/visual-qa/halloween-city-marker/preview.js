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
const markerControls = Object.fromEntries(["relationship", "primary", "secondary", "symbol", "level", "border", "motion"].map(id => [id, document.getElementById(id)]));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function updateMarkerMotion() {
  markerRoot.querySelectorAll(".marker").forEach(host => {
    host.dataset.motion = !document.hidden && !reducedMotion.matches && markerControls.motion.checked
      && markerControls.border.checked && host.dataset.visible === "true" && !host.dataset.state ? "on" : "off";
  });
}
// Reuse the approved city-bat shapes; only the outer HTML wrappers animate.
function markerDecoration() {
  const wing = "M33 23C24 18 14 9 2 7C6 14 8 23 5 29C12 23 16 25 17 32C22 26 27 28 28 35L35 29ZM37 23C46 18 56 9 68 7C64 14 62 23 65 29C58 23 54 25 53 32C48 26 43 28 42 35L35 29Z";
  const body = "M31 21L30 13L34 17Q35 16 36 17L40 13L39 22Q41 29 37 33L35 39L33 33Q29 29 31 21Z";
  const bat = `<span class="border-bat"><span class="border-wing"><svg viewBox="0 0 70 48"><path d="${wing}"/></svg></span><svg viewBox="0 0 70 48"><path d="${body}"/></svg></span>`;
  return `<span data-halloween-border="" aria-hidden="true"><img class="ornate-frame" src="ornate-frame.png" alt=""><span class="lantern-glow lantern-left"></span><span class="lantern-glow lantern-right"></span><span class="lantern-glow lantern-bottom"></span><span class="border-flight flight-left">${bat}</span><span class="border-flight flight-right">${bat}</span></span>`;
}
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
  if (reducedMotion.matches) document.getElementById("state-label").textContent += " · Reduced motion enabled";
  updateMarkerMotion();
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
  const visibility = new IntersectionObserver(entries => {
    entries.forEach(entry => { entry.target.dataset.visible = String(entry.isIntersecting); });
    updateMarkerMotion();
  });
  markerRoot.querySelectorAll(".marker").forEach((host, index) => {
    host.innerHTML = source.replaceAll("hcm-", `hcm${index}-`) + markerDecoration();
    visibility.observe(host);
  });
  Object.values(markerControls).forEach(control => control.addEventListener("input", updateMarkerPreview));
  reducedMotion.addEventListener("change", updateMarkerPreview);
  document.addEventListener("visibilitychange", updateMarkerMotion);
  await Promise.all([...markerRoot.querySelectorAll("img")].map(img => img.decode()));
  updateMarkerPreview(); document.documentElement.dataset.previewReady = "true";
})().catch(error => { document.getElementById("state-label").textContent = error.message; document.documentElement.dataset.previewReady = "error"; });
