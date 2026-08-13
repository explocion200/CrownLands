const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const required = [
  "index.html", "styles.css", "interface-theme.css", "game.js", "base-cities.js", "instant-economy-actions.js", "firebaseClient.js", "animation-manager.js", "release-manifest.js",
  "assets/map-editor-data.js", "assets/worlds/world_01/map-manifest.json", "audio/manifest.json", "functions/clanQuestPeriod.js",
  "artifact-manifest.json",
];
const forbidden = [
  "tools", "functions/index.js", "functions/package.json", "assets/camps",
  "assets/castles", "assets/inner-castle", "assets/optimized/manifest.json",
  "assets/worlds/world_01/regions", "assets/worlds/world_01/world-layout.json",
];

for (const relativePath of required) {
  if (!fs.existsSync(path.join(dist, relativePath))) throw new Error(`Production artifact is missing ${relativePath}.`);
}
for (const relativePath of forbidden) {
  if (fs.existsSync(path.join(dist, relativePath))) throw new Error(`Production artifact includes forbidden source data ${relativePath}.`);
}

const productionMapManifest = JSON.parse(fs.readFileSync(
  path.join(dist, "assets", "worlds", "world_01", "map-manifest.json"),
  "utf8",
));
if (productionMapManifest.maps?.length !== 15 || productionMapManifest.editableSourcesExcluded !== true) {
  throw new Error("Production map manifest must contain 15 immutable runtime entries without editable sources.");
}
for (const entry of productionMapManifest.maps) {
  if (entry.source || !/^assets\/worlds\/world_01\/maps\/versioned\/[\w-]+-[0-9a-f]{12}\.webp$/.test(entry.output || "")) {
    throw new Error(`${entry.id || "Unknown region"} has an invalid production gameplay map entry.`);
  }
}

const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolutePath);
    else files.push(absolutePath);
  }
}
collect(dist);
if (files.some(filePath => path.extname(filePath).toLowerCase() === ".wav")) {
  throw new Error("Production artifact contains WAV source masters.");
}
const totalBytes = files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
if (totalBytes > 25 * 1024 * 1024) {
  throw new Error(`Production artifact exceeds 25 MiB (${(totalBytes / 1024 / 1024).toFixed(2)} MiB).`);
}

for (const absolutePath of files.filter(filePath => /\.(?:html|css|js|json)$/i.test(filePath))) {
  if (absolutePath.endsWith(`${path.sep}audio${path.sep}manifest.json`)) continue;
  const source = fs.readFileSync(absolutePath, "utf8");
  for (const match of source.matchAll(/["'(]((?:\/?assets|\/?audio)\/[A-Za-z0-9_./-]+)(?:\?[^"')\s]*)?["')]/g)) {
    const requested = match[1].replace(/^\//, "");
    if (requested.endsWith("/")) continue;
    if (!fs.existsSync(path.join(dist, requested))) {
      throw new Error(`${path.relative(dist, absolutePath)} references missing runtime asset ${requested}.`);
    }
  }
}

console.log(`Production artifact validation passed (${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB).`);
