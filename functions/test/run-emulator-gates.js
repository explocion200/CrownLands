const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const testDirectory = __dirname;
const functionsDirectory = path.resolve(testDirectory, "..");
const firebaseCli = path.join(functionsDirectory, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const firebaseConfig = process.env.CROWNLANDS_FIREBASE_EMULATOR_CONFIG
  || process.env.CROWNLANDS_FIREBASE_CONFIG
  || "../firebase.json";
const resetGate = "emulator-reset-gate.js";
const discoveredGates = fs.readdirSync(testDirectory)
  .filter(fileName => /^emulator-.*\.js$/.test(fileName))
  .sort((left, right) => left.localeCompare(right));

if (!discoveredGates.includes(resetGate)) {
  throw new Error(`${resetGate} is required and must run before the remaining emulator gates.`);
}
if (!fs.existsSync(firebaseCli)) {
  throw new Error("The pinned Firebase CLI is missing. Run pnpm install --frozen-lockfile first.");
}

const orderedGates = [
  resetGate,
  ...discoveredGates.filter(fileName => fileName !== resetGate),
];

for (const fileName of orderedGates) {
  const grouped = process.env.GITHUB_ACTIONS === "true";
  if (grouped) console.log(`::group::${fileName}`);
  console.log(`\n[Crownlands emulator gate] ${fileName}`);

  const gateCommand = `node test/${fileName}`;
  const result = spawnSync(process.execPath, [
    firebaseCli,
    "emulators:exec",
    "--config", firebaseConfig,
    "--project", "crown-land-b15e0",
    "--only", "auth,firestore,functions",
    "--log-verbosity", "QUIET",
    gateCommand,
  ], {
    cwd: functionsDirectory,
    env: {
      ...process.env,
      METADATA_SERVER_DETECTION: "none",
    },
    stdio: "inherit",
  });

  if (grouped) console.log("::endgroup::");
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const signalSuffix = result.signal ? ` (signal ${result.signal})` : "";
    console.error(`[Crownlands emulator gate] ${fileName} failed${signalSuffix}.`);
    process.exit(result.status || 1);
  }
}

console.log(`\n[Crownlands emulator gate] Passed ${orderedGates.length} emulator files.`);
