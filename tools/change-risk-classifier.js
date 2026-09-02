#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TIER_RANK = Object.freeze({ Fast: 1, Standard: 2, Full: 3 });

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

const STATIC_PUBLIC_FILES = new Set([
  "ads.txt",
  "robots.txt",
  "sitemap.xml",
]);

const STANDARD_FRONTEND_FILES = new Map([
  ["animation-manager.js", "isolated client animation behavior"],
  ["audio-manager.js", "isolated client audio behavior"],
  ["patch-notes.js", "client-rendered public patch-note presentation"],
  ["public-site.js", "isolated public-site interaction behavior"],
  ["roadmap-data.js", "client-rendered public roadmap data"],
  ["roadmap.js", "isolated public-roadmap interaction behavior"],
  ["ui-layout-config.js", "isolated local UI-layout configuration"],
  ["ui-layout-runtime.js", "isolated local UI-layout behavior"],
]);

const CRITICAL_EXACT_PATHS = new Set([
  ".firebaserc",
  ".node-version",
  "AGENTS.md",
  "base-cities.js",
  "common-gear-ui.js",
  "common-gear.js",
  "economy-config.js",
  "firebase-config.js",
  "firebase-messaging-sw.js",
  "firebase.json",
  "firebaseClient.js",
  "firestore.indexes.json",
  "firestore.rules",
  "game.js",
  "index.html",
  "instant-economy-actions.js",
  "manifest.webmanifest",
  "netlify.toml",
  "region-catalog.js",
  "release-config.js",
  "release-manifest.js",
  "route-worker.js",
  "service-worker.js",
  "world-config.js",
  "docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md",
  "docs/SAFE_UPDATE_WORKFLOW.md",
]);

const CRITICAL_PREFIXES = [
  ".github/",
  ".githooks/",
  "firebase-hosting-redirect/",
  "functions/",
  "functions-auto-reset/",
  "tools/",
];

const CRITICAL_NAME_PATTERN = /(?:^|[/_.-])(?:auth|backend|battle|build|city|clan|combat|contract|deploy|economy|firebase|firestore|function|generation|login|map|progression|realm|release|reset|route|scheduled|schema|season|server|state|storage|world)(?:$|[/_.-])/i;
const CRITICAL_DOCUMENT_PATTERN = /(?:^|\/)(?:backend|deploy(?:ment)?|firebase|firestore|monthly-realm-operations|production-data|release|reset)(?:$|[-_.\/])/i;
const CRITICAL_VISUAL_PATTERN = /(?:^|\/)(?:islands?|maps?|regions?|routes?|worlds?)(?:$|[-_.\/])/i;
const VISUAL_EXTENSION_PATTERN = /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i;

function normalizeRepoPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "");
}

function classifyPath(inputPath) {
  const filePath = normalizeRepoPath(inputPath);
  const lowerPath = filePath.toLowerCase();
  const baseName = path.posix.basename(filePath);

  if (!filePath) {
    return { tier: "Full", reason: "an empty or unreadable path is ambiguous" };
  }

  if (CRITICAL_EXACT_PATHS.has(filePath)
      || CRITICAL_PREFIXES.some(prefix => filePath.startsWith(prefix))) {
    return { tier: "Full", reason: "the path is explicitly release-, backend-, authority-, or validation-critical" };
  }

  if (/(?:^|\/)package\.json$/i.test(filePath)
      || /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i.test(filePath)) {
    return { tier: "Full", reason: "package scripts, dependencies, and lockfiles are release-contract inputs" };
  }

  if ((lowerPath.startsWith("docs/") || /\.(?:md|mdx|txt)$/i.test(filePath))
      && CRITICAL_DOCUMENT_PATTERN.test(filePath)) {
    return { tier: "Full", reason: "the document is an operational reset, backend, deployment, or release contract" };
  }

  if (STATIC_PUBLIC_PAGES.has(filePath)) {
    return { tier: "Fast", reason: "the file is an explicitly allowlisted static public page" };
  }

  if (STATIC_PUBLIC_FILES.has(filePath)) {
    return { tier: "Fast", reason: "the file is allowlisted static public-site wording or crawl metadata" };
  }

  if (lowerPath.startsWith("docs/") || /\.(?:md|mdx)$/i.test(filePath)) {
    return { tier: "Fast", reason: "the file is non-operational documentation" };
  }

  if (/\.css$/i.test(filePath)) {
    return { tier: "Fast", reason: "CSS cannot change multiplayer authority or stored gameplay state" };
  }

  if (VISUAL_EXTENSION_PATTERN.test(filePath)) {
    if (CRITICAL_VISUAL_PATTERN.test(filePath)) {
      return { tier: "Full", reason: "map, route, region, island, and world assets are gameplay-critical" };
    }
    return { tier: "Fast", reason: "the file is a non-map visual asset with no executable or stored-state contract" };
  }

  if (STANDARD_FRONTEND_FILES.has(filePath)) {
    return { tier: "Standard", reason: STANDARD_FRONTEND_FILES.get(filePath) };
  }

  if (CRITICAL_NAME_PATTERN.test(filePath) || CRITICAL_NAME_PATTERN.test(baseName)) {
    return { tier: "Full", reason: "the path names a gameplay, authority, state, reset, map, or release concern" };
  }

  return { tier: "Full", reason: "the path is not on a reviewed Fast or Standard allowlist" };
}

function normalizeChange(change) {
  if (typeof change === "string") return { status: "M", paths: [normalizeRepoPath(change)] };
  const paths = Array.isArray(change?.paths) ? change.paths : [change?.path];
  return {
    status: String(change?.status || "M"),
    paths: paths.map(normalizeRepoPath).filter(Boolean),
  };
}

function classifyChanges(inputChanges, options = {}) {
  const changes = inputChanges.map(normalizeChange);
  const fileClassifications = [];
  for (const change of changes) {
    for (const filePath of change.paths) {
      fileClassifications.push({
        path: filePath,
        status: change.status,
        ...classifyPath(filePath),
      });
    }
  }
  fileClassifications.sort((left, right) => left.path.localeCompare(right.path));

  let tier = "Full";
  let decisionReason = "no changed files were found, so classification is ambiguous";
  if (fileClassifications.length) {
    tier = fileClassifications.reduce((highest, item) => (
      TIER_RANK[item.tier] > TIER_RANK[highest] ? item.tier : highest
    ), "Fast");
    decisionReason = tier === "Full"
      ? "at least one changed path is critical or not explicitly allowlisted"
      : `every changed path is explicitly allowlisted at ${tier} or lower risk`;
  }

  if (options.forceFull) {
    tier = "Full";
    decisionReason = "the validation:full override can only upgrade the result and was requested";
  }

  return {
    tier,
    requiresEmulators: tier === "Full",
    forcedFull: Boolean(options.forceFull),
    baseRef: options.baseRef || null,
    headRef: options.headRef || null,
    decisionReason,
    changes,
    files: fileClassifications,
  };
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
  return classifyChanges(gitChanges(repoRoot, baseRef, headRef), {
    ...options,
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
  lines.push("[Crownlands] Changed files and risk reasons:");
  if (!result.files.length) lines.push("  (none; fail-closed Full validation applies)");
  for (const item of result.files) {
    lines.push(`  ${item.status}\t${item.path}\t${item.tier} — ${item.reason}`);
  }
  if (result.tier !== "Full") {
    lines.push(`[Crownlands] ${result.tier} is safe because every path matched a reviewed lower-tier allowlist; critical and unknown paths always force Full.`);
    lines.push("[Crownlands] Multiplayer emulator validation is not required for this classified change.");
  } else {
    lines.push("[Crownlands] Full validation is required; lower-risk files cannot mask a critical or unknown path.");
  }
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
    ? classifyChanges(options.files, options)
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
  CRITICAL_EXACT_PATHS,
  STATIC_PUBLIC_PAGES,
  STANDARD_FRONTEND_FILES,
  TIER_RANK,
  classifyChanges,
  classifyGitDiff,
  classifyPath,
  formatClassification,
  gitChanges,
  normalizeRepoPath,
  parseNameStatus,
  printClassification,
};
