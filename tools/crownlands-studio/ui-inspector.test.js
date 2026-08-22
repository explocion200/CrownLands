const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");

test("manual inspector exposes selection, scope, editing, history, QA, and source-control workflows", async () => {
  const [html, source] = await Promise.all([
    fsp.readFile(path.join(ROOT, "tools", "map-editor", "index.html"), "utf8"),
    fsp.readFile(path.join(ROOT, "tools", "map-editor", "ui-inspector.js"), "utf8"),
  ]);
  for (const id of ["uiPropertyInspector", "uiBreadcrumb", "uiGlobalCloseSection", "uiLocalPositionSection", "uiGenericProperties", "uiUndoBtn", "uiRedoBtn", "uiRunQaBtn", "uiSaveChangesBtn", "uiReviewDiffBtn", "uiCommitBtn", "uiPushBtn"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(source, /function selectNode\(/);
  assert.match(source, /event\.shiftKey \|\| event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /function mutate\(/);
  assert.match(source, /function undo\(/);
  assert.match(source, /function redo\(/);
  assert.match(source, /function resetElement\(/);
  assert.match(source, /function applyConfigToFrame\(/);
  assert.match(source, /function contrastRatio\(/);
  assert.match(source, /scrollWidth > node\.clientWidth/);
  assert.match(source, /dataset\.uiNoScroll/);
  assert.match(source, /getSelectionContext/);
  assert.match(source, /sourceControl\?\.commit/);
  assert.match(source, /sourceControl\?\.push/);
});

test("priority screen preview source-maps selectable real Crownlands UI surfaces", async () => {
  const preview = await fsp.readFile(path.join(ROOT, "tools", "map-editor", "screen-preview.html"), "utf8");
  for (const screen of ["player-profile", "clan-members", "reports", "scout-report", "daily-login", "daily-missions", "achievements", "settings", "notifications", "privacy", "shop", "bag"]) assert.match(preview, new RegExp(`data-ui-screen="${screen}"`));
  assert.match(preview, /data-ui-component="close-button"/);
  assert.match(preview, /data-ui-breadcrumb=/);
  assert.match(preview, /data-ui-source=/);
  assert.match(preview, /data-ui-local-source=/);
});

test("shared Close Button migration keeps all production IDs and handlers", async () => {
  const [html, game, runtime, styles] = await Promise.all([
    fsp.readFile(path.join(ROOT, "index.html"), "utf8"),
    fsp.readFile(path.join(ROOT, "game.js"), "utf8"),
    fsp.readFile(path.join(ROOT, "ui-component-runtime.js"), "utf8"),
    fsp.readFile(path.join(ROOT, "styles.css"), "utf8"),
  ]);
  for (const id of ["clearSelectBtn", "profileCloseBtn", "closeModalBtn"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]+cl-shared-close`));
    assert.match(game, new RegExp(id));
  }
  assert.match(runtime, /SCREEN_SELECTORS/);
  assert.match(runtime, /ELEMENT_SELECTORS/);
  for (const selector of ["battle-report-modal", "scout-report-modal", "daily-login-reward-modal", "daily-mission-modal", "shop-modal", "inventory-modal", "profile-screen\.clan-active", "profile-screen\.settings-active"]) assert.match(runtime, new RegExp(selector.replace(/\./g, "\\.")));
  assert.match(runtime, /screenOverrides/);
  assert.doesNotMatch(runtime, /firebase|deploy|gameplay/i);
  const innerCastleRule = styles.match(/\.inner-castle-modal\s+\.modal-close\s*\{([^}]+)\}/)?.[1] || "";
  assert.doesNotMatch(innerCastleRule, /\b(?:width|height)\s*:/);
  assert.match(innerCastleRule, /\bright\s*:/);
});
