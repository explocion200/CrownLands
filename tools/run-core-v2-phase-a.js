"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCoreSpecification,
  buildLayerOneFortressArchitecture,
  hashObject,
} = require("./core-v2-phase-a/spec");
const { buildFiveMapSlice } = require("./core-v2-phase-a/prototype");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-a");
const COMPOSER = path.join(ROOT, "tools", "map-scaling-phase-6d", "compose_map.py");
const QA_RENDERER = path.join(ROOT, "tools", "core-v2-phase-a", "render_qa.py");

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
  const fortressArchitecture = buildLayerOneFortressArchitecture();
  const prototypes = buildFiveMapSlice();
  assert.equal(prototypes.length, 5);
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeJson(path.join(OUTPUT_ROOT, "core-v2-package-spec.json"), specification);
  writeJson(path.join(OUTPUT_ROOT, "layer-1-fortress-reservations.json"), fortressArchitecture);

  const prototypeIndex = [];
  for (const prototype of prototypes) {
    assert(prototype.receipt.validation.valid, `${prototype.coreRegion.name} prototype failed validation.`);
    const directoryName = prototype.profile.key;
    const output = path.join(OUTPUT_ROOT, "prototypes", directoryName);
    fs.mkdirSync(output, { recursive: true });
    const compositionPath = path.join(output, "composition.json");
    writeJson(compositionPath, prototype.plan);
    writeJson(path.join(output, "cities.json"), prototype.cities);
    writeJson(path.join(output, "validation-receipt.json"), prototype.receipt);
    const renderOutput = runPython(COMPOSER, [
      "--plan", compositionPath,
      "--root", ROOT,
      "--output", output,
    ]);
    const renderReceipt = JSON.parse(renderOutput.split(/\r?\n/).at(-1));
    writeJson(path.join(output, "render-receipt.json"), renderReceipt);
    prototypeIndex.push({
      key: directoryName,
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
      cleanMapSha256: renderReceipt.cleanPng.sha256,
      mapWebpSha256: renderReceipt.map.sha256,
      thumbnailSha256: renderReceipt.thumbnail.sha256,
      outputDirectory: path.relative(ROOT, output).replaceAll("\\", "/"),
    });
  }
  const index = {
    schemaVersion: 1,
    phase: "Core v2 Phase A",
    developmentOnly: true,
    productionActivated: false,
    publicationAllowed: false,
    approvedBase: "99e56a8b1a4015607cdb438a7c1edc1922eca91e",
    exactCoreRegionCount: specification.regions.length,
    exactCoreCityCapacity: specification.regions.reduce((sum, region) => sum + region.exactCityCapacity, 0),
    prototypeCount: prototypeIndex.length,
    prototypes: prototypeIndex,
    specificationHash: hashObject(specification),
    fortressArchitectureHash: hashObject(fortressArchitecture),
  };
  index.indexHash = hashObject({ ...index, indexHash: undefined });
  writeJson(path.join(OUTPUT_ROOT, "prototype-index.json"), index);
  runPython(QA_RENDERER, ["--root", ROOT, "--output", OUTPUT_ROOT]);
  console.log(`Core v2 Phase A generated ${prototypeIndex.length} development-only prototypes.`);
  console.log(`Exact Core specification: ${index.exactCoreRegionCount} maps / ${index.exactCoreCityCapacity} cities.`);
  console.log(`Output: ${path.relative(ROOT, OUTPUT_ROOT)}`);
}

main();
