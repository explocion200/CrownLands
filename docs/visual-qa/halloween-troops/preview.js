"use strict";
const controls = Object.fromEntries(["relationship", "mission", "direction", "returning", "motion"].map(id => [id, document.getElementById(id)]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const hosts = [...document.querySelectorAll(".motion-host")];
let atlasLayout = null;
const directions = {
  N: { row: 0, sheet: "march-north-east.png", label: "North", arrow: "↑", vector: [0, -1] },
  NE: { row: 1, sheet: "march-north-east.png", label: "Northeast", arrow: "↗", vector: [1, -1] },
  E: { row: 2, sheet: "march-north-east.png", label: "East", arrow: "→", vector: [1, 0] },
  SE: { row: 3, sheet: "march-north-east.png", label: "Southeast", arrow: "↘", vector: [1, 1] },
  S: { row: 0, sheet: "march-south-west.png", label: "South", arrow: "↓", vector: [0, 1] },
  SW: { row: 1, sheet: "march-south-west.png", label: "Southwest", arrow: "↙", vector: [-1, 1] },
  W: { row: 2, sheet: "march-south-west.png", label: "West", arrow: "←", vector: [-1, 0] },
  NW: { row: 3, sheet: "march-south-west.png", label: "Northwest", arrow: "↖", vector: [-1, -1] },
};
// Direction is derived from the current segment in screen space, never the endpoint alone.
function directionForVector(dx, dy, fallback = "S") {
  if (Math.hypot(dx, dy) < .001) return fallback;
  return ["E", "SE", "S", "SW", "W", "NW", "N", "NE"][(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
}
function setFacing(formation, key) {
  if (formation.dataset.facing === key && formation.querySelector(".frame-strip")) return;
  const direction = directions[key];
  formation.dataset.facing = key;
  if (formation.hasAttribute("role")) formation.setAttribute("aria-label", "Soldiers marching " + direction.label.toLowerCase());
  if (!atlasLayout) return;
  const sheet = atlasLayout[direction.sheet], strip = document.createElement("div");
  strip.className = "frame-strip";
  // Preserve the original raster and clip each measured pose, including spear tips.
  // A shared 360px coordinate box keeps scale and foot baseline stable between poses.
  const frames = formation.closest(".motion-host") ? sheet.rows[direction.row] : [sheet.rows[direction.row][0]];
  frames.forEach(frame => {
    const pose = document.createElement("div"), crop = document.createElement("div"), image = document.createElement("img");
    pose.className = "pose"; crop.className = "pose-crop"; image.className = "atlas";
    crop.style.cssText = "left:" + (360 - frame.width) / 720 * 100 + "%;top:" + (342 - frame.height) / 360 * 100 + "%;width:" + frame.width / 360 * 100 + "%;height:" + frame.height / 360 * 100 + "%";
    if (frame.excludeTopRight) {
      const edge = frame.excludeTopRight / frame.height * 100 + "%";
      crop.style.clipPath = "polygon(0 0,60% 0,60% " + edge + ",100% " + edge + ",100% 100%,0 100%)";
    }
    image.src = direction.sheet; image.alt = "";
    image.style.cssText = "width:" + sheet.width / frame.width * 100 + "%;height:" + sheet.height / frame.height * 100 + "%;left:" + -frame.x / frame.width * 100 + "%;top:" + -frame.y / frame.height * 100 + "%";
    crop.appendChild(image); pose.appendChild(crop); strip.appendChild(pose);
  });
  formation.replaceChildren(strip);
}
const gallery = document.getElementById("direction-gallery");
for (const [key, direction] of Object.entries(directions)) {
  const button = document.createElement("button");
  button.type = "button"; button.dataset.direction = key; button.setAttribute("aria-pressed", "false");
  button.innerHTML = '<div class="formation"><img class="atlas" src="' + direction.sheet + '" alt=""></div><span>' + direction.arrow + " " + direction.label + "</span>";
  setFacing(button.querySelector(".formation"), key);
  button.addEventListener("click", () => {
    controls.direction.value = key; controls.returning.checked = false; updatePreview(true);
  });
  gallery.appendChild(button);
}
const map = document.getElementById("map-scene"), axis = document.querySelector(".route-axis");
let routeAnimation = null, routePoints = [], segmentIndex = 0, ready = false, currentFacing = "E", routeWidth = 0, routeHeight = 0;
function updateMotion() {
  hosts.forEach(host => { host.dataset.motion = ready && controls.motion.checked && !document.hidden && !reduced.matches && host.dataset.visible === "true" ? "on" : "off"; });
  if (routeAnimation) {
    if (map.dataset.motion === "on") {
      if (routeAnimation.playState === "paused") routeAnimation.play();
    } else if (routeAnimation.playState !== "finished") routeAnimation.pause();
  }
  document.getElementById("motion-status").textContent = reduced.matches ? "Still preview · system reduced motion enabled" : controls.motion.checked ? "March follows each route segment" : "Animation paused";
}
function showFacing(key) {
  currentFacing = key;
  document.querySelectorAll(".motion-host .formation,[data-follow-facing]").forEach(formation => setFacing(formation, key));
  document.getElementById("facing-label").textContent = directions[key].arrow + " " + directions[key].label + " · enlarged detail";
  document.getElementById("route-caption").textContent = (controls.direction.value === "auto" ? "Eight-direction tour" : controls.returning.checked ? "Returning" : "Outbound") + " · " + directions[key].arrow + " " + directions[key].label;
  gallery.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.direction === key)));
}
function startSegment(index) {
  if (routeAnimation) { routeAnimation.onfinish = null; routeAnimation.cancel(); }
  segmentIndex = index;
  const from = routePoints[index], to = routePoints[index + 1];
  showFacing(directionForVector(to.x - from.x, to.y - from.y, currentFacing));
  // One compositor animation per route segment; no JavaScript work for individual frames.
  routeAnimation = axis.animate([
    { transform: "translate(" + from.x + "px," + from.y + "px)" },
    { transform: "translate(" + to.x + "px," + to.y + "px)" },
  ], { duration: controls.direction.value === "auto" ? 3000 : 7000, easing: "linear", fill: "both" });
  routeAnimation.onfinish = () => startSegment((segmentIndex + 1) % (routePoints.length - 1));
  updateMotion();
}
function buildRoute() {
  if (!ready) return;
  const width = map.clientWidth, height = map.clientHeight, cx = width / 2, cy = height * .53;
  routeWidth = width; routeHeight = height;
  const radius = Math.min((width - 140) / 2, (height - 260) / 2);
  const tour = controls.direction.value === "auto";
  if (tour) {
    routePoints = Array.from({ length: 9 }, (_, index) => {
      const angle = (-112.5 + index * 45) * Math.PI / 180;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });
  } else {
    const [dx, dy] = directions[controls.direction.value].vector, length = Math.hypot(dx, dy);
    routePoints = [-1, 1].map(sign => ({ x: cx + sign * dx / length * radius, y: cy + sign * dy / length * radius }));
  }
  if (controls.returning.checked) routePoints.reverse();
  document.querySelector(".route-line path").setAttribute("d", routePoints.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" "));
  map.dataset.tour = String(tour);
  const cityPoints = controls.returning.checked ? [...routePoints].reverse() : routePoints;
  for (const [selector, point] of [[".origin", cityPoints[0]], [".destination", cityPoints.at(-1)]]) {
    const endpoint = document.querySelector(selector);
    endpoint.style.left = point.x + "px"; endpoint.style.top = point.y + "px";
  }
  startSegment(0);
}
function updatePreview(routeChanged = false) {
  document.body.dataset.relationship = controls.relationship.value;
  const icon = document.querySelector(".mission-icon"), transfer = controls.mission.value === "transfer";
  const source = "../../../assets/icons/troop-orders/" + (transfer ? "marching-banner.svg" : "crossed-swords.svg");
  if (icon.getAttribute("src") !== source) icon.src = source;
  icon.alt = transfer ? "Transfer" : "Attack";
  // Illustrative exact counts appear only for your troops.
  document.querySelector(".troop-count").hidden = controls.relationship.value !== "player";
  if (routeChanged) buildRoute();
  updateMotion();
}
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { entry.target.dataset.visible = String(entry.isIntersecting); }); updateMotion();
});
hosts.forEach(host => observer.observe(host));
Object.entries(controls).forEach(([name, control]) => control.addEventListener("input", () => updatePreview(name === "direction" || name === "returning")));
document.addEventListener("visibilitychange", updateMotion);
reduced.addEventListener("change", updateMotion);
new ResizeObserver(() => {
  if (map.clientWidth !== routeWidth || map.clientHeight !== routeHeight) buildRoute();
}).observe(map);
updatePreview();
Promise.all([
  fetch("atlas-layout.json").then(response => { if (!response.ok) throw new Error("Missing atlas layout"); return response.json(); }),
  Promise.all([...document.images].map(img => img.decode())),
]).then(async ([layout]) => {
  atlasLayout = layout;
  gallery.querySelectorAll("button").forEach(button => setFacing(button.querySelector(".formation"), button.dataset.direction));
  ready = true; buildRoute();
  await Promise.all([...document.images].map(img => img.decode()));
  document.documentElement.dataset.previewReady = "true";
}).catch(() => {
  ready = false; updateMotion();
  document.documentElement.dataset.previewReady = "error";
  document.getElementById("motion-status").textContent = "Preview artwork could not be loaded.";
});
