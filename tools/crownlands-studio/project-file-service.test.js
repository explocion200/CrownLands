const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  PROJECT_MARKERS,
  createProjectFileService,
  normalizeRelativePath,
  validateCrownlandsProject,
} = require("./project-file-service");

async function createTempRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-studio-test-"));
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

test("normalizes project-relative paths and rejects escapes", () => {
  assert.equal(normalizeRelativePath("assets\\worlds\\world_01\\world-layout.json"), "assets/worlds/world_01/world-layout.json");
  assert.throws(() => normalizeRelativePath("../outside.json"), /escapes/);
  assert.throws(() => normalizeRelativePath("C:\\outside.json"), /must be relative/);
  assert.throws(() => normalizeRelativePath("/outside.json"), /must be relative/);
});

test("validates required Crownlands Studio project markers", async t => {
  const root = await createTempRoot(t);
  for (const marker of PROJECT_MARKERS) {
    const target = path.join(root, ...marker.split("/"));
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const body = marker.endsWith("world-layout.json")
      ? JSON.stringify({ worldId: "world_test", regions: [{ id: "center" }] })
      : marker.endsWith(".json") ? "{}" : "// marker\n";
    await fsp.writeFile(target, body, "utf8");
  }
  const valid = await validateCrownlandsProject(root);
  assert.equal(valid.valid, true);
  await fsp.unlink(path.join(root, "ui-layout-config.js"));
  const invalid = await validateCrownlandsProject(root);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missing.includes("ui-layout-config.js"));
});

test("allowlisted writes are atomic, backed up, and root constrained", async t => {
  const root = await createTempRoot(t);
  await fsp.mkdir(path.join(root, "data"), { recursive: true });
  await fsp.writeFile(path.join(root, "data", "config.json"), "{\"version\":1}\n", "utf8");
  const service = createProjectFileService(root, {
    readExact: ["data/config.json"],
    writeExact: ["data/config.json"],
  });

  const result = await service.writeJsonAtomic("data/config.json", { version: 2 });
  assert.equal(result.path, "data/config.json");
  assert.equal((await service.readJson("data/config.json")).version, 2);
  assert.equal(JSON.parse(await fsp.readFile(path.join(root, result.backupPath), "utf8")).version, 1);
  assert.rejects(() => service.writeTextAtomic("data/not-allowed.txt", "no"), /not allowed/);
  assert.throws(() => service.relativeFromAbsolute(path.resolve(root, "..", "outside.txt")), /escapes/);
});
