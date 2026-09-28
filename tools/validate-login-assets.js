"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html");
const styles = read("login-screen.css");
const worker = read("service-worker.js");
const builder = read("tools/build-production-client.js");
const master = fs.readFileSync(path.join(root, "docs/art-sources/login/kingdom-master.png"));
assert.equal(crypto.createHash("sha256").update(master).digest("hex"), "766514976ca94bb60568f14803db7545ed560f07ec4fbd2efcd4dbf48fc88371");
assert.equal(master.readUInt32BE(16), 1672);
assert.equal(master.readUInt32BE(20), 941);

for (const [name, hash, cap] of [
  ["login-kingdom-960-6646f1d404b1.webp", "6646f1d404b17540e1dcea8cb7d788967175b1ac52585cae2ac0ba898a602fbc", 170 * 1024],
  ["login-kingdom-1672-05a4bd4eda17.webp", "05a4bd4eda17f97fda3e05e0c55cf4e71fe30c6ff383f6920a0624b6cc0f3b48", 440 * 1024],
]) {
  const asset = `assets/optimized/${name}`;
  const bytes = fs.readFileSync(path.join(root, asset));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), hash, `${asset}: hash changed`);
  assert(bytes.length <= cap, `${asset}: download budget exceeded`);
  assert(index.includes(asset));
}
assert.match(index, /<header class="login-branding">[\s\S]*?<h1>Crownlands<\/h1>/);
assert.match(index, /<picture class="login-background" aria-hidden="true">/);
assert.match(index, /media="\(max-width: 900px\) and \(orientation: landscape\)"/);
assert.match(index, /media="\(min-width: 901px\), \(orientation: portrait\)"/);
assert.doesNotMatch(index, /class="login-game-info"|login-background-1448/);
for (const source of [read("styles.css"), read("interface-theme.css"), styles]) {
  assert.doesNotMatch(source, /login-background-1448|--login-art-(?:width|height)/);
}
assert.match(styles, /object-fit:\s*cover/);
for (const [, value] of styles.matchAll(/(?:animation|backdrop-filter):([^;}]+)/g)) {
  assert.equal(value.trim(), "none", "Login CSS must not add animated art or backdrop blur.");
}
assert.match(index, /href="login-screen\.css\?v=/);
assert.match(worker, /"\/login-screen\.css\?v=/);
assert.match(worker, /"\/assets\/optimized\/login-kingdom-960-/);
assert.doesNotMatch(worker, /"\/assets\/optimized\/login-kingdom-1672-/);
assert.match(builder, /"login-screen\.css"/);
assert(Buffer.byteLength(styles.replace(/\r\n/g, "\n")) <= 8 * 1024);
console.log("Validated responsive login artwork hashes, bounded downloads, live title, static presentation, and production/cache wiring.");
