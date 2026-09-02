#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { classifyGitDiff, printClassification } = require("./change-risk-classifier");

function resolvePnpm(repoRoot) {
  const localPnpm = path.join(repoRoot, "functions", "node_modules", "pnpm", "bin", "pnpm.cjs");
  if (fs.existsSync(localPnpm)) return { command: process.execPath, prefixArgs: [localPnpm] };
  return { command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", prefixArgs: [] };
}

function run(command, args, options) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}.`);
  }
}

function runValidationTier(repoRoot, options = {}) {
  const classification = classifyGitDiff(repoRoot, options);
  printClassification(classification);
  const pnpm = resolvePnpm(repoRoot);
  const functionsRoot = path.join(repoRoot, "functions");

  if (classification.tier === "Full") {
    console.log("[Crownlands] Running Full validation: complete static and multiplayer emulator gates.");
    run(pnpm.command, [...pnpm.prefixArgs, "run", "gate:release"], { cwd: functionsRoot });
    return classification;
  }

  console.log(`[Crownlands] Installing locked dependencies before ${classification.tier} validation...`);
  run(pnpm.command, [...pnpm.prefixArgs, "install", "--frozen-lockfile"], { cwd: functionsRoot });
  const script = classification.tier === "Fast" ? "gate:fast" : "gate:static";
  console.log(`[Crownlands] Running ${classification.tier} validation with ${script}.`);
  run(pnpm.command, [...pnpm.prefixArgs, "run", script], { cwd: functionsRoot });
  return classification;
}

function parseArguments(args) {
  const options = { baseRef: "origin/main", headRef: "HEAD" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--base") options.baseRef = args[++index];
    else if (value === "--head") options.headRef = args[++index];
    else if (value === "--force-full") options.forceFull = true;
    else throw new Error(`Unknown option: ${value}`);
    if (["--base", "--head"].includes(value) && !args[index]) throw new Error(`${value} requires a value.`);
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
