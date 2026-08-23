const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const thumbnailRoot = path.join(projectRoot, "assets", "worlds", "world_01", "thumbnails");
const versionedRoot = path.join(thumbnailRoot, "versioned");
const manifestPath = path.join(projectRoot, "assets", "worlds", "world_01", "thumbnail-manifest.json");

const referenceFiles = [
  "game.js",
  "assets/map-editor-data.js",
  "functions/world-layout.json",
  "assets/worlds/world_01/world-layout.json",
  ...fs.readdirSync(path.join(projectRoot, "assets", "worlds", "world_01", "regions"))
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => `assets/worlds/world_01/regions/${name}`),
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createThumbnailEntries({ write }) {
  if (write) fs.mkdirSync(versionedRoot, { recursive: true });
  return fs.readdirSync(thumbnailRoot)
    .filter(name => name.endsWith("-thumb.webp"))
    .sort()
    .map(sourceName => {
      const sourcePath = path.join(thumbnailRoot, sourceName);
      const payload = fs.readFileSync(sourcePath);
      const sha256 = crypto.createHash("sha256").update(payload).digest("hex");
      const stem = sourceName.slice(0, -".webp".length);
      const outputName = `${stem}-${sha256.slice(0, 12)}.webp`;
      const outputPath = path.join(versionedRoot, outputName);
      if (write && !fs.existsSync(outputPath)) fs.copyFileSync(sourcePath, outputPath);
      if (!write && !fs.existsSync(outputPath)) {
        throw new Error(`Missing fingerprinted thumbnail assets/worlds/world_01/thumbnails/versioned/${outputName}.`);
      }
      return {
        id: stem.replace(/-thumb$/, ""),
        source: `assets/worlds/world_01/thumbnails/${sourceName}`,
        output: `assets/worlds/world_01/thumbnails/versioned/${outputName}`,
        bytes: payload.length,
        sha256,
      };
    });
}

function updateReferences(entries, { write }) {
  for (const relativePath of referenceFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const original = fs.readFileSync(absolutePath, "utf8");
    let updated = original;
    for (const entry of entries) {
      const sourceName = path.posix.basename(entry.source, ".webp");
      const referencePattern = new RegExp(
        `assets/worlds/world_01/thumbnails/(?:versioned/)?${escapeRegExp(sourceName)}(?:-[0-9a-f]{12})?\\.webp`,
        "g",
      );
      updated = updated.replace(referencePattern, entry.output);
    }
    if (!write && updated !== original) {
      throw new Error(`${relativePath} does not reference the current content-hashed thumbnails.`);
    }
    if (write && updated !== original) fs.writeFileSync(absolutePath, updated, "utf8");
  }
}

function writeManifest(entries, { write }) {
  const manifest = `${JSON.stringify({
    schemaVersion: 1,
    description: "Immutable map-picker thumbnails generated from the editable source thumbnails.",
    thumbnails: entries,
  }, null, 2)}\n`;
  if (!write) {
    const current = fs.existsSync(manifestPath)
      ? fs.readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n")
      : "";
    if (current !== manifest.replace(/\r\n/g, "\n")) {
      throw new Error("assets/worlds/world_01/thumbnail-manifest.json is stale.");
    }
    return;
  }
  fs.writeFileSync(manifestPath, manifest, "utf8");
}

function removeStaleVersionedThumbnails(entries, { write }) {
  if (!write || !fs.existsSync(versionedRoot)) return;
  const current = new Set(entries.map(entry => path.basename(entry.output)));
  for (const name of fs.readdirSync(versionedRoot)) {
    if (!/^(?:center|east|north|south|west|region_?\d+)-thumb-[0-9a-f]{12}\.webp$/.test(name)) continue;
    if (!current.has(name)) fs.unlinkSync(path.join(versionedRoot, name));
  }
}

function fingerprintWorldThumbnails({ checkOnly = false } = {}) {
  const options = { write: !checkOnly };
  const entries = createThumbnailEntries(options);
  if (entries.length !== 20) throw new Error(`Expected 20 source thumbnails, found ${entries.length}.`);
  updateReferences(entries, options);
  writeManifest(entries, options);
  removeStaleVersionedThumbnails(entries, options);
  return entries;
}

if (require.main === module) {
  const checkOnly = process.argv.includes("--check");
  const entries = fingerprintWorldThumbnails({ checkOnly });
  const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`${checkOnly ? "Validated" : "Fingerprint-stamped"} ${entries.length} world thumbnails (${bytes.toLocaleString("en-US")} bytes).`);
}

module.exports = { fingerprintWorldThumbnails };
