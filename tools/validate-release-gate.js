const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMatch = (source, pattern, message) => assert.match(source, pattern, message);

const packageJson = JSON.parse(read("functions/package.json"));
const workflow = read(".github/workflows/crownlands-release-gate.yml");
const emulatorRunner = read("functions/test/run-emulator-gates.js");
const functionsSource = read("functions/index.js");
const prePushHook = read(".githooks/pre-push");
const rootPackageJson = JSON.parse(read("package.json"));
const startFeature = read("tools/start-feature.js");
const preparePr = read("tools/prepare-pr.js");
const prePushCheck = read("tools/pre-push-check.js");
const safeUpdateTests = read("tools/test-safe-update-pipeline.js");
const riskClassifier = read("tools/change-risk-classifier.js");
const riskClassifierTests = read("tools/test-change-risk-classifier.js");
const validationRunner = read("tools/run-validation-tier.js");
const browserSmoke = read("tools/validate-focused-browser-smoke.js");
const safeUpdateDocs = read("docs/SAFE_UPDATE_WORKFLOW.md");

assert.equal(packageJson.packageManager, "pnpm@11.9.0", "The repository pnpm version must match CI.");
assert.equal(packageJson.engines?.node, "22", "The Functions runtime must remain pinned to Node 22.");
assert.equal(packageJson.devEngines?.runtime?.version, "22", "The development runtime must remain pinned to Node 22.");
assert.equal(packageJson.devDependencies?.["firebase-tools"], "15.22.4", "The Firebase CLI must be lockfile-pinned.");
assert.equal(packageJson.devDependencies?.pnpm, "11.9.0", "The pre-push package manager must be locally pinned.");
assert.equal(read(".node-version").trim(), "22", ".node-version must match the Functions runtime.");

requireMatch(workflow, /permissions:\s*\n\s+contents:\s*read/, "Release Gate permissions are not read-only.");
requireMatch(workflow, /actions\/checkout@v6/g, "Release Gate must use the Node 24 checkout action.");
requireMatch(workflow, /pnpm\/setup@v2/g, "Release Gate must use pnpm's v11-compatible setup action.");
requireMatch(workflow, /version:\s*["']?11\.9\.0["']?/, "Workflow pnpm version drifted from packageManager.");
requireMatch(workflow, /runtime:\s*["']?node@22["']?/, "Workflow Node runtime drifted from Functions.");
requireMatch(workflow, /actions\/setup-java@v5/, "Release Gate must use setup-java v5.");
requireMatch(workflow, /name:\s*Static validation/, "The required Static validation check name changed.");
requireMatch(workflow, /name:\s*Multiplayer emulator validation/, "The required Multiplayer emulator validation check name changed.");
requireMatch(workflow, /name:\s*Validate/, "The required Validate check name changed.");
requireMatch(workflow, /git fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main/, "CI does not fetch authoritative origin/main.");
requireMatch(workflow, /node tools\/change-risk-classifier\.js/, "CI does not use the shared risk classifier.");
requireMatch(workflow, /schedule:[\s\S]*cron:\s*["']17 5 \* \* \*["']/, "Nightly Full validation schedule is missing.");
requireMatch(workflow, /github\.event_name != 'pull_request'[\s\S]*validation:full/, "Push, manual, nightly, and validation:full label overrides must force Full.");
requireMatch(workflow, /pnpm run gate:fast[\s\S]*pnpm run gate:static/, "Static CI does not select the classified Fast or Standard/Full gate.");
requireMatch(workflow, /pnpm run test:emulators/, "Emulator CI does not use the shared release command.");
requireMatch(workflow, /not required for this classified \$VALIDATION_TIER change/, "Safe emulator skips must explain why the required check passes.");
requireMatch(workflow, /requires_emulators == 'true'/, "Emulator execution is not guarded by the fail-closed classifier output.");
assert.doesNotMatch(workflow, /validation_tier[\s\S]*type:\s*choice/i, "Manual tier choices must never downgrade classifier results.");
assert.doesNotMatch(workflow, /node\s+functions\/test\/emulator-/, "Workflow must not maintain a manual emulator-file list.");

requireMatch(packageJson.scripts?.["test:emulators"] || "", /run-emulator-gates\.js/, "Emulator script does not use automatic discovery.");
requireMatch(packageJson.scripts?.["gate:fast"] || "", /lint[\s\S]*test-change-risk-classifier[\s\S]*run-focused-validators[\s\S]*build-production-client[\s\S]*validate-production-artifact[\s\S]*validate-focused-browser-smoke/, "Fast validation is missing required syntax, focused, build, artifact, or browser checks.");
requireMatch(packageJson.scripts?.["gate:static"] || "", /test-change-risk-classifier[\s\S]*validate-focused-browser-smoke/, "Standard/Full static validation is missing classifier or browser coverage.");
requireMatch(packageJson.scripts?.["gate:release"] || "", /--frozen-lockfile[\s\S]*gate:static[\s\S]*test:emulators/, "Local release gate is incomplete.");
requireMatch(emulatorRunner, /readdirSync\(testDirectory\)/, "Emulator runner does not discover tests from disk.");
requireMatch(emulatorRunner, /\^emulator-\.\*\\\.js\$/, "Emulator runner discovery pattern changed.");
requireMatch(emulatorRunner, /resetGate,[\s\S]*discoveredGates\.filter/, "Reset gate must run before the remaining emulator files.");
requireMatch(emulatorRunner, /node_modules["'],\s*["']firebase-tools["'],\s*["']lib["'],\s*["']bin["'],\s*["']firebase\.js["']/, "Emulator gate must launch the pinned CLI without a detachable Windows shim.");
requireMatch(emulatorRunner, /for \(const fileName of orderedGates\)[\s\S]*emulators:exec/, "Each emulator gate must run in an isolated emulator lifecycle.");
for (const isolatedPort of [/websocketPort:\s*portBase \+ 3/, /hub:[\s\S]*port:\s*portBase \+ 4/, /logging:[\s\S]*port:\s*portBase \+ 5/, /eventarc:[\s\S]*port:\s*portBase \+ 6/, /tasks:[\s\S]*port:\s*portBase \+ 7/]) {
  requireMatch(emulatorRunner, isolatedPort, "Every Firebase support emulator must receive an isolated port.");
}
requireMatch(emulatorRunner, /--log-verbosity["'],\s*["']QUIET/, "Emulator gate must keep CI output bounded.");
requireMatch(
  emulatorRunner,
  /const coreExpansionGate\s*=\s*["']emulator-core-expansion-state\.js["'][\s\S]*const coreExpansionGates\s*=\s*new Set\(\[[\s\S]*?coreExpansionGate[\s\S]*?["']emulator-first-time-onboarding\.js["'][\s\S]*?["']emulator-main-city-recovery\.js["'][\s\S]*?\]\)[\s\S]*const forceCoreExpansion\s*=\s*coreExpansionGates\.has\(fileName\)[\s\S]*CROWNLANDS_FORCE_CORE_EXPANSION_EMULATOR:\s*forceCoreExpansion \? ["']1["'] : ["']0["'][\s\S]*CROWNLANDS_FORCE_LEGACY_REALM_EMULATOR:\s*forceCoreExpansion \? ["']0["'] : ["']1["']/,
  "All legacy emulator fixtures must remain calendar-independent while only Core expansion, onboarding, and Main City recovery exercise the active realm.",
);
requireMatch(functionsSource, /FORCE_LEGACY_REALM_EMULATOR\s*=\s*process\.env\.FUNCTIONS_EMULATOR[\s\S]*CROWNLANDS_FORCE_LEGACY_REALM_EMULATOR/, "The legacy reset fixture override must remain emulator-only.");
requireMatch(functionsSource, /ACTIVE_REALM_IDENTITY\s*=\s*REALM_TOPOLOGY\.getRealmIdentity\(RUNTIME_REALM_CONFIG,\s*Date\.now\(\)\)/, "Scheduled emulator jobs must initialize from the same calendar-independent runtime realm config as callables.");
requireMatch(prePushHook, /node tools\/pre-push-check\.js/, "Pre-push hook does not use the shared safety check.");
requireMatch(startFeature, /fetchOrigin[\s\S]*switch[\s\S]*main[\s\S]*--ff-only[\s\S]*origin\/main/, "start-feature does not safely synchronize main.");
requireMatch(preparePr, /runRiskBasedValidation[\s\S]*writePreparationReceipt[\s\S]*push[\s\S]*pr/, "prepare-pr does not classify, validate, receipt, push, and create or update a PR.");
requireMatch(prePushCheck, /refs\/heads\/main[\s\S]*assertClean[\s\S]*fetchOrigin[\s\S]*verifyPreparationReceipt/, "Pre-push protection is incomplete.");
requireMatch(safeUpdateTests, /mkdtempSync[\s\S]*init[\s\S]*--bare[\s\S]*Unfinished tracked or untracked work[\s\S]*behind origin\\\/main/, "Safe-update integration coverage is incomplete.");
requireMatch(riskClassifier, /baseRef = "origin\/main"/, "Risk classifier must default to origin/main.");
requireMatch(riskClassifier, /`\$\{baseRef\}\.\.\.\$\{headRef\}`/, "Risk classifier must compare the complete three-dot branch diff.");
requireMatch(riskClassifier, /not on a reviewed Fast or Standard allowlist/, "Unknown classifier paths must fail closed.");
for (const coverage of [/styles\.css/, /game\.js/, /functions\/index\.js/, /experimental-widget\.js/, /completeBranch/]) {
  requireMatch(riskClassifierTests, coverage, "Classifier tests are missing disguised critical, unknown, or complete-branch coverage.");
}
requireMatch(validationRunner, /classification\.tier === "Full"[\s\S]*gate:release[\s\S]*gate:fast[\s\S]*gate:static/, "Local validation runner does not enforce all three tiers.");
for (const browserCoverage of [/Page\.navigate/, /name: "desktop"/, /name: "landscape-mobile"/]) {
  requireMatch(browserSmoke, browserCoverage, "Focused browser smoke must exercise desktop and landscape-mobile production pages.");
}
requireMatch(safeUpdateDocs, /start-feature[\s\S]*complete branch diff[\s\S]*validation:full[\s\S]*Pull-request checks are pending/, "Safe-update risk-tier documentation is incomplete.");
assert.equal(rootPackageJson.scripts?.["start-feature"], "node tools/start-feature.js", "Root start-feature command is missing.");
assert.equal(rootPackageJson.scripts?.["prepare-pr"], "node tools/prepare-pr.js", "Root prepare-pr command is missing.");
assert.equal(rootPackageJson.scripts?.["test:safe-update"], "node tools/test-safe-update-pipeline.js", "Safe-update test command is missing.");
assert.equal(rootPackageJson.scripts?.["validation:full"], "node tools/run-validation-tier.js --force-full", "Full validation override is missing.");
assert.equal(rootPackageJson.scripts?.["test:change-risk"], "node tools/test-change-risk-classifier.js", "Classifier test command is missing.");

const emulatorFiles = fs.readdirSync(path.join(root, "functions/test"))
  .filter(fileName => /^emulator-.*\.js$/.test(fileName));
assert.ok(emulatorFiles.includes("emulator-reset-gate.js"), "Reset emulator gate is missing.");
assert.ok(emulatorFiles.length >= 11, "Expected multiplayer emulator coverage is missing.");

console.log(`Validated release-gate parity and automatic discovery for ${emulatorFiles.length} emulator files.`);
