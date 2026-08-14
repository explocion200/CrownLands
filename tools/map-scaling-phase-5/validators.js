"use strict";

const {
  MAP_WIDTH,
  MAP_HEIGHT,
} = require("./terrain-plan");
const { PLAYER_REGION_CITY_CAPACITY, MINIMUM_NPC_CITIES_FOR_SPAWN } = require("../../functions/player-region-spawn");

const MAP_ASSET_BUDGET_BYTES = 1024 * 1024;
const THUMBNAIL_ASSET_BUDGET_BYTES = 200 * 1024;
const PARITY_TOLERANCE_PIXELS = 1;
const SIDES = Object.freeze(["north", "east", "south", "west"]);

function coordinateDifference(left, right) {
  return Math.max(
    Math.abs(Number(left?.x) - Number(right?.x)),
    Math.abs(Number(left?.y) - Number(right?.y)),
    Math.abs(Number(left?.rx || 0) - Number(right?.rx || 0)),
    Math.abs(Number(left?.ry || 0) - Number(right?.ry || 0))
  );
}

function validateGeometryArtParity(terrainPlan = {}) {
  const errors = [];
  const visualByGeometry = new Map((terrainPlan.visualComposition || [])
    .filter(element => element.geometryRef && element.geometryRef !== "decorative-only")
    .map(element => [element.geometryRef, element]));
  for (const blocker of terrainPlan.blockers || []) {
    const visual = visualByGeometry.get(blocker.id);
    if (!visual) {
      errors.push(`Blocker ${blocker.id} has no matching visual element.`);
      continue;
    }
    if (coordinateDifference(blocker, visual) > PARITY_TOLERANCE_PIXELS) {
      errors.push(`Blocker ${blocker.id} differs from its visual by more than ${PARITY_TOLERANCE_PIXELS}px.`);
    }
    if (Math.abs(Number(blocker.rot || 0) - Number(visual.rot || 0)) > 0.000001) {
      errors.push(`Blocker ${blocker.id} rotation differs from its visual.`);
    }
  }
  for (const road of [...(terrainPlan.roadSystem?.edgeRoads || []), ...(terrainPlan.roadSystem?.branches || [])]) {
    const visual = visualByGeometry.get(road.id);
    if (!visual) {
      errors.push(`Road ${road.id} has no matching visual element.`);
      continue;
    }
    if (JSON.stringify(road.points) !== JSON.stringify(visual.points)) errors.push(`Road ${road.id} visual path differs from gameplay geometry.`);
    if (Math.abs(Number(road.halfWidth) - Number(visual.halfWidth)) > PARITY_TOLERANCE_PIXELS) {
      errors.push(`Road ${road.id} visual width differs from gameplay geometry.`);
    }
  }
  const exitCounts = Object.fromEntries(SIDES.map(side => [side, 0]));
  for (const road of terrainPlan.roadSystem?.edgeRoads || []) {
    if (exitCounts[road.side] == null) errors.push(`Unknown edge-road side ${road.side}.`);
    else exitCounts[road.side] += 1;
    const exit = road.points?.[0] || {};
    const onExpectedEdge = road.side === "north" ? Number(exit.y) === 0
      : road.side === "south" ? Number(exit.y) === MAP_HEIGHT
        : road.side === "west" ? Number(exit.x) === 0
          : road.side === "east" ? Number(exit.x) === MAP_WIDTH : false;
    if (!onExpectedEdge) errors.push(`${road.id} does not terminate on its declared ${road.side} edge.`);
  }
  for (const side of SIDES) {
    if (exitCounts[side] !== 1) errors.push(`Expected exactly one ${side} edge road, received ${exitCounts[side]}.`);
  }
  if ((terrainPlan.visualComposition || []).some(element => /city|citadel|stronghold|camp/i.test(String(element.assetId || "")))) {
    errors.push("Runtime city/objective art was baked into the terrain composition.");
  }
  return {
    valid: errors.length === 0,
    errors,
    tolerancePixels: PARITY_TOLERANCE_PIXELS,
    blockerPairs: (terrainPlan.blockers || []).length,
    roadPairs: (terrainPlan.roadSystem?.edgeRoads || []).length + (terrainPlan.roadSystem?.branches || []).length,
    edgeExitCounts: exitCounts,
  };
}

function validateBakedAssets(bake = {}) {
  const errors = [];
  if (bake.map?.width !== MAP_WIDTH || bake.map?.height !== MAP_HEIGHT || bake.map?.opaque !== true) {
    errors.push("Map WebP is not an opaque 1448x1086 image.");
  }
  if (bake.thumbnail?.width !== 320 || bake.thumbnail?.height !== 240 || bake.thumbnail?.opaque !== true) {
    errors.push("Thumbnail WebP is not an opaque 320x240 image.");
  }
  if (!bake.map?.sha256 || !bake.thumbnail?.sha256) errors.push("Baked asset hashes are missing.");
  if (Number(bake.map?.bytes) > MAP_ASSET_BUDGET_BYTES) errors.push(`Map WebP exceeds ${MAP_ASSET_BUDGET_BYTES} bytes.`);
  if (Number(bake.thumbnail?.bytes) > THUMBNAIL_ASSET_BUDGET_BYTES) errors.push(`Thumbnail WebP exceeds ${THUMBNAIL_ASSET_BUDGET_BYTES} bytes.`);
  return { valid: errors.length === 0, errors };
}

function validatePlayerPackage(packageValue = {}) {
  const errors = [];
  if (packageValue.lifecycle !== "STANDBY") errors.push("Valid player package must end in STANDBY.");
  if (packageValue.publicationAllowed !== false || packageValue.activationAllowed !== false) errors.push("Phase 5 package is not publication-blocked.");
  if (packageValue.catalogEntry?.purpose !== "player_region" || packageValue.catalogEntry?.permanentCore === true) errors.push("Package is not an outer player region.");
  if (packageValue.catalogEntry?.spawnEligible !== false || packageValue.catalogEntry?.spawnReady !== false) errors.push("Development package is incorrectly spawn-ready.");
  if ((packageValue.cities || []).length !== PLAYER_REGION_CITY_CAPACITY) errors.push(`Player package must contain exactly ${PLAYER_REGION_CITY_CAPACITY} cities.`);
  if (new Set((packageValue.cities || []).map(city => city.id)).size !== (packageValue.cities || []).length) errors.push("Player package has duplicate city IDs.");
  if (packageValue.minimumNpcCitiesForSpawn !== MINIMUM_NPC_CITIES_FOR_SPAWN) errors.push("Runtime NPC threshold drifted from 15.");
  if (packageValue.geometryArtParity?.valid !== true) errors.push(...(packageValue.geometryArtParity?.errors || ["Geometry/art parity did not pass."]));
  if (packageValue.assetValidation?.valid !== true) errors.push(...(packageValue.assetValidation?.errors || ["Baked asset validation did not pass."]));
  if (packageValue.determinism?.webpRepeatMatch !== true || packageValue.determinism?.thumbnailRepeatMatch !== true) {
    errors.push("Repeated WebP/thumbnail baking was not deterministic.");
  }
  return { valid: errors.length === 0, errors };
}

function validateRolledBackPackage(result = {}) {
  const errors = [];
  if (result.lifecycle !== "ROLLED_BACK" || result.status !== "rolled_back") errors.push("Invalid fixture did not roll back.");
  if (result.package || result.bake || result.outputFiles?.length) errors.push("Rolled-back fixture retained publishable output.");
  if ((result.previewDefinition?.cities || []).length >= PLAYER_REGION_CITY_CAPACITY) errors.push("Invalid fixture unexpectedly placed all 40 cities.");
  return { valid: errors.length === 0, errors };
}

module.exports = Object.freeze({
  MAP_ASSET_BUDGET_BYTES,
  THUMBNAIL_ASSET_BUDGET_BYTES,
  PARITY_TOLERANCE_PIXELS,
  validateGeometryArtParity,
  validateBakedAssets,
  validatePlayerPackage,
  validateRolledBackPackage,
});
