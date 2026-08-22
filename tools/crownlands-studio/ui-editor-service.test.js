const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createProjectFileService } = require("./project-file-service");
const { DEFAULT_CONFIG, contrastRatio, createUiEditorService, sanitizeUiConfig, validateUiConfig } = require("./ui-editor-service");

async function fixture(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-ui-editor-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const files = {
    "ui-studio-config.json": `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
    "index.html": '<button id="clearSelectBtn" class="clear-btn cl-shared-close"></button><button id="profileCloseBtn" class="profile-screen-close cl-shared-close"></button><button id="closeModalBtn" class="modal-close cl-shared-close"></button>',
    "styles.css": ".inner-castle-modal .modal-close { width: 44px; height: 44px; }",
    "game.js": "clearSelectBtn.addEventListener('click', clearSelection); profileCloseBtn.addEventListener('click', closeProfileScreen); closeModalBtn.addEventListener('click', () => modal.close());",
  };
  for (const [relative, content] of Object.entries(files)) await fsp.writeFile(path.join(root, relative), content, "utf8");
  const projectFiles = createProjectFileService(root, { readExact: Object.keys(files), writeExact: ["ui-studio-config.json"] });
  return { root, service: createUiEditorService(projectFiles) };
}

test("sanitizes shared Close Button styles, local placement, responsive overrides, and generic element changes", () => {
  const raw = structuredClone(DEFAULT_CONFIG);
  raw.globalComponents["close-button"].states.default.width = 999;
  raw.globalComponents["close-button"].states.default.backgroundColor = "red; background:url(evil)";
  raw.globalComponents["close-button"].responsive.phone = { ...raw.globalComponents["close-button"].states.default, width: 34 };
  raw.screenOverrides["clan-members"] = { "close-button": { anchor: "top-right", top: 6, right: 10, x: 0, y: -4 } };
  raw.elementOverrides["clan-members:title"] = { screenId: "clan-members", elementId: "title", base: { color: "#E7DDC4", fontSize: 18, borderStyle: "dashed", textShadow: "0 1px 2px rgba(0,0,0,.4)", behavior: "attack" } };
  raw.elementOverrides["../../escape"] = { screenId: "clan-members", elementId: "bad", base: { color: "#000" } };
  const safe = sanitizeUiConfig(raw);
  assert.equal(safe.globalComponents["close-button"].states.default.width, 72);
  assert.equal(safe.globalComponents["close-button"].states.default.backgroundColor, DEFAULT_CONFIG.globalComponents["close-button"].states.default.backgroundColor);
  assert.equal(safe.globalComponents["close-button"].responsive.phone.width, 34);
  assert.equal(safe.screenOverrides["clan-members"]["close-button"].y, -4);
  assert.deepEqual(safe.elementOverrides["clan-members:title"].base, { color: "#E7DDC4", fontSize: 18, borderStyle: "dashed", textShadow: "0 1px 2px rgba(0,0,0,.4)" });
  assert.equal(safe.elementOverrides["../../escape"], undefined);
});

test("validates Close Button contrast without mutating values", () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.globalComponents["close-button"].states.default.backgroundColor = "#24201A";
  config.globalComponents["close-button"].states.default.iconColor = "#E7DDC4";
  const validation = validateUiConfig(config);
  assert.equal(validation.ok, true);
  assert.equal(validation.contrast.status, "passed");
  assert.ok(contrastRatio("#E7DDC4", "#24201A") > 4.5);
});

test("protected UI saves are atomic, backed up, versioned, and audit source mappings preserve handlers", async t => {
  const { root, service } = await fixture(t);
  const workspace = await service.getWorkspace();
  assert.equal(workspace.registry.components.length, 15);
  assert.equal(workspace.registry.screens.length, 13);
  assert.equal(workspace.audit.implementations, 4);
  assert.equal(workspace.audit.findings.filter(finding => finding.kind === "handler").length, 0);
  const next = structuredClone(workspace.config);
  next.globalComponents["close-button"].states.default.width = 42;
  next.screenOverrides["clan-members"] = { "close-button": { anchor: "top-right", top: 6, right: 10, x: 0, y: 0 } };
  const result = await service.save(next);
  assert.equal(result.config.globalComponents["close-button"].version, workspace.config.globalComponents["close-button"].version + 1);
  assert.equal(JSON.parse(await fsp.readFile(path.join(root, "ui-studio-config.json"), "utf8")).globalComponents["close-button"].states.default.width, 42);
  assert.ok(result.backupPath.endsWith("ui-studio-config.json.bak"));
  assert.equal(result.validation.ok, true);
});
