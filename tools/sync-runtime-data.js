const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { buildCompatibilityMapData, readWorldData } = require("./editor-server");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

const paths = {
  browserEconomy: path.join(root, "economy-config.js"),
  serverEconomy: path.join(root, "functions", "economy-config.json"),
  browserRealm: path.join(root, "release-config.js"),
  serverRealm: path.join(root, "functions", "release-config.json"),
  browserWorld: path.join(root, "assets", "map-editor-data.js"),
  serverWorld: path.join(root, "functions", "world-layout.json"),
};

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function browserAssignment(name, value) {
  return `(function () {\n  window.${name} = Object.freeze(${JSON.stringify(value, null, 2)});\n})();\n`;
}

async function replaceAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.tmp`;
  await fsp.writeFile(temporaryPath, contents, "utf8");
  await fsp.rename(temporaryPath, filePath);
}

async function validateOrWrite(filePath, expected, label) {
  const current = await fsp.readFile(filePath, "utf8").catch(() => "");
  if (current === expected) return;
  if (checkOnly) throw new Error(`${label} is stale. Run node tools/sync-runtime-data.js.`);
  await replaceAtomic(filePath, expected);
}

async function main() {
  const economy = JSON.parse(await fsp.readFile(paths.serverEconomy, "utf8"));
  const realm = JSON.parse(await fsp.readFile(paths.serverRealm, "utf8"));
  const { layout, regions } = await readWorldData();
  const world = buildCompatibilityMapData(layout, regions);

  await validateOrWrite(
    paths.browserEconomy,
    `window.CROWNLANDS_ECONOMY_CONFIG = ${JSON.stringify(economy, null, 2)};\n`,
    "Browser economy configuration",
  );
  await validateOrWrite(
    paths.browserRealm,
    browserAssignment("CROWNLANDS_REALM_CONFIG", realm),
    "Browser realm configuration",
  );
  await validateOrWrite(
    paths.browserWorld,
    `window.CROWNLANDS_MAP_EDITOR_DATA = ${JSON.stringify(world, null, 2)};\n`,
    "Browser world layout",
  );
  await validateOrWrite(paths.serverWorld, stableJson(world), "Server world layout");

  const mode = checkOnly ? "Validated" : "Synchronized";
  console.log(`${mode} economy, realm, and ${world.maps.length} world regions from canonical sources.`);
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
