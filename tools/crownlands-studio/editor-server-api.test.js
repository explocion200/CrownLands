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

  const editorResponse = await fetch(`${base}/editor/`);
  assert.equal(editorResponse.status, 200);
  assert.match(editorResponse.headers.get("content-security-policy") || "", /script-src 'self'/);

  const themeResponse = await fetch(`${base}/interface-theme.css`);
  assert.equal(themeResponse.status, 200);
  assert.match(themeResponse.headers.get("content-type") || "", /text\/css/);

  const traversalResponse = await fetch(`${base}/editor/%2e%2e%2fpackage.json`);
  assert.equal(traversalResponse.status, 403);
});
