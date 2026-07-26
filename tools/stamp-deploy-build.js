const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
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
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function writeProjectFile(relativePath, contents) {
  if (checkOnly) return;
  fs.writeFileSync(path.join(projectRoot, relativePath), contents, "utf8");
}

const buildId = getBuildId();
if (!buildId) throw new Error("Could not determine a Crownlands deployment build ID.");

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

console.log(`${checkOnly ? "Validated" : "Stamped"} Crownlands deployment build ${buildId}.`);
