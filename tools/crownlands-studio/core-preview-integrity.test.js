const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  EXPECTED,
  buildManifest,
  hashText,
  verifyManifest,
} = require("./core-preview-integrity");

const ROOT = path.resolve(__dirname, "..", "..");

test("supplemental Core preview manifest verifies the exact approved package", () => {
  const result = verifyManifest(ROOT);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.overallSha256, "1cc14d9af4bc4ee90a76f6c8f69b09f41ee191339baec3980cb51ce316e1bcbc");
  assert.equal(result.manifest.protectedFileCount, 59);
  assert.equal(result.manifest.authority.supplemental, true);
  assert.equal(result.manifest.authority.adoptedByProductionReset, false);
  assert.deepEqual(result.manifest.counts, {
    regions: EXPECTED.regionCount,
    maps: EXPECTED.mapCount,
    cities: EXPECTED.cityCount,
    objectives: EXPECTED.objectiveCount,
    directedConnections: 80,
    reciprocalConnections: EXPECTED.reciprocalConnectionCount,
  });
  assert.equal(result.manifest.artifacts.regions.length, 25);
  assert.equal(result.manifest.artifacts.mapArt.length, 25);
  assert.ok(result.manifest.artifacts.regions.every(region => region.geometrySha256 && region.objectivesSha256 && region.topologySha256));
});

test("manifest verification blocks a protected region geometry mutation", () => {
  const manifest = buildManifest(ROOT);
  const target = manifest.artifacts.regions[0].path;
  const result = verifyManifest(ROOT, {
    readFile(relativePath, absolutePath) {
      const source = fs.readFileSync(absolutePath);
      if (relativePath !== target) return source;
      const region = JSON.parse(source.toString("utf8"));
      region.cities[0].x += 1;
      return Buffer.from(JSON.stringify(region));
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes(`Integrity mismatch: ${target}`));
});

test("manifest verification blocks changed map art and a corrupt stored digest", () => {
  const manifest = buildManifest(ROOT);
  const mapTarget = manifest.artifacts.mapArt[0].path;
  const mapResult = verifyManifest(ROOT, {
    readFile(relativePath, absolutePath) {
      const source = fs.readFileSync(absolutePath);
      if (relativePath !== mapTarget) return source;
      const changed = Buffer.from(source);
      changed[0] ^= 0xff;
      return changed;
    },
  });
  assert.equal(mapResult.ok, false);
  assert.match(mapResult.errors.join(" "), /map art does not match its build receipt/i);

  const corrupt = JSON.parse(JSON.stringify(manifest));
  corrupt.protectedFileCount += 1;
  const digestResult = verifyManifest(ROOT, { manifest: corrupt });
  assert.equal(digestResult.ok, false);
  assert.match(digestResult.errors.join(" "), /stored manifest overall digest is invalid/i);
});

test("normalized text hashes are stable across checkout line endings", () => {
  assert.equal(hashText("alpha\nbeta\n"), hashText("alpha\r\nbeta\r\n"));
});
