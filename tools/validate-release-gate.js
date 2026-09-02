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
requireMatch(workflow, /pnpm run gate:static/, "Static CI does not use the shared release command.");
requireMatch(workflow, /pnpm run test:emulators/, "Emulator CI does not use the shared release command.");
assert.doesNotMatch(workflow, /node\s+functions\/test\/emulator-/, "Workflow must not maintain a manual emulator-file list.");

requireMatch(packageJson.scripts?.["test:emulators"] || "", /run-emulator-gates\.js/, "Emulator script does not use automatic discovery.");
requireMatch(packageJson.scripts?.["gate:release"] || "", /--frozen-lockfile[\s\S]*gate:static[\s\S]*test:emulators/, "Local release gate is incomplete.");
requireMatch(emulatorRunner, /readdirSync\(testDirectory\)/, "Emulator runner does not discover tests from disk.");
requireMatch(emulatorRunner, /\^emulator-\.\*\\\.js\$/, "Emulator runner discovery pattern changed.");
requireMatch(emulatorRunner, /resetGate,[\s\S]*discoveredGates\.filter/, "Reset gate must run before the remaining emulator files.");
requireMatch(emulatorRunner, /node_modules["'],\s*["']firebase-tools["'],\s*["']lib["'],\s*["']bin["'],\s*["']firebase\.js["']/, "Emulator gate must launch the pinned CLI without a detachable Windows shim.");
requireMatch(emulatorRunner, /for \(const fileName of orderedGates\)[\s\S]*emulators:exec/, "Each emulator gate must run in an isolated emulator lifecycle.");
requireMatch(emulatorRunner, /--log-verbosity["'],\s*["']QUIET/, "Emulator gate must keep CI output bounded.");
requireMatch(emulatorRunner, /CROWNLANDS_FORCE_LEGACY_REALM_EMULATOR:[\s\S]*fileName === resetGate/, "The reset gate must use a calendar-independent legacy realm fixture.");
requireMatch(functionsSource, /FORCE_LEGACY_REALM_EMULATOR\s*=\s*process\.env\.FUNCTIONS_EMULATOR[\s\S]*CROWNLANDS_FORCE_LEGACY_REALM_EMULATOR/, "The legacy reset fixture override must remain emulator-only.");
requireMatch(prePushHook, /node tools\/pre-push-check\.js/, "Pre-push hook does not use the shared safety check.");
requireMatch(startFeature, /fetchOrigin[\s\S]*switch[\s\S]*main[\s\S]*--ff-only[\s\S]*origin\/main/, "start-feature does not safely synchronize main.");
requireMatch(preparePr, /runReleaseGate[\s\S]*writePreparationReceipt[\s\S]*push[\s\S]*pr/, "prepare-pr does not validate, receipt, push, and create or update a PR.");
requireMatch(prePushCheck, /refs\/heads\/main[\s\S]*assertClean[\s\S]*fetchOrigin[\s\S]*verifyPreparationReceipt/, "Pre-push protection is incomplete.");
requireMatch(safeUpdateTests, /mkdtempSync[\s\S]*init[\s\S]*--bare[\s\S]*Unfinished tracked or untracked work[\s\S]*behind origin\\\/main/, "Safe-update integration coverage is incomplete.");
requireMatch(safeUpdateDocs, /start-feature[\s\S]*prepare-pr[\s\S]*Pull-request checks are pending/, "Safe-update recovery documentation is incomplete.");
assert.equal(rootPackageJson.scripts?.["start-feature"], "node tools/start-feature.js", "Root start-feature command is missing.");
assert.equal(rootPackageJson.scripts?.["prepare-pr"], "node tools/prepare-pr.js", "Root prepare-pr command is missing.");
assert.equal(rootPackageJson.scripts?.["test:safe-update"], "node tools/test-safe-update-pipeline.js", "Safe-update test command is missing.");

const emulatorFiles = fs.readdirSync(path.join(root, "functions/test"))
  .filter(fileName => /^emulator-.*\.js$/.test(fileName));
assert.ok(emulatorFiles.includes("emulator-reset-gate.js"), "Reset emulator gate is missing.");
assert.ok(emulatorFiles.length >= 11, "Expected multiplayer emulator coverage is missing.");

console.log(`Validated release-gate parity and automatic discovery for ${emulatorFiles.length} emulator files.`);
