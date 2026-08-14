"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runPhase5FixtureSuite } = require("./map-scaling-phase-5/fixtures");
const { writePhase5Previews } = require("./map-scaling-phase-5/preview");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "benchmark-results", "map", "phase-5");

function summarizeSuite(suite, preview) {
  const profiles = suite.playerProfiles.map(fixture => ({
    kind: fixture.kind,
    status: fixture.result.status,
    cityCount: fixture.result.package.cities.length,
    startingCandidateCount: fixture.result.package.startingCandidates.length,
    terrainPlanHash: fixture.result.terrainPlan.terrainPlanHash,
    cityHash: fixture.result.package.hashes.cityHash,
    mapWebpHash: fixture.result.package.hashes.webpHash,
    thumbnailHash: fixture.result.package.hashes.thumbnailHash,
    packageHash: fixture.result.package.packageHash,
    mapBytes: fixture.result.package.mapWebp.bytes,
    thumbnailBytes: fixture.result.package.thumbnailWebp.bytes,
    deterministic: fixture.deterministic,
    validation: fixture.result.validation,
    timings: fixture.result.timings,
  }));
  return {
    schemaVersion: 1,
    phase: 5,
    developmentOnly: true,
    generatorVersion: suite.generatorVersion,
    assetLibraryVersion: suite.assetLibraryVersion,
    worldId: suite.worldId,
    seasonId: suite.seasonId,
    corePackage: {
      version: suite.corePackage.corePackageVersion,
      packageHash: suite.corePackage.packageHash,
      cellCount: suite.corePackage.cells.length,
      activeCoreRegionCount: suite.coreFixtures.validation.activeCoreRegionCount,
      reservedCoreCellCount: suite.coreFixtures.validation.reservedCoreCellCount,
      holdingTowerReservationCount: suite.coreFixtures.validation.holdingTowerReservationCount,
      validation: suite.coreFixtures,
    },
    assetLibrary: {
      assetCount: suite.assetLibraryValidation.assetCount,
      productionReady: false,
      validation: suite.assetLibraryValidation,
    },
    profiles,
    constrainedInvalid: {
      status: suite.constrainedInvalid.result.status,
      cityCount: suite.constrainedInvalid.result.previewDefinition.cities.length,
      outputFiles: suite.constrainedInvalid.result.outputFiles,
      validationErrors: suite.constrainedInvalid.result.validation.errors,
      rollbackValidation: suite.constrainedInvalid.result.rollbackValidation,
      timings: suite.constrainedInvalid.result.timings,
    },
    topologyFixtures: suite.topologyFixtures,
    invalidMutations: suite.invalidMutations,
    preview: {
      developmentOnly: true,
      files: preview.files,
    },
    performance: {
      totalProfileGenerationMs: profiles.reduce((sum, profile) => sum + profile.timings.totalMs, 0),
      averageProfileGenerationMs: profiles.reduce((sum, profile) => sum + profile.timings.totalMs, 0) / profiles.length,
      maximumProfileGenerationMs: Math.max(...profiles.map(profile => profile.timings.totalMs)),
      totalMapBytes: profiles.reduce((sum, profile) => sum + profile.mapBytes, 0),
      totalThumbnailBytes: profiles.reduce((sum, profile) => sum + profile.thumbnailBytes, 0),
      approximateHeapDeltaBytes: profiles.reduce((sum, profile) => sum + profile.timings.approximateHeapDeltaBytes, 0),
    },
  };
}

function runPhase5() {
  const normalized = path.resolve(outputRoot);
  const expectedSuffix = path.join("benchmark-results", "map", "phase-5");
  if (!normalized.endsWith(expectedSuffix)) throw new Error("Refusing to reset an unexpected Phase 5 output path.");
  fs.rmSync(normalized, { recursive: true, force: true });
  fs.mkdirSync(normalized, { recursive: true });
  const suite = runPhase5FixtureSuite(normalized);
  fs.mkdirSync(path.join(normalized, "core"), { recursive: true });
  fs.writeFileSync(path.join(normalized, "core", "permanent-core-package.json"), `${JSON.stringify(suite.corePackage, null, 2)}\n`);
  fs.writeFileSync(path.join(normalized, "asset-library.json"), `${JSON.stringify(suite.assetLibrary, null, 2)}\n`);
  const preview = writePhase5Previews(normalized, suite);
  const report = summarizeSuite(suite, preview);
  fs.writeFileSync(path.join(normalized, "phase-5-results.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  const report = runPhase5();
  for (const profile of report.profiles) {
    console.log(`${profile.kind}: ${profile.status}, ${profile.cityCount} cities, ${profile.mapBytes} B WebP, ${profile.packageHash.slice(0, 12)}`);
  }
  console.log(`Core: ${report.corePackage.activeCoreRegionCount} active + ${report.corePackage.reservedCoreCellCount} reserved = ${report.corePackage.cellCount}; ${report.corePackage.holdingTowerReservationCount} Tower reservations.`);
  console.log(`Invalid constrained map: ${report.constrainedInvalid.status} with ${report.constrainedInvalid.cityCount} cities and ${report.constrainedInvalid.outputFiles.length} outputs.`);
  console.log(`Phase 5 average: ${report.performance.averageProfileGenerationMs.toFixed(2)} ms/package; ${report.performance.totalMapBytes} map bytes total.`);
}

module.exports = Object.freeze({ runPhase5, summarizeSuite, outputRoot });
