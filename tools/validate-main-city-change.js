const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const stylesSource = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;
const coreCatalog = JSON.parse(fs.readFileSync(
  path.join(root, "functions", "core-expansion-region-catalog.json"),
  "utf8"
));
const expectedRestrictedRegionIds = [
  "core-v2-north-west-holding-tower-m1-m1",
  "core-v2-greybanner-hold-p0-m1",
  "core-v2-north-east-holding-tower-p1-m1",
  "core-v2-swiftgate-p1-p0",
  "core-v2-crown-citadel-p0-p0",
  "core-v2-aurum-keep-m1-p0",
  "core-v2-south-west-holding-tower-m1-p1",
  "core-v2-ironwatch-p0-p1",
  "core-v2-south-east-holding-tower-p1-p1",
];
const expectedRedTrimRegionIds = [
  "core-v2-greybanner-hold-p0-m1",
  "core-v2-crown-citadel-p0-p0",
  "core-v2-swiftgate-p1-p0",
  "core-v2-ironwatch-p0-p1",
  "core-v2-aurum-keep-m1-p0",
];

assert.deepEqual(
  coreCatalog.mainCityPolicy?.restrictedRegionIds,
  expectedRestrictedRegionIds,
  "Main-city restriction must apply to exactly the nine confirmed maps."
);
assert.deepEqual(
  coreCatalog.mapPresentation?.redTrimRegionIds,
  expectedRedTrimRegionIds,
  "Red trim must apply to exactly the five confirmed map-switcher tiles."
);
const coreRegions = coreCatalog.regions.filter(region => region.permanentCore === true);
assert.equal(coreRegions.length, 25, "The Core must retain all 25 maps.");
assert.equal(coreRegions.every(region => region.spawnEligible === false), true, "Every Core map must remain new-player spawn-ineligible.");
assert.equal(
  coreRegions.filter(region => !expectedRestrictedRegionIds.includes(region.id)).length,
  16,
  "Exactly 16 Core maps must remain eligible for Main City placement."
);
assert.equal(
  coreCatalog.regions.filter(region => !region.permanentCore).every(region => !expectedRestrictedRegionIds.includes(region.id)),
  true,
  "New Lands maps must remain eligible for Main City placement."
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}.`);
  return source.slice(start, end);
}

const singleMainSource = sourceBetween(
  serverSource,
  "function createSingleMainCityPatches",
  "function createEmptyPendingAwayProduction"
);
const sandbox = {
  safeString(value) {
    return String(value || "");
  },
  getCityEntryPath(entry) {
    return String(entry?.ref?.path || "");
  },
  isStronghold(city) {
    return city?.kind === "stronghold" || Boolean(city?.strongholdType);
  },
  isEligibleMainCityEntry(entry) {
    return Boolean(entry?.city)
      && entry.city.kind !== "stronghold"
      && !entry.city.strongholdType
      && entry.city.regionId !== expectedRestrictedRegionIds[0];
  },
  getCityEntryRegionId(entry) {
    return String(entry?.city?.regionId || "");
  },
  HttpsError: class HttpsError extends Error {
    constructor(_code, message) {
      super(message);
    }
  },
};
vm.createContext(sandbox);
vm.runInContext(`${singleMainSource}; this.createSingleMainCityPatches = createSingleMainCityPatches;`, sandbox);

const mainCityProtectionSource = sourceBetween(
  serverSource,
  "function isProtectedMainCity",
  "function getShieldExpiresAtMs"
);
const protectionSandbox = {
  getOwnerUid(city) {
    return String(city?.ownerUid || "");
  },
  safeString(value, max = 80) {
    return String(value || "").trim().slice(0, max);
  },
  getRegionIdFromOnlineIslandId(value) {
    return String(value || "").replace(/^crownlands-/, "");
  },
  normalizeRegionId(value) {
    return String(value || "").trim().toLowerCase();
  },
};
vm.createContext(protectionSandbox);
vm.runInContext(`${mainCityProtectionSource}; this.isProtectedMainCity = isProtectedMainCity;`, protectionSandbox);
const profileProtectedCity = { id: "east_watch", regionId: "east", ownerUid: "defender", isMainCity: false };
const defenderProfile = { mainCityId: "east_watch", mainRegionId: "east" };
assert.equal(
  protectionSandbox.isProtectedMainCity(profileProtectedCity, "attacker", defenderProfile),
  true,
  "The profile main-city pointer must protect a city even when its document flag is stale."
);
assert.equal(
  protectionSandbox.isProtectedMainCity(profileProtectedCity, "defender", defenderProfile),
  false,
  "A player must still be able to reinforce their own main city."
);
assert.equal(
  protectionSandbox.isProtectedMainCity(
    { ...profileProtectedCity, regionId: "west" },
    "attacker",
    defenderProfile
  ),
  false,
  "A same-named city on another region must not be mistaken for the protected main city."
);
assert.equal(
  protectionSandbox.isProtectedMainCity(
    { id: "west_keep", regionId: "west", ownerUid: "defender", isMainCity: true },
    "attacker",
    defenderProfile
  ),
  false,
  "A stale city flag must not keep the previous home protected after the owner profile moves elsewhere."
);

const clientMainCityProtectionSource = sourceBetween(
  clientSource,
  "function identityMarksCityAsMain",
  "function getMainCityAttackBlockReason"
);
const clientProtectionSandbox = {
  state: { mainCityId: "west_keep" },
  onlinePresence: [],
  playerIdentityCache: new Map([[
    "ally",
    { mainCityId: "east_watch", mainRegionId: "east" },
  ]]),
  getCurrentOnlineUid() {
    return "current-player";
  },
  getKnownCityId(value) {
    return String(value || "");
  },
  getCityRegionId(city) {
    return String(city?.regionId || "");
  },
  getRegionIdFromOnlineIslandId(value) {
    return String(value || "").replace(/^crownlands-/, "");
  },
  normalizeRegionId(value) {
    return String(value || "").trim().toLowerCase();
  },
};
vm.createContext(clientProtectionSandbox);
vm.runInContext(
  `${clientMainCityProtectionSource}; this.clientIsProtectedMainCity = isProtectedMainCity;`,
  clientProtectionSandbox
);
assert.equal(
  clientProtectionSandbox.clientIsProtectedMainCity({
    id: "west_keep",
    regionId: "west",
    owner: "enemy",
    ownerUid: "ally",
    isMainCity: true,
  }),
  false,
  "The client must allow reinforcement of a stale former home when canonical identity points elsewhere."
);
assert.equal(
  clientProtectionSandbox.clientIsProtectedMainCity({
    id: "east_watch",
    regionId: "east",
    owner: "enemy",
    ownerUid: "ally",
    isMainCity: false,
  }),
  true,
  "The client must still block the ally's canonical current home."
);

const westOldMain = {
  ref: { path: "islands/main-west/cities/west_keep" },
  city: { id: "west_keep", regionId: "west", isMainCity: true },
};
const eastNewMain = {
  ref: { path: "islands/main-east/cities/east_watch" },
  city: { id: "east_watch", regionId: "east", isMainCity: false },
};
const northRegular = {
  ref: { path: "islands/main-north/cities/north_gate" },
  city: { id: "north_gate", regionId: "north", isMainCity: false },
};
const switchResult = sandbox.createSingleMainCityPatches(
  [westOldMain, eastNewMain, northRegular],
  eastNewMain.ref
);

assert.equal(switchResult.cityPatches.length, 2, "A switch must update the old and new main cities.");
assert.equal(westOldMain.city.isMainCity, false, "The previous main city must become a regular city.");
assert.equal(eastNewMain.city.isMainCity, true, "The selected city must become the only main city.");
assert.equal(northRegular.city.isMainCity, false, "Unrelated owned cities must remain regular.");
assert.equal(
  [westOldMain, eastNewMain, northRegular].filter(entry => entry.city.isMainCity).length,
  1,
  "Exactly one owned regular city must remain marked as the main city."
);
assert.equal(
  JSON.stringify(switchResult.cityUpdates.map(update => [update.id, update.regionId, update.isMainCity])),
  JSON.stringify([
    ["west_keep", "west", false],
    ["east_watch", "east", true],
  ]),
  "Cross-map city updates must identify both the demoted and promoted city."
);
const restrictedCandidate = {
  ref: { path: "islands/restricted/cities/restricted_keep" },
  city: { id: "restricted_keep", regionId: expectedRestrictedRegionIds[0], isMainCity: false },
};
assert.throws(
  () => sandbox.createSingleMainCityPatches([westOldMain, restrictedCandidate], restrictedCandidate.ref),
  /cannot become your main city/i,
  "Internal main-city patch creation must reject a restricted-map target."
);

assert.match(serverSource, /const MAIN_CITY_CHANGE_CITY_LIMIT = 30;/, "Server city-count cooldown boundary changed.");
assert.match(serverSource, /MAIN_CITY_CHANGE_SMALL_KINGDOM_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000;/, "Server 7-day cooldown is missing.");
assert.match(serverSource, /MAIN_CITY_CHANGE_LARGE_KINGDOM_COOLDOWN_MS = 14 \* 24 \* 60 \* 60 \* 1000;/, "Server 14-day cooldown is missing.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?getOwnerUid\(targetEntry\.city\) !== uid \|\| isStronghold\(targetEntry\.city\)/, "Server must reject unowned cities and Strongholds.");
assert.match(serverSource, /function getCityEntryRegionId[\s\S]*?ref\?\.parent\?\.parent\?\.id[\s\S]*?if \(referencedIslandId\) return getRegionIdFromOnlineIslandId\(referencedIslandId\)[\s\S]*?city\?\.regionId/, "Server region identity must prefer the authoritative city document path over stored metadata.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?const targetRegionId = getCityEntryRegionId\(targetEntry, regionId\);[\s\S]*?!isMainCityRegionEligible\(targetRegionId\)[\s\S]*?const regularOwnedCount[\s\S]*?stationedReinforcementsForTargetQuery/, "Server must reject a restricted authoritative target before cooldown or reinforcement processing, even when the client spoofs a region.");
assert.match(serverSource, /function assertCurrentSeasonMainCity[\s\S]*?!isMainCityRegionEligible\(cityRegionId\)/, "Normal gameplay participation must reject a restricted-map Main City.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?mainCityId: targetEntry\.city\.id[\s\S]*?mainIslandId: targetIslandId[\s\S]*?mainRegionId: targetRegionId[\s\S]*?mainCityChangedAtMs: nowMs/, "Server must update every main-city profile pointer and the cooldown timestamp.");
assert.match(serverSource, /exports\.changeMainCity[\s\S]*?createSingleMainCityPatches\(economy\.cityEntries, targetEntry\.ref\)[\s\S]*?writePreparedEconomy/, "Server switch must atomically repair all owned city flags.");
assert.match(serverSource, /writeGlobalStatsFromEconomy[\s\S]*?mainCityId: stats\.mainCityId[\s\S]*?mainRegionId: stats\.mainRegionId[\s\S]*?mainIslandId: stats\.mainIslandId/, "Leaderboard/global stats must receive the new main-city location.");
assert.match(serverSource, /function isProtectedMainCity[\s\S]*?ownerProfile\?\.mainCityId[\s\S]*?city\.isMainCity/, "Server combat protection must use both the owner's authoritative main-city pointer and the city flag.");
assert.match(serverSource, /const defenderMainCityProfile = getMainCityProtectionProfile\([\s\S]*?defenderPowerData[\s\S]*?defenderGlobalStatsData[\s\S]*?defenderLeaderboardData[\s\S]*?resolvedKind === "attack"[\s\S]*?isProtectedMainCity\(target, uid, defenderMainCityProfile\)[\s\S]*?Main cities cannot be attacked/, "Server launch authority must reject attacks using every authoritative main-city pointer.");
assert.match(serverSource, /if \(isProtectedMainCity\(target, attackerUid, defenderProfile\)\)[\s\S]*?blocked: "main_city"/, "Server arrival authority must return armies if the destination is the defender's main city.");

assert.match(clientSource, /function changeMainCity[\s\S]*?state\.mainCityId = nextMainCityId[\s\S]*?normalizeSingleMainCityAssignment\(nextMainCityId/, "Client must apply the new main-city ID before normalizing city flags.");
assert.match(clientSource, /function getMainCityChangeStatus[\s\S]*?locationEligible[\s\S]*?isMainCityRegionEligible\(getCityRegionId\(city\)\)[\s\S]*?canChange:[\s\S]*?locationEligible/, "Client main-city changes must fail closed on restricted maps.");
assert.match(clientSource, /const mainCityBlock = mainCityStatus\.isMain[\s\S]*?: !mainCityStatus\.locationEligible[\s\S]*?\? ""[\s\S]*?: `[\s\S]*?main-city-action-panel/, "Restricted-map City Info must omit the Main City move action instead of disabling it.");
assert.match(clientSource, /function renderIslandMapTile[\s\S]*?RED_TRIM_REGION_IDS\.has\(regionId\)[\s\S]*?"red-trim"/, "The map switcher must apply red trim from the exact catalog policy.");
assert.match(clientSource, /mainCityStatus\.reason && !mainCityStatus\.cooldownText/, "City info must keep the main-city cooldown inside the change button instead of repeating it below.");
assert.match(clientSource, /normalizeSingleMainCityAssignment[\s\S]*?const shouldBeMain = Boolean\(mainCityId && city\.id === mainCityId\)/, "Client must demote every loaded city except the selected main city.");
assert.match(clientSource, /onlineOwnedCitiesCache = onlineOwnedCitiesCache\.map[\s\S]*?city\.id === mainCityId && !isStronghold\(city\)/, "Cross-map owned-city cache must retain exactly one main city.");
assert.match(clientSource, /const mainCity = !stronghold[\s\S]*?city\.id === state\.mainCityId[\s\S]*?btn\.classList\.add\("main-city-node"\)/, "Map rendering must move the main-city marker to the selected owned city.");
assert.match(clientSource, /const mainCity = !stronghold[\s\S]*?: isProtectedMainCity\(city\)/, "Enemy home-base styling must use the canonical main-city identity.");
assert.match(clientSource, /function isProtectedMainCity[\s\S]*?playerIdentityCache\.get\(ownerUid\)[\s\S]*?onlinePresence/, "Client targeting must recognize foreign main cities from canonical identity and presence data.");
assert.match(clientSource, /foreignMainCityFlag = Object\.prototype\.hasOwnProperty\.call\(online, "isMainCity"\)[\s\S]*?\? Boolean\(online\.isMainCity\)[\s\S]*?: Boolean\(current\.isMainCity\)/, "An authoritative false main-city snapshot must clear a stale client flag.");
assert.match(clientSource, /if \(cachedIdentity\?\.mainCityId\) return identityMarksCityAsMain\(city, cachedIdentity\);[\s\S]*?return Boolean\(city\.isMainCity\);/, "A canonical foreign-player home pointer must override a stale city flag.");
assert.doesNotMatch(stylesSource, /\.city-node\.main-city-node \.city-art[\s\S]*?filter:/, "Main-city castle artwork must keep its normal colors.");
assert.match(stylesSource, /\.city-node\.player\.main-city-node \.city-owner-column,[\s\S]*?\.city-node\.player\.main-city-node \.city-army-count[\s\S]*?background: #454b54;/, "The current player's main-city UI must use the protected-home dark gray.");
assert.match(stylesSource, /\.city-node\.enemy\.main-city-node \.foreign-city-shield,[\s\S]*?\.city-node\.enemy\.main-city-node \.foreign-selected-data[\s\S]*?background: #454b54;/, "Enemy main-city UI must render dark gray.");
assert.match(stylesSource, /\.island-map-picker \.island-map-icon\.red-trim::before[\s\S]*?border: 3px solid #b51f2e;[\s\S]*?pointer-events: none;/, "The five designated map tiles must receive a visible non-interactive red trim.");

console.log("Validated exact-nine Main City restrictions, five red-trim map tiles, authoritative paths, atomic switching, recovery guards, cooldowns, and home-base protection.");
