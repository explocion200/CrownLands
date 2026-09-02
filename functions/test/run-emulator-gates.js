const fs = require("node:fs");
const path = require("node:path");
const { randomInt } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const testDirectory = __dirname;
const functionsDirectory = path.resolve(testDirectory, "..");
const firebaseCli = path.join(functionsDirectory, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const firebaseConfig = process.env.CROWNLANDS_FIREBASE_EMULATOR_CONFIG
  || process.env.CROWNLANDS_FIREBASE_CONFIG
  || "../firebase.json";
const firebaseConfigPath = path.resolve(functionsDirectory, firebaseConfig);
const firebaseConfigTemplate = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
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

function createIsolatedFirebaseConfig(attemptId) {
  const portBase = randomInt(12000, 52000);
  const isolatedConfig = {
    ...firebaseConfigTemplate,
    emulators: {
      ...(firebaseConfigTemplate.emulators || {}),
      functions: {
        ...((firebaseConfigTemplate.emulators || {}).functions || {}),
        port: portBase,
      },
      firestore: {
        ...((firebaseConfigTemplate.emulators || {}).firestore || {}),
        port: portBase + 1,
      },
      auth: {
        ...((firebaseConfigTemplate.emulators || {}).auth || {}),
        port: portBase + 2,
      },
      ui: {
        ...((firebaseConfigTemplate.emulators || {}).ui || {}),
        enabled: false,
      },
    },
  };
  const temporaryConfigPath = path.join(
    path.dirname(firebaseConfigPath),
    `.firebase-emulator-gate-${process.pid}-${attemptId}.json`,
  );
  fs.writeFileSync(temporaryConfigPath, `${JSON.stringify(isolatedConfig, null, 2)}\n`, "utf8");
  return temporaryConfigPath;
}

for (const fileName of orderedGates) {
  const grouped = process.env.GITHUB_ACTIONS === "true";
  if (grouped) console.log(`::group::${fileName}`);
  const gateCommand = `node test/${fileName}`;
  const maxAttempts = 2;
  let result;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptSuffix = attempt > 1 ? ` (retry ${attempt - 1}/${maxAttempts - 1})` : "";
    const isolatedConfigPath = createIsolatedFirebaseConfig(`${fileName}-${attempt}`);
    console.log(`\n[Crownlands emulator gate] ${fileName}${attemptSuffix}`);
    try {
      result = spawnSync(process.execPath, [
        firebaseCli,
        "emulators:exec",
        "--config", isolatedConfigPath,
        "--project", "crown-land-b15e0",
        "--only", "auth,firestore,functions",
        "--log-verbosity", "QUIET",
        gateCommand,
      ], {
        cwd: functionsDirectory,
        env: {
          ...process.env,
          METADATA_SERVER_DETECTION: "none",
          CROWNLANDS_FORCE_CORE_EXPANSION_EMULATOR: fileName === "emulator-core-expansion-state.js"
            ? "1"
            : "0",
          CROWNLANDS_FORCE_LEGACY_REALM_EMULATOR: fileName === resetGate ? "1" : "0",
        },
        stdio: "inherit",
      });
    } finally {
      fs.rmSync(isolatedConfigPath, { force: true });
    }

    if (result.error) throw result.error;
    if (result.status === 0) break;
    if (attempt < maxAttempts) {
      const signalSuffix = result.signal ? ` (signal ${result.signal})` : "";
      console.warn(
        `[Crownlands emulator gate] ${fileName} exited with status ${result.status || 1}${signalSuffix}; retrying once to tolerate Firebase emulator shutdown flakes.`,
      );
    }
  }

  if (grouped) console.log("::endgroup::");
  if (result.status !== 0) {
    const signalSuffix = result.signal ? ` (signal ${result.signal})` : "";
    console.error(`[Crownlands emulator gate] ${fileName} failed${signalSuffix}.`);
    process.exit(result.status || 1);
  }
}

console.log(`\n[Crownlands emulator gate] Passed ${orderedGates.length} emulator files.`);
