const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PROJECT_MARKERS = Object.freeze([
  "index.html",
  "tools/editor-server.js",
  "tools/crownlands-studio/project-file-service.js",
  "tools/map-editor/index.html",
  "tools/map-editor/studio.js",
  "tools/map-editor/ui-inspector.js",
  "assets/optimized/manifest.json",
  "assets/worlds/world_01/world-layout.json",
  "economy-config.js",
  "functions/economy-config.json",
  "ui-layout-config.js",
  "ui-studio-config.json",
  "ui-component-runtime.js",
  "objective-visual-config.js",
  "benchmark-results/map/core-v2-qa-1/CORE_PREVIEW_INTEGRITY_MANIFEST.json",
]);

function normalizeRelativePath(value) {
  const source = String(value || "").trim().replace(/\\/g, "/");
  if (!source || path.posix.isAbsolute(source) || /^[a-z]:/i.test(source)) {
    throw new Error(`Project path must be relative: ${source || "(empty)"}`);
  }
  const normalized = path.posix.normalize(source).replace(/^\.\//, "");
  if (!normalized || normalized === ".." || normalized.startsWith("../") || normalized.includes("\0")) {
    throw new Error(`Project path escapes the selected root: ${source}`);
  }
  return normalized;
}

function resolveInside(rootDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(rootDir, ...normalized.split("/"));
  const relative = path.relative(rootDir, resolved);
  if (!relative || relative === ".") return { normalized, resolved };
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Resolved path escapes the selected Crownlands project: ${normalized}`);
  }
  return { normalized, resolved };
}

async function validateCrownlandsProject(candidateRoot) {
  const supplied = String(candidateRoot || "").trim();
  if (!supplied) {
    return { valid: false, root: "", missing: [...PROJECT_MARKERS], errors: ["No project folder was selected."] };
  }

  let root;
  try {
    root = await fsp.realpath(path.resolve(supplied));
    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) throw new Error("The selected path is not a folder.");
  } catch (error) {
    return { valid: false, root: path.resolve(supplied), missing: [...PROJECT_MARKERS], errors: [error.message || String(error)] };
  }

  const missing = [];
  for (const marker of PROJECT_MARKERS) {
    try {
      const target = resolveInside(root, marker).resolved;
      const stat = await fsp.stat(target);
      if (!stat.isFile()) missing.push(marker);
    } catch {
      missing.push(marker);
    }
  }

  const errors = [];
  if (!missing.includes("assets/worlds/world_01/world-layout.json")) {
    try {
      const worldLayout = JSON.parse(await fsp.readFile(path.join(root, "assets", "worlds", "world_01", "world-layout.json"), "utf8"));
      if (!worldLayout?.worldId || !Array.isArray(worldLayout?.regions) || !worldLayout.regions.length) {
        errors.push("World layout is missing worldId or region markers.");
      }
    } catch (error) {
      errors.push(`World layout is not valid JSON: ${error.message || error}`);
    }
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    root,
    projectName: path.basename(root),
    missing,
    errors,
    markers: [...PROJECT_MARKERS],
  };
}

function matchesPolicy(relativePath, exact, prefixes) {
  return exact.has(relativePath) || prefixes.some(prefix => relativePath.startsWith(prefix));
}

function createProjectFileService(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const readExact = new Set((options.readExact || []).map(normalizeRelativePath));
  const writeExact = new Set((options.writeExact || []).map(normalizeRelativePath));
  const readPrefixes = (options.readPrefixes || []).map(value => `${normalizeRelativePath(value).replace(/\/$/, "")}/`);
  const writePrefixes = (options.writePrefixes || []).map(value => `${normalizeRelativePath(value).replace(/\/$/, "")}/`);
  const backupRoot = normalizeRelativePath(options.backupRoot || ".crownlands-studio/backups");

  function resolveAllowed(relativePath, operation) {
    const target = resolveInside(root, relativePath);
    const exact = operation === "write" ? writeExact : readExact;
    const prefixes = operation === "write" ? writePrefixes : readPrefixes;
    if (!matchesPolicy(target.normalized, exact, prefixes)) {
      throw new Error(`${operation === "write" ? "Writing" : "Reading"} is not allowed for project file: ${target.normalized}`);
    }
    return target;
  }

  async function readText(relativePath) {
    const target = resolveAllowed(relativePath, "read");
    try {
      return await fsp.readFile(target.resolved, "utf8");
    } catch (error) {
      throw new Error(`Could not read ${target.normalized}: ${error.message || error}`, { cause: error });
    }
  }

  async function readJson(relativePath, fallback) {
    try {
      return JSON.parse(await readText(relativePath));
    } catch (error) {
      if (error.cause?.code === "ENOENT" && arguments.length > 1) return fallback;
      throw error;
    }
  }

  async function backupExisting(target) {
    try {
      await fsp.access(target.resolved, fs.constants.F_OK);
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
    const backupRelative = `${backupRoot}/${target.normalized}.bak`;
    const backup = resolveInside(root, backupRelative);
    await fsp.mkdir(path.dirname(backup.resolved), { recursive: true });
    await fsp.copyFile(target.resolved, backup.resolved);
    return backup.normalized;
  }

  async function writeAtomic(relativePath, data, options = {}) {
    const target = resolveAllowed(relativePath, "write");
    const backupPath = options.backup === false ? "" : await backupExisting(target);
    await fsp.mkdir(path.dirname(target.resolved), { recursive: true });
    const tempPath = `${target.resolved}.${process.pid}.${Date.now()}.studio-tmp`;
    try {
      await fsp.writeFile(tempPath, data, options.encoding ? { encoding: options.encoding } : undefined);
      await fsp.rename(tempPath, target.resolved);
    } catch (error) {
      await fsp.unlink(tempPath).catch(() => {});
      throw new Error(`Could not write ${target.normalized}: ${error.message || error}`, { cause: error });
    }
    return { path: target.normalized, backupPath };
  }

  async function writeTextAtomic(relativePath, text, options = {}) {
    return writeAtomic(relativePath, String(text), { ...options, encoding: "utf8" });
  }

  async function writeJsonAtomic(relativePath, value, options = {}) {
    return writeTextAtomic(relativePath, `${JSON.stringify(value, null, 2)}\n`, options);
  }

  async function removeFile(relativePath) {
    const target = resolveAllowed(relativePath, "write");
    const backupPath = await backupExisting(target);
    try {
      await fsp.unlink(target.resolved);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`Could not remove ${target.normalized}: ${error.message || error}`, { cause: error });
      }
    }
    return { path: target.normalized, backupPath };
  }

  function relativeFromAbsolute(filePath) {
    const resolved = path.resolve(filePath);
    const relative = path.relative(root, resolved).replace(/\\/g, "/");
    return resolveInside(root, relative).normalized;
  }

  return Object.freeze({
    root,
    readText,
    readJson,
    writeAtomic,
    writeTextAtomic,
    writeJsonAtomic,
    removeFile,
    relativeFromAbsolute,
    resolveRead: relativePath => resolveAllowed(relativePath, "read").resolved,
    resolveWrite: relativePath => resolveAllowed(relativePath, "write").resolved,
  });
}

module.exports = {
  PROJECT_MARKERS,
  createProjectFileService,
  normalizeRelativePath,
  validateCrownlandsProject,
};
