#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { classifyGitDiff, printClassification } = require("./change-risk-classifier");
const { testArguments } = require("./validation-plan");

function resolvePnpm(repoRoot) {
  const localPnpm = path.join(repoRoot, "functions", "node_modules", "pnpm", "bin", "pnpm.cjs");
  if (fs.existsSync(localPnpm)) return { command: process.execPath, prefixArgs: [localPnpm] };
  return { command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", prefixArgs: [] };
}

function run(command, args, options) {
  const label = args.join(" ");
  const logName = crypto.createHash("sha256").update(command + label).digest("hex").slice(0, 16);
  const logPath = path.join(options.logDirectory, `${logName}.log`);
  fs.mkdirSync(options.logDirectory, { recursive: true });
  const descriptor = fs.openSync(logPath, "w");
  console.log(`[Crownlands] Running ${label}`);
  let result;
  try {
    result = childProcess.spawnSync(command, args, { cwd: options.cwd, env: process.env, stdio: ["ignore", descriptor, descriptor], windowsHide: true });
  } finally { fs.closeSync(descriptor); }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const descriptor = fs.openSync(logPath, "r");
    try {
      const length = fs.fstatSync(descriptor).size;
      const tail = Buffer.alloc(Math.min(length, 12000));
      fs.readSync(descriptor, tail, 0, tail.length, Math.max(0, length - tail.length));
      console.error(tail.toString("utf8"));
    } finally { fs.closeSync(descriptor); }
    throw new Error(`${label} failed with status ${result.status}. Full log: ${logPath}`);
  }
  console.log(`[Crownlands] Passed ${label}`);
}

function runValidationTier(repoRoot, options = {}) {
  const classification = classifyGitDiff(repoRoot, options);
  printClassification(classification);
  const pnpm = resolvePnpm(repoRoot);
  const functionsRoot = path.join(repoRoot, "functions");
  const phase = options.phase || "all";
  if (!["all", "static", "emulators"].includes(phase)) throw new Error(`Unknown validation phase: ${phase}`);
  const git = args => childProcess.execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
  const stateRoot = path.resolve(repoRoot, git(["rev-parse", "--git-path", "crownlands-safe-update/validation"]));
  const execute = options.execute || ((command, args, cwd) => run(command, args, { cwd, logDirectory: path.join(stateRoot, "logs") }));
  const runPnpm = script => execute(pnpm.command, [...pnpm.prefixArgs, "run", script], functionsRoot);
  const runNode = (file, args = []) => execute(process.execPath, [path.join(repoRoot, file), ...args], repoRoot);
  if (phase !== "emulators" && !options.skipInstall) execute(pnpm.command, [...pnpm.prefixArgs, "install", "--frozen-lockfile"], functionsRoot);

  if (classification.tier === "Full") {
    if (phase !== "emulators") runPnpm("gate:static");
    if (phase !== "static") runPnpm("test:emulators");
    return { ...classification, validationPhase: phase, emulatorsDeferred: phase === "static" };
  }

  // Only reuse local success for the exact commit, base, plan, runtime and locked
  // inputs. CI always executes independently. Dirty working trees never use it.
  const clean = !git(["status", "--porcelain", "--untracked-files=all"]);
  const cacheKey = crypto.createHash("sha256").update(JSON.stringify({
    head: git(["rev-parse", options.headRef || "HEAD"]), base: git(["rev-parse", options.baseRef || "origin/main"]),
    node: process.version, platform: process.platform, selection: classification,
    buildEnvironment: [process.env.COMMIT_REF, process.env.GITHUB_SHA, process.env.DEPLOY_ID],
    lock: fs.existsSync(path.join(functionsRoot, "pnpm-lock.yaml")) ? fs.readFileSync(path.join(functionsRoot, "pnpm-lock.yaml"), "utf8").replace(/\r\n/g, "\n") : "",
  })).digest("hex");
  const cachePath = path.join(stateRoot, `${cacheKey}.json`);
  // Build outputs are disposable, so always regenerate and validate them.
  const useCache = clean && !classification.buildRequired && !options.noCache && !options.execute
    && process.env.CI !== "true" && process.env.GITHUB_ACTIONS !== "true";
  let reusedStatic = false;
  if (phase !== "emulators") {
    if (useCache && fs.existsSync(cachePath)) {
      try {
        const receipt = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        reusedStatic = receipt.cacheKey === cacheKey && receipt.passed === true;
      } catch { /* A damaged local receipt means rerun the checks. */ }
    }
    if (reusedStatic) console.log("[Crownlands] Reusing successful local focused checks for unchanged tested inputs.");
    else {
      const changedJs = classification.changes.filter(change => !change.status.startsWith("D")).map(change => change.paths.at(-1))
        .filter(file => /\.(?:js|cjs|mjs)$/.test(file));
      for (const file of changedJs) execute(process.execPath, ["--check", path.join(repoRoot, file)], repoRoot);
      const lintFiles = changedJs.filter(file => /^[^/]+\.js$/.test(file) || /^functions\/[^/]+\.js$/.test(file));
      if (lintFiles.length) execute(pnpm.command, [...pnpm.prefixArgs, "exec", "eslint", ...lintFiles.map(file => path.relative(functionsRoot, path.join(repoRoot, file)))], functionsRoot);
      if (classification.dependencyAuditRequired) execute(pnpm.command, [...pnpm.prefixArgs, "audit", "--prod", "--audit-level", "moderate"], functionsRoot);
      if (classification.buildRequired) {
        runNode("tools/sync-runtime-data.js", ["--check"]);
        runNode("tools/generate-release-manifest.js");
        runNode("tools/build-production-client.js");
        runNode("tools/validate-production-artifact.js");
      }
      for (const test of classification.staticTests) {
        const args = testArguments(test);
        if (["tools/validate-focused-browser-smoke.js", "tools/run-focused-validators.js"].includes(test)) args.push("--base", options.baseRef || "origin/main", "--head", options.headRef || "HEAD");
        runNode(test, args);
      }
      if (useCache && !git(["status", "--porcelain", "--untracked-files=all"])) {
        fs.mkdirSync(stateRoot, { recursive: true });
        fs.writeFileSync(cachePath, `${JSON.stringify({ cacheKey, passed: true, completedAt: new Date().toISOString() })}\n`);
      }
    }
  }
  if (phase !== "static" && classification.emulatorTests.length) {
    runNode("tools/generate-release-manifest.js");
    execute(process.execPath, [path.join(functionsRoot, "test/run-emulator-gates.js"),
      ...classification.emulatorTests.flatMap(test => ["--file", path.basename(test)])], functionsRoot);
  } else if (phase === "emulators") console.log("[Crownlands] No emulator tests are required by this reviewed change plan.");
  return { ...classification, validationPhase: phase, emulatorsDeferred: phase === "static" && classification.requiresEmulators, reusedStatic };
}

function parseArguments(args) {
  const options = { baseRef: "origin/main", headRef: "HEAD" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--base") options.baseRef = args[++index];
    else if (value === "--head") options.headRef = args[++index];
    else if (value === "--force-full") options.forceFull = true;
    else if (value === "--phase") options.phase = args[++index];
    else if (value === "--skip-install") options.skipInstall = true;
    else if (value === "--no-cache") options.noCache = true;
    else throw new Error(`Unknown option: ${value}`);
    if (["--base", "--head", "--phase"].includes(value) && !args[index]) throw new Error(`${value} requires a value.`);
  }
  return options;
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  runValidationTier(repoRoot, parseArguments(process.argv.slice(2)));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[Crownlands] Tiered validation failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { runValidationTier };
