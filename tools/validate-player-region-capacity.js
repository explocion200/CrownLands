"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PLAYER_REGION_CITY_CAPACITY,
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  countAuthoritativeNpcCities,
  derivePlayerRegionSpawnEligibility,
} = require("../functions/player-region-spawn");
const {
  normalizeConfig,
} = require("./map-scaling-phase-4/generator");
const { runPhase4ScenarioSuite } = require("./map-scaling-phase-4/scenarios");

const root = path.resolve(__dirname, "..");
const directions = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

function connections(openSide = "", targetRegionId = "") {
  return Object.fromEntries(Object.entries(directions).map(([side, oppositeSide]) => [side, {
    side,
    oppositeSide,
    state: side === openSide ? "open" : "gated",
    targetRegionId: side === openSide ? targetRegionId : "",
  }]));
}

const regionA = {
  id: "player_a",
  purpose: "player_region",
  permanentCore: false,
  lifecycle: "active",
  npcCityCount: 40,
  connections: connections("east", "player_b"),
};
const regionB = {
  id: "player_b",
  purpose: "player_region",
  permanentCore: false,
  lifecycle: "active",
  connections: connections("west", "player_a"),
};
const regions = [regionA, regionB];
const topologyBeforeEligibilityChecks = JSON.stringify(regions);
const regularCityIds = Array.from({ length: PLAYER_REGION_CITY_CAPACITY }, (_, index) => (
  `player_a_city_${String(index + 1).padStart(2, "0")}`
));
const ownershipState = ownedCount => regularCityIds.map((id, index) => ({
  id,
  resetGeneration: "test-generation",
  ownerUid: index < ownedCount ? `player_${index + 1}` : null,
}));

assert.equal(PLAYER_REGION_CITY_CAPACITY, 40);
assert.equal(MINIMUM_NPC_CITIES_FOR_SPAWN, 15);
assert.equal(countAuthoritativeNpcCities({
  cityOwnershipState: ownershipState(25),
  regularCityIds,
  resetGeneration: "test-generation",
}), 15);

const atThreshold = derivePlayerRegionSpawnEligibility({
  region: regionA,
  regions,
  cityOwnershipState: ownershipState(25),
  regularCityIds,
  resetGeneration: "test-generation",
  ownershipStateAuthoritative: true,
});
assert.equal(atThreshold.currentNpcCityCount, 15);
assert.equal(atThreshold.spawnEligible, true, "15 unowned cities must still allow one placement.");

const afterThresholdPlacement = derivePlayerRegionSpawnEligibility({
  region: regionA,
  regions,
  cityOwnershipState: ownershipState(26),
  regularCityIds,
  resetGeneration: "test-generation",
  ownershipStateAuthoritative: true,
});
assert.equal(afterThresholdPlacement.currentNpcCityCount, 14);
assert.equal(afterThresholdPlacement.spawnEligible, false, "The next placement must be blocked once 14 remain.");

const belowThreshold = derivePlayerRegionSpawnEligibility({
  region: regionA,
  regions,
  cityOwnershipState: ownershipState(28),
  regularCityIds,
  resetGeneration: "test-generation",
  ownershipStateAuthoritative: true,
});
assert.equal(belowThreshold.currentNpcCityCount, 12);
assert.equal(belowThreshold.spawnEligible, false, "12 unowned cities must block new placement.");
assert(belowThreshold.reasons.includes("npc_city_threshold"));

const staticMetadataOnly = derivePlayerRegionSpawnEligibility({
  region: { ...regionA, npcCityCount: 40, spawnEligible: true, spawnReady: true },
  regions,
  cityOwnershipState: ownershipState(28),
  regularCityIds,
  resetGeneration: "test-generation",
  ownershipStateAuthoritative: false,
});
assert.equal(staticMetadataOnly.spawnEligible, false, "Static NPC metadata must not authorize placement.");
assert(staticMetadataOnly.reasons.includes("ownership_state_not_authoritative"));
assert.equal(JSON.stringify(regions), topologyBeforeEligibilityChecks, "Eligibility derivation mutated topology or travel state.");

for (const invalidRegion of [
  { ...regionA, lifecycle: "standby" },
  { ...regionA, permanentCore: true },
  { ...regionA, purpose: "core_support" },
  { ...regionA, connections: connections("east", "missing_region") },
]) {
  assert.equal(derivePlayerRegionSpawnEligibility({
    region: invalidRegion,
    regions,
    cityOwnershipState: ownershipState(0),
    regularCityIds,
    resetGeneration: "test-generation",
    ownershipStateAuthoritative: true,
  }).spawnEligible, false);
}

assert.throws(() => normalizeConfig({ totalCityCapacity: 39 }), /exactly 40/);
assert.throws(() => normalizeConfig({ targetNpcCities: 28 }), /no longer configurable/);

const suite = runPhase4ScenarioSuite();
for (const fixture of suite.fixtures.filter(entry => entry.expectedSpawnReady)) {
  assert.equal(fixture.result.status, "standby");
  assert.equal(fixture.result.previewDefinition.cities.length, PLAYER_REGION_CITY_CAPACITY);
}
assert.equal(suite.fullLayer.playerRegions.length, 24);
assert.equal(suite.fullLayer.generated.length, 24);
assert(suite.fullLayer.generated.every(entry => (
  entry.result.status === "standby"
  && entry.result.previewDefinition.cities.length === PLAYER_REGION_CITY_CAPACITY
)));

const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
assert.match(serverSource, /derivePlayerRegionSpawnEligibility\(\{[\s\S]*?cityOwnershipState,[\s\S]*?ownershipStateAuthoritative:\s*true/);
assert.match(serverSource, /for \(const cityId of candidateIds\)[\s\S]*?transaction\.get\(cityRef\)[\s\S]*?derivePlayerRegionSpawnEligibility/);
assert.match(serverSource, /region-spawn-ineligible[\s\S]*?ineligibleSpawnRegionIds\.add\(chosenIsland\.regionId\)/);
assert.doesNotMatch(serverSource, /STARTER_REGION_IDS[\s\S]{0,1200}npcCityCount/,
  "Starter-region candidates still depend on static NPC metadata.");

console.log("Validated exact 40-city player regions and authoritative 15-NPC runtime spawn eligibility.");
