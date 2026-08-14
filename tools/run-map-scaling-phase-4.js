"use strict";

const { getClockwiseRingCoordinates } = require("../region-catalog");
const { runPhase4ScenarioSuite } = require("./map-scaling-phase-4/scenarios");

function summarizeFixture(report) {
  const result = report.result;
  return {
    kind: report.kind,
    expectedSpawnReady: report.expectedSpawnReady,
    status: result.status,
    deterministic: report.deterministic,
    generationHash: result.generationHash,
    npcCityCount: result.previewDefinition.cities.length,
    startingCityCandidateCount: result.previewDefinition.startingCityCandidates.length,
    candidatePositionsEvaluated: result.metrics.candidatePositionsEvaluated,
    rejectedPositions: result.metrics.rejectedPositions,
    rejectedByReason: result.metrics.rejectedByReason,
    capacity: result.capacity,
    validationErrors: result.validation.errors,
    stateHistory: result.receipt.stateHistory,
    timingRuns: report.timings,
  };
}

function createPhase4Report() {
  const suite = runPhase4ScenarioSuite();
  const fullLayerMaps = suite.fullLayer.generated.map(entry => ({
    order: entry.index + 1,
    kind: entry.kind,
    regionId: entry.result.allocation.regionId,
    coordinate: entry.result.allocation.coordinate,
    npcCityCount: entry.result.previewDefinition.cities.length,
    startingCityCandidateCount: entry.result.previewDefinition.startingCityCandidates.length,
    status: entry.result.status,
    generationHash: entry.result.generationHash,
    generationAndValidationMs: entry.timing.generationAndValidationMs,
    candidatePositionsEvaluated: entry.result.metrics.candidatePositionsEvaluated,
    rejectedPositions: entry.result.metrics.rejectedPositions,
  }));
  const timingValues = fullLayerMaps.map(entry => entry.generationAndValidationMs);
  return {
    schemaVersion: 1,
    phase: 4,
    generatedAt: new Date().toISOString(),
    generatorVersion: suite.generatorVersion,
    developmentOnly: true,
    worldId: suite.worldId,
    seasonId: suite.seasonId,
    layerOneCoordinateOrder: getClockwiseRingCoordinates(1),
    fixtures: suite.fixtures.map(summarizeFixture),
    differentSeed: suite.differentSeed,
    partialRing: Object.fromEntries(Object.entries(suite.partialRing.stages).map(([count, stage]) => [count, {
      coordinate: stage.allocation.coordinate,
      previousClockwiseRegionId: stage.allocation.previousClockwiseRegionId,
      cardinalNeighbors: stage.allocation.cardinalNeighbors,
      connections: stage.region.connections,
      ringWillClose: stage.allocation.ringWillClose,
    }])),
    fullLayerOne: {
      mapCount: suite.fullLayer.playerRegions.length,
      spawnReadyCount: suite.fullLayer.generated.filter(entry => entry.result.status === "standby").length,
      minimumNpcCityCount: Math.min(...fullLayerMaps.map(entry => entry.npcCityCount)),
      maximumNpcCityCount: Math.max(...fullLayerMaps.map(entry => entry.npcCityCount)),
      totalNpcCityCount: fullLayerMaps.reduce((total, entry) => total + entry.npcCityCount, 0),
      minimumStartingCandidateCount: Math.min(...fullLayerMaps.map(entry => entry.startingCityCandidateCount)),
      layerHash: suite.fullLayer.layerHash,
      ringClosureRegionId: fullLayerMaps.at(-1).regionId,
      nextLayerAllocation: suite.fullLayer.layerTwoAllocation,
      timing: {
        ...suite.fullLayer.timing,
        minimumMapMs: Math.min(...timingValues),
        maximumMapMs: Math.max(...timingValues),
        averageMapMs: timingValues.reduce((total, value) => total + value, 0) / timingValues.length,
      },
      maps: fullLayerMaps,
    },
    retryPlan: suite.retryPlan,
  };
}

if (require.main === module) {
  const report = createPhase4Report();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const fixture of report.fixtures) {
      console.log(`${fixture.kind}: ${fixture.status}, ${fixture.npcCityCount} NPC cities, ${fixture.startingCityCandidateCount} starting candidates, ${fixture.generationHash.slice(0, 12)}`);
    }
    console.log(`Full Layer 1: ${report.fullLayerOne.spawnReadyCount}/${report.fullLayerOne.mapCount} standby, ${report.fullLayerOne.totalNpcCityCount} NPC cities, ${report.fullLayerOne.layerHash.slice(0, 12)}.`);
    console.log(`Next Layer 2 coordinate: ${report.fullLayerOne.nextLayerAllocation.coordinate.gridX},${report.fullLayerOne.nextLayerAllocation.coordinate.gridY}.`);
    console.log(`Generation: ${report.fullLayerOne.timing.averageMapMs.toFixed(2)} ms/map average, ${report.fullLayerOne.timing.maximumMapMs.toFixed(2)} ms maximum.`);
  }
}

module.exports = Object.freeze({ createPhase4Report });
