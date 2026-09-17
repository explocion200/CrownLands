"use strict";
const frame = document.getElementById("preview"), canvas = document.getElementById("canvas");
const sample = document.getElementById("sample"), tower = document.getElementById("tower"), query = new URLSearchParams(location.search);
const sizes = {desktop: [1440, 900], landscape: [844, 390], small: [568, 320]};
let viewport = Object.hasOwn(sizes, query.get("viewport")) ? query.get("viewport") : "desktop";
let section = ["overview", "garrison", "walls", "rules"].includes(query.get("section")) ? query.get("section") : "overview";
for (const select of [sample, tower]) if ([...select.options].some(o => o.value === query.get(select.id))) select.value = query.get(select.id);
function sync() { history.replaceState(null, "", `?viewport=${viewport}&sample=${sample.value}&tower=${tower.value}&section=${section}`); }
function resize() {
  const [w, h] = sizes[viewport], scale = Math.min(1, (document.documentElement.clientWidth - 24) / w);
  Object.assign(frame.style, {width: `${w}px`, height: `${h}px`, transform: `scale(${scale})`});
  Object.assign(canvas.style, {width: `${w * scale}px`, height: `${h * scale}px`});
  document.getElementById("dimensions").textContent = `${w} × ${h} screen · ${Math.round(scale * 100)}% preview`;
  document.querySelectorAll("[data-viewport]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.viewport === viewport)));
  sync();
}
function reset() { frame.contentWindow?.postMessage({type: "tower-review", sample: sample.value, tower: tower.value, section}, location.origin); sync(); }
document.querySelectorAll("[data-viewport]").forEach(b => b.addEventListener("click", () => { viewport = b.dataset.viewport; resize(); }));
sample.addEventListener("change", reset); tower.addEventListener("change", reset); document.getElementById("reset").addEventListener("click", reset);
window.addEventListener("resize", resize);
window.addEventListener("message", e => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  if (e.data?.type === "tower-ready") reset();
  if (e.data?.type === "tower-status") {document.getElementById("reviewStatus").textContent = e.data.message; if (["overview", "garrison", "walls", "rules"].includes(e.data.section)) {section = e.data.section; sync();}}
});
resize(); frame.src = `preview.html?sample=${sample.value}&tower=${tower.value}&section=${section}`;
