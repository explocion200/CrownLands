/* Map pickup artwork clearance and cached saved-location validation. */
/* exported getHarvestBonusMapArtBounds, isHarvestBonusPlacementSafe */
function getHarvestBonusSeasonalArtBounds(regionId) {
  if (!isHalloweenMapSeason() || !halloweenMapLayouts) return [];
  const summary = REGION_CATALOG_SUMMARIES_BY_ID.get(regionId);
  const placements = halloweenMapLayouts.maps[regionId] || halloweenMapLayouts.maps[summary?.templateRegionId];
  if (!Array.isArray(placements)) return [];
  return placements.slice(0, 24).flatMap(placement => {
    if (!Array.isArray(placement)) return [];
    const [assetIndex, x, y] = placement, asset = halloweenMapLayouts.assets[assetIndex];
    if (!asset || !/^assets\/optimized\/halloween-map-[a-z]+-[a-f0-9]{12}\.webp$/.test(asset.src)
      || ![x, y, asset.w, asset.h].every(Number.isFinite) || asset.w <= 0 || asset.h <= 0) return [];
    const start = islandImagePointToWorld(regionId, { x, y });
    const end = islandImagePointToWorld(regionId, { x: x + asset.w, y: y + asset.h });
    return [{ left: start.x, top: start.y, right: end.x, bottom: end.y }];
  });
}

function getHarvestBonusMapArtBounds(regionId, includePickupExclusions = true) {
  const activeRegionId = normalizeRegionId(regionId);
  const art = getIllustratedMapPresentation(activeRegionId);
  const rectangles = [];
  const addImageRect = (x, y, width, height) => {
    const start = islandImagePointToWorld(activeRegionId, { x, y });
    const end = islandImagePointToWorld(activeRegionId, { x: x + width, y: y + height });
    rectangles.push({ left: start.x, top: start.y, right: end.x, bottom: end.y });
  };
  for (const item of art?.scenery || []) {
    addImageRect(item.x - item.w / 2, item.y - item.h / 2, item.w, item.h);
  }
  for (const item of art?.landmarks || []) addImageRect(item.x, item.y, item.width, item.height);
  // Include canonical positions even before every city snapshot is loaded, and
  // live positions after a relocation. Reserve maximum city/skin artwork.
  for (const city of includePickupExclusions ? [...getPlayableBaseCitiesByRegion(activeRegionId), ...(state?.cities || [])] : []) {
    if (getCityRegionId(city) !== activeRegionId || isStronghold(city)) continue;
    // City markers use world/map pixels, whereas registered scenery uses image
    // pixels. Do not scale the marker footprint with the background artwork.
    rectangles.push({ left: city.x - 60, top: city.y - 72, right: city.x + 60, bottom: city.y + 60 });
  }
  for (const tower of WORLD_HOLDING_TOWERS) {
    if (normalizeRegionId(tower.regionId) !== activeRegionId) continue;
    const left = tower.visualX - tower.width * tower.anchorX;
    const top = tower.visualY - tower.width * tower.anchorY;
    rectangles.push({ left: left - tower.width * .2, top, right: left + tower.width * 1.2, bottom: top + tower.width * 1.65 });
  }
  if (includePickupExclusions) rectangles.push(...getHarvestBonusSeasonalArtBounds(activeRegionId));
  return rectangles;
}

function isHarvestBonusPlacementSafe(bonus) {
  const regionId = normalizeRegionId(bonus.regionId);
  const pendingArt = isHalloweenMapSeason() && !halloweenMapLayouts && Boolean(halloweenMapLayoutPromise);
  const key = `${regionId}|${bonus.id}|${bonus.x}|${bonus.y}|${cityRenderSignature}|${isHalloweenMapSeason()}|${pendingArt}`;
  if (harvestBonusPlacementValidation?.state === state
    && harvestBonusPlacementValidation.key === key
    && harvestBonusPlacementValidation.layouts === halloweenMapLayouts) return harvestBonusPlacementValidation.safe;
  const bounds = getIslandMapBounds(regionId);
  const distance = Math.hypot(bonus.x - bounds.left - bounds.width / 2, bonus.y - bounds.top - bounds.height / 2);
  const safe = !pendingArt && distance <= Math.min(bounds.width, bounds.height) * Math.max(...HARVEST_BONUS_CENTER_SEARCH_FRACTIONS) + 1
    && isValidHarvestBonusPoint(bonus.x, bonus.y, regionId, null, bonus.id);
  harvestBonusPlacementValidation = { state, key, layouts: halloweenMapLayouts, safe };
  return safe;
}
