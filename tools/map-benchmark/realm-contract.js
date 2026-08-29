"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SERVER_SOURCE_PATH = path.join(ROOT_DIR, "functions", "index.js");
const RELEASE_CONFIG_PATH = path.join(ROOT_DIR, "functions", "release-config.json");

function readNumericServerConstant(source, name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9]+);`));
  if (!match) throw new Error(`Could not derive ${name} from the authoritative server source.`);
  return Number(match[1]);
}

function extractRealmInfoSource(source) {
  const start = source.indexOf("exports.getRealmInfo = timedCallable(");
  const end = source.indexOf("exports.registerGameInstallation = timedCallable(", start);
  if (start < 0 || end <= start) throw new Error("Could not locate the authoritative getRealmInfo response.");
  return source.slice(start, end);
}

function loadAuthoritativeRealmContract() {
  const releaseConfig = JSON.parse(fs.readFileSync(RELEASE_CONFIG_PATH, "utf8"));
  const serverSource = fs.readFileSync(SERVER_SOURCE_PATH, "utf8");
  const realmInfoSource = extractRealmInfoSource(serverSource);
  const skillPointSystemVersion = readNumericServerConstant(serverSource, "SKILL_POINT_SYSTEM_VERSION");

  if (!realmInfoSource.includes("skillPointSystemVersion: SKILL_POINT_SYSTEM_VERSION")) {
    throw new Error("The authoritative realm response no longer exposes skillPointSystemVersion.");
  }

  return Object.freeze({
    ok: true,
    releaseId: String(releaseConfig.releaseId || ""),
    currentReleaseId: String(releaseConfig.releaseId || ""),
    resetGeneration: String(releaseConfig.resetGeneration || ""),
    worldId: String(releaseConfig.worldId || ""),
    contractHash: String(releaseConfig.apiContractHash || ""),
    currentContractHash: String(releaseConfig.apiContractHash || ""),
    releaseManifestVersion: 1,
    skillPointSystemVersion,
    capabilities: Object.freeze({ skillPointSystemVersion }),
    sourceHash: crypto.createHash("sha256").update(realmInfoSource).digest("hex"),
  });
}

module.exports = {
  extractRealmInfoSource,
  loadAuthoritativeRealmContract,
  readNumericServerConstant,
};
