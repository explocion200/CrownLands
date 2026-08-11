const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const serverOutput = path.join(root, "functions", "release-manifest.json");
const browserOutput = path.join(root, "release-manifest.js");

function getBuildId() {
  const environmentBuild = String(
    process.env.COMMIT_REF || process.env.GITHUB_SHA || process.env.DEPLOY_ID || "",
  ).trim();
  if (environmentBuild) return environmentBuild.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function listFiles(directory, predicate) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath, predicate);
    return predicate(absolutePath) ? [absolutePath] : [];
  });
}

function hashFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const absolutePath of [...files].sort()) {
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
    hash.update(relativePath);
    hash.update("\0");
    // Git may check out text as CRLF on Windows while CI uses LF. Source hashes
    // are diagnostics, so make them stable across deployment environments.
    hash.update(fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function writeAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, contents, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function validateOrWrite(filePath, expected) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (current === expected) return;
  if (checkOnly) throw new Error(`${path.relative(root, filePath)} is stale or missing.`);
  writeAtomic(filePath, expected);
}

function createManifest() {
  const release = JSON.parse(fs.readFileSync(path.join(root, "functions", "release-config.json"), "utf8"));
  const contractHash = String(release.apiContractHash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(contractHash)) {
    throw new Error("functions/release-config.json must define a 64-character apiContractHash.");
  }
  const functionsRoot = path.join(root, "functions");
  const serverFiles = listFiles(functionsRoot, absolutePath => {
    const relativePath = path.relative(functionsRoot, absolutePath).replace(/\\/g, "/");
    if (relativePath === "release-manifest.json") return false;
    if (relativePath.startsWith("node_modules/") || relativePath.startsWith("test/")) return false;
    return /\.(?:js|json|yaml|yml)$/.test(relativePath) || relativePath === "pnpm-lock.yaml";
  });
  serverFiles.push(path.join(root, "firestore.rules"), path.join(root, "firestore.indexes.json"));

  const clientFiles = [
    "index.html", "styles.css", "game.js", "common-gear.js", "instant-economy-actions.js", "firebaseClient.js", "animation-manager.js", "audio-manager.js",
    "service-worker.js", "firebase-messaging-sw.js", "manifest.webmanifest",
    "release-config.js", "economy-config.js", "world-config.js", "ui-layout-config.js",
    "ui-layout-runtime.js", "ads-config.js", "assets/map-editor-data.js",
  ].map(relativePath => path.join(root, relativePath));

  const indexSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
  const callableNames = [...indexSource.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)]
    .map(match => match[1])
    .filter((name, index, values) => values.indexOf(name) === index)
    .sort();
  const serverSourceHash = hashFiles(serverFiles);
  const clientSourceHash = hashFiles(clientFiles);

  return {
    schemaVersion: 1,
    buildId: getBuildId(),
    releaseId: release.releaseId,
    resetGeneration: release.resetGeneration,
    worldId: release.worldId,
    contractHash,
    serverSourceHash,
    clientSourceHash,
    callableCount: callableNames.length,
  };
}

const manifest = createManifest();
const serverSource = `${JSON.stringify(manifest, null, 2)}\n`;
const browserSource = `(function () {\n  window.CROWNLANDS_RELEASE_MANIFEST = Object.freeze(${JSON.stringify(manifest, null, 2)});\n})();\n`;
validateOrWrite(serverOutput, serverSource);
validateOrWrite(browserOutput, browserSource);
console.log(`${checkOnly ? "Validated" : "Generated"} release manifest ${manifest.buildId.slice(0, 12)} (${manifest.callableCount} callables).`);
