const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");

test("Studio shell has unique IDs and all required areas", async () => {
  const html = await fsp.readFile(path.join(ROOT, "tools", "map-editor", "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
  for (const id of [
    "worldStudioBtn", "economyModeBtn", "uiStudioBtn", "qaStudioBtn", "codexAiBtn",
    "worldView", "regionView", "economyView", "themeView", "componentsView",
    "screensView", "gameUiView", "qaView", "codexAiView", "codexTaskForm",
    "codexTaskHistory", "codexActionMessage", "codexRoutingForm", "studioDirtyChip", "studioLogPanel",
  ]) {
    assert.ok(ids.includes(id), `Missing Studio element #${id}`);
  }
  const editorScript = html.indexOf('src="editor.js');
  assert.ok(html.indexOf('src="studio.js') < editorScript, "Studio controller must load before the editor orchestrator");
  assert.ok(html.indexOf('src="codex-ai.js') < editorScript, "Codex workspace controller must load before the editor orchestrator");
  assert.match(html, /data-ask-codex="(?:theme|component|screen|hud)"/);
});

test("Codex task preflight failures stay visible in the task detail", async () => {
  const source = await fsp.readFile(path.join(ROOT, "tools", "map-editor", "codex-ai.js"), "utf8");
  assert.match(source, /function setActionMessage/);
  assert.match(source, /AI task could not start/);
  assert.match(source, /setActionMessage\(message, "error"\)/);
  assert.match(source, /state\.busy && action !== "cancel"/);
  assert.match(source, /Cancellation requested\. Waiting for the local Codex process to stop safely/);
});

test("responsive preview presets and game style sources remain wired", async () => {
  const [studio, components, screens] = await Promise.all([
    fsp.readFile(path.join(ROOT, "tools", "map-editor", "studio.js"), "utf8"),
    fsp.readFile(path.join(ROOT, "tools", "map-editor", "component-preview.html"), "utf8"),
    fsp.readFile(path.join(ROOT, "tools", "map-editor", "screen-preview.html"), "utf8"),
  ]);
  for (const dimensions of ["1440", "900", "844", "390", "667", "375"]) assert.match(studio, new RegExp(`\\b${dimensions}\\b`));
  for (const preview of [components, screens]) {
    assert.match(preview, /href="\/styles\.css/);
    assert.match(preview, /href="\/interface-theme\.css/);
    assert.match(preview, /href="studio-preview\.css/);
  }
});

test("desktop renderer keeps the hardened Electron boundary", async () => {
  const [main, preload] = await Promise.all([
    fsp.readFile(path.join(__dirname, "main.js"), "utf8"),
    fsp.readFile(path.join(__dirname, "preload.js"), "utf8"),
  ]);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /studio:ai-plan-task/);
  assert.match(main, /confirmAiAction/);
  assert.match(main, /showMessageBox/);
  assert.match(main, /createReadOnlyPreviewServer/);
  assert.match(preload, /ai:\s*Object\.freeze/);
  assert.match(preload, /studio:ai-plan-task/);
  assert.match(preload, /studio:ai-apply-task/);
  assert.doesNotMatch(preload, /require\(["']node:fs/);
  assert.doesNotMatch(preload, /require\(["']child_process/);
  assert.doesNotMatch(preload, /ipcRenderer\.(?:send|invoke)\([^"']/);
});
