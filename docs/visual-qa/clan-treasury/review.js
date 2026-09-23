"use strict";
const frame = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const query = new URLSearchParams(location.search);
const viewports = { desktop: [1440, 900], landscape: [844, 390], small: [568, 320] };
let viewport = Object.hasOwn(viewports, query.get("viewport")) ? query.get("viewport") : "desktop";
const sample = document.getElementById("sample");
if ([...sample.options].some(option => option.value === query.get("sample"))) sample.value = query.get("sample");
function updateUrl() {
  const params = new URLSearchParams({ viewport, sample: sample.value });
  history.replaceState(null, "", "?" + params);
  document.getElementById("fullWindow").href = "preview.html?" + params;
}
function resize() {
  const [width, height] = viewports[viewport];
  for (const element of [frame, canvas]) Object.assign(element.style, { width: width + "px", height: height + "px" });
  document.getElementById("dimensions").textContent = `${width} × ${height} · 1:1 preview`;
  document.querySelectorAll("[data-viewport]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.viewport === viewport)));
  updateUrl();
}
function reset() {
  updateUrl();
  frame.contentWindow.postMessage({ type: "treasury-review", sample: sample.value }, location.origin);
}
document.querySelectorAll("[data-viewport]").forEach(button => button.addEventListener("click", () => { viewport = button.dataset.viewport; resize(); }));
sample.addEventListener("change", reset);
document.getElementById("reset").addEventListener("click", reset);
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === "treasury-status") document.getElementById("reviewStatus").textContent = event.data.message;
});
frame.addEventListener("load", reset);
resize();
frame.src = "preview.html?" + new URLSearchParams({ sample: sample.value });
