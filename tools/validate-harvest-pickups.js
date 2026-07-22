const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "functions", "index.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction(gameSource, "currentDailyDateKey"), context);
vm.runInContext(extractFunction(serverSource, "getCurrentDateKey"), context);

const utcRollover = new Date("2026-07-22T00:30:00.000Z");
assert.equal(context.currentDailyDateKey(utcRollover), "2026-07-22");
assert.equal(context.getCurrentDateKey(utcRollover), "2026-07-22");

const collectStart = gameSource.indexOf("async function collectHarvestBonus");
const collectEnd = gameSource.indexOf("function getOfflineProgressSeconds", collectStart);
assert.ok(collectStart >= 0 && collectEnd > collectStart, "Pickup collection flow must exist.");
const collectSource = gameSource.slice(collectStart, collectEnd);
assert.match(collectSource, /applyServerEconomyResult\(result, \{ renderCities: false \}\)/, "Pickup claims must avoid a full city-map rebuild.");
assert.doesNotMatch(collectSource, /renderCities\(true\)/, "Pickup claims must not force-render all visible cities.");
assert.match(collectSource, /result\?\.currentUser\?\.daily/, "Pickup count messages must use the authoritative server counter.");

console.log("Validated UTC pickup counters and lightweight post-claim rendering.");
