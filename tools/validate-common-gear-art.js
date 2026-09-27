const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const G = require("../common-gear"), serverG = require("../functions/common-gear");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const context = {escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))};
vm.runInNewContext(read("common-gear-ui.js") + "\nthis.artLayout = COMMON_GEAR_ART_LAYOUT;", context);
const assets = JSON.parse(read("assets/optimized/manifest.json")).assets.filter(a => a.category === "gear-item");
assert.equal(assets.length, 320); assert.equal(Object.keys(context.artLayout).length, 160);
assert.deepEqual(G.DEFINITIONS, serverG.DEFINITIONS, "Artwork import must preserve client/server definition parity.");
assert(G.DEFINITIONS.every(d => G.RARITIES.includes(d.rarity) && d.maxLevel === 5), "Every rarity must retain five levels.");
const sha = payload => crypto.createHash("sha256").update(payload).digest("hex");
for (const definition of G.DEFINITIONS) {
  const layout = context.artLayout[definition.art]; assert(layout, definition.gearKey);
  for (const [detail, output] of [[false, definition.art], [true, layout[0]]]) {
    const asset = assets.find(a => a.output === output); assert(asset && asset.preparedDelivery);
    const payload = fs.readFileSync(path.join(root, output));
    const source = fs.readFileSync(path.join(root, asset.source));
    assert.equal(sha(payload), asset.sha256); assert.equal(sha(source), asset.sourceSha256);
    assert.equal(payload.length, asset.bytes); assert.equal(asset.width, detail ? 384 : 192);
    assert.equal(asset.width, asset.height); assert(asset.hasAlpha);
    assert(asset.bytes <= (detail ? 96 : 32) * 1024);
    const rendered = context.renderCommonGearArtwork(definition.art, {detail});
    assert(rendered.includes(`href="${output}"`));
    assert(rendered.includes('viewBox="0 0 100 100"') && rendered.includes('preserveAspectRatio="xMidYMid meet"'));
    assert(rendered.includes('aria-hidden="true"') && rendered.includes('focusable="false"'));
    assert(!rendered.includes('srcset='), "Small slots must not automatically fetch selected-item detail art.");
    assert.equal((rendered.match(/<image /g) || []).length, 1);
    assert(rendered.includes("this.style.visibility='hidden'"), "A failed bitmap must leave surrounding labels usable.");
    const sourceWidth = source.readUInt32BE(16), b = asset.sourceBounds;
    const scale = (asset.width - 2 * asset.safetyPadding) / sourceWidth;
    const [_, size, left, top] = layout;
    const frame = {left: left + (b.left * scale + asset.safetyPadding) / asset.width * size,
      top: top + (b.top * scale + asset.safetyPadding) / asset.height * size,
      width: b.width * scale / asset.width * size, height: b.height * scale / asset.height * size};
    assert(Math.abs(Math.max(frame.width, frame.height) - 84) < .001);
    assert(Math.min(frame.left, frame.top, 100-frame.left-frame.width, 100-frame.top-frame.height) > 7.9);
  }
}
const escaped = context.renderCommonGearArtwork(G.DEFINITIONS[0].art, {alt:'A "quoted" & named item'});
assert(escaped.includes('aria-label="A &quot;quoted&quot; &amp; named item"'));
assert(context.renderCommonGearArtwork("missing.webp").includes('onerror="this.hidden=true"'));
for (const prefix of ["treasury", "barracks", "gatehouse", "royal-stables"]) {
  const text = read(`${prefix}-gear-ui.js`);
  assert(text.includes("renderCommonGearArtwork(src,{alt,detail})"));
  assert(text.includes('GearArt(def.art,"",true)'), `${prefix} selected details need the larger derivative`);
}
assert(read("common-gear-box-ui.js").includes("renderCommonGearArtwork(d.art)"));
for (const file of ["battle-report-detail-ui.js", "troop-orders-ui.js"]) {
  for (const [output] of read(file).matchAll(/assets\/optimized\/gear-[a-z0-9-]+\.webp/g)) {
    assert(assets.some(asset => asset.output === output), `${file} references retired gear art ${output}`);
  }
}
console.log("PASS: 160 rarity designs, 320 hashed/alpha derivatives, source identity, 84% framing, icon/detail separation, escaped labels, graceful missing-art fallback and unchanged rarity/definition parity.");
