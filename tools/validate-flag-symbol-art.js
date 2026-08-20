const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const runtimeSprite = fs.readFileSync(path.join(root, "assets", "flag-symbols", "runtime.svg"), "utf8");
const config = require(path.join(root, "functions", "playerFlagConfig.js"));
const proof = fs.readFileSync(path.join(root, "docs", "visual-qa", "player-flags", "symbol-art-pass.html"), "utf8");
const selectedRoot = path.join(root, "assets", "flag-symbols", "selected");
const manifest = JSON.parse(fs.readFileSync(path.join(selectedRoot, "manifest.json"), "utf8"));

const expectedIds = config.SYMBOLS.map(symbol => `cl-icon-${symbol.icon}`);
const symbolMatches = [...index.matchAll(/<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)];
const inlineFlagSymbols = symbolMatches.filter(match => match[1].startsWith("cl-icon-flag-"));
const runtimeFlagSymbols = [...runtimeSprite.matchAll(/<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)];
const flagSymbols = [...runtimeFlagSymbols, ...inlineFlagSymbols];
const discoveredIds = flagSymbols.map(match => match[1]);

assert.equal(runtimeFlagSymbols.length, 21, "Expected exactly 21 approved runtime flag symbols.");
assert.equal(inlineFlagSymbols.length, 9, "Expected exactly 9 inline legacy-only fallback symbols.");
assert.equal(new Set(discoveredIds).size, discoveredIds.length, "Duplicate runtime or fallback flag symbol IDs found.");
assert.deepEqual([...discoveredIds].sort(), [...expectedIds].sort(), "Runtime and fallback symbols do not preserve the stable 30-ID catalog.");
assert.deepEqual(runtimeFlagSymbols.map(match => match[1]), config.SELECTABLE_SYMBOLS.map(symbol => `cl-icon-${symbol.icon}`), "Runtime sprite ordering changed from the approved catalog.");
assert.deepEqual(inlineFlagSymbols.map(match => match[1]), config.LEGACY_ONLY_SYMBOL_KEYS.map(id => `cl-icon-flag-${id}`), "Inline fallbacks changed from the legacy-only catalog.");
assert.deepEqual(manifest.stableSymbolIds, config.SYMBOL_KEYS, "Source manifest does not preserve the stable 30-ID catalog.");

const forbiddenMarkup = /<(?:text|image|foreignObject|script)|href\s*=\s*"https?:|style\s*=|on\w+\s*=/i;
const allowedElements = new Set(["path", "circle", "rect", "polygon", "ellipse", "g"]);
const commandArity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const tokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/g;

function validatePathData(data, symbolId) {
  assert.ok(data && data.trim(), `${symbolId} contains an empty path.`);
  const tokens = data.match(tokenPattern) || [];
  const residue = data.replace(tokenPattern, "").replace(/[\s,]/g, "");
  assert.equal(residue, "", `${symbolId} contains invalid SVG path characters: ${residue}`);
  assert.match(tokens[0] || "", /^[Mm]$/, `${symbolId} path must start with M or m.`);

  let index = 0;
  let command = null;
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    assert.ok(command, `${symbolId} has path numbers without a command.`);
    const upper = command.toUpperCase();
    const arity = commandArity[upper];
    assert.notEqual(arity, undefined, `${symbolId} contains unsupported command ${command}.`);
    if (arity === 0) { command = null; continue; }
    let count = 0;
    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index])) { count += 1; index += 1; }
    assert.ok(count >= arity && count % arity === 0, `${symbolId} command ${command} has ${count} values; expected a multiple of ${arity}.`);
  }
}

for (const [, symbolId, viewBox, body] of flagSymbols) {
  assert.match(viewBox, /^0 0 (?:32|100) (?:32|100)$/, `${symbolId} uses an unexpected viewBox.`);
  assert.doesNotMatch(body, forbiddenMarkup, `${symbolId} contains forbidden SVG markup.`);
  const elements = [...body.matchAll(/<([a-z][a-z0-9-]*)\b/gi)].map(match => match[1]);
  assert.ok(elements.length, `${symbolId} contains no SVG geometry.`);
  for (const element of elements) assert.ok(allowedElements.has(element), `${symbolId} contains non-allowlisted <${element}> geometry.`);
  for (const pathMatch of body.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) validatePathData(pathMatch[1], symbolId);
  assert.equal((body.match(/<path\b/g) || []).length, [...body.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].length, `${symbolId} has a path without d data.`);
}

const useReferences = [...proof.matchAll(/href="#(cl-icon-[^"$]+)"/g)].map(match => match[1]);
for (const id of useReferences) assert.ok(index.includes(`id="${id}"`), `Proof page references missing symbol ${id}.`);
const runtimeUseReferences = [...proof.matchAll(/assets\/flag-symbols\/runtime\.svg#(cl-icon-[^"$]+)"/g)].map(match => match[1]);
for (const id of runtimeUseReferences) assert.ok(runtimeSprite.includes(`id="${id}"`), `Proof page references missing runtime symbol ${id}.`);
assert.match(proof, /all <use> refs/);
assert.match(proof, /duplicateIds/);
assert.match(proof, /new Path2D\(data\)/);
assert.match(proof, /assets\/flag-symbols\/selected\/manifest\.json/);

assert.equal(manifest.entries.length, 22, "Expected a mapping record for every uploaded source image.");
const selectedEntries = manifest.entries.filter(entry => entry.selected);
const alternateEntries = manifest.entries.filter(entry => !entry.selected);
const selectedIds = selectedEntries.map(entry => entry.symbolId);
assert.equal(selectedEntries.length, 21, "Expected 21 unique selected uploaded symbols.");
assert.equal(new Set(selectedIds).size, selectedIds.length, "Selected uploaded sources contain a duplicate runtime ID.");
assert.deepEqual([...selectedIds].sort(), [...config.SELECTABLE_SYMBOL_KEYS].sort(), "Selectable symbols do not exactly match the approved traced artwork set.");
assert.equal(alternateEntries.length, 1, "Expected one documented duplicate/alternate source.");
assert.equal(alternateEntries[0].symbolId, "eagle", "The documented alternate must remain an eagle candidate.");
assert.deepEqual(
  [...manifest.missingUploadedIds].sort(),
  config.SYMBOL_KEYS.filter(id => !selectedIds.includes(id)).sort(),
  "Missing uploaded IDs do not match catalog coverage."
);
assert.deepEqual(manifest.missingUploadedIds, config.LEGACY_ONLY_SYMBOL_KEYS, "Missing artwork IDs must remain the legacy-only compatibility set.");

let assetBytes = fs.statSync(path.join(selectedRoot, "manifest.json")).size;
for (const entry of manifest.entries) {
  assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/, `${entry.sourceFile} has an invalid SHA-256.`);
  assert.ok(entry.sourceWidth > 0 && entry.sourceHeight > 0, `${entry.sourceFile} has invalid source dimensions.`);
  assert.ok(["high", "medium-high"].includes(entry.confidence), `${entry.sourceFile} has an unsupported confidence value.`);

  const sourcePath = path.join(root, entry.sourceAsset);
  const vectorPath = path.join(root, entry.vectorAsset);
  assert.ok(fs.existsSync(sourcePath), `Missing normalized source asset ${entry.sourceAsset}.`);
  assert.ok(fs.existsSync(vectorPath), `Missing traced vector asset ${entry.vectorAsset}.`);
  const sourceBytes = fs.readFileSync(sourcePath);
  assert.deepEqual([...sourceBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${entry.sourceAsset} is not a PNG.`);

  const vector = fs.readFileSync(vectorPath, "utf8");
  assert.match(vector, /viewBox="0 0 100 100"/);
  assert.match(vector, /fill="currentColor"/);
  assert.doesNotMatch(vector, forbiddenMarkup, `${entry.vectorAsset} contains forbidden SVG markup.`);
  const vectorPathData = vector.match(/<path\b[^>]*\bd="([^"]+)"/)?.[1];
  validatePathData(vectorPathData, entry.vectorAsset);

  if (entry.selected) {
    const runtime = runtimeFlagSymbols.find(match => match[1] === `cl-icon-flag-${entry.symbolId}`);
    assert.ok(runtime, `Missing selected runtime symbol ${entry.symbolId}.`);
    const runtimePathData = runtime[3].match(/<path\b[^>]*\bd="([^"]+)"/)?.[1];
    assert.equal(runtimePathData, vectorPathData, `${entry.symbolId} runtime geometry is stale.`);
  }
  assetBytes += sourceBytes.length + Buffer.byteLength(vector);
}
assert.ok(assetBytes < 300 * 1024, `Selected source package is unexpectedly large: ${assetBytes} bytes.`);

assert.match(proof, /manifest\.entries\.filter\(entry => entry\.selected\)/, "Proof page does not derive the selected set from the source manifest.");
assert.match(proof, /config\.SYMBOLS\.filter\(symbol => selected\.has\(symbol\.key\)\)/, "Proof page does not render every selected source ID.");

console.log(`Validated 30 readable IDs across 21 approved runtime traces and 9 inline legacy-only fallbacks, 22 mapped sources, 1 alternate, and ${assetBytes} source-package bytes.`);
