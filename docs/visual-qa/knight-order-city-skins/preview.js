"use strict";
const SKINS = Object.freeze([
  { id: "templar", order: "Templars", name: "Dawnwatch", color: [246, 192, 92], tagline: "Ivory · Crimson · Gold", description: "Ivory ramparts, crimson crosses and a towering keep, lit by the first gold of dawn.", effects: ["Templar standards", "Torch patrols", "Campfire smoke"], gates: [[41.7, 82.5], [58.1, 82.5]] },
  { id: "hospitaller", order: "Hospitallers", name: "Night Sanctuary", color: [201, 234, 242], tagline: "Charcoal · White · Silver", description: "A fortified sanctuary of quiet cloisters, black banners and warm lanterns beneath silver light.", effects: ["Hospital banners", "Lantern patrols", "Watchfires"], gates: [[45, 81.5], [61.5, 81.5]] },
  { id: "teutonic", order: "Teutonic Knights", name: "Frost Citadel", color: [156, 214, 247], tagline: "Slate · White · Ice", description: "A stern northern citadel with black crosses, snow-capped gables and a cold blue watchlight.", effects: ["Winter standards", "Snowfall", "Torch patrols"], gates: [[43, 52], [55.5, 49]] },
  { id: "santiago", order: "Santiago", name: "Emberward", color: [255, 157, 78], tagline: "Sandstone · Crimson · Copper", description: "Sun-warmed sandstone and terracotta, carrying the red sword-cross above blazing gate braziers.", effects: ["Sword-cross standards", "Campfire smoke", "Torch patrols"], gates: [[41.5, 83.5], [59, 83.5]] }
]);
const root = document.documentElement;
const workspace = document.querySelector(".workspace");
const showcase = document.getElementById("showcase");
const effects = document.getElementById("effects");
const pause = document.getElementById("pause");
const preference = matchMedia("(prefers-reduced-motion: reduce)");
let selected = "templar", view = "inspect", paused = false, manualMotion = false;
let frame = 0, elapsed = 0, previous = 0, lastPaint = 0;
const scenes = [];
root.dataset.visible = String(!document.hidden);
root.dataset.paused = "false";
effects.value = preference.matches ? "subtle" : "full";
root.dataset.effects = effects.value;
document.getElementById("orders").innerHTML = SKINS.map(skin => `<button type="button" class="order-button" data-order-choice="${skin.id}" aria-pressed="${skin.id === selected}"><img src="art/${skin.id}.png" alt="" width="68" height="78"><span><strong>${skin.order}</strong><small>${skin.tagline}</small></span></button>`).join("");
function card(skin) {
  return `<article class="skin-card" data-order="${skin.id}" aria-label="${skin.order}: ${skin.name}"><div class="card-top"><span>${skin.order}</span><span>City skin concept</span></div><div class="stage"><div class="city"><img class="art" src="art/${skin.id}.png" alt="${skin.order} fortified city"><img class="encampment" src="art/encampment.webp" alt="" aria-hidden="true">${skin.gates.map(([x,y], index) => `<span class="gate-glow ${index ? "second" : ""}" style="--x:${x}%;--y:${y}%" aria-hidden="true"></span>`).join("")}</div><canvas aria-hidden="true"></canvas><span class="scale-label">160 px · City-marker preview</span></div><div class="card-copy"><h2>${skin.name}</h2><p>${skin.description}</p><div class="effect-tags">${skin.effects.map(effect => `<span>${effect}</span>`).join("")}</div></div></article>`;
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) { const scene = scenes.find(item => item.canvas === entry.target); if (scene) { scene.visible = entry.isIntersecting; scene.canvas.closest(".skin-card").dataset.visible = String(scene.visible); } }
  schedule();
});
const sizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const scene = scenes.find(item => item.canvas === entry.target || item.city === entry.target);
    if (!scene) continue;
    if (entry.target === scene.canvas) {
      scene.width = entry.contentRect.width; scene.height = entry.contentRect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      scene.canvas.width = Math.round(scene.width * ratio); scene.canvas.height = Math.round(scene.height * ratio);
      scene.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    // The stage owns the effects; measure the city separately to keep gate
    // emitters attached while particles travel beyond the artwork's bounds.
    const cityBounds = scene.city.getBoundingClientRect(), canvasBounds = scene.canvas.getBoundingClientRect();
    scene.size = cityBounds.width; scene.left = cityBounds.left - canvasBounds.left; scene.top = cityBounds.top - canvasBounds.top;
    draw(scene, elapsed);
  }
});
function render() {
  observer.disconnect(); sizeObserver.disconnect(); scenes.length = 0;
  workspace.dataset.view = view;
  document.querySelectorAll("[data-order-choice]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.orderChoice === selected)));
  document.querySelectorAll("[data-view]").forEach(button => { if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.view === view)); });
  showcase.innerHTML = (view === "compare" ? SKINS : SKINS.filter(skin => skin.id === selected)).map(card).join("");
  showcase.querySelectorAll(".skin-card").forEach(element => {
    const canvas = element.querySelector("canvas"), city = element.querySelector(".city");
    scenes.push({ canvas, city, context: canvas.getContext("2d"), skin: SKINS.find(skin => skin.id === element.dataset.order), visible: true, width: 0, height: 0, size: 0, left: 0, top: 0 });
    observer.observe(canvas); sizeObserver.observe(canvas); sizeObserver.observe(city);
  });
  schedule();
}
function draw(scene, time) {
  const { context: ctx, width: w, height: h, size, left, top, skin } = scene;
  ctx.clearRect(0, 0, w, h);
  if (!w || !h || !size || effects.value === "off") return;
  drawMedievalOutskirts(ctx, skin, effects.value === "subtle" ? 1.5 : time, w, h, size, left, top);
}
function isRunning() { return !document.hidden && !paused && effects.value === "full" && scenes.some(scene => scene.visible); }
function tick(now) {
  frame = 0;
  if (!isRunning()) { previous = 0; return; }
  if (previous) elapsed += Math.min((now - previous) / 1000, .1);
  previous = now;
  if (now - lastPaint >= 1000 / 30) { for (const scene of scenes) if (scene.visible) draw(scene, elapsed); lastPaint = now; }
  frame = requestAnimationFrame(tick);
}
function schedule() {
  if (isRunning()) { if (!frame) frame = requestAnimationFrame(tick); }
  else { cancelAnimationFrame(frame); frame = 0; previous = 0; for (const scene of scenes) draw(scene, elapsed); }
}
document.getElementById("orders").addEventListener("click", event => {
  const button = event.target.closest("[data-order-choice]"); if (!button) return;
  selected = button.dataset.orderChoice; render();
});
document.querySelector(".view-controls").addEventListener("click", event => {
  const button = event.target.closest("[data-view]"); if (!button) return;
  view = button.dataset.view; render();
});
effects.addEventListener("change", () => { manualMotion = true; root.dataset.effects = effects.value; schedule(); });
pause.addEventListener("click", () => { paused = !paused; root.dataset.paused = String(paused); pause.setAttribute("aria-pressed", String(paused)); pause.textContent = paused ? "Resume motion" : "Pause motion"; schedule(); });
document.addEventListener("visibilitychange", () => { root.dataset.visible = String(!document.hidden); schedule(); });
preference.addEventListener("change", () => { if (!manualMotion) { effects.value = preference.matches ? "subtle" : "full"; root.dataset.effects = effects.value; schedule(); } });
render();
