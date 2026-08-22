const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  CONFIG_RELATIVE_PATH,
  createCorePreviewService,
  parseConfigSource,
  resolveObjectiveVisualSize,
  sanitizeConfig,
} = require("./core-preview-service");

const ROOT = path.resolve(__dirname, "..", "..");

function createMemoryProjectFiles() {
  let configSource = fs.readFileSync(path.join(ROOT, CONFIG_RELATIVE_PATH), "utf8");
  return {
    async readText(relativePath) {
      assert.equal(relativePath, CONFIG_RELATIVE_PATH);
      return configSource;
    },
    async writeTextAtomic(relativePath, nextSource) {
      assert.equal(relativePath, CONFIG_RELATIVE_PATH);
      configSource = nextSource;
      return { path: relativePath, backupPath: ".crownlands-studio/backups/objective-visual-config.js.bak" };
    },
    resolveRead(relativePath) {
      return path.resolve(ROOT, ...String(relativePath).split("/"));
    },
    readConfig: () => parseConfigSource(configSource),
  };
}

test("Core preview workspace exposes only manifest-verified package data", async () => {
  const projectFiles = createMemoryProjectFiles();
  const service = createCorePreviewService(projectFiles, ROOT);
  const workspace = await service.getWorkspace();
  assert.equal(workspace.ok, true);
  assert.equal(workspace.offlineOnly, true);
  assert.equal(workspace.notLive, true);
  assert.equal(workspace.regions.length, 25);
  assert.equal(workspace.regions.reduce((total, region) => total + region.cities.length, 0), 1480);
  assert.equal(workspace.regions.reduce((total, region) => total + region.objectives.length, 0), 17);
  assert.ok(workspace.regions.every(region => region.map.url.startsWith("/api/core-preview/maps/")));
  assert.ok(workspace.regions.flatMap(region => region.objectives).every(objective => objective.interactionSize === objective.serializedSize));
});

test("project without the optional Core package returns a clear unavailable workspace", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-core-preview-unavailable-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const service = createCorePreviewService({
    async readText() { throw new Error("readText must not run before manifest verification"); },
    resolveRead(relativePath) { return path.resolve(root, ...String(relativePath).split("/")); },
  }, root);
  const workspace = await service.getWorkspace();
  assert.equal(workspace.ok, false);
  assert.equal(workspace.editable, false);
  assert.equal(workspace.reason, "unavailable");
  assert.match(workspace.errors[0], /Pending Core preview unavailable for this project/);
  assert.deepEqual(workspace.regions, []);
});

test("external visual config wins only for Core artwork, never interaction geometry", () => {
  const config = sanitizeConfig({ camp: 180, stronghold: 210, crownCitadel: 330 });
  const coreRegion = { id: "core-v2-test" };
  const liveRegion = { id: "center" };
  const camp = { id: "test_camp", campType: "gold", size: 132 };
  const stronghold = { id: "test_stronghold", strongholdType: "gold_stronghold", size: 154 };
  const citadel = { id: "test_citadel", strongholdType: "crown_citadel", size: 260 };
  assert.equal(resolveObjectiveVisualSize(config, coreRegion, camp), 180);
  assert.equal(resolveObjectiveVisualSize(config, coreRegion, stronghold), 210);
  assert.equal(resolveObjectiveVisualSize(config, coreRegion, citadel), 330);
  assert.equal(resolveObjectiveVisualSize(config, liveRegion, camp), 132);
  assert.equal(resolveObjectiveVisualSize(config, liveRegion, stronghold), 154);
  assert.equal(resolveObjectiveVisualSize(config, liveRegion, citadel), 260);
  assert.equal(camp.size, 132);
  assert.equal(stronghold.size, 154);
  assert.equal(citadel.size, 260);
});

test("atomic Core preview save changes only external config and re-verifies protection", async () => {
  const projectFiles = createMemoryProjectFiles();
  const service = createCorePreviewService(projectFiles, ROOT);
  const result = await service.save({ camp: 144, stronghold: 166, crownCitadel: 280 });
  assert.deepEqual(result.changedFiles, [CONFIG_RELATIVE_PATH]);
  assert.equal(result.generatedFilesAffected, 0);
  assert.equal(result.packageIntegrityUnchanged, true);
  assert.equal(result.resetCandidateUnchanged, true);
  assert.equal(result.packageOverallSha256, "1cc14d9af4bc4ee90a76f6c8f69b09f41ee191339baec3980cb51ce316e1bcbc");
  assert.deepEqual(projectFiles.readConfig().pendingCore5x5.visualSizes, { camp: 144, stronghold: 166, crownCitadel: 280 });
});

test("invalid visual size is rejected before any save", () => {
  assert.throws(() => sanitizeConfig({ camp: 10, stronghold: 154, crownCitadel: 260 }), /camp visual size/i);
  assert.throws(() => sanitizeConfig({ camp: 132, stronghold: 154.5, crownCitadel: 260 }), /stronghold visual size/i);
});
