const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}`;
const rules = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}.`);
  return source.slice(start, end);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

requireMatch(server, /CITADEL_ASSAULT_TROOPS\s*=\s*100_000/, "Citadel assault force must remain 100,000 troops.");
requireMatch(server, /CITADEL_ASSAULT_TARGET_LIMIT\s*=\s*20/, "Citadel assault target cap must remain 20.");
requireMatch(server, /CITADEL_ASSAULT_TIME_ZONE\s*=\s*"America\/New_York"/, "Citadel assaults must follow Eastern wall-clock time through daylight-saving changes.");
requireMatch(server, /exports\.selectCitadelAssaultTargets[\s\S]*?schedule:\s*"45 9 \* \* \*"[\s\S]*?timeZone:\s*CITADEL_ASSAULT_TIME_ZONE/, "Missing 9:45 AM Eastern target selection schedule.");
requireMatch(server, /exports\.selectCitadelAssaultTargetsEvening[\s\S]*?schedule:\s*"15 18 \* \* \*"[\s\S]*?timeZone:\s*CITADEL_ASSAULT_TIME_ZONE/, "Missing 6:15 PM Eastern target selection schedule.");
requireMatch(server, /exports\.resolveCitadelAssaultWave[\s\S]*?schedule:\s*"0 10 \* \* \*"[\s\S]*?timeZone:\s*CITADEL_ASSAULT_TIME_ZONE/, "Missing 10:00 AM Eastern resolution schedule.");
requireMatch(server, /exports\.resolveCitadelAssaultWaveEvening[\s\S]*?schedule:\s*"30 18 \* \* \*"[\s\S]*?timeZone:\s*CITADEL_ASSAULT_TIME_ZONE/, "Missing 6:30 PM Eastern resolution schedule.");
requireMatch(server, /selectionPhase\s*\?\s*CITADEL_ASSAULT_WARNING_MINUTES \* 60 \* 1000/, "Target receipts must remain exactly 15 minutes ahead of selection.");
requireMatch(server, /shuffleCitadelAssaultCandidates[\s\S]*?crypto\.randomInt[\s\S]*?slice\(0, CITADEL_ASSAULT_TARGET_LIMIT\)/, "Targets are not sampled uniformly without replacement and capped at 20.");

const eligibility = server.slice(
  server.indexOf("function isCitadelAssaultEligibleCity"),
  server.indexOf("function createCitadelAssaultIncomingView")
);
requireMatch(eligibility, /CITADEL_ASSAULT_REGION_ID[\s\S]*?!isStronghold\(city\)[\s\S]*?city\.isMainCity !== true/, "Eligibility must require center-region regular non-main cities.");
if (/shield/i.test(eligibility)) throw new Error("Peace Shields must not affect Citadel assault eligibility.");

requireMatch(server, /previousLevel <= CITADEL_ASSAULT_LEVEL_LOSS/, "Level 5-or-lower neutralization threshold is missing.");
const resolver = sourceBetween(
  server,
  "async function resolveCitadelAssaultTarget",
  "async function resolveCitadelAssaultWave"
);
requireMatch(resolver, /defensePower:\s*defensePackages\.totalGarrisonDefense/, "Citadel assaults must exclude all wall power from total defense.");
requireMatch(resolver, /ignoreWallDefense:\s*true/, "Citadel assaults must explicitly bypass city walls.");
requireMatch(resolver, /getCitadelAssaultOutcome\(result, previousLevel\)/, "Citadel level loss must use the full-garrison defeat gate.");
requireMatch(resolver, /totalDefense:\s*defensePackages\.totalGarrisonDefense/, "Citadel reports must show garrison-only effective defense.");
requireMatch(server, /ownerKind:\s*"neutral"[\s\S]*?level:\s*1[\s\S]*?troops:\s*CITADEL_ASSAULT_NEUTRAL_TROOPS/, "Low-level losses must create a Level 1 neutral city with 10 troops.");
requireMatch(server, /xpAwarded:\s*0[\s\S]*?goldAwarded:\s*0[\s\S]*?troopsAwarded:\s*0/, "Citadel assault defense reports must award no progression rewards.");
requireMatch(server, /recoverCitadelAssaultLosses[\s\S]*?fieldMedics/, "Field Medics recovery is missing.");
requireMatch(server, /reinforcementBattleReceipts[\s\S]*?xpAwarded:\s*0/, "Reinforcement settlement must award zero XP.");
requireMatch(server, /writeOwnershipChangeEvent[\s\S]*?reason:\s*CITADEL_ASSAULT_EVENT_KIND/, "Neutralized cities must emit an ownership-change event.");

requireMatch(client, /CITADEL_ASSAULT_TIME_ZONE\s*=\s*"America\/New_York"[\s\S]*?CITADEL_ASSAULT_EASTERN_TIMES[\s\S]*?hour:\s*10,\s*minute:\s*0[\s\S]*?hour:\s*18,\s*minute:\s*30/, "Client Eastern assault times are incomplete.");
requireMatch(client, /getNextCitadelAssaultAtMs[\s\S]*?getCitadelAssaultEasternWallTimeMs/, "Client daylight-saving-aware countdown calculation is missing.");
requireMatch(client, /eventKind !== CITADEL_ASSAULT_EVENT_KIND[\s\S]*?troopVisibility === "estimate"/, "NPC troop visibility must remain exact.");
requireMatch(client, /function formatBattleWallAfterStatus[\s\S]*?wallDefenseIgnored[\s\S]*?Bypassed/, "Citadel battle reports must identify the untouched bypassed wall.");
requireMatch(client, /getActiveMapRegionId\(\) === CITADEL_ASSAULT_REGION_ID/, "Countdown must only appear on the Citadel map.");
requireMatch(html, /id="citadelAssaultCountdown"[\s\S]*?role="timer"/, "Citadel assault countdown markup is missing.");
requireMatch(html, /id="dailyLoginRewardBtn"[\s\S]*?id="citadelAssaultCountdown"[\s\S]*?<div class="resource-bar">/, "Countdown must remain between Daily Login and the Home-button resource group.");
requireMatch(styles, /\.citadel-assault-countdown\.imminent/, "Imminent countdown styling is missing.");
const countdownStyles = sourceBetween(
  styles,
  ".citadel-assault-countdown {",
  ".citadel-assault-countdown[hidden]"
);
requireMatch(countdownStyles, /position:\s*static[\s\S]*?flex:\s*0 1 clamp\(84px, 15vw, 126px\)/, "Countdown must participate in the top HUD layout between adjacent controls.");
requireMatch(countdownStyles, /width:\s*clamp\(84px, 15vw, 126px\)[\s\S]*?max-width:\s*126px[\s\S]*?min-height:\s*44px/, "Countdown must remain a compact, bounded HUD badge.");
assert.doesNotMatch(countdownStyles, /(?:top|left|right|bottom|transform|z-index):/, "Countdown must not float over other HUD controls.");
requireMatch(rules, /10:00 AM and 6:30 PM Eastern Time[\s\S]*?9:45 AM and 6:15 PM Eastern[\s\S]*?ignore 100% of city-wall defense[\s\S]*?every stationed and reinforcing troop is defeated[\s\S]*?no defense experience is awarded/i, "Public Citadel assault rules are incomplete.");

const outcomeSandbox = {
  CITADEL_ASSAULT_LEVEL_LOSS: 5,
  Math,
  Number,
  clampCityLevel(value) {
    return Math.max(1, Math.floor(Number(value) || 1));
  },
  safeNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  },
};
vm.createContext(outcomeSandbox);
vm.runInContext(
  `${extractFunction(server, "getCitadelAssaultOutcome")}; this.getOutcome = getCitadelAssaultOutcome;`,
  outcomeSandbox
);
assert.deepEqual(
  { ...outcomeSandbox.getOutcome({ success: true, defendersLeft: 0 }, 20) },
  { defendersDefeated: true, neutralized: false, outcome: "damaged", nextLevel: 15 },
  "Defeating the full garrison must remove exactly five city levels."
);
assert.deepEqual(
  { ...outcomeSandbox.getOutcome({ success: true, defendersLeft: 1 }, 20) },
  { defendersDefeated: false, neutralized: false, outcome: "held", nextLevel: 20 },
  "A surviving defender must prevent the five-level penalty."
);
assert.deepEqual(
  { ...outcomeSandbox.getOutcome({ success: false, defendersLeft: 0 }, 20) },
  { defendersDefeated: false, neutralized: false, outcome: "held", nextLevel: 20 },
  "The level penalty must require a Citadel victory as well as zero defenders."
);
assert.deepEqual(
  { ...outcomeSandbox.getOutcome({ success: true, defendersLeft: 0 }, 5) },
  { defendersDefeated: true, neutralized: true, outcome: "lost", nextLevel: 1 },
  "A fully defeated Level 5 city must still return to neutral at Level 1."
);

const clientScheduleSource = sourceBetween(
  client,
  "const CITADEL_ASSAULT_TIME_ZONE",
  "const CROWN_CITADEL_ART_SRC"
);
const clientCountdownSource = sourceBetween(
  client,
  "function getCitadelAssaultEasternParts",
  "function formatCitadelAssaultCountdown"
);
const clientScheduleSandbox = { Date, Intl, Object };
vm.runInNewContext(
  `${clientScheduleSource}\n${clientCountdownSource}\nglobalThis.getNextCitadelAssaultAtMs = getNextCitadelAssaultAtMs;`,
  clientScheduleSandbox
);
assert.equal(
  clientScheduleSandbox.getNextCitadelAssaultAtMs(Date.parse("2026-08-01T13:00:00Z")),
  Date.parse("2026-08-01T14:00:00Z"),
  "The summer morning countdown must resolve to 10:00 AM EDT."
);
assert.equal(
  clientScheduleSandbox.getNextCitadelAssaultAtMs(Date.parse("2026-08-01T15:00:00Z")),
  Date.parse("2026-08-01T22:30:00Z"),
  "The summer evening countdown must resolve to 6:30 PM EDT."
);
assert.equal(
  clientScheduleSandbox.getNextCitadelAssaultAtMs(Date.parse("2026-01-15T14:00:00Z")),
  Date.parse("2026-01-15T15:00:00Z"),
  "The winter morning countdown must resolve to 10:00 AM EST."
);
assert.equal(
  clientScheduleSandbox.getNextCitadelAssaultAtMs(Date.parse("2026-01-15T16:00:00Z")),
  Date.parse("2026-01-15T23:30:00Z"),
  "The winter evening countdown must resolve to 6:30 PM EST."
);

const serverWaveSource = sourceBetween(
  server,
  "function getCitadelAssaultWaveAtMs",
  "function citadelAssaultWaveRef"
);
const serverWaveSandbox = {
  Date,
  CITADEL_ASSAULT_WARNING_MINUTES: 15,
  timestampToMs: value => Number(value),
  safeNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
};
vm.runInNewContext(`${serverWaveSource}\nglobalThis.getWave = getCitadelAssaultWaveAtMs;`, serverWaveSandbox);
const morningWave = serverWaveSandbox.getWave(Date.parse("2026-08-01T13:45:00Z"), true);
assert.equal(morningWave.id, "20260801-1400", "The morning warning must share the 10:00 AM EDT wave ID.");
assert.equal(morningWave.scheduledAtMs, Date.parse("2026-08-01T14:00:00Z"));
const eveningWave = serverWaveSandbox.getWave(Date.parse("2026-08-01T22:15:00Z"), true);
assert.equal(eveningWave.id, "20260801-2230", "The evening warning must share the 6:30 PM EDT wave ID.");
assert.equal(eveningWave.scheduledAtMs, Date.parse("2026-08-01T22:30:00Z"));

console.log("Validated Citadel Legion wall bypass, full-garrison level penalty, schedules, zero-XP settlement, incoming threats, and center-map countdown.");
