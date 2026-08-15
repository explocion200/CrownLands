"use strict";

const {
  createDeterministicRandom,
  createGeneratedCityId,
  createSeedMetadata,
  estimateUsableCapacity,
  evaluateStaticPlacement,
  identifyStartingCityCandidates,
  normalizeConfig,
  normalizeTerrainDefinition,
  validateGeneratedDefinition,
} = require("../map-scaling-phase-4/generator");

const GRID_STEP = 22;
const GRID_JITTER = 9;
const SELECTION_TRIALS = 96;

function buildCandidatePool(terrainModel, config, random) {
  const candidates = [];
  const offsetX = random() * GRID_STEP;
  const offsetY = random() * GRID_STEP;
  for (let row = 0, y = config.edgeClearance + offsetY; y <= terrainModel.height - config.edgeClearance; row += 1, y += GRID_STEP) {
    const rowShift = row % 2 ? GRID_STEP / 2 : 0;
    for (let x = config.edgeClearance + offsetX + rowShift; x <= terrainModel.width - config.edgeClearance; x += GRID_STEP) {
      const point = {
        x: Math.round(x + (random() - 0.5) * GRID_JITTER * 2),
        y: Math.round(y + (random() - 0.5) * GRID_JITTER * 2),
      };
      if (!evaluateStaticPlacement(point, terrainModel, config)) candidates.push(point);
    }
  }
  return candidates;
}

function conflictGraph(candidates, minimumSeparation) {
  const neighbors = Array.from({ length: candidates.length }, () => []);
  const squaredMinimum = minimumSeparation * minimumSeparation;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const dx = candidates[left].x - candidates[right].x;
      const dy = candidates[left].y - candidates[right].y;
      if (dx * dx + dy * dy < squaredMinimum) {
        neighbors[left].push(right);
        neighbors[right].push(left);
      }
    }
  }
  return neighbors;
}

function selectNaturalLayout(candidates, neighbors, config, seedHash) {
  let best = [];
  for (let trial = 0; trial < SELECTION_TRIALS; trial += 1) {
    const random = createDeterministicRandom(`${seedHash}|selection-trial-${trial + 1}`);
    const active = Array(candidates.length).fill(true);
    const degrees = neighbors.map(items => items.length);
    const tieNoise = candidates.map(() => random() * (2 + trial % 7));
    const selectedIndexes = [];
    while (selectedIndexes.length < config.totalCityCapacity) {
      let chosen = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let index = 0; index < candidates.length; index += 1) {
        if (!active[index]) continue;
        const score = degrees[index] + tieNoise[index];
        if (score < bestScore) {
          bestScore = score;
          chosen = index;
        }
      }
      if (chosen < 0) break;
      selectedIndexes.push(chosen);
      const removed = [chosen, ...neighbors[chosen]];
      for (const index of removed) {
        if (!active[index]) continue;
        active[index] = false;
        for (const neighbor of neighbors[index]) if (active[neighbor]) degrees[neighbor] -= 1;
      }
    }
    const selected = selectedIndexes.map(index => candidates[index]);
    if (selected.length > best.length) best = selected;
    if (selected.length === config.totalCityCapacity) return { selected, trial: trial + 1 };
  }
  return { selected: best, trial: SELECTION_TRIALS };
}

function neutralCity(allocation, seedHash, point, terrainModel) {
  const id = createGeneratedCityId(allocation.regionId, seedHash, point);
  return {
    id,
    name: `Frontier ${id.slice(-6).toUpperCase()}`,
    regionId: allocation.regionId,
    x: Math.round(point.x),
    y: Math.round(point.y),
    xNorm: Math.round(point.x / terrainModel.width * 1e6) / 1e6,
    yNorm: Math.round(point.y / terrainModel.height * 1e6) / 1e6,
    owner: "neutral",
    ownerKind: "neutral",
    startType: "neutral",
    level: 1,
    troops: 10,
    defense: 1,
    generated: true,
  };
}

function generateOptimizedRegionPrototype({ allocation, definition, existingRegions, generatorVersion, seedSalt }) {
  const config = normalizeConfig({
    totalCityCapacity: 40,
    minCitySeparation: 112,
    maximumCandidateEvaluations: 320000,
  });
  const terrainModel = normalizeTerrainDefinition(definition, config);
  const seed = createSeedMetadata({ allocation, seedSalt, generatorVersion });
  const random = createDeterministicRandom(`${seed.seedHash}|feasibility-grid`);
  const pool = buildCandidatePool(terrainModel, config, random);
  const neighbors = conflictGraph(pool, config.minCitySeparation);
  const selection = selectNaturalLayout(pool, neighbors, config, seed.seedHash);
  const cities = selection.selected.map(point => neutralCity(allocation, seed.seedHash, point, terrainModel))
    .sort((left, right) => left.id.localeCompare(right.id));
  const startingCandidates = identifyStartingCityCandidates(cities, terrainModel, config);
  const generation = {
    seed,
    config,
    terrainModel,
    cities,
    startingCandidates,
    capacity: estimateUsableCapacity(terrainModel, config, cities.length),
    metrics: {
      strategy: "deterministic-feasibility-grid-with-jitter-v1",
      candidatePositionsEvaluated: pool.length,
      acceptedPositions: cities.length,
      rejectedPositions: Math.max(0, pool.length - cities.length),
      rejectedByReason: {},
      selectionTrial: selection.trial,
      selectionTrialLimit: SELECTION_TRIALS,
      gridStep: GRID_STEP,
      gridJitter: GRID_JITTER,
    },
  };
  const validation = validateGeneratedDefinition({ allocation, definition, generation, existingRegions });
  const exactFortyAndFour = cities.length === 40 && startingCandidates.selected.length === 4;
  return {
    status: validation.valid && exactFortyAndFour ? "standby" : "rolled_back",
    seed,
    config,
    terrainModel,
    cities,
    startingCandidates,
    capacity: generation.capacity,
    metrics: generation.metrics,
    validation: exactFortyAndFour ? validation : {
      ...validation,
      valid: false,
      errors: [
        ...validation.errors,
        ...(cities.length !== 40 ? [`Placed ${cities.length} city positions; exactly 40 are required.`] : []),
        ...(startingCandidates.selected.length !== 4 ? [`Found ${startingCandidates.selected.length} starting candidates; exactly 4 are required for Phase 6D.`] : []),
      ],
    },
    previewDefinition: {
      ...definition,
      cities,
      startingCityCandidates: startingCandidates.selected,
    },
  };
}

module.exports = Object.freeze({
  GRID_STEP,
  GRID_JITTER,
  SELECTION_TRIALS,
  generateOptimizedRegionPrototype,
});
