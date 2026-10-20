"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const M = require("./map-benchmark/seamless/model");
const { createSeamlessFixture } = require("./map-benchmark/seamless/fixtures");
const { AssetLoader } = require("./map-benchmark/seamless/assets");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  const scene = createSeamlessFixture(), crowded = createSeamlessFixture(true);
  assert.deepEqual(scene, createSeamlessFixture());
  assert.equal(scene.sections.length, 9); assert.equal(scene.marches.length, 6); assert.equal(crowded.marches.length, 240);
  assert.deepEqual(scene.objects, crowded.objects);
  assert.equal(new Set(scene.objects.map(o => o.key)).size, scene.objects.length);
  const catalog = require("../assets/worlds/core-expansion-v1/region-catalog.json");
  const clearance = require("./map-art/clearance.json");
  for (const s of scene.sections) {
    const summary = catalog.regions.find(r => r.id === s.id), definition = JSON.parse(fs.readFileSync(summary.regionDefinitionPath));
    for (const city of definition.cities) {
      const o = scene.objects.find(o => o.key === M.identity(s.id, city.id));
      assert.equal(o.id, city.id); assert.deepEqual(o.local, { x: city.x, y: city.y });
      assert.deepEqual(M.worldToLocal(s, o), o.local);
    }
    for (const art of summary.artPresentation.landmarks) {
      const o = scene.objects.find(o => o.key === M.identity(s.id, art.id));
      close(o.left, s.x + art.x); close(o.top, s.y + art.y); close(o.width, art.width); close(o.height, art.height);
      assert.deepEqual(o.artLocal, { x: art.x, y: art.y, width: art.width, height: art.height });
    }
    for (const art of summary.artPresentation.scenery) {
      const o = scene.objects.find(o => o.key === M.identity(s.id, art.id));
      close(o.left, s.x + art.x - art.w / 2); close(o.top, s.y + art.y - art.h / 2);
    }
    for (const p of [{ x: 0, y: 0 }, { x: 1448, y: 1086 }, { x: 724.25, y: 543.75 }]) assert.deepEqual(M.worldToLocal(s, M.localToWorld(s, p)), p);
  }
  let seams = 0, corners = 0;
  for (const s of scene.sections) for (const [dx, dy, exit, enter] of [[1, 0, { x: 1448, y: 543 }, { x: 0, y: 543 }], [0, 1, { x: 724, y: 1086 }, { x: 724, y: 0 }]]) {
    const neighbor = scene.sections.find(n => n.gridX === s.gridX + dx && n.gridY === s.gridY + dy); if (!neighbor) continue;
    assert.deepEqual(M.localToWorld(s, exit), M.localToWorld(neighbor, enter));
    for (const [section, endpoint] of [[s, exit], [neighbor, enter]]) assert.ok(clearance.maps.find(m => m.id === section.id).roads.some(line => [line[0], line.at(-1)].some(p => p[0] === endpoint.x && p[1] === endpoint.y)));
    seams++;
  }
  assert.equal(seams, 12);
  for (const x of [1448, 2896]) for (const y of [1086, 2172]) {
    const adjacent = scene.sections.filter(s => x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height);
    assert.equal(adjacent.length, 4); corners++;
  }
  assert.equal(corners, 4);
  for (const size of [{ width: 1440, height: 800 }, { width: 844, height: 310 }, { width: 568, height: 240 }]) {
    const camera = { x: 2172, y: 1629, zoom: M.limits(size).home }, anchor = { x: size.width * 0.6, y: size.height * 0.4 };
    const before = M.unproject(camera, anchor, size), zoomed = M.zoomAt(camera, size, anchor, camera.zoom * 1.5);
    const after = M.unproject(zoomed, anchor, size); close(before.x, after.x); close(before.y, after.y);
    const moved = { x: anchor.x + 10, y: anchor.y - 12 }, pinch = M.zoomAt(camera, size, anchor, camera.zoom * 1.25, moved);
    const pinchedPoint = M.unproject(pinch, moved, size); close(before.x, pinchedPoint.x); close(before.y, pinchedPoint.y);
    const projected = M.project(camera, before, size); close(projected.x, anchor.x); close(projected.y, anchor.y);
    const fit = M.clamp({ x: -100, y: -100, zoom: 0 }, size); close(fit.x, 2172); close(fit.y, 1629);
  }
  for (const march of scene.marches) {
    const sourcePoints = new Set(march.sections.flatMap(id => {
      const section = scene.sections.find(s => s.id === id);
      return clearance.maps.find(m => m.id === id).roads.flat().map(([x, y]) => JSON.stringify(M.localToWorld(section, { x, y })));
    }));
    for (const point of march.points) assert.ok(sourcePoints.has(JSON.stringify(point)), "March leaves existing painted roads");
    const path = M.preparePath(march.points);
    assert.deepEqual(M.along(path, 0), march.points[0]); assert.deepEqual(M.along(path, path.length), march.points.at(-1));
    for (let i = 1; i < march.points.length; i++) assert.ok(Math.hypot(march.points[i].x - march.points[i - 1].x, march.points[i].y - march.points[i - 1].y) < 5, "March seam teleports");
  }
  // Controlled completions prove priority, late-result rejection and residency.
  const pending = [], released = [];
  const loader = new AssetLoader(() => {}, (path, signal) => new Promise((resolve, reject) => pending.push({ path, signal, resolve, reject })), url => released.push(url));
  const wanted = n => Array.from({ length: n }, (_, i) => ({ path: `full-${i}`, kind: "full", priority: i }));
  loader.update(wanted(9)); await tick(); assert.deepEqual(pending.map(p => p.path), ["full-0", "full-1"]);
  pending.shift().resolve("zero"); pending.shift().resolve("one"); await tick();
  assert.equal(loader.stats().full, 2); assert.equal(pending.length, 2);
  loader.update([{ path: "new", kind: "full", priority: 0 }]);
  assert.equal(loader.stats().full, 0); assert.ok(pending.every(p => p.signal.aborted));
  pending.shift().resolve("obsolete-two"); pending.shift().resolve("obsolete-three"); await tick();
  assert.equal(loader.get("full-2"), undefined); assert.ok(released.includes("obsolete-two"));
  pending.shift().reject(new Error("failure")); await tick(); assert.equal(loader.stats().failed, 1);
  loader.retry(); await tick(); pending.shift().resolve("retry-success"); await tick();
  assert.equal(loader.get("new"), "retry-success"); assert.equal(loader.stats().failed, 0);
  loader.update(wanted(9)); await tick();
  while (pending.length) { pending.shift().resolve("decoded-image"); await tick(); }
  assert.equal(loader.stats().full, 4); assert.equal(loader.stats().peakFull, 4); assert.equal(loader.stats().peakRequests, 2);
  loader.dispose(); assert.equal(loader.stats().cached, 0);
  const server = createMapBenchmarkServer(), address = await server.listen();
  try {
    const page = await fetch(`${address.url}/__benchmark__/seamless/`); assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /connect-src 'self'/);
    const html = await page.text(); assert.doesNotMatch(html, /firebase|game\.js|serviceWorker/);
    assert.equal((await fetch(`${address.url}/__benchmark__/seamless/`, { method: "POST" })).status, 405);
    const denied = await new Promise(resolve => { require("node:http").get(`${address.url}/__benchmark__/seamless/`, { headers: { Host: "public.example" } }, res => { res.resume(); resolve(res.statusCode); }); });
    assert.equal(denied, 403);
    assert.deepEqual(await (await fetch(`${address.url}/__benchmark__/seamless/fixture`)).json(), scene);
    assert.equal(server.getFixtureCount(), 0, "Separate scene must not initialize mock player accounts");
    assert.equal((await fetch(`${address.url}/__benchmark__/?scenario=A`)).status, 200, "Existing harness entry broken");
  } finally { await server.close(); }
  for (const file of ["index.html", "app-entry.js", "game.js", "service-worker.js", "tools/build-production-client.js"]) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /seamless\/preview|seamless-world|__benchmark__\/seamless/, `Prototype referenced by production: ${file}`);
  console.log(`Seamless world: ${scene.objects.length} preserved objects, 12 seams, 4 corners, projection, six road marches, loading limits/recovery and loopback isolation passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
