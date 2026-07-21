const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "assets", "map-editor-data.js");
const outputPath = path.join(rootDir, "functions", "world-layout.json");

function readEditorLayout() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath, timeout: 1000 });
  const layout = context.window.CROWNLANDS_MAP_EDITOR_DATA;
  if (!layout || !Array.isArray(layout.maps) || !layout.maps.length) {
    throw new Error("Map editor data did not contain any maps.");
  }
  return layout;
}

const layout = readEditorLayout();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
console.log(`Wrote ${layout.maps.length} maps to ${outputPath}`);
