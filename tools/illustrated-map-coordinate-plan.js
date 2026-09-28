"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { getWorldSize, getMapBounds, getImageDimensions, imagePointToWorld } = require("../functions/authoritative-route-planner");

function selectActiveRegions(layout, activeRegionIds, requestedRegionIds = []) {
  const active = new Set([...layout.maps.filter(map => map.permanentCore).map(map => map.id), ...activeRegionIds]);
  const selected = requestedRegionIds.length ? requestedRegionIds : [...active];
  assert.equal(new Set(selected).size, selected.length, "Duplicate requested region");
  for (const id of selected) {
    assert(active.has(id), `Requested region is not active: ${id}`);
    assert(layout.maps.some(map => map.id === id), `No reviewed layout for active map ${id}`);
  }
  return selected;
}

function canonicalCityPositions(layout, regionId) {
  const map = layout.maps.find(entry => entry.id === regionId);
  assert(map, `No reviewed layout for active map ${regionId}`);
  const model = { bounds: getMapBounds(map, getWorldSize(layout)), dimensions: getImageDimensions(map) };
  return new Map(map.cities.map(city => {
    const point = imagePointToWorld(model, city);
    return [city.id, { x: Math.round(point.x), y: Math.round(point.y) }];
  }));
}

function coordinateWrite(document, position) {
  assert(document.name && document.updateTime, "Existing document and update precondition required");
  assert(Number.isInteger(position.x) && Number.isInteger(position.y), "Canonical integer coordinates required");
  return {
    update: { name: document.name, fields: { x: { integerValue: String(position.x) }, y: { integerValue: String(position.y) } } },
    updateMask: { fieldPaths: ["x", "y"] },
    currentDocument: { updateTime: document.updateTime },
  };
}

function planHash(identity, targets) {
  const values = targets.map(target => [target.document.name, target.before, target.position]).sort((a, b) => a[0].localeCompare(b[0]));
  return crypto.createHash("sha256").update(JSON.stringify({ identity, values })).digest("hex");
}
async function commitCoordinateBatch(client, documentRoot, guards, targets) {
  const response = await client.post(`${documentRoot}:beginTransaction`, { options: { readWrite: {} } });
  const transaction = response.body.transaction;
  assert(transaction, "Firestore transaction required");
  try {
    for (const guard of guards) {
      const result = await client.post(`${documentRoot}:batchGet`, {
        documents: [`${documentRoot.slice(4)}/${guard.path}`], transaction,
      });
      const entry = Array.isArray(result.body) ? result.body[0] : result.body;
      assert(entry?.found, "Realm guard document is missing");
      guard.validate(entry.found);
    }
    const writes = targets.map(target => coordinateWrite(target.document, target.position));
    await client.post(`${documentRoot}:commit`, { transaction, writes });
  } catch (error) {
    await client.post(`${documentRoot}:rollback`, { transaction }).catch(() => {});
    throw error;
  }
}
module.exports = { selectActiveRegions, canonicalCityPositions, coordinateWrite, planHash, commitCoordinateBatch };
