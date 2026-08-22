const assert = require("node:assert/strict");
const test = require("node:test");
const { createServer, sanitizeQaStore } = require("../editor-server");

test("sanitizes structured QA records", () => {
  const store = sanitizeQaStore({
    schemaVersion: 1,
    issues: [{
      id: "sample issue",
      title: "Sample",
      categories: ["Visual", "Unknown"],
      severity: "impossible",
      status: "Verified",
      relevantFiles: ["tools/map-editor/index.html"],
    }],
  });
  assert.equal(store.issues.length, 1);
  assert.deepEqual(store.issues[0].categories, ["Visual"]);
  assert.equal(store.issues[0].severity, "Medium");
  assert.equal(store.issues[0].status, "Verified");
});

test("serves Studio context and the seeded QA store", async t => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const contextResponse = await fetch(`${base}/api/studio-context`);
  assert.equal(contextResponse.status, 200);
  const context = await contextResponse.json();
  assert.ok(context.projectRoot);
  assert.ok(Object.hasOwn(context, "branch"));

  const qaResponse = await fetch(`${base}/api/qa-issues`);
  assert.equal(qaResponse.status, 200);
  const qa = await qaResponse.json();
  assert.equal(qa.schemaVersion, 1);
  assert.ok(qa.issues.length >= 6);
  assert.ok(qa.issues.some(issue => /troop counter/i.test(issue.title)));

  const uiResponse = await fetch(`${base}/api/ui-editor`);
  assert.equal(uiResponse.status, 200);
  const ui = await uiResponse.json();
  assert.equal(ui.config.schemaVersion, 1);
  assert.equal(ui.registry.components.length, 15);
  assert.ok(ui.registry.screens.some(screen => screen.id === "clan-members"));
  assert.ok(ui.registry.closeButton.usages.some(usage => usage.id === "shared-modal-close"));

  const uiValidationResponse = await fetch(`${base}/api/ui-editor/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ui.config),
  });
  assert.equal(uiValidationResponse.status, 200);
  assert.equal((await uiValidationResponse.json()).ok, true);

  const coreResponse = await fetch(`${base}/api/core-preview`);
  assert.equal(coreResponse.status, 200);
  const core = await coreResponse.json();
  assert.equal(core.ok, true);
  assert.equal(core.offlineOnly, true);
  assert.equal(core.notLive, true);
  assert.equal(core.integrity.counts.maps, 25);
  assert.equal(core.integrity.counts.cities, 1480);
  assert.equal(core.integrity.counts.objectives, 17);
  assert.equal(core.integrity.counts.reciprocalConnections, 40);
  assert.deepEqual(core.visualCounts, { packagedObjectives: 17, holdingTowers: 4, totalObjectives: 21 });
  assert.equal(core.regions.flatMap(region => region.objectives).filter(objective => objective.kind === "holdingTower").length, 4);

  const coreMapResponse = await fetch(`${base}${core.regions[0].map.url}`);
  assert.equal(coreMapResponse.status, 200);
  assert.match(coreMapResponse.headers.get("content-type") || "", /image\/webp/);
  assert.equal((await coreMapResponse.arrayBuffer()).byteLength, core.regions[0].map.bytes);

  const invalidCoreConfigResponse = await fetch(`${base}/api/core-preview/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ camp: 1, stronghold: 154, crownCitadel: 260 }),
  });
  assert.equal(invalidCoreConfigResponse.status, 400);
  assert.match((await invalidCoreConfigResponse.text()), /camp visual size/i);

  const editorResponse = await fetch(`${base}/editor/`);
  assert.equal(editorResponse.status, 200);
  assert.match(editorResponse.headers.get("content-security-policy") || "", /script-src 'self'/);

  const themeResponse = await fetch(`${base}/interface-theme.css`);
  assert.equal(themeResponse.status, 200);
  assert.match(themeResponse.headers.get("content-type") || "", /text\/css/);

  const uiRuntimeResponse = await fetch(`${base}/ui-component-runtime.js`);
  assert.equal(uiRuntimeResponse.status, 200);
  assert.match(await uiRuntimeResponse.text(), /CrownlandsUIRuntime/);

  const traversalResponse = await fetch(`${base}/editor/%2e%2e%2fpackage.json`);
  assert.equal(traversalResponse.status, 403);
});
