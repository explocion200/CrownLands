"use strict";
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runValidationTier } = require("./run-validation-tier");
const { selectGates } = require("../functions/test/run-emulator-gates");
const gates = ["emulator-chat.js", "emulator-reset-gate.js", "emulator-tower.js"];
assert.deepEqual(selectGates(gates, ["--file", "emulator-tower.js"]), ["emulator-tower.js"], "A selected suite must not implicitly run reset or chat.");
assert.deepEqual(selectGates(gates), ["emulator-reset-gate.js", "emulator-chat.js", "emulator-tower.js"]);
assert.deepEqual(selectGates(gates, ["--file", gates[0], "--file", gates[0]]), [gates[0]]);
for (const args of [["--file"], ["--all"], ["--file", "emulator-missing.js"], ["--file", "../emulator-chat.js"]]) {
  assert.throws(() => selectGates(gates, args), /Use --file|Unknown emulator/);
}
const discovered = fs.readdirSync(path.join(__dirname, "../functions/test")).filter(file => /^emulator-.*\.js$/.test(file));
const reset = "emulator-reset-gate.js";
const shards = [1, 2, 3, 4].map(index => selectGates(discovered, ["--shard", `${index}/4`]));
for (const shard of shards) assert.equal(shard[0], reset, "Every worker must run reset before its isolated suites.");
const partition = shards.flatMap(shard => shard.slice(1));
assert.equal(new Set(partition).size, partition.length, "Non-reset suites must not be duplicated across workers.");
assert.deepEqual([...partition].sort(), discovered.filter(file => file !== reset).sort(), "Full sharding must not drop any discovered suite.");
assert.deepEqual(selectGates(discovered, ["--shard", "1/1"]), selectGates(discovered));
assert.deepEqual(selectGates([...discovered].reverse(), ["--shard", "2/4"]), shards[1], "Filesystem order must not change the partition.");
for (const shard of ["", "0/4", "5/4", "1/0", "1/17", "1/4junk", "1.5/4"]) {
  assert.throws(() => selectGates(discovered, ["--shard", shard]), /Use --shard/);
}
assert.throws(() => selectGates(discovered, ["--shard", "1/4", "--shard", "2/4"]), /Use --shard/);
assert.throws(() => selectGates(discovered, ["--shard", "1/4", "--file", reset]), /not selected files/);
assert.throws(() => selectGates(["emulator-chat.js"], ["--shard", "1/4"]), /require the reset gate/);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-targeted-validation-test-"));
const originalCI = process.env.CI;
const originalActions = process.env.GITHUB_ACTIONS;
const originalConsole = console.log;
console.log = () => {};
function git(root, args) {
  return cp.execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}
function commit(root, message) { git(root, ["add", "."]); git(root, ["commit", "-m", message]); }
function fixture(name) {
  const root = path.join(temporaryRoot, name);
  fs.mkdirSync(root);
  git(root, ["init"]);
  git(root, ["config", "user.name", "Crownlands Test"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  write(root, "functions/pnpm-lock.yaml", "fixture lock\n");
  write(root, "functions/feature.js", "// baseline\n");
  write(root, "tools/validate-widget.js", 'require("node:fs").appendFileSync(".git/test-runs", "run\\n");\n');
  write(root, "functions/test/emulator-tower.js", "// fixture\n");
  commit(root, "baseline");
  git(root, ["branch", "-M", "main"]);
  git(root, ["switch", "-c", "codex/fixture"]);
  return root;
}
function plan(root, paths, tests) {
  write(root, "validation-plan.json", JSON.stringify({ schemaVersion: 1, baseCommit: git(root, ["rev-parse", "main"]),
    coverage: [{ paths, tests, reason: "Validate changed behavior and the shared feature dependencies." }] }));
}
const options = { baseRef: "main", skipInstall: true };
try {
  const root = fixture("phases");
  write(root, "functions/feature.js", "// changed backend\n");
  plan(root, ["functions/feature.js"], ["tools/validate-widget.js", "functions/test/emulator-tower.js"]);
  commit(root, "backend change");
  const calls = [];
  const execute = (command, args) => calls.push([command, ...args]);
  const local = runValidationTier(root, { ...options, phase: "static", execute });
  assert.equal(local.emulatorsDeferred, true);
  assert.ok(calls.some(args => args.some(arg => arg.endsWith("validate-widget.js"))));
  assert.ok(!calls.some(args => args.some(arg => /run-emulator-gates|gate:static|test:emulators/.test(arg))));
  assert.ok(calls.some(args => args.some(arg => arg.endsWith("build-production-client.js"))));
  calls.length = 0;
  runValidationTier(root, { ...options, phase: "emulators", execute });
  assert.equal(calls.length, 2, "Only manifest generation and the selected emulator runner should run.");
  assert.deepEqual(calls[1].slice(-2), ["--file", "emulator-tower.js"]);
  calls.length = 0;
  runValidationTier(root, { ...options, forceFull: true, execute });
  assert.ok(calls.some(args => args.includes("gate:static")));
  assert.ok(calls.some(args => args.includes("test:emulators")));
  calls.length = 0;
  runValidationTier(root, { ...options, forceFull: true, phase: "emulators", emulatorShard: "2/4", execute });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].some(arg => arg.endsWith("generate-release-manifest.js")));
  assert.deepEqual(calls[1].slice(-2), ["--shard", "2/4"]);
  assert.throws(() => runValidationTier(root, { ...options, phase: "emulators", emulatorShard: "2/4", execute }), /Full emulator phase/);
  assert.throws(() => runValidationTier(root, { ...options, forceFull: true, phase: "static", emulatorShard: "2/4", execute }), /Full emulator phase/);
  assert.throws(() => runValidationTier(root, { ...options, phase: "bad", execute }), /Unknown validation phase/);
  assert.throws(() => runValidationTier(root, { ...options, phase: "static", execute: () => { throw new Error("fixture failure"); } }), /fixture failure/);
  const cacheRoot = fixture("cache");
  fs.appendFileSync(path.join(cacheRoot, "tools/validate-widget.js"), "// changed validator\n");
  plan(cacheRoot, ["tools/validate-widget.js"], ["tools/validate-widget.js"]);
  commit(cacheRoot, "validator change");
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
  const run = extra => runValidationTier(cacheRoot, { ...options, phase: "static", ...extra });
  const count = () => fs.readFileSync(path.join(cacheRoot, ".git/test-runs"), "utf8").trim().split("\n").length;
  assert.equal(run().reusedStatic, false);
  assert.equal(run().reusedStatic, true);
  assert.equal(count(), 1, "Identical clean local inputs should reuse successful checks.");
  assert.equal(run({ noCache: true }).reusedStatic, false);
  process.env.CI = "true";
  assert.equal(run().reusedStatic, false, "CI executes its checks independently.");
  delete process.env.CI;
  write(cacheRoot, "untracked.txt", "dirty\n");
  assert.equal(run().reusedStatic, false, "Dirty work must not use a cached success.");
  fs.unlinkSync(path.join(cacheRoot, "untracked.txt"));
  fs.appendFileSync(path.join(cacheRoot, "tools/validate-widget.js"), "// second commit\n");
  commit(cacheRoot, "updated validator");
  assert.equal(run().reusedStatic, false, "A new commit invalidates successful checks.");
  assert.equal(count(), 5);
  calls.length = 0;
  runValidationTier(cacheRoot, { ...options, phase: "emulators", execute });
  assert.equal(calls.length, 0, "A change without selected emulator coverage never starts Firebase.");

  const outputRoot = path.join(temporaryRoot, "output");
  fs.mkdirSync(outputRoot);
  const runPath = path.join(__dirname, "run-validation-tier.js");
  function outputCheck(actions, failure) {
    const command = `console.log("live progress"); console.error("diagnostic detail"); process.exit(${failure ? 7 : 0});`;
    const script = `require(${JSON.stringify(runPath)}).run(process.execPath, ["-e", ${JSON.stringify(command)}], ${JSON.stringify({ cwd: outputRoot, logDirectory: path.join(outputRoot, "logs") })});`;
    return cp.spawnSync(process.execPath, ["-e", script], { env: { ...process.env, GITHUB_ACTIONS: actions }, encoding: "utf8", windowsHide: true });
  }
  const liveSuccess = outputCheck("true", false);
  assert.equal(liveSuccess.status, 0);
  assert.match(liveSuccess.stdout, /live progress/);
  assert.match(liveSuccess.stderr, /diagnostic detail/);
  assert.equal(fs.existsSync(path.join(outputRoot, "logs")), false, "GitHub output must not be stranded in a temporary runner file.");
  const liveFailure = outputCheck("true", true);
  assert.notEqual(liveFailure.status, 0);
  assert.match(liveFailure.stdout, /live progress/);
  assert.match(liveFailure.stderr, /diagnostic detail[\s\S]*failed with status 7/);
  const localSuccess = outputCheck("false", false);
  assert.equal(localSuccess.status, 0);
  assert.equal(localSuccess.stderr, "");
  const logFiles = fs.readdirSync(path.join(outputRoot, "logs"));
  assert.equal(logFiles.length, 1);
  assert.match(fs.readFileSync(path.join(outputRoot, "logs", logFiles[0]), "utf8"), /live progress[\s\S]*diagnostic detail/);
  const localFailure = outputCheck("false", true);
  assert.notEqual(localFailure.status, 0);
  assert.match(localFailure.stderr, /diagnostic detail[\s\S]*failed with status 7/);
} finally {
  if (originalCI === undefined) delete process.env.CI; else process.env.CI = originalCI;
  if (originalActions === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = originalActions;
  console.log = originalConsole;
  const resolved = path.resolve(temporaryRoot);
  assert.ok(resolved.startsWith(path.join(os.tmpdir(), "crownlands-targeted-validation-test-")));
  fs.rmSync(resolved, { recursive: true, force: true });
}
console.log("Validated selected emulator execution, separate local/CI phases, failure propagation, full override, and local cache invalidation.");
