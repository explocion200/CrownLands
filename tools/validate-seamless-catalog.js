"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), crypto = require("node:crypto");
const { createCatalogFeed } = require("./map-benchmark/seamless/catalog-feed");
const { AreaFeed } = require("./map-benchmark/seamless/feed");
const { AssetLoader } = require("./map-benchmark/seamless/assets");
const M = require("./map-benchmark/seamless/model");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const tick = () => new Promise(r => setImmediate(r));
async function main() {
  const source = createCatalogFeed(), crowded = createCatalogFeed(true), manifest = source.manifest;
  const catalog = require("../assets/worlds/core-expansion-v1/region-catalog.json");
  assert.equal(manifest.sections.length, catalog.regions.length); assert.equal(manifest.sections.length, 81);
  assert.equal(manifest.cityCount, 3720); assert.equal(manifest.objectCount, 8244); assert.equal(manifest.marchCount, 144); assert.equal(crowded.manifest.marchCount, 1728);
  assert.ok(!manifest.objects && !manifest.marches, "Bootstrap must not download the whole scene");
  const keys = new Set(), objects = [], cities = []; let seams = 0;
  for (const s of manifest.sections) {
    const data = source.read([s.id], 0), definition = JSON.parse(fs.readFileSync(catalog.regions.find(r => r.id === s.id).regionDefinitionPath));
    assert.equal(data.sections.length, 1);
    const sectionObjects = data.sections[0].objects; objects.push(...sectionObjects);
    const castles = sectionObjects.filter(o => o.kind === "castle"); cities.push(...castles); assert.equal(castles.length, definition.cities.length);
    for (const o of sectionObjects) { assert.ok(!keys.has(o.key)); keys.add(o.key); const local = M.worldToLocal(s, o); assert.ok(Math.hypot(local.x - o.previewLocal.x, local.y - o.previewLocal.y) < 1e-7); }
    for (const city of definition.cities) assert.deepEqual(castles.find(o => o.id === city.id).local, { x: city.x, y: city.y });
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const n = manifest.sections.find(n => n.gridX === s.gridX + dx && n.gridY === s.gridY + dy); if (!n) continue;
      assert.deepEqual(M.localToWorld(s, dx ? { x: 1448, y: 543 } : { x: 724, y: 1086 }), M.localToWorld(n, dx ? { x: 0, y: 543 } : { x: 724, y: 0 })); seams++; }
  }
  assert.equal(keys.size, 8244); assert.equal(seams, 144);
  for (const c of cities) {
    const s = manifest.sections.find(s => s.id === c.sectionId);
    const neighbors = new Set(manifest.sections.filter(n => Math.abs(n.gridX - s.gridX) <= 1 && Math.abs(n.gridY - s.gridY) <= 1).map(n => n.id));
    for (const o of objects.filter(o => neighbors.has(o.sectionId) && o.key !== c.key)) {
      if (o.kind === "castle") assert.ok(Math.hypot(c.x - o.x, c.y - o.y) >= 88, `City overlap: ${c.key}/${o.key}`);
      else assert.ok(!(c.left < o.left + o.width + 10 && c.left + c.width > o.left - 10 && c.top < o.top + o.height + 10 && c.top + c.height > o.top - 10), `Scenery overlap: ${c.key}/${o.key}`);
    }
  }
  const ids = manifest.sections.slice(0, 16).map(s => s.id), payload = crowded.read(ids, 1);
  assert.equal(payload.sections.length, 16); assert.ok(payload.routes.length < payload.marches.length);
  assert.ok(payload.marches.every(m => !m.points && m.sections.some(id => ids.includes(id)) && payload.routes.some(r => r.id === m.routeId)));
  const first = source.read([ids[0]], 0).sections[0].objects[0], updated = source.read([ids[0]], 1).sections[0].objects[0];
  assert.equal(first.key, updated.key); assert.notEqual(first.owner, updated.owner); assert.notEqual(first.troops, updated.troops);
  for (const bad of [[], [ids[0], ids[0]], ["../secret"], manifest.sections.slice(0, 17).map(s => s.id)]) assert.throws(() => source.read(bad, 0));
  const camera = M.forWorld(manifest), size = { width: 844, height: 300 }, home = { x: 6000, y: 4500, zoom: camera.limits(size).home };
  const point = { x: 430, y: 170 }, before = M.unproject(home, point, size), zoomed = camera.zoomAt(home, size, point, home.zoom * 2);
  const after = M.unproject(zoomed, point, size); assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-7);
  const fit = camera.clamp({ x: -100, y: 999999, zoom: 0 }, size); assert.equal(fit.x, manifest.width / 2); assert.equal(fit.y, manifest.height / 2);
  // Nearby data should survive ordinary oscillating pans/zooms, especially on
  // wide phone viewports; every visible section must remain present.
  const homeSection = manifest.sections.find(s => s.id === manifest.homeSectionId);
  for (const [width,height] of [[1440,800],[844,315],[568,245]]) {
    const viewport = {width,height}; let previous = [], replacements = 0;
    for (let frame = 0; frame < 360; frame++) {
      const t = frame/60, c = {x:homeSection.x+724+600*Math.sin(t*1.8),y:homeSection.y+543+400*Math.cos(t*1.4),zoom:camera.limits(viewport).home*(.85+.2*Math.sin(t*2))};
      const next = M.interestSections(manifest.sections,c,viewport,previous).map(s=>s.id).sort();
      assert.ok(next.length <= 16);
      assert.ok(manifest.sections.filter(s=>M.intersects(M.visible(c,viewport),s.x,s.y,s.width,s.height)).every(s=>next.includes(s.id)),"Visible section dropped from interest window");
      if (next.join() !== previous.join()) replacements++;
      previous = next;
    }
    assert.ok(replacements <= 2,`${width}: ${replacements} nearby-data replacements during six seconds of ordinary motion`);
  }
  // Out-of-order completions cannot overwrite a newer area set or revision.
  const pending = [], changes = [], feed = new AreaFeed(data => changes.push(data), (ids, signal) => new Promise((resolve, reject) => pending.push({ ids, signal, resolve, reject })));
  feed.set([ids[0]]); feed.set([ids[1]]); assert.ok(pending[0].signal.aborted);
  pending[1].resolve(source.read([ids[1]], 4)); await tick(); pending[0].resolve(source.read([ids[0]], 0)); await tick();
  assert.equal(feed.data.sections[0].id, ids[1]); assert.equal(feed.data.revision, 4); assert.equal(feed.stats().staleResults, 1);
  feed.refresh(); pending[2].resolve(source.read([ids[1]], 3)); await tick(); assert.equal(feed.data.revision, 4);
  feed.refresh(); pending[3].reject(new Error("Offline")); await tick(); assert.ok(feed.failed); assert.equal(feed.data.revision, 4);
  feed.refresh(); pending[4].resolve(source.read([ids[1]], 5)); await tick(); assert.ok(!feed.failed); assert.equal(feed.data.revision, 5);
  feed.set([]); assert.equal(feed.data.sections.length, 0); assert.equal(feed.data.marches.length, 0); assert.equal(feed.data.routes.length, 0);
  feed.set(ids); pending[5].resolve(source.read(ids, 6)); await tick(); assert.equal(feed.stats().peakSections, 16);
  feed.dispose(); assert.equal(feed.stats().sections, 0); assert.ok(changes.length > 4);
  const loader = new AssetLoader(() => {}, async path => path, () => {});
  for (let trip = 0; trip < 5; trip++) { loader.update(Array.from({ length: 81 }, (_, i) => ({ path: `thumb-${trip}-${i}`, kind: "thumbnail", priority: i }))); for (let i = 0; i < 20; i++) await tick(); assert.equal(loader.stats().thumbnails, 16); assert.equal(loader.stats().cached, 16); }
  assert.equal(loader.stats().peakThumbnails, 16); assert.equal(loader.stats().peakRequests, 2); loader.dispose();
  const atlas = JSON.parse(fs.readFileSync("tools/map-benchmark/seamless/terrain/catalog-overview.json"));
  assert.equal(atlas.sections, 81); assert.ok(atlas.output.bytes < 512 * 1024);
  for (const input of [...atlas.inputs, atlas.output]) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(input.path)).digest("hex"), input.sha256, `Stale overview: ${input.path}`);
  let now = 100000; const server = createMapBenchmarkServer({ clock: () => now }), address = await server.listen();
  try {
    const get = async path => fetch(address.url + path);
    const response = await get("/__benchmark__/seamless/catalog"); assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/); assert.deepEqual(await response.json(), manifest);
    const url = `/__benchmark__/seamless/areas?ids=${ids[0]}`; assert.equal((await (await get(url)).json()).revision, 0); now += 15000;
    assert.equal((await (await get(url)).json()).revision, 3);
    for (const query of ["", "../secret", ids.join(",") + ",unknown"]) assert.equal((await get(`/__benchmark__/seamless/areas?ids=${encodeURIComponent(query)}`)).status, 400);
    assert.equal((await fetch(address.url + url, { method: "POST" })).status, 405); assert.equal(server.getFixtureCount(), 0);
  } finally { await server.close(); }
  console.log("Full catalog: 81 sections, 3720 cities, 144 joins, identity/clearance, overview provenance, bounded 16-area subscriptions/thumbnails, versioned updates, stale rejection and reconnect recovery passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
