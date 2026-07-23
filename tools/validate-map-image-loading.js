const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const layout = JSON.parse(fs.readFileSync(path.join(root, "functions", "world-layout.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !/<link[^>]+rel="preload"[^>]+worlds\/world_01\/maps\//i.test(html),
  "The login page should not preload an arbitrary island before the player profile is known."
);
assert(
  game.includes('preloadIslandMap(targetRegionId, { fetchPriority: "high" })'),
  "The active island art should load at high priority during online setup."
);
assert(
  game.includes('window.requestIdleCallback(callback, { timeout: 2500 })'),
  "Neighboring island preloads should wait for browser idle time."
);
assert(
  game.includes('preloadIslandMap(connectedRegionIds[index], { fetchPriority: "low" })'),
  "Neighboring islands should preload sequentially at low priority."
);
assert(
  game.includes('if (pendingImage) pendingImage.fetchPriority = "high"'),
  "A selected island should promote an in-progress background preload."
);

const backgroundStart = game.indexOf("function setImageMapBackground");
const backgroundEnd = game.indexOf("function renderWorldMap", backgroundStart);
const backgroundSource = game.slice(backgroundStart, backgroundEnd);
const decodeIndex = backgroundSource.indexOf("await image.decode()");
const readyIndex = backgroundSource.indexOf('mapBg.classList.add("image-map-ready")');
assert(decodeIndex >= 0 && readyIndex > decodeIndex, "Map art must decode before it is revealed.");
assert(
  worker.includes('if (request.destination === "image")') && worker.includes("cacheFirst(request)"),
  "Map images should continue using cache-first service-worker delivery."
);

let fullMapBytes = 0;
let thumbnailBytes = 0;
for (const map of layout.maps || []) {
  const fullMapPath = path.join(root, String(map.imageSrc || ""));
  const thumbnailPath = path.join(root, String(map.thumbnailSrc || ""));
  assert(map.thumbnailSrc, `${map.id} should use an optimized map-picker thumbnail.`);
  assert(fs.existsSync(fullMapPath), `${map.id} full map art is missing.`);
  assert(fs.existsSync(thumbnailPath), `${map.id} map-picker thumbnail is missing.`);
  assert(map.thumbnailSrc !== map.imageSrc, `${map.id} should not load full map art in the map picker.`);
  fullMapBytes += fs.statSync(fullMapPath).size;
  thumbnailBytes += fs.statSync(thumbnailPath).size;
}
assert(thumbnailBytes < fullMapBytes * 0.1, "Map-picker thumbnails should stay below 10% of full map art size.");

console.log(`Map image loading validation passed (${thumbnailBytes} thumbnail bytes vs ${fullMapBytes} full-map bytes).`);
