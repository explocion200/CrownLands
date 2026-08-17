"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PHASE_A_DIR = path.join(ROOT_DIR, "benchmark-results", "map", "core-v2-phase-a");
const OUTPUT_DIR = path.join(ROOT_DIR, "benchmark-results", "map", "core-v2-phase-a1");
const THRESHOLDS = Object.freeze([70, 75, 80, 90, 100, 112]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function quantile(sorted, probability) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function analyzePrototype(prototype) {
  const cities = readJson(path.join(ROOT_DIR, prototype.outputDirectory, "cities.json"));
  const pairs = [];
  const nearestByCity = new Map(cities.map(city => [city.id, Number.POSITIVE_INFINITY]));
  for (let leftIndex = 0; leftIndex < cities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cities.length; rightIndex += 1) {
      const left = cities[leftIndex];
      const right = cities[rightIndex];
      const distance = Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
      pairs.push({ leftId: left.id, rightId: right.id, distance });
      nearestByCity.set(left.id, Math.min(nearestByCity.get(left.id), distance));
      nearestByCity.set(right.id, Math.min(nearestByCity.get(right.id), distance));
    }
  }
  pairs.sort((left, right) => left.distance - right.distance || left.leftId.localeCompare(right.leftId));
  const nearestDistances = [...nearestByCity.values()].sort((left, right) => left - right);
  const pairCountsUnder = Object.fromEntries(THRESHOLDS.map(threshold => [String(threshold), pairs.filter(pair => pair.distance < threshold).length]));
  return {
    key: prototype.key,
    name: prototype.name,
    mapType: prototype.mapType,
    exactCityCapacity: prototype.exactCityCapacity,
    actualCityCount: cities.length,
    minCenterSpacingPx: round(pairs[0]?.distance || 0),
    p5NearestNeighborSpacingPx: round(quantile(nearestDistances, 0.05)),
    medianNearestNeighborSpacingPx: round(quantile(nearestDistances, 0.5)),
    maxNearestNeighborSpacingPx: round(nearestDistances.at(-1) || 0),
    pairCountsUnderPx: pairCountsUnder,
    tightestPairs: pairs.slice(0, 10).map(pair => ({ ...pair, distance: round(pair.distance) })),
    nearestNeighborSpacingPx: nearestDistances.map(distance => round(distance)),
  };
}

function markdown(report) {
  const lines = [
    "# Core v2 Phase A.1 spacing analysis",
    "",
    "Development-only analysis of the approved Phase A city coordinates. `p5` is the linearly interpolated fifth percentile of each city's nearest-neighbor distance. Threshold columns count unordered city pairs with center distance strictly below the stated number of source-image pixels.",
    "",
    "| Map | Cities | Min | p5 nearest | Median nearest | <70 | <75 | <80 | <90 | <100 | <112 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  report.results.forEach(result => {
    const count = threshold => result.pairCountsUnderPx[String(threshold)];
    lines.push(`| ${result.name} | ${result.actualCityCount} | ${result.minCenterSpacingPx} | ${result.p5NearestNeighborSpacingPx} | ${result.medianNearestNeighborSpacingPx} | ${count(70)} | ${count(75)} | ${count(80)} | ${count(90)} | ${count(100)} | ${count(112)} |`);
  });
  lines.push("", "## Tightest pairs", "");
  report.results.forEach(result => {
    const pair = result.tightestPairs[0];
    lines.push(`- ${result.name}: ${pair.leftId} ↔ ${pair.rightId}, ${pair.distance} px.`);
  });
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function run() {
  const index = readJson(path.join(PHASE_A_DIR, "prototype-index.json"));
  const report = {
    schemaVersion: 1,
    phase: "Core v2 Phase A.1",
    developmentOnly: true,
    sourcePhase: "Core v2 Phase A",
    units: "source-image pixels at 1448x1086",
    p5Definition: "linear interpolation over per-city nearest-neighbor distances",
    pairThresholdDefinition: "unordered city pairs with center-to-center distance strictly below threshold",
    thresholdsPx: THRESHOLDS,
    results: index.prototypes.map(analyzePrototype),
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "spacing-analysis.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "SPACING_ANALYSIS.md"), markdown(report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) run();

module.exports = { analyzePrototype, quantile, run };
