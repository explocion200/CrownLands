"use strict";

const DIRECTIONAL_THEMES = Object.freeze({
  north: Object.freeze({ id: "north_light_winter", label: "North / light winter", climate: "cold_temperate" }),
  east: Object.freeze({ id: "east_tropical", label: "East / tropical", climate: "lush_tropical_frontier" }),
  south: Object.freeze({ id: "south_dry_frontier", label: "South / dry frontier", climate: "dry_temperate" }),
  west: Object.freeze({ id: "west_grassy", label: "West / grassy", climate: "temperate_grassland" }),
});

function classifyDirectionalTheme(gridX, gridY) {
  const x = Math.round(Number(gridX) || 0);
  const y = Math.round(Number(gridY) || 0);
  if (x === 0 && y === 0) throw new Error("The Crownlands origin does not have a player-region directional theme.");

  // The dominant world-grid axis selects the regional family. Exact diagonal
  // ties belong to North/South so classification stays stable across layers.
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? DIRECTIONAL_THEMES.north : DIRECTIONAL_THEMES.south;
  return x < 0 ? DIRECTIONAL_THEMES.west : DIRECTIONAL_THEMES.east;
}

module.exports = Object.freeze({ DIRECTIONAL_THEMES, classifyDirectionalTheme });
