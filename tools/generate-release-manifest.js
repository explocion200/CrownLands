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
    "assets/icons/google-translate-attribution.png", "assets/icons/google-translate-attribution-short.png",
    "chat-ledger-ui.css", "chat-translation.js", "reward-ledger-ui.js", "reward-ledger-ui.css",
    "marches-activity-ui.css", "marches-activity-ui.js",
    "rallies-activity-ui.css", "rallies-activity-ui.js",
    "reinforcements-activity-ui.css", "reinforcements-activity-ui.js",
    "objectives-activity-ui.css", "objectives-activity-ui.js",
    "troop-orders-ui.css", "troop-orders-ui.js",
    "assets/icons/troop-orders/crossed-swords.svg", "assets/icons/troop-orders/marching-banner.svg",
    "assets/clan-heraldry/art-set-v1/svg/full/fortress-keep.svg", "assets/clan-heraldry/art-set-v1/svg/full/crown.svg",
    "quests-ui.js", "quests-ui.css",
    "achievements-ui.js", "achievements-ui.css",
    "player-profile-ui.js", "player-profile-ui.css",
    "skills-ledger-ui.css",
    "clan-ledger-ui.css",
    "settings-ledger-ui.css", "assets/icons/chat-ledger-seal.svg", "assets/icons/hero-reward-crown.svg", "assets/icons/settings-ledger.svg",
    ...fs.readdirSync(path.join(root, "assets/icons/skills")).filter(name => name.endsWith(".svg")).map(name => `assets/icons/skills/${name}`),
    "assets/icons/reward-daily-login-r1.svg", "assets/icons/reward-daily-quests-r1.svg", "assets/icons/reward-achievements-r1.svg",
    "daily-login-ui.js", "daily-login-ui.css", "index.html", "styles.css", "city-details-ui.js", "city-details-ui.css", "city-list-ui.css", "holding-tower-ui.css", "interface-theme.css", "common-gear-ui.css", "manuscript-prototype.css", "ui-contrast-correction.css", "profile-theme.css", "crownlands-palette.css", "action-buttons.css", "mobile-viewport.css", "chat.css", "chat-ui.js", "game.js", "holding-tower-ui.js", "camp-details-ui.js", "camp-details-ui.css", "clan-tower-details-ui.js", "clan-tower-details-ui.css", "base-cities.js", "common-gear.js", "common-gear-ui.js", "instant-economy-actions.js", "firebaseClient.js", "animation-manager.js", "audio-manager.js",
    "service-worker.js", "firebase-messaging-sw.js", "manifest.webmanifest",
    "treasury-gear-ui.js", "treasury-gear-ui.css",
    "barracks-gear-ui.js", "barracks-gear-ui.css",
  "gatehouse-gear-ui.js", "gatehouse-gear-ui.css",
  "royal-stables-gear-ui.js", "royal-stables-gear-ui.css",
  "common-gear-box-ui.js", "common-gear-box-ui.css",
  "item-bag-ui.js", "item-bag-ui.css",
  "assets/icons/common-gear-chest-r1.svg",
    "release-config.js", "economy-config.js", "world-config.js", "ui-layout-config.js",
    "ui-layout-runtime.js", "ads-config.js", "assets/map-editor-data.js", "clan-heraldry-v2.css",
    "region-catalog.js", "functions/world-travel-network.js", "functions/clanHeraldryConfig.js", "functions/clanHeraldryAssets.js", "functions/clanHeraldryLegacyV1.js", "functions/clanHeraldryRenderer.js",
    "assets/clan-heraldry/art-set-v1/manifest.json", "assets/clan-heraldry/art-set-v1/charges-full.svg", "assets/clan-heraldry/art-set-v1/charges-micro.svg",
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
