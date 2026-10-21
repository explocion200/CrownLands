"use strict";
// Current Core catalog identities, fictional accounts. No live storage access.
const fs = require("node:fs"), path = require("node:path");
const { createFixture } = require("../fixtures");
const { createSeamlessFixture } = require("./fixtures");
const catalog = require("../../../assets/worlds/core-expansion-v1/region-catalog.json");
function createNativeFixture() {
  const fixture = createFixture("A"), scene = createSeamlessFixture(false);
  fixture.nativeWorld = true;
  fixture.benchmarkSeed += "-native-world";
  scene.homeSectionId = fixture.primaryRegionId;
  const home = scene.sections.find(s => s.id === scene.homeSectionId);
  fixture.neighborRegionId = scene.sections.find(s => s.gridX === home.gridX && s.gridY === home.gridY + 1).id;
  fixture.scenario = { ...fixture.scenario, marchCount: 0 };
  fixture.mapData.maps = scene.sections.map(s => {
    const summary = catalog.regions.find(r => r.id === s.id);
    return { ...JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../..", summary.regionDefinitionPath))), regionDefinitionPath: summary.regionDefinitionPath };
  });
  fixture.citiesByRegion = {}; fixture.campsByRegion = {};
  for (const map of fixture.mapData.maps) {
    fixture.citiesByRegion[map.id] = map.cities.map((c, i) => ({ id: c.id, regionId: map.id,
      ownerUid: i < 3 ? fixture.player.uid : "", ownerKind: i < 3 ? "player" : "neutral", ownerName: i < 3 ? fixture.player.displayName : "",
      level: 1, troops: i < 3 ? 50000 : 50, troopFloat: i < 3 ? 50000 : 50, isMainCity: map.id === home.id && i === 0, updatedAtMs: fixture.fixedEpochMs }));
    fixture.campsByRegion[map.id] = (map.camps || []).map(c => ({ id: c.id, regionId: map.id, campType: c.campType || c.type, holderUid: "", troops: 50 }));
  }
  for (const o of scene.objects) {
    const row = fixture.citiesByRegion[o.sectionId]?.find(c => c.id === o.id);
    if (row) { o.owner = row.ownerName || "Neutral"; o.troops = row.troops; }
  }
  fixture.nativeScene = scene;
  return fixture;
}
module.exports = { createNativeFixture };
