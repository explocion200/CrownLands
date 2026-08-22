const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { fingerprintWorldMaps } = require("./fingerprint-world-maps");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
if (output !== path.resolve(root, "dist") || !output.startsWith(`${root}${path.sep}`)) {
  throw new Error("Refusing to replace an unsafe production output path.");
}

const rootFiles = [
  "about.html", "ads.txt", "ads-config.js", "animation-manager.js", "audio-manager.js",
  "battle-economy-guide.css", "battle-economy-guide.html", "battle-economy-guide.js",
  "battle-guide-calculations.js", "battle-reports-guide.html", "clans-rallies-guide.html",
  "common-gear.js", "economy-config.js", "firebase-config.js",
  "daily-rewards.css",
  "daily-rewards-guide.html",
  "firebase-messaging-sw.js", "firebaseClient.js", "game-rules.html", "game.js", "base-cities.js", "holding-tower-ui.js", "instant-economy-actions.js",
  "guides.html", "home.html", "how-to-play.html", "index.html", "manifest.webmanifest", "objective-visual-config.js", "objectives-guide.html", "patch-notes.js",
  "privacy.html", "readability.css", "manuscript-prototype.css", "ui-contrast-correction.css", "interface-theme.css", "release-config.js", "release-manifest.js", "robots.txt",
  "region-catalog.js",
  "roadmap.css", "roadmap-data.js", "roadmap.html", "roadmap.js",
  "route-worker.js", "scouting-guide.html", "service-worker.js", "site-info.css", "skills-presets-guide.html", "sitemap.xml",
  "styles.css", "holding-tower-ui.css", "support.html", "ui-layout-config.js", "ui-layout-runtime.js",
  "terms.html", "updates.html", "public-site.js", "world-config.js",
];

function copy(relativeSource, relativeDestination = relativeSource) {
  const source = path.join(root, relativeSource);
  const destination = path.join(output, relativeDestination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectoryFiles(relativeDirectory, predicate = () => true) {
  const sourceDirectory = path.join(root, relativeDirectory);
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) copyDirectoryFiles(relativePath, predicate);
    else if (predicate(relativePath)) copy(relativePath);
  }
}

function writeProductionRegionDefinitions() {
  const world = JSON.parse(fs.readFileSync(path.join(root, "functions", "world-layout.json"), "utf8"));
  for (const map of world.maps || []) {
    const definition = {
      id: map.id,
      name: map.label,
      type: map.type,
      gridX: map.gridX,
      gridY: map.gridY,
      width: map.imageWidth,
      height: map.imageHeight,
      imagePath: map.imageSrc,
      thumbnailPath: map.thumbnailSrc,
      cityCapacity: map.cityCapacity,
      regionPath: map.regionDefinitionPath,
      cities: map.cities || [],
      strongholds: (map.objectives || []).map(objective => ({
        ...objective,
        strongholdType: objective.sourceStrongholdType || objective.strongholdType || objective.type,
        bonusType: objective.bonus,
        bonusAmount: objective.bonusPercent,
      })),
      camps: map.camps || [],
      edgeConnections: map.edgeConnections || {},
    };
    const destination = path.join(output, map.regionDefinitionPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(definition, null, 2)}\n`, "utf8");
  }
}

fingerprintWorldMaps();
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
rootFiles.forEach(relativePath => copy(relativePath));
copyDirectoryFiles("assets/icons", relativePath => !relativePath.endsWith("crownlands-icon-master.png"));
copyDirectoryFiles("assets/optimized", relativePath => !relativePath.endsWith("manifest.json"));
if (fs.existsSync(path.join(root, "promo-screenshots"))) {
  copyDirectoryFiles("promo-screenshots", relativePath => /\.(?:png|jpe?g|webp)$/i.test(relativePath));
}
copy("assets/worlds/world_01/map-manifest.json");
copy("assets/worlds/world_01/region-catalog.js");
writeProductionRegionDefinitions();
const productionMapManifestPath = path.join(output, "assets", "worlds", "world_01", "map-manifest.json");
const productionMapManifest = JSON.parse(fs.readFileSync(productionMapManifestPath, "utf8"));
productionMapManifest.description = "Immutable regional gameplay maps included in this production artifact.";
productionMapManifest.editableSourcesExcluded = true;
productionMapManifest.maps = productionMapManifest.maps.map(({ id, output: runtimePath, bytes, sha256 }) => ({
  id,
  output: runtimePath,
  bytes,
  sha256,
}));
fs.writeFileSync(productionMapManifestPath, `${JSON.stringify(productionMapManifest, null, 2)}\n`, "utf8");
copyDirectoryFiles("assets/worlds/world_01/maps/versioned", relativePath => relativePath.endsWith(".webp"));
copyDirectoryFiles("assets/worlds/world_01/thumbnails/versioned", relativePath => relativePath.endsWith(".webp"));
copy("audio/manifest.json");
copyDirectoryFiles("audio", relativePath => /\.(?:mp3|ogg)$/i.test(relativePath));
copy("functions/clanQuestPeriod.js");

const stamp = spawnSync(process.execPath, [path.join(__dirname, "stamp-deploy-build.js"), "--root", "dist"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (stamp.error) throw stamp.error;
if (stamp.status !== 0) process.exit(stamp.status || 1);

const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolutePath);
    else files.push({
      path: path.relative(output, absolutePath).replace(/\\/g, "/"),
      bytes: fs.statSync(absolutePath).size,
    });
  }
}
collect(output);
const inventory = {
  schemaVersion: 1,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files: files.sort((left, right) => left.path.localeCompare(right.path)),
};
fs.writeFileSync(path.join(output, "artifact-manifest.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(`Built dist with ${inventory.fileCount} files (${(inventory.totalBytes / 1024 / 1024).toFixed(2)} MiB).`);
