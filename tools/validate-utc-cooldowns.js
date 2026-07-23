const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "game.js");
const serverPath = path.join(root, "functions", "index.js");
const stylesPath = path.join(root, "styles.css");
const source = fs.readFileSync(gamePath, "utf8");
const serverSource = fs.readFileSync(serverPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

function extractFunction(fileSource, name) {
  const start = fileSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = fileSource.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < fileSource.length; index += 1) {
    if (fileSource[index] === "(") parameterDepth += 1;
    if (fileSource[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = fileSource.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `Missing ${name} body.`);
  let depth = 0;
  for (let index = bodyStart; index < fileSource.length; index += 1) {
    if (fileSource[index] === "{") depth += 1;
    if (fileSource[index] === "}") depth -= 1;
    if (depth === 0) return fileSource.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const context = {
  Date,
  Math,
  Set,
  ROYAL_PEACE_SHIELD_ITEM_ID: "shield_12h",
  ROYAL_PEACE_SHIELD_DAILY_PURCHASE_LIMIT: 1,
  WAR_DRUMS_ITEM_ID: "war_drums_30m",
  ROYAL_TAX_DECREE_ITEM_ID: "royal_tax_decree_30m",
  PRODUCTION_BOOST_PURCHASE_LIMIT: 3,
  PRODUCTION_BOOST_ITEM_IDS: new Set(["war_drums_30m", "royal_tax_decree_30m"]),
  timestampToMs: value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (value instanceof Date) return value.getTime();
    return Number(value) || 0;
  },
};

vm.createContext(context);
vm.runInContext([
  extractFunction(source, "getUtcDateKeyAtMs"),
  extractFunction(source, "getNextUtcDayStartMs"),
  extractFunction(source, "normalizeItemPurchaseTimestamps"),
  extractFunction(source, "normalizeDailyItemPurchaseCounter"),
  extractFunction(source, "getItemDailyPurchaseLimit"),
  extractFunction(source, "getItemPurchaseStatus"),
].join("\n"), context, { filename: gamePath });

const beforeMidnight = Date.parse("2026-07-23T23:59:00.000Z");
const afterMidnight = Date.parse("2026-07-24T00:00:01.000Z");
const shieldCooldowns = {
  shield_12h: { utcDate: "2026-07-23", purchaseCount: 1 },
};
const shieldBeforeReset = context.getItemPurchaseStatus("shield_12h", shieldCooldowns, beforeMidnight);
assert.equal(shieldBeforeReset.count, 1);
assert.equal(shieldBeforeReset.remainingMs, 60_000);
const shieldAfterReset = context.getItemPurchaseStatus("shield_12h", shieldCooldowns, afterMidnight);
assert.equal(shieldAfterReset.count, 0);
assert.equal(shieldAfterReset.remainingMs, 0);

const boostCooldowns = {
  war_drums_30m: { utcDate: "2026-07-23", purchaseCount: 3 },
};
const boostBeforeReset = context.getItemPurchaseStatus("war_drums_30m", boostCooldowns, beforeMidnight);
assert.equal(boostBeforeReset.count, 3);
assert.equal(boostBeforeReset.remainingMs, 60_000);
const boostAfterReset = context.getItemPurchaseStatus("war_drums_30m", boostCooldowns, afterMidnight);
assert.equal(boostAfterReset.count, 0);
assert.equal(boostAfterReset.remainingMs, 0);

const migratedBoost = context.normalizeDailyItemPurchaseCounter({
  purchaseTimestampsMs: [
    Date.parse("2026-07-22T23:58:00.000Z"),
    Date.parse("2026-07-23T00:01:00.000Z"),
    Date.parse("2026-07-23T12:00:00.000Z"),
  ],
}, 3);
assert.equal(migratedBoost.utcDate, "2026-07-23");
assert.equal(migratedBoost.purchaseCount, 2);

const selectionRenderSource = extractFunction(source, "renderSelectionChangeNow");
assert.doesNotMatch(selectionRenderSource, /renderAll\(/, "Selection changes must not redraw the full map.");
assert.match(selectionRenderSource, /renderCities\(\)/);
assert.match(selectionRenderSource, /renderPanel\(\)/);
assert.match(stylesSource, /button\s*\{[^}]*touch-action:\s*manipulation;/, "Buttons should use immediate touch activation.");

assert.doesNotMatch(source, /PURCHASE_(?:COOLDOWN|WINDOW)_MS/, "Client purchase limits must not use rolling windows.");
assert.doesNotMatch(serverSource, /PURCHASE_(?:COOLDOWN|WINDOW)_MS/, "Server purchase limits must not use rolling windows.");
assert.match(serverSource, /function getItemPurchaseStatus[\s\S]*?getNextUtcDayStartMs/, "The server should reset purchases at the next UTC day.");
assert.match(serverSource, /utcDate:\s*purchaseStatus\.utcDate[\s\S]*?purchaseCount:/, "The server should persist UTC purchase counters.");
assert.match(serverSource, /once per UTC day|times per UTC day/, "Purchase limit errors should describe UTC-day limits.");

console.log("Validated UTC shop resets, legacy cooldown migration, and responsive selection rendering.");
