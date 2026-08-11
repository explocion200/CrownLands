const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
if (output !== path.resolve(root, "dist") || !output.startsWith(`${root}${path.sep}`)) {
  throw new Error("Refusing to replace an unsafe production output path.");
}

const rootFiles = [
  "about.html", "ads.txt", "ads-config.js", "animation-manager.js", "audio-manager.js",
  "battle-economy-guide.css", "battle-economy-guide.html", "battle-economy-guide.js",
  "battle-guide-calculations.js", "economy-config.js", "firebase-config.js",
  "daily-rewards.css",
  "firebase-messaging-sw.js", "firebaseClient.js", "game-rules.html", "game.js", "instant-economy-actions.js",
  "how-to-play.html", "index.html", "manifest.webmanifest", "patch-notes.js",
  "privacy.html", "release-config.js", "release-manifest.js", "robots.txt",
  "route-worker.js", "service-worker.js", "site-info.css", "sitemap.xml",
  "styles.css", "support.html", "ui-layout-config.js", "ui-layout-runtime.js",
  "world-config.js",
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

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
rootFiles.forEach(relativePath => copy(relativePath));
copy("assets/map-editor-data.js");
copyDirectoryFiles("assets/icons");
copyDirectoryFiles("assets/optimized", relativePath => !relativePath.endsWith("manifest.json"));
copyDirectoryFiles("assets/worlds/world_01/maps", relativePath => relativePath.endsWith(".webp"));
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
