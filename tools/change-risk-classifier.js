#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const STATIC_PUBLIC_PAGES = new Set([
  "about.html",
  "battle-economy-guide.html",
  "battle-reports-guide.html",
  "clans-rallies-guide.html",
  "community.html",
  "daily-rewards-guide.html",
  "game-rules.html",
  "guides.html",
  "home.html",
  "how-to-play.html",
  "objectives-guide.html",
  "privacy.html",
  "roadmap.html",
  "scouting-guide.html",
  "skills-presets-guide.html",
  "support.html",
  "terms.html",
  "updates.html",
  "world.html",
]);

const { PLAN_PATH, normalizePath, selectValidation } = require("./validation-plan");

function normalizeRepoPath(value) {
  return normalizePath(value);
}

function normalizeChange(change) {
  if (typeof change === "string") return { status: "M", paths: [normalizeRepoPath(change)] };
  return { status: String(change.status || "M"), paths: (change.paths || [change.path]).map(normalizeRepoPath) };
}

function classifyChanges(inputChanges, options = {}) {
  const changes = inputChanges.map(normalizeChange);
  if (options.forceFull) {
    return {
      tier: "Full", requiresEmulators: true, forcedFull: true,
      decisionReason: "explicit full regression run (manual override or nightly schedule)",
      changes, files: changes.flatMap(change => change.paths.map(file => ({ path: file, status: change.status, tier: "Full", reason: "explicit full regression run" }))),
      baseRef: options.baseRef || null, headRef: options.headRef || null,
    };
  }
  return { ...selectValidation(changes, options.plan, options), baseRef: options.baseRef || null, headRef: options.headRef || null };
}

function parseNameStatus(output) {
  const fields = String(output || "").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.slice(index, index + pathCount).map(normalizeRepoPath);
    if (paths.length !== pathCount || paths.some(filePath => !filePath)) {
      throw new Error(`Could not parse git diff entry ${status}.`);
    }
    changes.push({ status, paths });
    index += pathCount;
  }
  return changes;
}

function gitChanges(repoRoot, baseRef = "origin/main", headRef = "HEAD") {
  const result = childProcess.spawnSync(
    "git",
    ["diff", "--name-status", "-z", "--find-renames", `${baseRef}...${headRef}`],
    { cwd: repoRoot, encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git diff failed with status ${result.status}.`);
  }
  return parseNameStatus(result.stdout);
}

function classifyGitDiff(repoRoot, options = {}) {
  const baseRef = options.baseRef || "origin/main";
  const headRef = options.headRef || "HEAD";
  let plan;
  let baseCommit;
  if (!options.forceFull) {
    baseCommit = childProcess.execFileSync("git", ["merge-base", baseRef, headRef], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
    const baseTip = childProcess.execFileSync("git", ["rev-parse", baseRef], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).trim();
    if (baseCommit !== baseTip) throw new Error("The branch is behind its validation base. Reconcile the base and review the affected-test plan.");
    try {
      plan = JSON.parse(childProcess.execFileSync("git", ["show", `${headRef}:${PLAN_PATH}`], { cwd: repoRoot, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
    } catch {
      throw new Error(`Commit ${PLAN_PATH} before preparation. List the changed files, affected tests, shared dependencies, and baseCommit.`);
    }
  }
  return classifyChanges(gitChanges(repoRoot, baseRef, headRef), {
    ...options,
    plan, baseCommit, repoRoot,
    baseRef,
    headRef,
  });
}

function formatClassification(result) {
  const lines = [
    `[Crownlands] Validation tier: ${result.tier}`,
    `[Crownlands] Decision: ${result.decisionReason}.`,
  ];
  if (result.baseRef) lines.push(`[Crownlands] Complete branch diff: ${result.baseRef}...${result.headRef}.`);
  lines.push("[Crownlands] Changed files:");
  if (!result.files.length) lines.push("  (none)");
  for (const item of result.files) {
    lines.push(`  ${item.status}\t${item.path}`);
  }
  if (result.tier === "Targeted") {
    for (const group of result.coverage) lines.push(`[Crownlands] Coverage: ${group.reason}`);
    lines.push(`[Crownlands] Selected ${result.staticTests.length} focused validator(s), ${result.emulatorTests.length} emulator file(s); production build ${result.buildRequired ? "required" : "not affected"}.`);
    for (const test of [...result.staticTests, ...result.emulatorTests]) lines.push(`  ${test}`);
  } else lines.push("[Crownlands] Explicit full regression run selected.");
  return lines.join("\n");
}

function printClassification(result) {
  console.log(formatClassification(result));
}

function writeGithubOutput(filePath, result) {
  const delimiter = `CROWNLANDS_${process.pid}_${Date.now()}`;
  const output = [
    `tier=${result.tier}`,
    `requires_emulators=${result.requiresEmulators}`,
    `forced_full=${result.forcedFull}`,
    `base_ref=${result.baseRef || "origin/main"}`,
    `summary<<${delimiter}`,
    formatClassification(result),
    delimiter,
    "",
  ].join("\n");
  fs.appendFileSync(filePath, output, "utf8");
}

function parseArguments(args) {
  const options = { baseRef: "origin/main", headRef: "HEAD", files: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--base") options.baseRef = args[++index];
    else if (value === "--head") options.headRef = args[++index];
    else if (value === "--file") options.files.push(args[++index]);
    else if (value === "--force-full") options.forceFull = true;
    else if (value === "--github-output") options.githubOutput = args[++index];
    else throw new Error(`Unknown option: ${value}`);
    if (["--base", "--head", "--file", "--github-output"].includes(value) && !args[index]) {
      throw new Error(`${value} requires a value.`);
    }
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const result = options.files.length
    ? classifyChanges(options.files, { ...options, plan: options.forceFull ? undefined : JSON.parse(fs.readFileSync(path.join(repoRoot, PLAN_PATH), "utf8")), repoRoot })
    : classifyGitDiff(repoRoot, options);
  printClassification(result);
  if (options.githubOutput) writeGithubOutput(options.githubOutput, result);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[Crownlands] Change-risk classification failed closed: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  STATIC_PUBLIC_PAGES,
  classifyChanges,
  classifyGitDiff,
  formatClassification,
  gitChanges,
  normalizeRepoPath,
  parseNameStatus,
  printClassification,
};
