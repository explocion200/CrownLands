const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const helperMatch = serverSource.match(
  /function doesVeilOfSilenceBlock\(kind = "", targetType = "city"\) \{[\s\S]*?\n\}/,
);
if (!helperMatch) throw new Error("Veil of Silence kind predicate is missing.");

const context = {};
vm.runInNewContext(`${helperMatch[0]}; this.doesVeilOfSilenceBlock = doesVeilOfSilenceBlock;`, context);

if (!context.doesVeilOfSilenceBlock("scout", "city")) {
  throw new Error("Veil of Silence must block city scouts.");
}
[
  ["attack", "city"],
  ["transfer", "city"],
  ["attack", "camp"],
  ["transfer", "camp"],
  ["scout", "camp"],
].forEach(([kind, targetType]) => {
  if (context.doesVeilOfSilenceBlock(kind, targetType)) {
    throw new Error(`Veil of Silence must not block ${kind} orders targeting ${targetType}.`);
  }
});

requireMatch(
  serverSource,
  /doesVeilOfSilenceBlock\(resolvedKind,\s*order\.targetType\)[\s\S]*?That city is hidden by Veil of Silence/,
  "Army launch must use the scout-only Veil predicate.",
);
requireMatch(
  serverSource,
  /doesVeilOfSilenceBlock\(army\.kind,\s*army\.targetType\)[\s\S]*?Veil of Silence blocked the scout/,
  "Army resolution must use the scout-only Veil predicate.",
);
requireMatch(
  serverSource,
  /const kind = \["attack", "transfer", "scout"\]\.includes\(raw\.kind\) \? raw\.kind : "attack"/,
  "Army payload normalization must preserve explicit attack, transfer, and scout kinds.",
);
if (/\brenderMap\(\)/.test(clientSource)) {
  throw new Error("Client still calls the nonexistent renderMap function.");
}

console.log("Validated scout-only Veil of Silence behavior and uninterrupted map rendering.");
