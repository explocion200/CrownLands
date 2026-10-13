"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "assets/optimized/halloween-map-layouts-v3.json"), "utf8"));
const rectangles = Object.fromEntries(Object.entries(source.maps).map(([regionId, placements]) => [regionId,
  placements.map(([assetIndex, x, y]) => ({ x, y, width: source.assets[assetIndex].w, height: source.assets[assetIndex].h }))]));
const output = path.join(root, "functions/marauder-seasonal-clearance.json");
const text = JSON.stringify({ version: 1, source: "halloween-map-layouts-v3", rectangles }) + "\n";
if (process.argv.includes("--check")) assert.equal(fs.readFileSync(output, "utf8").replace(/\r\n/g, "\n"), text);
else fs.writeFileSync(output, text);
