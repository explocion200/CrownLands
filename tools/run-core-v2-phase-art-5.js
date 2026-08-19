"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { buildCoreSpecification, hashObject } = require("./core-v2-phase-a/spec");
const { BATCH_COORDINATES, BATCH_VERSION, buildBatch } = require("./core-v2-phase-art-5/batch");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-5");
const COMPOSER = path.join(ROOT, "tools", "map-scaling-phase-6d", "compose_map.py");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runPython(script, args) {
  const pythonExecutable = process.env.CORE_V2_PYTHON || "python";
  const result = childProcess.spawnSync(pythonExecutable, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error(`${path.basename(script)} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function main() {
  const specification = buildCoreSpecification();
  const prototypes = buildBatch();
  assert.equal(prototypes.length, 5);
  assert.equal(prototypes.reduce((sum, prototype) => sum + prototype.cities.length, 0), 300);
  assert.deepEqual(
    prototypes.map(prototype => prototype.coreRegion.coordinate),
    BATCH_COORDINATES.map(coordinate => ({ ...coordinate, worldLayer: 0 })),
  );
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const entries = [];
  for (const prototype of prototypes) {
    assert(prototype.receipt.validation.valid, `${prototype.coreRegion.name} failed validation: ${prototype.receipt.validation.errors.join("; ")}`);
    const output = path.join(OUTPUT_ROOT, "geometry", prototype.profile.key);
    fs.mkdirSync(output, { recursive: true });
    const compositionPath = path.join(output, "composition.json");
    writeJson(compositionPath, prototype.plan);
    writeJson(path.join(output, "cities.json"), prototype.cities);
    writeJson(path.join(output, "validation-receipt.json"), prototype.receipt);
    const renderOutput = runPython(COMPOSER, ["--plan", compositionPath, "--root", ROOT, "--output", output]);
    const renderReceipt = JSON.parse(renderOutput.split(/\r?\n/).at(-1));
    writeJson(path.join(output, "render-receipt.json"), renderReceipt);
    entries.push({
      key: prototype.profile.key,
      regionId: prototype.coreRegion.regionId,
      name: prototype.coreRegion.name,
      coordinate: prototype.coreRegion.coordinate,
      mapType: prototype.coreRegion.mapType,
      exactCityCapacity: prototype.coreRegion.exactCityCapacity,
      climate: prototype.coreRegion.climate,
      objective: prototype.coreRegion.objective,
      profile: prototype.profile,
      topology: prototype.coreRegion.topology,
      compositionPlanHash: prototype.plan.planHash,
      cityPlanHash: prototype.receipt.cityPlanHash,
      validationReceiptHash: prototype.receipt.receiptHash,
      geometryDraftSha256: renderReceipt.cleanPng.sha256,
      outputDirectory: path.relative(ROOT, output).replaceAll("\\", "/"),
    });
  }
  const index = {
    schemaVersion: 1,
    phase: "Core v2 Phase ART-5",
    batchVersion: BATCH_VERSION,
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    approvedBase: "996e54c279c442592bb31dfea032097d80fc7d0a",
    exactBatchMapCount: entries.length,
    exactBatchCityCapacity: entries.reduce((sum, entry) => sum + entry.exactCityCapacity, 0),
    finishedCoreMapCountAfterApproval: 20,
    representedCoreCityCapacityAfterApproval: 1185,
    exactCoreRegionCount: specification.exactRegionCount,
    exactCoreCityCapacity: specification.exactCityCapacity,
    entries,
  };
  index.indexHash = hashObject({ ...index, indexHash: undefined });
  writeJson(path.join(OUTPUT_ROOT, "art5-index.json"), index);
  console.log(`Core v2 Phase ART-5 prepared ${entries.length} development-only geometry packages / ${index.exactBatchCityCapacity} cities.`);
  console.log(`Output: ${path.relative(ROOT, OUTPUT_ROOT)}`);
}

main();
