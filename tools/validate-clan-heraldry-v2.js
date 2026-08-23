const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const artRoot = path.join(root, "assets", "clan-heraldry", "art-set-v1");
const manifest = JSON.parse(fs.readFileSync(path.join(artRoot, "manifest.json"), "utf8"));
const generated = JSON.parse(fs.readFileSync(path.join(artRoot, "generated-metadata.json"), "utf8"));
const config = require(path.join(root, "functions", "clanHeraldryConfig.js"));
const assets = require(path.join(root, "functions", "clanHeraldryAssets.js"));
const legacy = require(path.join(root, "functions", "clanHeraldryLegacyV1.js"));
const renderer = require(path.join(root, "functions", "clanHeraldryRenderer.js")).create({ config, assets, legacyRenderer: legacy });
const proof = fs.readFileSync(path.join(root, "docs", "visual-qa", "clan-heraldry-v2", "index.html"), "utf8");

const ids = config.CHARGES.map(option => option.key);
assert.equal(ids.length, 22, "Expected 21 artwork charges plus none.");
assert.equal(new Set(ids).size, ids.length, "Configured charge IDs must be unique.");
assert.equal(config.COLORS.length, 16, "Expected the approved 16-color palette.");
assert.equal(config.SHAPES.length, 4);
assert.equal(config.DIVISIONS.length, 8);
assert.equal(config.CHARGE_LAYOUTS.length, 4);
assert.equal(config.TRIMS.length, 3);
assert.equal(config.FINISHES.length, 3);
assert.deepEqual(config.PENDING_CHARGE_KEYS, ["double-eagle", "griffin", "raven", "helm", "castle"]);
assert.equal(config.normalizeHeraldryRevision(undefined), 0);
assert.equal(config.normalizeHeraldryRevision(-1), 0);
assert.equal(config.normalizeHeraldryRevision(7), 7);
assert.equal(config.V2_SCHEMA_EXAMPLE.charge, "castle");
assert.equal(config.normalizeV2ForRead(config.V2_SCHEMA_EXAMPLE).charge, "castle", "Lenient reads must preserve stable pending IDs.");
assert.equal(config.createV2DraftFromV1({ charge: "castle" }).charge, "none", "Legacy Castle must not be silently remapped to clan-exclusive Fortress Keep.");

const manifestIds = manifest.entries.map(entry => entry.id);
assert.equal(new Set(manifestIds).size, manifestIds.length, "Manifest IDs must be unique.");
assert.deepEqual(manifestIds, ids.filter(id => id !== "none"), "Manifest/config charge ordering changed.");
const availableIds = manifest.entries.filter(entry => entry.available).map(entry => entry.id);
assert.deepEqual(availableIds, config.SELECTABLE_CHARGE_KEYS.filter(id => id !== "none"));
for (const entry of manifest.entries.filter(entry => entry.artworkPending)) {
  assert.equal(entry.available, false); assert.equal(entry.selectable, false);
  assert.ok(!entry.sourcePath, `${entry.id} must not receive fallback artwork.`);
}

function pngDimensions(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
for (const entry of manifest.entries.filter(entry => entry.available)) {
  const source = fs.readFileSync(path.join(root, entry.sourcePath));
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), entry.sourceSha256, `${entry.id} source hash mismatch.`);
  assert.deepEqual(pngDimensions(source), [entry.sourceWidth, entry.sourceHeight], `${entry.id} source dimensions changed.`);
  if (entry.sourceWidth !== 1024 || entry.sourceHeight !== 1024) {
    assert.equal(entry.approvedSourceException === true || entry.provenance === "player-source", true, `${entry.id} needs a documented source-contract exception.`);
  }
}

const metadataById = new Map(generated.entries.map(entry => [entry.id, entry]));
assert.deepEqual(generated.entries.map(entry => entry.id), availableIds, "Full/micro generated manifest parity failed.");
for (const id of availableIds) {
  const metadata = metadataById.get(id);
  assert.ok(metadata, `Missing generated metadata for ${id}.`);
  for (const [variant, minimumPadding] of [["full", 31], ["micro", 23]]) {
    const bounds = metadata[`${variant}Bounds`];
    assert.ok(bounds.left >= minimumPadding && bounds.top >= minimumPadding && 511 - bounds.right >= minimumPadding && 511 - bounds.bottom >= minimumPadding, `${id} ${variant} exceeds safe bounds.`);
    assert.ok(fs.statSync(path.join(artRoot, "normalized", variant, `${id}.png`)).size > 0, `${id} ${variant} mask is empty.`);
    assert.ok(fs.statSync(path.join(artRoot, "svg", variant, `${id}.svg`)).size > 0, `${id} ${variant} trace is empty.`);
  }
}

const forbidden = /<(?:script|image|foreignObject|text)|\bon\w+\s*=|href\s*=\s*["']https?:|style\s*=/i;
const spriteData = {};
for (const variant of ["full", "micro"]) {
  const file = path.join(artRoot, `charges-${variant}.svg`);
  const svg = fs.readFileSync(file, "utf8");
  spriteData[variant] = { raw: Buffer.byteLength(svg), gzip: zlib.gzipSync(svg).length, svg };
  assert.doesNotMatch(svg, forbidden, `${variant} sprite contains forbidden SVG content.`);
  const symbolIds = [...svg.matchAll(/<symbol\s+id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(symbolIds.length, availableIds.length, `${variant} sprite does not match manifest.`);
  assert.equal(new Set(symbolIds).size, symbolIds.length, `${variant} sprite contains duplicate IDs.`);
  assert.deepEqual(symbolIds, availableIds.map(id => `clan-charge-v1-${variant}-${id}`));
  assert.ok(!svg.includes("<path fill-rule=\"evenodd\" d=\"\""), `${variant} sprite contains an empty path.`);
}
assert.ok(spriteData.full.raw <= 120 * 1024, `Full sprite exceeds 120KB: ${spriteData.full.raw}`);
assert.ok(spriteData.full.gzip <= 45 * 1024, `Full sprite exceeds 45KB gzip: ${spriteData.full.gzip}`);
assert.ok(spriteData.micro.raw <= 45 * 1024, `Micro sprite exceeds 45KB: ${spriteData.micro.raw}`);
assert.ok(spriteData.micro.gzip <= 18 * 1024, `Micro sprite exceeds 18KB gzip: ${spriteData.micro.gzip}`);

assert.match(proof, /symbolHref/);
for (const id of availableIds) {
  assert.ok(spriteData.full.svg.includes(`id="clan-charge-v1-full-${id}"`));
  assert.ok(spriteData.micro.svg.includes(`id="clan-charge-v1-micro-${id}"`));
}
assert.doesNotMatch(assets.FULL_SPRITE_URL, /^https?:/);
assert.doesNotMatch(assets.MICRO_SPRITE_URL, /^https?:/);
assert.match(proof, /568|landscape/);
assert.doesNotMatch(proof, /orientation\s*:\s*portrait/i);

function loadProductionV1Renderer() {
  const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
  const start = game.indexOf("function createDefaultClanShield()");
  const end = game.indexOf("function setTextIfChanged", start);
  assert.ok(start >= 0 && end > start, "Unable to isolate current production v1 renderer.");
  const prefix = `const CLAN_SHIELD_SHAPES=${JSON.stringify(config.SHAPES.map(({ key, label }) => ({ key, label })))};const CLAN_SHIELD_DIVISIONS=${JSON.stringify(config.DIVISIONS.map(({ key, label }) => ({ key, label })))};const CLAN_SHIELD_CHARGES=${JSON.stringify(["none","castle","lion","eagle","crown","swords","fleur","sun"].map(key=>({key})))};const CLAN_SHIELD_CHARGE_LAYOUTS=${JSON.stringify(config.CHARGE_LAYOUTS)};const CLAN_SHIELD_TRIMS=${JSON.stringify(config.TRIMS)};const CLAN_SHIELD_FINISHES=${JSON.stringify(config.FINISHES)};function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}`;
  const context = { result: null };
  vm.runInNewContext(`${prefix}${game.slice(start, end)}result={normalizeClanShield,renderClanShield};`, context);
  return context.result;
}
const productionV1 = loadProductionV1Renderer();
const legacyBannerFixture = { pattern: "diagonal", symbol: "tower", primary: "#24445f", secondary: "#d8bd78" };
assert.equal(JSON.stringify(legacy.normalizeClanShield(null, legacyBannerFixture)), JSON.stringify(productionV1.normalizeClanShield(null, legacyBannerFixture)), "Legacy banner normalization changed.");
const fixtures = [null, config.DEFAULT_V1, { pattern: "diagonal", symbol: "tower", primary: "#abcdef" }, { shape: "kite", division: "saltire", charge: "sun", secondaryCharge: "fleur", chargeLayout: "chief", trim: "riveted", finish: "battleworn" }];
for (const [index, fixture] of fixtures.entries()) {
  assert.equal(JSON.stringify(legacy.normalizeClanShield(fixture)), JSON.stringify(productionV1.normalizeClanShield(fixture)), `v1 normalization fixture ${index} changed.`);
  const options = { size: index ? "mini" : "large", instance: `fixture-${index}`, label: `Fixture ${index}` };
  assert.equal(legacy.renderClanShield(fixture, options), productionV1.renderClanShield(fixture, options), `v1 renderer fixture ${index} changed.`);
}

const strictDefault = config.validateV2Write({ ...config.DEFAULT_V2 });
assert.equal(strictDefault.ok, true, strictDefault.errors.join(" "));
assert.equal(config.validateV2Write({ ...config.DEFAULT_V2, charge: "griffin" }).ok, false, "Pending artwork must be rejected for writes.");
assert.doesNotMatch(renderer.renderMarkup(config.V2_SCHEMA_EXAMPLE, { width: 96 }), /clan-charge-v1-full-castle/, "Pending charges must not emit unresolved sprite references.");
assert.equal(config.validateV2Write({ ...config.DEFAULT_V2, surprise: true }).ok, false, "Unknown fields must be rejected.");
assert.equal(config.validateV2Write({ ...config.DEFAULT_V2, primary: "#123456" }).ok, false, "New off-palette values must be rejected.");
assert.equal(config.validateV2Write({ ...config.DEFAULT_V2, primary: "#123456" }, { existing: { ...config.DEFAULT_V2, primary: "#123456" } }).ok, true, "Existing off-palette values must remain valid.");

function nodeCount(markup) { return (markup.match(/<[a-z][^!/\s>]*(?:\s|>)/gi) || []).length; }
const microMarkup = renderer.renderMarkup({ ...config.DEFAULT_V2 }, { width: 27 });
const fullMarkup = renderer.renderMarkup({ ...config.DEFAULT_V2 }, { width: 96 });
const pairedMarkup = renderer.renderMarkup({ ...config.DEFAULT_V2, chargeLayout: "paired" }, { width: 96 });
const complexMarkup = renderer.renderMarkup({ ...config.DEFAULT_V2, chargeLayout: "quartered" }, { width: 96 });
assert.match(microMarkup, /data-heraldry-variant="micro"/);
assert.match(renderer.renderMarkup({ ...config.DEFAULT_V2 }, { size: "mini" }), /data-heraldry-variant="micro"/);
assert.match(fullMarkup, /data-heraldry-variant="full"/);
assert.match(microMarkup, /charges-micro\.svg#/);
assert.match(fullMarkup, /charges-full\.svg#/);
assert.ok(nodeCount(microMarkup) <= 12, `Micro shield has ${nodeCount(microMarkup)} nodes.`);
assert.ok(nodeCount(fullMarkup) <= 18, `Full center shield has ${nodeCount(fullMarkup)} nodes.`);
assert.ok(nodeCount(pairedMarkup) <= 18, `Full paired shield has ${nodeCount(pairedMarkup)} nodes.`);
assert.ok(nodeCount(complexMarkup) <= 22, `Complex shield has ${nodeCount(complexMarkup)} nodes.`);
assert.ok(nodeCount(microMarkup) * 100 <= 1200, "100-row micro heraldry exceeds 1,200 nodes.");
assert.doesNotMatch(fullMarkup, /<defs>/, "V2 creates per-instance definitions.");
assert.equal((fullMarkup.match(/assets\/clan-heraldry/g) || []).length, 1, "Center shield should use one local sprite reference.");
assert.equal(renderer.renderMarkup(config.DEFAULT_V1, { instance: "dispatch" }), legacy.renderClanShield(config.DEFAULT_V1, { instance: "dispatch" }), "Version dispatch changed v1.");

const fakeElement = { dataset: {}, ownerDocument: null, innerHTML: "", getBoundingClientRect: () => ({ width: 40 }) };
const firstRender = renderer.render(fakeElement, config.DEFAULT_V2, { width: 40 });
const firstMarkup = fakeElement.innerHTML;
const secondRender = renderer.render(fakeElement, config.DEFAULT_V2, { width: 40 });
assert.equal(firstRender.changed, true); assert.equal(secondRender.changed, false); assert.equal(fakeElement.innerHTML, firstMarkup);
const measuredElement = { dataset: {}, ownerDocument: null, innerHTML: "", getBoundingClientRect: () => ({ width: 39 }) };
renderer.render(measuredElement, config.DEFAULT_V2);
assert.match(measuredElement.innerHTML, /data-heraldry-variant="micro"/, "Measured widths below 45px must use micro art.");

for (const charge of config.SELECTABLE_CHARGES.filter(option => option.key !== "none")) {
  const markup = renderer.renderMarkup({ ...config.DEFAULT_V2, charge: charge.key }, { width: 27 });
  assert.match(markup, new RegExp(`clan-charge-v1-micro-${charge.key}`));
}
for (const token of ["exclusive-grid", "charge-grid", "reuse-grid", "pending-grid", "shapes", "divisions", "layouts", "materials", "version-proof"]) assert.ok(proof.includes(token), `Proof section ${token} missing.`);

console.log(JSON.stringify({ charges: availableIds.length, pending: config.PENDING_CHARGE_KEYS.length, spriteBytes: { full: spriteData.full.raw, fullGzip: spriteData.full.gzip, micro: spriteData.micro.raw, microGzip: spriteData.micro.gzip }, nodes: { micro: nodeCount(microMarkup), fullCenter: nodeCount(fullMarkup), fullPaired: nodeCount(pairedMarkup), complex: nodeCount(complexMarkup), leaderboard100: nodeCount(microMarkup) * 100 }, v1Fixtures: fixtures.length }, null, 2));
