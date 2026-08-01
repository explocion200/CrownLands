const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const rules = fs.readFileSync(path.join(root, "game-rules.html"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

requireMatch(server, /CITADEL_ASSAULT_TROOPS\s*=\s*100_000/, "Citadel assault force must remain 100,000 troops.");
requireMatch(server, /CITADEL_ASSAULT_TARGET_LIMIT\s*=\s*20/, "Citadel assault target cap must remain 20.");
requireMatch(server, /schedule:\s*"45 3,14 \* \* \*"[\s\S]*?timeZone:\s*"Etc\/UTC"/, "Missing 03:45/14:45 UTC target selection schedule.");
requireMatch(server, /schedule:\s*"0 4,15 \* \* \*"[\s\S]*?timeZone:\s*"Etc\/UTC"/, "Missing 04:00/15:00 UTC resolution schedule.");
requireMatch(server, /shuffleCitadelAssaultCandidates[\s\S]*?crypto\.randomInt[\s\S]*?slice\(0, CITADEL_ASSAULT_TARGET_LIMIT\)/, "Targets are not sampled uniformly without replacement and capped at 20.");

const eligibility = server.slice(
  server.indexOf("function isCitadelAssaultEligibleCity"),
  server.indexOf("function createCitadelAssaultIncomingView")
);
requireMatch(eligibility, /CITADEL_ASSAULT_REGION_ID[\s\S]*?!isStronghold\(city\)[\s\S]*?city\.isMainCity !== true/, "Eligibility must require center-region regular non-main cities.");
if (/shield/i.test(eligibility)) throw new Error("Peace Shields must not affect Citadel assault eligibility.");

requireMatch(server, /previousLevel <= CITADEL_ASSAULT_LEVEL_LOSS/, "Level 5-or-lower neutralization threshold is missing.");
requireMatch(server, /ownerKind:\s*"neutral"[\s\S]*?level:\s*1[\s\S]*?troops:\s*CITADEL_ASSAULT_NEUTRAL_TROOPS/, "Low-level losses must create a Level 1 neutral city with 10 troops.");
requireMatch(server, /xpAwarded:\s*0[\s\S]*?goldAwarded:\s*0[\s\S]*?troopsAwarded:\s*0/, "Citadel assault defense reports must award no progression rewards.");
requireMatch(server, /recoverCitadelAssaultLosses[\s\S]*?fieldMedics/, "Field Medics recovery is missing.");
requireMatch(server, /reinforcementBattleReceipts[\s\S]*?xpAwarded:\s*0/, "Reinforcement settlement must award zero XP.");
requireMatch(server, /writeOwnershipChangeEvent[\s\S]*?reason:\s*CITADEL_ASSAULT_EVENT_KIND/, "Neutralized cities must emit an ownership-change event.");

requireMatch(client, /getNextCitadelAssaultAtMs[\s\S]*?CITADEL_ASSAULT_UTC_HOURS/, "Client UTC countdown calculation is missing.");
requireMatch(client, /eventKind !== CITADEL_ASSAULT_EVENT_KIND[\s\S]*?troopVisibility === "estimate"/, "NPC troop visibility must remain exact.");
requireMatch(client, /getActiveMapRegionId\(\) === CITADEL_ASSAULT_REGION_ID/, "Countdown must only appear on the Citadel map.");
requireMatch(html, /id="citadelAssaultCountdown"[\s\S]*?role="timer"/, "Citadel assault countdown markup is missing.");
requireMatch(styles, /\.citadel-assault-countdown\.imminent/, "Imminent countdown styling is missing.");
requireMatch(rules, /04:00 and 15:00 UTC[\s\S]*?no defense experience is awarded/i, "Public Citadel assault rules are incomplete.");

console.log("Validated Citadel Legion schedules, selection, combat penalties, zero-XP settlement, incoming threats, and center-map countdown.");
