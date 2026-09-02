"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  classifyChanges,
  classifyGitDiff,
  classifyPath,
  parseNameStatus,
} = require("./change-risk-classifier");
const { focusedValidatorFiles } = require("./run-focused-validators");
const { focusedPages } = require("./validate-focused-browser-smoke");

function expectPath(filePath, expectedTier) {
  const actual = classifyPath(filePath);
  assert.equal(actual.tier, expectedTier, `${filePath}: ${actual.reason}`);
}

function expectChanges(files, expectedTier, options = {}) {
  const actual = classifyChanges(files, options);
  assert.equal(actual.tier, expectedTier, actual.files.map(item => `${item.path}: ${item.reason}`).join("\n"));
  return actual;
}

for (const filePath of [
  "README.md",
  "docs/player-guide.md",
  "styles.css",
  "home.html",
  "game-rules.html",
  "assets/icons/crown.png",
  "promo-screenshots/landing.webp",
]) expectPath(filePath, "Fast");

for (const filePath of [
  "animation-manager.js",
  "audio-manager.js",
  "public-site.js",
  "roadmap.js",
  "ui-layout-runtime.js",
]) expectPath(filePath, "Standard");

for (const filePath of [
  ".github/workflows/crownlands-release-gate.yml",
  "AGENTS.md",
  "assets/worlds/world_01/maps/versioned/map.webp",
  "docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md",
  "docs/SAFE_UPDATE_WORKFLOW.md",
  "firebaseClient.js",
  "firestore.indexes.json",
  "firestore.rules",
  "functions/index.js",
  "functions/styles.css",
  "game.js",
  "economy-config.js",
  "map-new-lands.js",
  "clan-rally-controller.js",
  "package.json",
  "release-config.js",
  "service-worker.js",
  "tools/prepare-pr.js",
]) expectPath(filePath, "Full");

expectChanges(["docs/player-guide.md", "styles.css"], "Fast");
expectChanges(["README.md", "animation-manager.js"], "Standard");

const disguisedGameplay = expectChanges(["styles.css", "docs/player-guide.md", "game.js"], "Full");
assert.equal(disguisedGameplay.files.find(item => item.path === "game.js").tier, "Full");

const disguisedBackend = expectChanges(["home.html", "functions/index.js"], "Full");
assert.equal(disguisedBackend.requiresEmulators, true);

const criticalRename = classifyChanges([
  { status: "R100", paths: ["firebaseClient.js", "firebase-client.css"] },
]);
assert.equal(criticalRename.tier, "Full", "Renaming a critical file to a safe-looking extension must remain Full.");

expectChanges(["experimental-widget.js"], "Full");
expectChanges([], "Full");

const forced = expectChanges(["README.md"], "Full", { forceFull: true });
assert.equal(forced.forcedFull, true);
assert.match(forced.decisionReason, /override can only upgrade/);

assert.deepEqual(parseNameStatus("M\0styles.css\0R100\0game.js\0game.css\0"), [
  { status: "M", paths: ["styles.css"] },
  { status: "R100", paths: ["game.js", "game.css"] },
]);

assert.deepEqual(focusedPages(["home.html"]), ["home.html"]);
assert.deepEqual(focusedPages(["animation-manager.js", "styles.css"]), ["index.html"]);
assert.ok(focusedValidatorFiles(["home.html"]).includes("validate-public-site-content.js"));
assert.ok(focusedValidatorFiles(["styles.css"]).includes("validate-ui-readability.js"));
assert.ok(focusedValidatorFiles(["animation-manager.js"]).includes("validate-animation-system.js"));

function git(cwd, args) {
  const result = childProcess.spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-risk-classifier-test-"));
try {
  git(temporaryRoot, ["init"]);
  git(temporaryRoot, ["config", "user.name", "Crownlands Test"]);
  git(temporaryRoot, ["config", "user.email", "test@example.invalid"]);
  fs.writeFileSync(path.join(temporaryRoot, "game.js"), "const authority = true;\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "README.md"), "baseline\n", "utf8");
  git(temporaryRoot, ["add", "game.js", "README.md"]);
  git(temporaryRoot, ["commit", "-m", "baseline"]);
  git(temporaryRoot, ["branch", "-M", "main"]);
  const base = git(temporaryRoot, ["rev-parse", "HEAD"]);
  git(temporaryRoot, ["switch", "-c", "codex/risk-test"]);

  fs.appendFileSync(path.join(temporaryRoot, "game.js"), "const changedAuthority = true;\n", "utf8");
  git(temporaryRoot, ["add", "game.js"]);
  git(temporaryRoot, ["commit", "-m", "critical first commit"]);
  fs.appendFileSync(path.join(temporaryRoot, "README.md"), "safe-looking final commit\n", "utf8");
  git(temporaryRoot, ["add", "README.md"]);
  git(temporaryRoot, ["commit", "-m", "docs final commit"]);

  assert.equal(
    classifyGitDiff(temporaryRoot, { baseRef: "HEAD~1", headRef: "HEAD" }).tier,
    "Fast",
    "The final commit is intentionally safe-looking for this regression fixture.",
  );
  const completeBranch = classifyGitDiff(temporaryRoot, { baseRef: base, headRef: "HEAD" });
  assert.equal(completeBranch.tier, "Full", "Complete branch classification must retain the earlier critical change.");
  assert.deepEqual(completeBranch.files.map(item => item.path), ["game.js", "README.md"]);
} finally {
  const expectedPrefix = path.join(os.tmpdir(), "crownlands-risk-classifier-test-");
  if (!temporaryRoot.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected test path: ${temporaryRoot}`);
  }
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log("Validated Fast, Standard, Full, mixed critical disguises, renames, unknown paths, full override, and complete-branch classification.");
