"use strict";
const assert = require("node:assert/strict");
const layout = require("../functions/core-expansion-world-layout.json");
const proof = require("./map-art/clan-tower-clearance.json");
const clearance = require("./map-art/clearance.json");
const { selectActiveRegions, canonicalCityPositions, planHash } = require("./illustrated-map-coordinate-plan");
const { createAuthoritativeRoutePlanner } = require("../functions/authoritative-route-planner");
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const planner = createAuthoritativeRoutePlanner(layout);
const ids = proof.maps.map(map => map.id);
assert.equal(ids.length, 4);
assert.equal(new Set(ids).size, 4);
assert.equal(proof.topology, "core-expansion-v1");
assert.deepEqual(selectActiveRegions(layout, ["new-lands-l01-p001"], ids), ids);
assert.throws(() => selectActiveRegions(layout, [], ["new-lands-l01-p001"]), /not active/);
assert.throws(() => selectActiveRegions(layout, [], [ids[0], ids[0]]), /Duplicate/);
assert.throws(() => selectActiveRegions(layout, ["unreviewed"], ["unreviewed"]), /No reviewed layout/);
assert.throws(() => selectActiveRegions(layout, [], [""]), /not active/);
assert.notEqual(planHash({ regionIds: ids }, []), planHash({ regionIds: [ids[0]] }, []), "Migration confirmation must bind its map scope");
let moved = 0;
for (const record of proof.maps) {
  const map = layout.maps.find(map => map.id === record.id);
  const review = clearance.maps.find(map => map.id === record.id);
  const positions = canonicalCityPositions(layout, map.id);
  assert.equal(map.cities.length, 55);
  assert(map.permanentCore);
  const e = proof.cityEnvelope;
  for (const city of map.cities) {
    assert(!intersects({ x: city.x - e.left, y: city.y - e.top, w: e.left + e.right, h: e.top + e.bottom }, record.reserved), `${map.id}/${city.id} enters the full compound clearing`);
  }
  for (let i = 0; i < review.cities.length; i++) for (let j = i + 1; j < review.cities.length; j++) {
    assert(!intersects(review.cities[i].bounds, review.cities[j].bounds), `City artwork overlaps on ${map.id}`);
  }
  for (const move of record.moves) {
    const city = map.cities.find(city => city.id === move.id);
    assert.deepEqual({ x: city.x, y: city.y }, move.to);
    assert.notDeepEqual(move.from, move.to);
    const from = { id: city.id, regionId: map.id, ...positions.get(city.id) };
    const other = map.cities.find(other => other.id !== city.id);
    const to = { id: other.id, regionId: map.id, ...positions.get(other.id) };
    const route = planner.calculate(from, to);
    assert(route?.pathSegments?.length, `No route from relocated ${city.id}`);
    assert.deepEqual(route.pathSegments[0].points[0], positions.get(city.id));
    assert.deepEqual(route.pathSegments.at(-1).points.at(-1), positions.get(other.id));
    moved++;
  }
}
console.log(`Validated ${moved} city moves across four complete Clan Tower clearings, 220 city positions, canonical route endpoints and scoped migration guards.`);
