const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const GENERATED_PATH_PATTERNS = [
  /^dist\//,
  /^release-artifacts\//,
  /^node_modules\//,
  /^functions\/node_modules\//,
  /^\.firebase\//,
  /^\.netlify\//,
  /^release-manifest\.js$/,
  /^functions\/release-manifest\.json$/,
];

class SafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafetyError";
  }
}

function commandText(command, args) {
  return [command, ...args].map(value => (/\s/.test(value) ? JSON.stringify(value) : value)).join(" ");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    input: options.input,
    stdio: options.stdio || "pipe",
    windowsHide: true,
  });
  if (result.error) {
    throw new SafetyError(`Could not run ${commandText(command, args)}: ${result.error.message}`);
  }
  if (!options.allowFailure && result.status !== 0) {
    const details = String(result.stderr || result.stdout || "").trim();
    throw new SafetyError(
      `${commandText(command, args)} failed${details ? `:\n${details}` : "."}`,
    );
  }
  return result;
}

function runGit(repoRoot, args, options = {}) {
  return run("git", args, { ...options, cwd: repoRoot });
}

function getRepoRoot(cwd = process.cwd()) {
  const result = run("git", ["rev-parse", "--show-toplevel"], { cwd });
  return path.resolve(result.stdout.trim());
}

function assertNode22() {
  const version = process.versions.node;
  if (Number(version.split(".")[0]) !== 22) {
    throw new SafetyError(
      `Crownlands safety commands require Node 22. This shell is using Node ${version}. Switch to Node 22 and retry.`,
    );
  }
}

function gitOutput(repoRoot, args) {
  return runGit(repoRoot, args).stdout.trim();
}

function assertClean(repoRoot) {
  const status = gitOutput(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    throw new SafetyError(
      `Unfinished tracked or untracked work exists. Commit, move, or intentionally remove it before continuing. Nothing was stashed or discarded.\n${status}`,
    );
  }
}

function assertOrigin(repoRoot) {
  const result = runGit(repoRoot, ["remote", "get-url", "origin"], { allowFailure: true });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new SafetyError("The repository does not have an origin remote. Add the GitHub remote and retry.");
  }
}

function fetchOrigin(repoRoot) {
  console.log("[Crownlands] Fetching the latest GitHub branches...");
  runGit(repoRoot, ["fetch", "--prune", "origin"], { stdio: "inherit" });
}

function currentBranch(repoRoot) {
  const result = runGit(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new SafetyError("The repository is in detached-HEAD mode. Switch to a named branch and retry.");
  }
  return result.stdout.trim();
}

function revision(repoRoot, ref) {
  return gitOutput(repoRoot, ["rev-parse", "--verify", ref]);
}

function refExists(repoRoot, ref) {
  return runGit(repoRoot, ["show-ref", "--verify", "--quiet", ref], { allowFailure: true }).status === 0;
}

function divergence(repoRoot, base = "origin/main", head = "HEAD") {
  const output = gitOutput(repoRoot, ["rev-list", "--left-right", "--count", `${base}...${head}`]);
  const [behind, ahead] = output.split(/\s+/).map(Number);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    throw new SafetyError(`Could not determine divergence between ${base} and ${head}.`);
  }
  return { behind, ahead };
}

function normalizeFeatureName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^codex\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (!normalized) {
    throw new SafetyError("Provide a feature name, for example: pnpm start-feature -- city-search");
  }
  return normalized;
}

function normalizeRepoPath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || normalized === ".") return ".";
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new SafetyError(`Feature scope must stay inside the repository: ${value}`);
  }
  return normalized;
}

function parseCommandArguments(args) {
  const positionals = [];
  const scopes = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--scope") {
      const scope = args[index + 1];
      if (!scope) throw new SafetyError("--scope requires a repository path.");
      scopes.push(normalizeRepoPath(scope));
      index += 1;
    } else if (value.startsWith("--")) {
      throw new SafetyError(`Unknown option: ${value}`);
    } else {
      positionals.push(value);
    }
  }
  return { positionals, scopes: [...new Set(scopes)] };
}

function localStateRoot(repoRoot) {
  const gitPath = gitOutput(repoRoot, ["rev-parse", "--git-path", "crownlands-safe-update"]);
  return path.isAbsolute(gitPath) ? gitPath : path.resolve(repoRoot, gitPath);
}

function branchFileName(branch) {
  return Buffer.from(branch, "utf8").toString("base64url");
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function metadataPath(repoRoot, branch) {
  return path.join(localStateRoot(repoRoot), "features", `${branchFileName(branch)}.json`);
}

function receiptPath(repoRoot, branch) {
  return path.join(localStateRoot(repoRoot), "prepared", `${branchFileName(branch)}.json`);
}

function writeFeatureMetadata(repoRoot, metadata) {
  writeJsonAtomic(metadataPath(repoRoot, metadata.branch), {
    schemaVersion: 1,
    ...metadata,
  });
}

function readFeatureMetadata(repoRoot, branch) {
  const filePath = metadataPath(repoRoot, branch);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new SafetyError(`Local feature metadata is unreadable: ${filePath}`);
  }
}

function writePreparationReceipt(repoRoot, receipt) {
  writeJsonAtomic(receiptPath(repoRoot, receipt.branch), {
    schemaVersion: 1,
    completedAt: new Date().toISOString(),
    ...receipt,
  });
}

function readPreparationReceipt(repoRoot, branch) {
  const filePath = receiptPath(repoRoot, branch);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new SafetyError(`The preparation receipt is unreadable. Run prepare-pr again: ${filePath}`);
  }
}

function assertFeatureBranch(repoRoot) {
  const branch = currentBranch(repoRoot);
  if (branch === "main") {
    throw new SafetyError("Direct pushes from local main are blocked. Start a fresh codex/<feature-name> branch instead.");
  }
  if (!branch.startsWith("codex/")) {
    throw new SafetyError(`Expected a codex/<feature-name> branch, but the current branch is ${branch}.`);
  }
  return branch;
}

function parseNameStatus(output) {
  if (!output.trim()) return [];
  return output.trim().split(/\r?\n/).map(line => {
    const fields = line.split("\t");
    const status = fields[0];
    if (/^[RC]/.test(status)) {
      return { status, oldPath: fields[1], path: fields[2] };
    }
    return { status, path: fields[1] };
  });
}

function parseNumstat(output) {
  const stats = new Map();
  if (!output.trim()) return stats;
  for (const line of output.trim().split(/\r?\n/)) {
    const [addedText, deletedText, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    stats.set(filePath, {
      added: addedText === "-" ? 0 : Number(addedText),
      deleted: deletedText === "-" ? 0 : Number(deletedText),
      binary: addedText === "-" || deletedText === "-",
    });
  }
  return stats;
}

function pathMatchesScope(filePath, scope) {
  return scope === "." || filePath === scope || filePath.startsWith(`${scope}/`);
}

function isGeneratedPath(filePath) {
  return GENERATED_PATH_PATTERNS.some(pattern => pattern.test(filePath));
}

function historicalReversions(repoRoot, changedFiles, baseRef) {
  const findings = [];
  for (const item of changedFiles) {
    if (!item.path || item.status.startsWith("D") || item.status.startsWith("R") || isGeneratedPath(item.path)) continue;
    const headBlob = runGit(repoRoot, ["rev-parse", `HEAD:${item.path}`], { allowFailure: true });
    const baseBlob = runGit(repoRoot, ["rev-parse", `${baseRef}:${item.path}`], { allowFailure: true });
    if (headBlob.status !== 0 || baseBlob.status !== 0 || headBlob.stdout.trim() === baseBlob.stdout.trim()) continue;
    const history = gitOutput(repoRoot, ["rev-list", "--max-count=50", baseRef, "--", item.path]).split(/\r?\n/).filter(Boolean);
    for (const commit of history.slice(1)) {
      const priorBlob = runGit(repoRoot, ["rev-parse", `${commit}:${item.path}`], { allowFailure: true });
      if (priorBlob.status === 0 && priorBlob.stdout.trim() === headBlob.stdout.trim()) {
        findings.push(`${item.path} exactly matches its version from ${commit.slice(0, 12)}`);
        break;
      }
    }
  }
  return findings;
}

function auditBranch(repoRoot, options = {}) {
  const baseRef = options.baseRef || "origin/main";
  const branch = assertFeatureBranch(repoRoot);
  const { behind, ahead } = divergence(repoRoot, baseRef, "HEAD");
  if (behind > 0) {
    throw new SafetyError(
      `${branch} is ${behind} commit(s) behind ${baseRef}. Start from the updated main branch or reconcile the branch before preparing a PR.`,
    );
  }
  if (ahead === 0) {
    throw new SafetyError(`${branch} has no commits to propose against ${baseRef}.`);
  }

  const commits = gitOutput(repoRoot, ["log", "--format=%h%x09%s", `${baseRef}..HEAD`]).split(/\r?\n/).filter(Boolean);
  const changedFiles = parseNameStatus(gitOutput(repoRoot, ["diff", "--name-status", "--find-renames", `${baseRef}...HEAD`]));
  const numstat = parseNumstat(gitOutput(repoRoot, ["diff", "--numstat", `${baseRef}...HEAD`]));
  const blockers = [];
  const warnings = [];
  const mergeCommits = gitOutput(repoRoot, ["rev-list", "--merges", `${baseRef}..HEAD`]).split(/\r?\n/).filter(Boolean);
  if (mergeCommits.length) blockers.push(`Merge commits are present: ${mergeCommits.map(value => value.slice(0, 12)).join(", ")}`);

  const deletions = changedFiles.filter(item => item.status.startsWith("D"));
  if (deletions.length) blockers.push(`Deleted files require explicit review: ${deletions.map(item => item.path).join(", ")}`);

  const generatedFiles = changedFiles.filter(item => isGeneratedPath(item.path));
  if (generatedFiles.length) blockers.push(`Generated or local artifacts are included: ${generatedFiles.map(item => item.path).join(", ")}`);

  const scopes = (options.scopes || []).map(normalizeRepoPath);
  if (scopes.length) {
    const outsideScope = changedFiles.filter(item => !scopes.some(scope => pathMatchesScope(item.path, scope)));
    if (outsideScope.length) {
      blockers.push(`Files fall outside the declared feature scope: ${outsideScope.map(item => item.path).join(", ")}`);
    }
  } else {
    warnings.push("No feature paths were declared. Review every changed file in the summary below before continuing.");
  }

  let added = 0;
  let deleted = 0;
  for (const stat of numstat.values()) {
    added += stat.added;
    deleted += stat.deleted;
  }
  if (deleted >= 200 && deleted > added * 1.5) {
    warnings.push(`The branch removes ${deleted} lines while adding ${added}; confirm this is not an unrelated large reversion.`);
  }
  for (const finding of historicalReversions(repoRoot, changedFiles, baseRef)) {
    warnings.push(`Possible full-file reversion: ${finding}.`);
  }

  return { branch, baseRef, behind, ahead, commits, changedFiles, blockers, warnings, added, deleted, scopes };
}

function printAudit(audit) {
  console.log(`[Crownlands] Proposed PR: ${audit.ahead} commit(s), ${audit.changedFiles.length} changed file(s), +${audit.added}/-${audit.deleted}.`);
  console.log("[Crownlands] Commits:");
  for (const commit of audit.commits) console.log(`  ${commit}`);
  console.log("[Crownlands] Files:");
  for (const item of audit.changedFiles) console.log(`  ${item.status}\t${item.path}`);
  for (const warning of audit.warnings) console.warn(`[Crownlands] REVIEW: ${warning}`);
  if (audit.blockers.length) {
    throw new SafetyError(`The PR audit found blockers:\n- ${audit.blockers.join("\n- ")}`);
  }
}

function resolvePnpm(repoRoot) {
  const localPnpm = path.join(repoRoot, "functions", "node_modules", "pnpm", "bin", "pnpm.cjs");
  if (fs.existsSync(localPnpm)) return { command: process.execPath, prefixArgs: [localPnpm] };
  for (const candidate of process.platform === "win32" ? ["pnpm.cmd", "pnpm"] : ["pnpm"]) {
    const result = run(candidate, ["--version"], { allowFailure: true });
    if (result.status === 0) return { command: candidate, prefixArgs: [] };
  }
  throw new SafetyError("pnpm 11.9.0 is required. Install the locked Functions dependencies and retry.");
}

function runReleaseGate(repoRoot) {
  const pnpm = resolvePnpm(repoRoot);
  console.log("[Crownlands] Running the complete Node 22 release gate...");
  run(pnpm.command, [...pnpm.prefixArgs, "run", "gate:release"], {
    cwd: path.join(repoRoot, "functions"),
    stdio: "inherit",
  });
}

function assertGhAuthenticated(repoRoot) {
  const version = run("gh", ["--version"], { cwd: repoRoot, allowFailure: true });
  if (version.status !== 0) {
    throw new SafetyError("GitHub CLI is missing. Install gh, authenticate it, and run prepare-pr again.");
  }
  const auth = run("gh", ["auth", "status"], { cwd: repoRoot, allowFailure: true });
  if (auth.status !== 0) {
    throw new SafetyError("GitHub CLI is not authenticated. Run gh auth login, then run prepare-pr again.");
  }
}

function verifyPreparationReceipt(repoRoot, branch) {
  const receipt = readPreparationReceipt(repoRoot, branch);
  if (!receipt) {
    throw new SafetyError("This branch has not completed prepare-pr for its current commit. Run prepare-pr before pushing.");
  }
  const head = revision(repoRoot, "HEAD");
  const originMain = revision(repoRoot, "origin/main");
  if (receipt.branch !== branch || receipt.head !== head || receipt.originMain !== originMain) {
    throw new SafetyError("The branch or GitHub main changed after validation. Run prepare-pr again before pushing.");
  }
  return receipt;
}

function markdownAudit(audit) {
  const files = audit.changedFiles.map(item => `- \`${item.status}\` \`${item.path}\``).join("\n");
  const warnings = audit.warnings.length ? audit.warnings.map(item => `- ${item}`).join("\n") : "- None.";
  return [
    "## Safety audit",
    "",
    `- Base: \`${audit.baseRef}\``,
    `- Diff size: +${audit.added}/-${audit.deleted}`,
    `- Declared scope: ${audit.scopes.length ? audit.scopes.map(value => `\`${value}\``).join(", ") : "not provided; changed files listed for review"}`,
    "- Merge commits: none",
    "- Deleted files: none",
    "- Generated artifacts: none",
    "",
    "### Review notes",
    "",
    warnings,
    "",
    "### Files",
    "",
    files,
    "",
    "## Validation",
    "",
    "- Node 22 confirmed",
    "- `pnpm run gate:release` passed",
    "- Pre-push receipt matches the exact branch HEAD and latest `origin/main`",
  ].join("\n");
}

module.exports = {
  SafetyError,
  assertClean,
  assertFeatureBranch,
  assertGhAuthenticated,
  assertNode22,
  assertOrigin,
  auditBranch,
  currentBranch,
  divergence,
  fetchOrigin,
  getRepoRoot,
  gitOutput,
  isGeneratedPath,
  markdownAudit,
  normalizeFeatureName,
  normalizeRepoPath,
  parseCommandArguments,
  pathMatchesScope,
  printAudit,
  readFeatureMetadata,
  refExists,
  revision,
  run,
  runGit,
  runReleaseGate,
  verifyPreparationReceipt,
  writeFeatureMetadata,
  writePreparationReceipt,
};
