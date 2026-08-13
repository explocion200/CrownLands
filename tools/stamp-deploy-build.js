const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createDailyPatchNoteReleases, getUtcDateKey } = require("./patch-note-history");
const { fingerprintWorldMaps } = require("./fingerprint-world-maps");
const { fingerprintWorldThumbnails } = require("./fingerprint-world-thumbnails");

const projectRoot = path.resolve(__dirname, "..");
const rootArgumentIndex = process.argv.indexOf("--root");
const artifactRoot = rootArgumentIndex >= 0
  ? path.resolve(projectRoot, process.argv[rootArgumentIndex + 1] || "")
  : projectRoot;
const checkOnly = process.argv.includes("--check");

function getBuildId() {
  const deployedCommit = String(
    process.env.COMMIT_REF
      || process.env.GITHUB_SHA
      || process.env.DEPLOY_ID
      || "",
  ).trim();
  if (deployedCommit) return deployedCommit.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch (_) {
    return `local-${Date.now()}`;
  }
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(artifactRoot, relativePath), "utf8");
}

function writeProjectFile(relativePath, contents) {
  if (checkOnly) return;
  fs.writeFileSync(path.join(artifactRoot, relativePath), contents, "utf8");
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_) {
    return "";
  }
}

function normalizePatchNote(value) {
  let note = String(value || "")
    .replace(/^\s*(?:feat|fix|perf|refactor)(?:\([^)]*\))?!?:\s*/i, "")
    .replace(/\s*\(#\d+\)\s*$/i, "")
    .replace(/\s*\[(?:skip ci|ci skip)\]\s*$/i, "")
    .trim();
  if (!note || /^merge\b/i.test(note)) return "";
  if (/\b(?:tests?|testing|validator|validation|emulator gate|release gate)\b/i.test(note)) return "";
  if (/^(?:chore|ci|docs)(?:\([^)]*\))?:/i.test(note)) return "";
  note = `${note.charAt(0).toUpperCase()}${note.slice(1)}`;
  return /[.!?]$/.test(note) ? note : `${note}.`;
}

function getCommitBodyNote(commit) {
  const lines = runGit(["show", "-s", "--format=%B", commit])
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^merge pull request\b/i.test(line) && !/^(?:co-authored-by|signed-off-by):/i.test(line));
  for (const line of lines) {
    const note = normalizePatchNote(line);
    if (note) return note;
  }
  return "";
}

function getCommitPatchNotes(commit) {
  const revisionParts = runGit(["rev-list", "--parents", "-n", "1", commit]).split(/\s+/).filter(Boolean);
  const firstParent = revisionParts[1] || "";
  const isMergeCommit = revisionParts.length > 2;
  const subjectOutput = isMergeCommit && firstParent
    ? runGit(["log", "--reverse", "--no-merges", "--format=%s", `${firstParent}..${commit}`])
    : runGit(["show", "-s", "--format=%s", commit]);
  const notes = subjectOutput
    .split(/\r?\n/)
    .map(normalizePatchNote)
    .filter(Boolean)
    .filter((note, index, values) => values.indexOf(note) === index)
    .slice(0, 6);
  if (notes.length) return notes;
  const bodyNote = getCommitBodyNote(commit);
  return [bodyNote || "Performance, stability, and maintenance improvements."];
}

function getPatchNoteReleases(currentBuildId) {
  const releaseRows = runGit(["log", "--first-parent", "--format=%H%x09%cI", "HEAD"])
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(row => {
      const [commit, publishedAt] = row.split("\t");
      return { commit, publishedAt };
    });
  if (!releaseRows.length) {
    const publishedAt = new Date().toISOString();
    return [{
      buildId: currentBuildId,
      dateKey: getUtcDateKey(publishedAt),
      publishedAt,
      notes: ["Performance, stability, and gameplay improvements."],
    }];
  }
  const releases = createDailyPatchNoteReleases(releaseRows, {
    currentBuildId,
    getNotes: getCommitPatchNotes,
  });
  if (releases.length) return releases;
  const publishedAt = new Date().toISOString();
  return [{
    buildId: currentBuildId,
    dateKey: getUtcDateKey(publishedAt),
    publishedAt,
    notes: ["Performance, stability, and gameplay improvements."],
  }];
}

function createPatchNotesSource(currentBuildId) {
  const payload = {
    buildId: currentBuildId,
    generatedAt: new Date().toISOString(),
    releases: getPatchNoteReleases(currentBuildId),
  };
  return `(function () {\n  const patchNotes = ${JSON.stringify(payload, null, 2)};\n  patchNotes.releases.forEach(release => {\n    release.notes = Object.freeze(release.notes);\n    Object.freeze(release);\n  });\n  patchNotes.releases = Object.freeze(patchNotes.releases);\n  window.CROWNLANDS_PATCH_NOTES = Object.freeze(patchNotes);\n})();\n`;
}

const buildId = getBuildId();
if (!buildId) throw new Error("Could not determine a Crownlands deployment build ID.");

if (artifactRoot === projectRoot) {
  fingerprintWorldMaps({ checkOnly });
  fingerprintWorldThumbnails({ checkOnly });
}

readProjectFile("patch-notes.js");
const patchNotesSource = createPatchNotesSource(buildId);
writeProjectFile("patch-notes.js", patchNotesSource);

const indexHtml = readProjectFile("index.html")
  .replace(
    /(<meta\s+name="crownlands-build"\s+content=")[^"]*("\s*\/?>)/i,
    `$1${buildId}$2`,
  )
  .replace(
    /((?:href|src)="(?!https?:|\/\/)[^"]+\.(?:css|js))(?:\?v=[^"]*)?(")/gi,
    `$1?v=${buildId}$2`,
  );
writeProjectFile("index.html", indexHtml);

const serviceWorker = readProjectFile("service-worker.js")
  .replace(
    /const CACHE_VERSION = "[^"]*";/,
    `const CACHE_VERSION = "${buildId}";`,
  )
  .replace(
    /("(?:\/[^"]+)\.(?:css|js))\?v=[^"]*(")/gi,
    `$1?v=${buildId}$2`,
  );
writeProjectFile("service-worker.js", serviceWorker);

const localScriptAndStyleUrls = [...indexHtml.matchAll(/(?:href|src)="((?!https?:|\/\/)[^"]+\.(?:css|js)(?:\?[^"]*)?)"/gi)]
  .map(match => match[1]);
if (!indexHtml.includes(`name="crownlands-build" content="${buildId}"`)) {
  throw new Error("The HTML build marker was not stamped.");
}
if (localScriptAndStyleUrls.some(url => !url.includes(`v=${buildId}`))) {
  throw new Error("At least one local script or stylesheet was not stamped.");
}
if (!serviceWorker.includes(`const CACHE_VERSION = "${buildId}";`)) {
  throw new Error("The service-worker cache version was not stamped.");
}
if (!patchNotesSource.includes(`"buildId": "${buildId}"`) || !patchNotesSource.includes('window.CROWNLANDS_PATCH_NOTES')) {
  throw new Error("The generated patch notes were not stamped with the deployment build.");
}
new Function(patchNotesSource);

console.log(`${checkOnly ? "Validated" : "Stamped"} Crownlands deployment build ${buildId}.`);
