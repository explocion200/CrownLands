const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const configSource = read("ui-layout-config.js");
const runtimeSource = read("ui-layout-runtime.js");
const serverSource = read("tools/editor-server.js");
const editorSource = read("tools/map-editor/editor.js");
const hudEditorSource = read("tools/map-editor/hud-editor.js");
const editorHtml = read("tools/map-editor/index.html");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(configSource, context, { filename: "ui-layout-config.js", timeout: 1000 });
const config = context.window.CROWNLANDS_UI_LAYOUT_CONFIG;
if (config?.schemaVersion !== 1) throw new Error("HUD layout config must use schemaVersion 1.");
for (const [id, width, height] of [
  ["landscapeTablet", 844, 390],
  ["desktop", 1440, 900],
]) {
  const preset = config.presets?.[id];
  if (!preset || preset.width !== width || preset.height !== height || typeof preset.components !== "object") {
    throw new Error(`HUD preset ${id} is missing or has the wrong viewport.`);
  }
}

requireMatch(serverSource, /\/api\/ui-layout-data[\s\S]*readUiLayoutConfig/, "Editor server is missing the HUD layout read API.");
requireMatch(serverSource, /\/api\/ui-layout-data[\s\S]*writeUiLayoutConfig/, "Editor server is missing the HUD layout write API.");
requireMatch(serverSource, /Unsupported HUD component/, "HUD layout API must reject unsupported component IDs.");
requireMatch(editorSource, /CrownlandsHudEditor\.save/, "Save to Game does not include HUD layouts.");
requireMatch(editorSource, /uiLayout:\s*window\.CrownlandsHudEditor/, "Editor export does not include HUD layouts.");
requireMatch(editorSource, /replaceConfig\(imported\.uiLayout\)/, "Editor import does not restore HUD layouts.");
requireMatch(hudEditorSource, /nearestSnap[\s\S]*vertical[\s\S]*horizontal/, "HUD editor is missing smart snapping.");
requireMatch(hudEditorSource, /pushHistory[\s\S]*undo[\s\S]*redo/, "HUD editor is missing undo/redo history.");
requireMatch(hudEditorSource, /SEARCH_ITEMS[\s\S]*commander box[\s\S]*reports button/, "Feature finder aliases are missing.");
requireMatch(hudEditorSource, /44px touch target/, "HUD validation must enforce accessible touch targets.");
requireMatch(editorHtml, /id="gameUiModeBtn"/, "Game UI mode button is missing.");
requireMatch(editorHtml, /id="featureSearchInput"/, "Global feature finder is missing.");
requireMatch(runtimeSource, /choosePreset[\s\S]*desktop[\s\S]*landscapeTablet/, "Game runtime does not select landscape and desktop HUD presets.");
if (/phonePortrait/.test(configSource + runtimeSource + serverSource + hudEditorSource + editorHtml)) {
  throw new Error("Portrait mode must not be exposed by the landscape-only Crownlands editor.");
}
requireMatch(runtimeSource, /schemaVersion !== 1/, "Game runtime must fall back for unsupported HUD schemas.");

console.log("UI layout editor validation passed.");
