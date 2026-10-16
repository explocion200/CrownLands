"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function publicConfiguration(value) {
  if (!value || Object.keys(value).sort().join() !== "epoch,mode,protocol,publicKey" || value.mode !== "production" || value.protocol !== 1
    || !/^[a-f0-9]{32}$/.test(value.epoch || "") || !/^[A-Za-z0-9_-]{87}$/.test(value.publicKey || "")) throw Error("Explicit public local deployment configuration required");
  const bytes = Buffer.from(value.publicKey, "base64url");
  if (bytes.length !== 65 || bytes[0] !== 4 || bytes.toString("base64url") !== value.publicKey) throw Error("Invalid public push key");
  crypto.ECDH.convertKey(bytes, "prime256v1");
  return { ...value };
}
function inventory(directory) {
  const files = [];
  function visit(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile()) { const bytes = fs.readFileSync(file); files.push({ path: path.relative(directory, file).split(path.sep).join("/"), bytes: bytes.length, sha256: hash(bytes) }); }
    else throw Error("Static client cannot contain links or special files");
  } }
  visit(directory); return files.sort((a, b) => a.path.localeCompare(b.path));
}
function prepare({ source, destination, config }) {
  config = publicConfiguration(config);
  if (!path.isAbsolute(source) || !path.isAbsolute(destination) || fs.existsSync(destination)
    || destination.startsWith(source + path.sep)) throw Error("New separate absolute candidate directory required");
  const before = inventory(source), manifest = JSON.parse(fs.readFileSync(path.join(source, "artifact-manifest.json")));
  const listed = new Map(manifest.files.map(file => [file.path, file.bytes]));
  if (before.length !== listed.size + 1 || before.some(file => file.path !== "artifact-manifest.json" && listed.get(file.path) !== file.bytes)) throw Error("Validated static artifact required");
  for (const file of ["local-production.js", "local-client.js", "local-web-push.js", "firebaseClient.js", "service-worker.js", "firebase-config.js", "index.html", "play/index.html"]) {
    if (!listed.has(file)) throw Error("Local client dependency missing");
  }
  const sourceHtml = fs.readFileSync(path.join(source, "index.html"), "utf8");
  const extraPrecache = ["local-production.js", "local-client.js", "local-web-push.js", "firebase-config.js"];
  if (extraPrecache.reduce((bytes, name) => bytes + listed.get(name), 0) > 32 * 1024) throw Error("Local transport precache exceeds 32 KiB");
  const sourceBuild = /name="crownlands-build" content="([A-Za-z0-9_-]+)"/.exec(sourceHtml)?.[1];
  if (!sourceBuild) throw Error("Stamped source build required");
  const buildId = sourceBuild + "-local-" + config.epoch;
  const browserConfig = { ...config, buildId };
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  const write = (name, value) => fs.writeFileSync(path.join(destination, name), value);
  write("firebase-config.js", `// Public deployment identity and Web Push verification key; no credentials.\nwindow.CROWNLANDS_LOCAL_BACKEND = ${JSON.stringify(browserConfig)};\n`);
  for (const name of ["index.html", "play/index.html"]) {
    const html = fs.readFileSync(path.join(destination, name), "utf8");
    const configScript = /<script src="firebase-config\.js(?:\?[^"<>]*)?"><\/script>/g;
    const entryScript = /<script src="app-entry\.js(?:\?[^"<>]*)?"><\/script>/;
    if ([...html.matchAll(configScript)].length !== 1 || !entryScript.test(html) || html.includes('src="local-production.js')) throw Error("Review changed game bootstrap");
    write(name, html.replace(configScript, "").replace(entryScript,
      '<script src="firebase-config.js"></script>\n  <script src="local-production.js"></script>\n  $&')
      .replace(/(name="crownlands-build" content=")[^"]*(")/, `$1${buildId}$2`)
      .replace(/((?:href|src)="(?!https?:|\/\/)[^"]+\.(?:css|js))(?:\?v=[^"]*)?(")/gi, `$1?v=${buildId}$2`));
  }
  const worker = fs.readFileSync(path.join(destination, "service-worker.js"), "utf8");
  if (worker.split("const LOCAL_BACKEND = null;").length !== 2) throw Error("Review changed worker backend selector");
  write("service-worker.js", worker.replace("const LOCAL_BACKEND = null;", `const LOCAL_BACKEND = ${JSON.stringify(config)};`)
    .replace(/const CACHE_VERSION = "([A-Za-z0-9_-]+)";/, `const CACHE_VERSION = "${buildId}";`)
    .replace(/("(?:\/[^"\n]+)\.(?:css|js))\?v=[^"]*(")/gi, `$1?v=${buildId}$2`)
    .replace("const STATIC_CACHE_URLS = [", "const STATIC_CACHE_URLS = [\n" + extraPrecache.map(name => `  "/${name}?v=${buildId}",`).join("\n")));
  // Regenerate sizes after the variant transformation; preserve a digest of the
  // original build and exact candidate for later reviewed installation.
  const files = inventory(destination).filter(file => file.path !== "artifact-manifest.json");
  write("artifact-manifest.json", JSON.stringify({ schemaVersion: 1, fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files: files.map(({ path, bytes }) => ({ path, bytes })) }, null, 2) + "\n");
  return { version: 1, mode: "production", protocol: 1, epoch: config.epoch, publicKey: config.publicKey, buildId,
    sourceDigest: hash(JSON.stringify(before)), files: inventory(destination) };
}
if (require.main === module) {
  try {
    const [source, configuration, destination] = process.argv.slice(2);
    const receipt = prepare({ source, destination, config: JSON.parse(fs.readFileSync(configuration)) });
    fs.writeFileSync(destination + ".receipt.json", JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log("Prepared local production candidate. No services, routing or live data changed.");
  } catch { console.error("Candidate preparation stopped. Preserve any partial output and inspect locally."); process.exitCode = 1; }
}
module.exports = { publicConfiguration, inventory, prepare };
