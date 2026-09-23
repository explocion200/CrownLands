"use strict";
const preview = document.getElementById("preview");
const query = new URLSearchParams(location.search);
const sizes = [56, 64, 72];
const viewports = { desktop: [1440, 900], landscape: [844, 390], small: [568, 320] };
const state = {
  size: sizes.includes(Number(query.get("size"))) ? Number(query.get("size")) : 56,
  zoom: Math.max(40, Math.min(100, Number(query.get("zoom")) || (query.get("viewport") === "landscape" || query.get("viewport") === "small" ? 40 : 60))),
  sample: query.get("sample") === "owned" ? "owned" : "rival",
  viewport: Object.hasOwn(viewports, query.get("viewport")) ? query.get("viewport") : "window"
};
function drawControls() {
  document.querySelectorAll("[data-size]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.size) === state.size)));
  document.getElementById("zoom").value = state.zoom;
  document.getElementById("zoom-value").value = state.zoom + "%";
  document.getElementById("sample").value = state.sample;
  document.getElementById("viewport").value = state.viewport;
  const dimensions = viewports[state.viewport];
  preview.style.width = dimensions ? dimensions[0] + "px" : "100%";
  preview.style.height = dimensions ? dimensions[1] + "px" : "max(390px, calc(100dvh - 255px))";
  const params = new URLSearchParams(state);
  history.replaceState(null, "", "?" + params);
  document.getElementById("full-window").href = "preview.html?" + params;
}
function update() {
  drawControls();
  preview.contentWindow.postMessage({ type: "tower-size-settings", ...state }, location.origin);
}
document.getElementById("sizes").addEventListener("click", event => {
  const button = event.target.closest("[data-size]");
  if (button) { state.size = Number(button.dataset.size); update(); }
});
for (const id of ["zoom", "sample", "viewport"]) document.getElementById(id).addEventListener("input", event => {
  state[id] = id === "zoom" ? Number(event.target.value) : event.target.value;
  update();
});
document.getElementById("recenter").addEventListener("click", update);
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== preview.contentWindow) return;
  if (event.data?.type === "tower-size-ready") update();
  if (event.data?.type === "tower-size-measurement") {
    const { buttons, zoom, minimumZoom } = event.data;
    const zoomControl = document.getElementById("zoom");
    zoomControl.min = Math.ceil(minimumZoom * 100);
    state.zoom = Math.round(zoom * 100);
    zoomControl.value = state.zoom;
    document.getElementById("zoom-value").value = state.zoom + "%";
    document.getElementById("full-window").href = "preview.html?" + new URLSearchParams(state);
    const format = number => Number(number.toFixed(1));
    document.getElementById("measurement").textContent = buttons.length
      ? buttons.map(button => `${button.label}: ${format(button.width)} × ${format(button.height)} px`).join("  ·  ") + `  |  Map ${Math.round(zoom * 100)}%`
      : "Select the Clan Tower to show its controls, or press Recenter.";
    document.documentElement.dataset.actionSizeReviewReady = "true";
  }
});
drawControls();
preview.src = "preview.html?" + new URLSearchParams(state);
