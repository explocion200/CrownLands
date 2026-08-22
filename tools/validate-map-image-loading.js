const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const firebaseClient = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const layout = JSON.parse(fs.readFileSync(path.join(root, "functions", "world-layout.json"), "utf8"));
const mapManifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "worlds", "world_01", "map-manifest.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}().`);
  const signatureEnd = source.indexOf(")", start);
  const bodyStart = source.indexOf("{", signatureEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}().`);
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
  game.includes('window.requestIdleCallback(callback, { timeout: 1000 })')
    && /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 3000\);/.test(game),
  "Neighboring island preloads should wait three seconds and then use browser idle time."
);
assert(
  game.includes('preloadIslandMap(connectedRegionIds[index], { fetchPriority: "low" })'),
  "Neighboring islands should preload sequentially at low priority."
);
assert(
  game.includes('.slice(0, 2)')
    && game.includes('!connection?.saveData')
    && game.includes('["slow-2g", "2g"].includes(effectiveType)')
    && game.includes('document.visibilityState !== "hidden"'),
  "Speculative map loading must be limited to two neighbors and disabled on constrained or hidden pages."
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
assert(
  worker.includes("RUNTIME_CACHE_NAME")
    && worker.includes("REGION_CACHE_NAME")
    && worker.includes("WORLD_IMAGE_CACHE_NAME")
    && worker.includes("keys.slice(0, Math.max(0, keys.length - maximumEntries))"),
  "Runtime map, thumbnail, and region caches must remain build-scoped and bounded."
);
assert(
  worker.includes("function isWorldMapImageRequest(url)")
    && worker.includes("if (isWorldMapImageRequest(url)) return Response.error();"),
  "A failed world map must not masquerade as a successfully decoded generic image fallback."
);
const isWorldMapImageRequest = vm.runInNewContext(
  `(${extractFunction(worker, "isWorldMapImageRequest")})`,
  { self: { location: { origin: "https://crownlands.test" } } },
);
assert(
  isWorldMapImageRequest(new URL("https://crownlands.test/game/assets/worlds/world_01/maps/center.webp")),
  "World-map failure detection must work from a subdirectory deployment."
);
assert(
  isWorldMapImageRequest(new URL("https://crownlands.test/game/assets/west-island.webp")),
  "Legacy full-map art must also reject the generic fallback."
);
assert(
  !isWorldMapImageRequest(new URL("https://crownlands.test/game/assets/worlds/world_01/thumbnails/versioned/center.webp")),
  "Map-picker thumbnails may continue to use the generic optional-image fallback."
);
assert(
  !isWorldMapImageRequest(new URL("https://crownlands.test/game/assets/optimized/hud-map.webp")),
  "Ordinary interface artwork must not be classified as a full world map."
);

const campArtByType = new Map();
const strongholdArtByType = new Map();
for (const map of layout.maps || []) {
  for (const objective of map.objectives || []) {
    const strongholdType = String(objective.strongholdType || objective.type || "").toLowerCase();
    const artSrc = String(objective.artSrc || "");
    assert(
      /^assets\/optimized\/(?:crown-citadel|stronghold-[\w-]+)-[1-9]\d{1,3}x[1-9]\d{1,3}-[0-9a-f]{12}\.webp$/.test(artSrc),
      `${objective.id} should use content-hashed optimized objective artwork.`
    );
    assert(fs.existsSync(path.join(root, artSrc)), `${objective.id} objective artwork is missing.`);
    strongholdArtByType.set(strongholdType, artSrc);
  }
  for (const camp of map.camps || []) {
    const campType = String(camp.campType || camp.type || "gold").toLowerCase();
    const artSrc = String(camp.artSrc || "");
    assert(
      /^assets\/optimized\/camp-[\w-]+-[1-9]\d{1,3}x[1-9]\d{1,3}-[0-9a-f]{12}\.webp$/.test(artSrc),
      `${camp.id} should use content-hashed optimized camp artwork.`
    );
    assert(fs.existsSync(path.join(root, artSrc)), `${camp.id} camp artwork is missing.`);
    campArtByType.set(campType, artSrc);
  }
}
assert(campArtByType.size === 4, "All four reward-camp artwork types must be present in the world layout.");
assert(strongholdArtByType.size === 5, "All five Stronghold artwork types must be present in the world layout.");

const getStrongholdArtSrc = vm.runInNewContext(
  `(${extractFunction(game, "getStrongholdArtSrc")})`,
  {
    CROWN_CITADEL_ART_SRC: strongholdArtByType.get("crown"),
    DEFENSE_STRONGHOLD_ART_SRC: strongholdArtByType.get("defense"),
    SPEED_STRONGHOLD_ART_SRC: strongholdArtByType.get("speed"),
    TRAINING_STRONGHOLD_ART_SRC: strongholdArtByType.get("training"),
    GOLD_STRONGHOLD_ART_SRC: strongholdArtByType.get("gold"),
    isCrownCitadel: city => city?.strongholdType === "crown",
    isDefenseStronghold: city => city?.strongholdType === "defense",
    isSpeedStronghold: city => city?.strongholdType === "speed",
    isTrainingStronghold: city => city?.strongholdType === "training",
    isGoldStronghold: city => city?.strongholdType === "gold",
    String,
  }
);
for (const [strongholdType, artSrc] of strongholdArtByType) {
  assert(
    getStrongholdArtSrc({
      strongholdType,
      artSrc: `assets/${strongholdType === "crown" ? "crown-citadel" : `stronghold-${strongholdType}`}.png?v=legacy-editor`,
    }) === artSrc,
    `A stale ${strongholdType} Stronghold snapshot must not override packaged optimized artwork.`
  );
}

const staleCampBases = new Map([...campArtByType].map(([campType, artSrc]) => {
  const id = `stale_${campType}_camp`;
  return [id, { id, regionId: "region_6", campType, artSrc }];
}));
const normalizeOnlineCampState = vm.runInNewContext(
  `(${extractFunction(game, "normalizeOnlineCampState")})`,
  {
    REWARD_CAMP_COMBAT_VERSION: 1,
    DEFAULT_CAMP_VISUAL_SIZE: 132,
    WORLD_CAMPS_BY_ID: staleCampBases,
    getRewardCampConfig(camp) {
      return {
        kind: `${camp.campType}Camp`,
        type: camp.campType,
        rewardType: camp.campType,
        holdSeconds: 600,
        baseDefenders: 20000,
        baseReward: 20000,
        combatVersion: 1,
        troopPower: 1,
        rewardSchedule: [],
        maxDailyRewards: 0,
      };
    },
    getCampConfigForType(campType) {
      return { artSrc: campArtByType.get(campType) };
    },
    readVisualSize(value, fallback) {
      const parsed = Math.floor(Number(value));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    },
    getCampRenderSize(camp) {
      const parsed = Math.floor(Number(camp?.visualSize || camp?.size));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 132;
    },
    normalizeRegionId: value => String(value || ""),
    getRegionIdFromOnlineIslandId: value => String(value || "").replace(/^crownlands-/, ""),
    normalizeTimestampMs: value => Math.max(0, Number(value) || 0),
  }
);
for (const [campType, artSrc] of campArtByType) {
  const normalizedCamp = normalizeOnlineCampState({
    id: `stale_${campType}_camp`,
    regionId: "region_6",
    campType,
    artSrc: `assets/camps/${campType}.png`,
  });
  assert(
    normalizedCamp.artSrc === artSrc,
    `A stale ${campType} camp snapshot must not override optimized world-layout artwork.`
  );
}
assert(
  game.includes('new URL("./service-worker.js", document.baseURI)')
    && firebaseClient.includes('new URL("./service-worker.js", document.baseURI)'),
  "Service-worker registration must resolve from the deployed game folder so itch subdirectory builds can cache art."
);
assert(
  worker.includes('const APP_BASE_URL = new URL("./", self.location.href)')
    && worker.includes("new Request(resolveAppUrl(url)"),
  "Service-worker precaching must resolve files relative to its own deployment folder."
);
assert(
  !game.includes('serviceWorker.register("/service-worker.js")')
    && !firebaseClient.includes('new URL("/service-worker.js", window.location.origin)'),
  "Service-worker registration must not fall back to the host root."
);

let fullMapBytes = 0;
let thumbnailBytes = 0;
for (const map of layout.maps || []) {
  const fullMapPath = path.join(root, String(map.imageSrc || ""));
  const thumbnailPath = path.join(root, String(map.thumbnailSrc || ""));
  assert(map.thumbnailSrc, `${map.id} should use an optimized map-picker thumbnail.`);
  assert(
    /^assets\/worlds\/world_01\/maps\/versioned\/[\w-]+-[0-9a-f]{12}\.webp$/.test(map.imageSrc),
    `${map.id} should use a content-hashed immutable gameplay map.`
  );
  assert(
    /^assets\/worlds\/world_01\/thumbnails\/versioned\/[\w-]+-[0-9a-f]{12}\.webp$/.test(map.thumbnailSrc),
    `${map.id} should use a content-hashed immutable thumbnail.`
  );
  assert(fs.existsSync(fullMapPath), `${map.id} full map art is missing.`);
  assert(fs.existsSync(thumbnailPath), `${map.id} map-picker thumbnail is missing.`);
  assert(map.thumbnailSrc !== map.imageSrc, `${map.id} should not load full map art in the map picker.`);
  fullMapBytes += fs.statSync(fullMapPath).size;
  thumbnailBytes += fs.statSync(thumbnailPath).size;
}
assert(mapManifest.maps?.length === layout.maps?.length, "The immutable gameplay-map manifest must contain every active catalog region.");
assert(thumbnailBytes < fullMapBytes * 0.1, "Map-picker thumbnails should stay below 10% of full map art size.");

console.log(`Map image loading validation passed (${thumbnailBytes} thumbnail bytes vs ${fullMapBytes} full-map bytes).`);
