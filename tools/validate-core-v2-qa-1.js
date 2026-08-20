"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createFixture, SIDE_META } = require("./core-v2-qa-1/fixture.js");

const ROOT = path.resolve(__dirname, "..");

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function main() {
  const fixture = createFixture();
  const maps = fixture.mapData.maps;
  const regions = fixture.regionCatalog.regions;
  assert.equal(maps.length, 25);
  assert.equal(regions.length, 25);
  assert.equal(maps.reduce((sum, map) => sum + map.cities.length, 0), 1480);
  assert.equal(new Set(maps.flatMap(map => map.cities.map(city => city.id))).size, 1480);
  assert(maps.every(map => map.cities.length === map.cityCapacity));
  assert(regions.every(region => region.permanentCore && !region.spawnEligible && !region.spawnReady));

  let directedOpen = 0;
  let gated = 0;
  let diagonals = 0;
  const regionById = new Map(regions.map(region => [region.id, region]));
  for (const region of regions) {
    for (const [side, connection] of Object.entries(region.connections)) {
      if (connection.state === "gated") {
        gated += 1;
        assert.equal(connection.targetRegionId, "");
        continue;
      }
      directedOpen += 1;
      const target = regionById.get(connection.targetRegionId);
      assert(target, `${region.id}.${side} has an unknown target.`);
      const meta = SIDE_META[side];
      assert.equal(target.gridX, region.gridX + meta.dx);
      assert.equal(target.gridY, region.gridY + meta.dy);
      assert.equal(target.connections[meta.opposite].targetRegionId, region.id);
      if (Math.abs(target.gridX - region.gridX) + Math.abs(target.gridY - region.gridY) !== 1) diagonals += 1;
    }
  }
  assert.equal(directedOpen, 80);
  assert.equal(gated, 20);
  assert.equal(diagonals, 0);

  const typeCounts = maps.reduce((result, map) => {
    result[map.purpose] = (result[map.purpose] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(typeCounts, {
    support: 4,
    deed_camp: 4,
    relic_camp: 4,
    warband_camp: 2,
    gold_camp: 2,
    holding_tower: 4,
    stronghold: 4,
    crown_citadel: 1,
  });
  assert.equal(maps.filter(map => map.cityCapacity === 70).length, 4);
  assert.equal(maps.filter(map => map.cityCapacity === 60).length, 9);
  assert.equal(maps.filter(map => map.cityCapacity === 55).length, 12);

  const strongholdMaps = fixture.prototypes.filter(entry => ["STRONGHOLD", "CROWN_CITADEL"].includes(entry.mapType));
  assert.equal(strongholdMaps.length, 5);
  strongholdMaps.forEach(entry => {
    assert.equal(entry.objective.x, 724);
    assert.equal(entry.objective.y, 543);
  });
  assert.equal(fixture.prototypes.filter(entry => entry.mapType === "HOLDING_TOWER").length, 4);
  maps.forEach(map => {
    const minimumSpacing = Math.min(...map.cities.flatMap((city, index) => map.cities.slice(index + 1).map(other => distance(city, other))));
    assert(minimumSpacing >= 68 - 1e-6, `${map.label} violates the 68px Core spacing rule.`);
  });

  fixture.prototypes.forEach(prototype => assert(fs.existsSync(path.join(ROOT, prototype.candidateMapPath)), `Missing ${prototype.candidateMapPath}`));
  console.log(JSON.stringify({
    pass: true,
    maps: maps.length,
    cities: maps.reduce((sum, map) => sum + map.cities.length, 0),
    typeCounts,
    directedOpen,
    reciprocalConnections: directedOpen / 2,
    gated,
    diagonals,
    strongholdsCentered: strongholdMaps.length,
    towerReservations: 4,
  }));
}

main();
